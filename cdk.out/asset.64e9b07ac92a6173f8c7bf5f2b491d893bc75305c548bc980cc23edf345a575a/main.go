package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// WhatsApp webhook payload structures
type WebhookPayload struct {
	Object string             `json:"object"`
	Entry  []WebhookEntry     `json:"entry"`
}

type WebhookEntry struct {
	ID      string                  `json:"id"`
	Changes []WebhookChange         `json:"changes"`
}

type WebhookChange struct {
	Value WebhookValue `json:"value"`
	Field string       `json:"field"`
}

type WebhookValue struct {
	MessagingProduct string         `json:"messaging_product"`
	Metadata         WebhookMetadata `json:"metadata"`
	Contacts         []WebhookContact `json:"contacts"`
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
	From      string    `json:"from"`
	ID        string    `json:"id"`
	Timestamp string    `json:"timestamp"`
	Text      WebhookText `json:"text,omitempty"`
	Type      string    `json:"type"`
}

type WebhookText struct {
	Body string `json:"body"`
}

// WhatsApp API response structures
type WhatsAppMessageRequest struct {
	MessagingProduct string                    `json:"messaging_product"`
	RecipientType    string                    `json:"recipient_type"`
	To               string                    `json:"to"`
	Type             string                    `json:"type"`
	Text             WhatsAppMessageText       `json:"text"`
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

func handleRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Handle GET requests for webhook verification
	if request.HTTPMethod == "GET" {
		mode := request.QueryStringParameters["hub.mode"]
		token := request.QueryStringParameters["hub.verify_token"]
		challenge := request.QueryStringParameters["hub.challenge"]

		verifyToken := os.Getenv("SYRUS_VERIFY_TOKEN")

		log.Printf("Webhook verification attempt - Mode: %s, Token: %s, Challenge: %s", mode, token, challenge)

		if mode == "subscribe" && token == verifyToken {
			log.Printf("Webhook verification successful")
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
		// Log the incoming request for debugging
		log.Printf("Received webhook message: %s", request.Body)

	// Parse the webhook payload
	var webhookPayload WebhookPayload
	if err := json.Unmarshal([]byte(request.Body), &webhookPayload); err != nil {
		log.Printf("Error parsing webhook payload: %v", err)
		return events.APIGatewayProxyResponse{
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
							// Send "Received" message back to sender
							go sendReceivedMessage(msg.From)
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

	// Method not allowed
	return events.APIGatewayProxyResponse{
		StatusCode: 405,
		Body:       "Method Not Allowed",
	}, nil
}

func sendReceivedMessage(recipientPhoneNumber string) {
	// Get environment variables
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
			Body: "Received",
		},
	}

	// Convert to JSON
	jsonData, err := json.Marshal(messageRequest)
	if err != nil {
		log.Printf("Error marshaling message request: %v", err)
		return
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating HTTP request: %v", err)
		return
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error sending WhatsApp message: %v", err)
		return
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading response: %v", err)
		return
	}

	// Log the response
	log.Printf("WhatsApp API response: %s", string(body))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Successfully sent 'Received' message to %s", recipientPhoneNumber)
	} else {
		log.Printf("Failed to send message. Status: %d, Body: %s", resp.StatusCode, string(body))
	}
}

func main() {
	lambda.Start(handleRequest)
}
