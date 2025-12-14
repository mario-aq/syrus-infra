package main

import (
	"bytes"
	"context"
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

// parseSyrusCommand parses messages that start with $yrus or /syrus
// Returns prefix, command, and arguments. Returns empty strings if not a syrus command.
func parseSyrusCommand(body string) (prefix string, command string, args []string) {
	// Check for $yrus prefix
	if strings.HasPrefix(body, "$yrus") {
		prefix = "$yrus"
		remaining := strings.TrimSpace(body[len(prefix):])
		if remaining == "" {
			return prefix, "", []string{}
		}
		parts := strings.Fields(remaining)
		if len(parts) == 0 {
			return prefix, "", []string{}
		}
		return prefix, parts[0], parts[1:]
	}

	// Check for /syrus prefix
	if strings.HasPrefix(body, "/syrus") {
		prefix = "/syrus"
		remaining := strings.TrimSpace(body[len(prefix):])
		if remaining == "" {
			return prefix, "", []string{}
		}
		parts := strings.Fields(remaining)
		if len(parts) == 0 {
			return prefix, "", []string{}
		}
		return prefix, parts[0], parts[1:]
	}

	// Not a syrus command
	return "", "", []string{}
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

func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Handle GET requests for webhook verification
	if request.RequestContext.HTTP.Method == "GET" {
		mode := request.QueryStringParameters["hub.mode"]
		token := request.QueryStringParameters["hub.verify_token"]
		challenge := request.QueryStringParameters["hub.challenge"]

		verifyToken := os.Getenv("SYRUS_VERIFY_TOKEN")

		if mode == "subscribe" && token == verifyToken {
			return events.APIGatewayV2HTTPResponse{
				StatusCode: 200,
				Headers: map[string]string{
					"Content-Type": "text/plain",
				},
				Body: challenge,
			}, nil
		}

		log.Printf("Webhook verification failed - invalid token or mode")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 403,
			Body:       "Forbidden",
		}, nil
	}

	// Handle POST requests for messages
	if request.RequestContext.HTTP.Method == "POST" {
		// Parse the webhook payload
		var webhookPayload WebhookPayload
		if err := json.Unmarshal([]byte(request.Body), &webhookPayload); err != nil {
			return events.APIGatewayV2HTTPResponse{
				StatusCode: 400,
				Body:       `{"error": "Invalid webhook payload"}`,
			}, nil
		}

		// Process messages if any
		if len(webhookPayload.Entry) > 0 {
			for _, entry := range webhookPayload.Entry {
				for _, change := range entry.Changes {
					if change.Field == "messages" && len(change.Value.Messages) > 0 {
						for _, msg := range change.Value.Messages {
							// Parse syrus command from message
							prefix, command, _ := parseSyrusCommand(msg.Text.Body) // args reserved for future commands
							if prefix != "" {
								// Log syrus command received
								log.Printf("Syrus command received from %s: prefix='%s', command='%s', message='%s'", msg.From, prefix, command, msg.Text.Body)

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

									// Send "Received" message back to sender
									sendReceivedMessage(msg.From)

									// Handle debug command
									if command == "debug" {
										debugResponse := formatDebugPayload(webhookPayload)
										sendMessage(msg.From, debugResponse)
									}
									// Future: Handle other commands here
								}
								// If not whitelisted, silently ignore even syrus commands
							}
							// If not a syrus command, silently ignore
						}
					}
				}
			}
		}

		// Return 200 OK immediately to acknowledge receipt
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
			Body: `{"status": "ok"}`,
		}, nil
	}

	// Method not allowed
	return events.APIGatewayV2HTTPResponse{
		StatusCode: 405,
		Body:       "Method Not Allowed",
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

func main() {
	lambda.Start(handleRequest)
}
