package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/ssm"
)

// WhatsApp webhook payload structures
type WebhookPayload struct {
	Object string         `json:"object"`
	Entry  []WebhookEntry `json:"entry"`
}

type WebhookEntry struct {
	ID      string          `json:"id"`
	Changes []WebhookChange `json:"changes"`
}

type WebhookChange struct {
	Value WebhookValue `json:"value"`
	Field string       `json:"field"`
}

type WebhookValue struct {
	MessagingProduct string              `json:"messaging_product"`
	Metadata         WebhookMetadata     `json:"metadata"`
	Contacts         []WebhookContact    `json:"contacts"`
	Messages         []IndividualMessage `json:"messages"`
}

type WebhookMetadata struct {
	DisplayPhoneNumber string `json:"display_phone_number"`
	PhoneNumberID      string `json:"phone_number_id"`
}

type WebhookContact struct {
	Profile WebhookProfile `json:"profile"`
	WaID    string         `json:"wa_id"`
}

type WebhookProfile struct {
	Name string `json:"name"`
}

type IndividualMessage struct {
	From      string      `json:"from"`
	ID        string      `json:"id"`
	Timestamp string      `json:"timestamp"`
	Text      WebhookText `json:"text,omitempty"`
	Type      string      `json:"type"`
}

type WebhookText struct {
	Body string `json:"body"`
}

// WhatsApp API response structures
type WhatsAppMessageRequest struct {
	MessagingProduct string              `json:"messaging_product"`
	RecipientType    string              `json:"recipient_type"`
	To               string              `json:"to"`
	Type             string              `json:"type"`
	Text             WhatsAppMessageText `json:"text"`
}

type WhatsAppMessageText struct {
	PreviewURL bool   `json:"preview_url,omitempty"`
	Body       string `json:"body"`
}

type WhatsAppMessageResponse struct {
	MessagingProduct string `json:"messaging_product"`
	Contacts         []struct {
		Input string `json:"input"`
		WaID  string `json:"wa_id"`
	} `json:"contacts"`
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages"`
}

// formatDebugPayload formats the complete webhook payload for debug responses
func formatDebugPayload(payload WebhookPayload) string {
	payloadJSON, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Sprintf("Error formatting payload: %v", err)
	}

	return fmt.Sprintf("Received:\n%s\n\n===>\nResponse:\nDebug mode - full payload logged above", string(payloadJSON))
}

// checkHostExists checks if a WhatsApp user ID exists in the hosts table and returns name if found
func checkHostExists(waId string) (string, bool) {
	hostsTable := os.Getenv("SYRUS_HOSTS_TABLE")
	if hostsTable == "" {
		log.Printf("SYRUS_HOSTS_TABLE environment variable not set")
		return "", false
	}

	// Create AWS session
	sess, err := session.NewSession()
	if err != nil {
		log.Printf("Error creating AWS session: %v", err)
		return "", false
	}

	// Create DynamoDB client
	svc := dynamodb.New(sess)

	// Query the hosts table
	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(hostsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"waId": {
				S: aws.String(waId),
			},
		},
	})

	if err != nil {
		log.Printf("Error querying hosts table: %v", err)
		return "", false
	}

	// Check if item exists
	if result.Item == nil {
		return "", false
	}

	// Extract name if it exists
	name := ""
	if nameAttr, exists := result.Item["name"]; exists && nameAttr.S != nil {
		name = *nameAttr.S
	}

	return name, true
}

func handleRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Handle GET requests for webhook verification
	if request.HTTPMethod == "GET" {
		mode := ""
		token := ""
		challenge := ""
		if request.QueryStringParameters != nil {
			mode = request.QueryStringParameters["hub.mode"]
			token = request.QueryStringParameters["hub.verify_token"]
			challenge = request.QueryStringParameters["hub.challenge"]
		}

		verifyToken := os.Getenv("SYRUS_VERIFY_TOKEN")

		if mode == "subscribe" && token == verifyToken {
			return events.APIGatewayProxyResponse{
				StatusCode: 200,
				Headers: map[string]string{
					"Content-Type": "text/plain",
				},
				Body: challenge,
			}, nil
		}

		log.Printf("Webhook verification failed - invalid token or mode")
		return events.APIGatewayProxyResponse{
			StatusCode: 403,
			Body:       "Forbidden",
		}, nil
	}

	// Handle POST requests for messages
	if request.HTTPMethod == "POST" {
		return handlePostRequest(request)
	}

	// Method not allowed
	return events.APIGatewayProxyResponse{
		StatusCode: 405,
		Body:       "Method Not Allowed",
	}, nil
}

func extractSignatureHeader(request events.APIGatewayProxyRequest) (string, error) {
	signatureHeader := ""
	// REST API headers are case-insensitive but may be normalized
	// Check multiple possible header name formats
	for key, value := range request.Headers {
		keyLower := strings.ToLower(key)
		if keyLower == "x-hub-signature-256" {
			signatureHeader = value
			log.Printf("Found signature header: %s = %s", key, value)
			break
		}
	}

	if signatureHeader == "" {
		log.Printf("Missing X-Hub-Signature-256 header. Available headers: %v", request.Headers)
		return "", fmt.Errorf("missing X-Hub-Signature-256 header")
	}

	return signatureHeader, nil
}

func validateRequest(request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, *WebhookPayload) {
	// Extract signature header from request
	signatureHeader, err := extractSignatureHeader(request)
	if err != nil {
		log.Printf("Failed to extract signature header: %v", err)
		return events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"error": "Unauthorized"}`,
		}, nil
	}

	// Get app secret from SSM
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
	}
	appSecret, err := getAppSecret(stage)
	if err != nil {
		log.Printf("Failed to get app secret: %v", err)
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       `{"error": "Internal server error"}`,
		}, nil
	}

	// Handle base64 encoded body if needed
	body := request.Body
	if request.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			log.Printf("Failed to decode base64 body: %v", err)
			return events.APIGatewayProxyResponse{
				StatusCode: 400,
				Body:       `{"error": "Invalid request body"}`,
			}, nil
		}
		body = string(decoded)
		log.Printf("Decoded base64 body, new length: %d", len(body))
	}

	// Verify signature using the raw body
	if !verifySignature(signatureHeader, body, appSecret) {
		log.Printf("Signature verification failed - header: %s, body length: %d", signatureHeader, len(body))
		return events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"error": "Unauthorized"}`,
		}, nil
	}

	// Parse the webhook payload (use decoded body if it was base64)
	var webhookPayload WebhookPayload
	if err := json.Unmarshal([]byte(body), &webhookPayload); err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"error": "Invalid webhook payload"}`,
		}, nil
	}

	// Validate schema (use decoded body)
	if err := validateSchema(body); err != nil {
		log.Printf("Schema validation failed: %v", err)
		return events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"error": "Invalid webhook payload"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{}, &webhookPayload
}

func handlePostRequest(request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate request
	errResponse, webhookPayload := validateRequest(request)
	if errResponse.StatusCode != 0 {
		return errResponse, nil
	}

	// Process messages if any
	if len(webhookPayload.Entry) > 0 {
		for _, entry := range webhookPayload.Entry {
			for _, change := range entry.Changes {
				if change.Field == "messages" && len(change.Value.Messages) > 0 {
					for _, msg := range change.Value.Messages {
						// Check if sender is whitelisted in hosts table
						name, exists := checkHostExists(msg.From)
						if exists {
							// Log the full incoming message payload for whitelisted users
							payloadJSON, err := json.MarshalIndent(webhookPayload, "", "  ")
							if err != nil {
								log.Printf("Error marshaling webhook payload for logging: %v", err)
							} else {
								userIdentifier := name
								if userIdentifier == "" {
									userIdentifier = msg.From
								}
								log.Printf("Incoming message from whitelisted user %s: %s", userIdentifier, string(payloadJSON))
							}

							// Handle debug command
							if strings.HasPrefix(msg.Text.Body, "$debug") {
								debugResponse := formatDebugPayload(*webhookPayload)
								sendMessage(msg.From, debugResponse)
							}
							// Send "Received" message back to sender
							sendReceivedMessage(msg.From)
							// Future: Handle other commands here

						}
						// If not whitelisted, silently ignore even syrus commands
					}
				}
			}
		}
	}

	// Return 200 OK immediately to acknowledge receipt
	return events.APIGatewayProxyResponse{
		StatusCode: 200,
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
		Body: `{"status": "ok"}`,
	}, nil
}

// sendMessage sends a custom text message to a WhatsApp user
func sendMessage(recipientPhoneNumber string, messageBody string) {
	accessToken := os.Getenv("SYRUS_WA_TOKEN")
	phoneNumberID := os.Getenv("SYRUS_PHONE_ID")

	if accessToken == "" || phoneNumberID == "" {
		log.Printf("Missing WhatsApp credentials")
		return
	}

	// WhatsApp API URL
	apiURL := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", phoneNumberID)

	// Create the message payload
	messageRequest := WhatsAppMessageRequest{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               recipientPhoneNumber,
		Type:             "text",
		Text: WhatsAppMessageText{
			Body: messageBody,
		},
	}

	// Convert to JSON
	jsonData, err := json.Marshal(messageRequest)
	if err != nil {
		log.Printf("Error marshaling message request")
		return
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating HTTP request")
		return
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))

	// Create HTTP client for WhatsApp API
	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error sending WhatsApp message: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Successfully sent message to %s", recipientPhoneNumber)
	} else {
		log.Printf("Failed to send message. Status: %d", resp.StatusCode)
	}
}

func sendReceivedMessage(recipientPhoneNumber string) {
	sendMessage(recipientPhoneNumber, "Received")
}

// getAppSecret retrieves the WhatsApp app secret from SSM Parameter Store
func getAppSecret(stage string) (string, error) {
	sess, err := session.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := ssm.New(sess)
	paramName := fmt.Sprintf("/syrus/%s/whatsapp/app-secret", stage)
	result, err := svc.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true),
	})

	if err != nil {
		return "", fmt.Errorf("failed to get parameter %s: %w", paramName, err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return "", fmt.Errorf("parameter %s not found or has no value", paramName)
	}

	return *result.Parameter.Value, nil
}

// verifySignature verifies the WhatsApp webhook signature using X-Hub-Signature-256 header
func verifySignature(signatureHeader, body, appSecret string) bool {
	if signatureHeader == "" {
		return false
	}

	if !strings.HasPrefix(signatureHeader, "sha256=") {
		log.Printf("Invalid signature format: %s", signatureHeader)
		return false
	}
	expectedSignature := strings.TrimPrefix(signatureHeader, "sha256=")

	h := hmac.New(sha256.New, []byte(appSecret))
	h.Write([]byte(body))
	computedSignature := hex.EncodeToString(h.Sum(nil))

	return hmac.Equal([]byte(expectedSignature), []byte(computedSignature))
}

// validateSchema validates the webhook payload schema
func validateSchema(body string) error {
	var payload WebhookPayload
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return fmt.Errorf("invalid JSON payload: %w", err)
	}

	if payload.Object == "" {
		return fmt.Errorf("missing 'object' field")
	}

	if len(payload.Entry) == 0 {
		return fmt.Errorf("missing or empty 'entry' array")
	}

	for i, entry := range payload.Entry {
		if len(entry.Changes) == 0 {
			return fmt.Errorf("entry[%d] has no changes", i)
		}
		for j, change := range entry.Changes {
			if change.Value.MessagingProduct != "whatsapp" {
				return fmt.Errorf("entry[%d].changes[%d].value.messaging_product must be 'whatsapp', got: %s", i, j, change.Value.MessagingProduct)
			}
		}
	}

	return nil
}

func main() {
	lambda.Start(handleRequest)
}
