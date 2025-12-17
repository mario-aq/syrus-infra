package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/sqs"
	"github.com/aws/aws-sdk-go/service/ssm"
)

// Discord interaction structures
type DiscordInteraction struct {
	ID        string                 `json:"id"`
	Type      int                    `json:"type"` // 1 = PING, 2 = APPLICATION_COMMAND, etc.
	Data      map[string]interface{} `json:"data,omitempty"`
	GuildID   string                 `json:"guild_id,omitempty"`
	ChannelID string                 `json:"channel_id,omitempty"`
	Member    *DiscordMember         `json:"member,omitempty"`
	User      *DiscordUser           `json:"user,omitempty"`
	Token     string                 `json:"token"`
}

type DiscordMember struct {
	User DiscordUser `json:"user"`
}

type DiscordUser struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

// getMapKeys returns the keys of a map as a slice of strings
func getMapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// formatDebugPayload formats the complete interaction payload for debug responses
func formatDebugPayload(interaction DiscordInteraction) string {
	payloadJSON, err := json.MarshalIndent(interaction, "", "  ")
	if err != nil {
		return fmt.Sprintf("Error formatting payload: %v", err)
	}

	return fmt.Sprintf("Received:\n%s\n\n===>\nResponse:\nDebug mode - full payload logged above", string(payloadJSON))
}

// checkHostExists checks if a Discord user ID exists in the hosts table and returns name if found
func checkHostExists(userID string) (string, bool) {
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

	// Query the hosts table (id is partition key, source is sort key)
	// For Discord users, source should be "discord"
	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(hostsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"id": {
				S: aws.String(userID),
			},
			"source": {
				S: aws.String("discord"),
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

// getDiscordPublicKey retrieves the Discord public key from SSM Parameter Store
func getDiscordPublicKey(stage string) (ed25519.PublicKey, error) {
	sess, err := session.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := ssm.New(sess)
	paramName := fmt.Sprintf("/syrus/%s/discord/public-key", stage)
	result, err := svc.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(false), // Public key doesn't need decryption
	})

	if err != nil {
		return nil, fmt.Errorf("failed to get parameter %s: %w", paramName, err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return nil, fmt.Errorf("parameter %s not found or has no value", paramName)
	}

	// Decode hex-encoded public key
	publicKeyHex := strings.TrimSpace(*result.Parameter.Value)
	publicKeyBytes, err := hex.DecodeString(publicKeyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to decode public key hex: %w", err)
	}

	if len(publicKeyBytes) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid public key size: expected %d bytes, got %d", ed25519.PublicKeySize, len(publicKeyBytes))
	}

	return ed25519.PublicKey(publicKeyBytes), nil
}

// getDiscordAppID retrieves the Discord application ID from SSM Parameter Store
func getDiscordAppID(stage string) (string, error) {
	sess, err := session.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := ssm.New(sess)
	paramName := fmt.Sprintf("/syrus/%s/discord/app-id", stage)
	result, err := svc.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(false),
	})

	if err != nil {
		return "", fmt.Errorf("failed to get parameter %s: %w", paramName, err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return "", fmt.Errorf("parameter %s not found or has no value", paramName)
	}

	return strings.TrimSpace(*result.Parameter.Value), nil
}

// sendMessageToQueue sends a message to the messaging SQS queue
func sendMessageToQueue(channelID string, content string, interactionToken string) error {
	queueURL := os.Getenv("SYRUS_MESSAGING_QUEUE_URL")
	if queueURL == "" {
		return fmt.Errorf("SYRUS_MESSAGING_QUEUE_URL environment variable not set")
	}

	// Create AWS session
	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	// Create SQS client
	svc := sqs.New(sess)

	// Create message body
	messageBody := map[string]interface{}{
		"channel_id": channelID,
		"content":    content,
	}
	if interactionToken != "" {
		messageBody["interaction_token"] = interactionToken
	}
	messageBodyJSON, err := json.Marshal(messageBody)
	if err != nil {
		return fmt.Errorf("failed to marshal message body: %w", err)
	}

	// Send message to queue
	// Use interaction ID as MessageGroupId for FIFO ordering (or use a fixed group for all messages)
	_, err = svc.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(queueURL),
		MessageBody:            aws.String(string(messageBodyJSON)),
		MessageGroupId:         aws.String("discord-responses"),                           // Fixed group for all Discord responses
		MessageDeduplicationId: aws.String(fmt.Sprintf("%s-%d", channelID, len(content))), // Simple deduplication
	})

	if err != nil {
		return fmt.Errorf("failed to send message to queue: %w", err)
	}

	log.Printf("Successfully sent message to queue for channel %s", channelID)
	return nil
}

// verifyDiscordSignature verifies the Discord interaction signature using Ed25519
// Uses raw bytes to avoid any string encoding issues
func verifyDiscordSignature(signature string, timestamp string, bodyBytes []byte, publicKey ed25519.PublicKey) bool {
	if signature == "" || timestamp == "" {
		return false
	}

	// Decode hex-encoded signature
	signatureBytes, err := hex.DecodeString(signature)
	if err != nil {
		log.Printf("Invalid signature format: %v", err)
		return false
	}

	if len(signatureBytes) != ed25519.SignatureSize {
		log.Printf("Invalid signature size: expected %d bytes, got %d", ed25519.SignatureSize, len(signatureBytes))
		return false
	}

	// CRITICAL: Use raw bytes, not string concatenation
	// Discord signs: timestamp (as bytes) + body (as bytes)
	timestampBytes := []byte(timestamp)
	message := append(timestampBytes, bodyBytes...)
	return ed25519.Verify(publicKey, message, signatureBytes)
}

// extractDiscordHeaders extracts Discord signature headers from the HTTP API v2 request
func extractDiscordHeaders(headers map[string]string) (signature, timestamp string, err error) {
	// HTTP API v2 headers are case-sensitive, but we check both cases
	for key, value := range headers {
		keyLower := strings.ToLower(key)
		if keyLower == "x-signature-ed25519" {
			signature = value
		} else if keyLower == "x-signature-timestamp" {
			timestamp = value
		}
	}

	if signature == "" {
		return "", "", fmt.Errorf("missing X-Signature-Ed25519 header")
	}
	if timestamp == "" {
		return "", "", fmt.Errorf("missing X-Signature-Timestamp header")
	}

	return signature, timestamp, nil
}

func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Discord only uses POST
	if request.RequestContext.HTTP.Method != "POST" {
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 405,
			Body:       `{"error": "Method Not Allowed"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}

		return response, nil
	}

	// Get raw body bytes (HTTP API v2 may send base64 encoded)
	bodyBytes := []byte(request.Body)
	if request.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(request.Body)
		if err != nil {
			log.Printf("Failed to decode base64 body: %v", err)
			response := events.APIGatewayV2HTTPResponse{
				StatusCode: 400,
				Body:       `{"error": "Invalid request body"}`,
				Headers: map[string]string{
					"Content-Type": "application/json",
				},
			}

			return response, nil
		}
		bodyBytes = decoded
	}

	// CRITICAL: Verify signature FIRST for ALL requests (including PING)
	// Discord requires signature verification even for PING to ensure security.
	// Discord tests that unsigned/invalid requests are rejected (401), not accepted.
	signature, timestamp, err := extractDiscordHeaders(request.Headers)
	if err != nil {
		log.Printf("Failed to extract Discord headers: %v", err)
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 401,
			Body:       `{"error": "Unauthorized"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}

		return response, nil
	}

	// Get Discord public key from SSM
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
	}
	publicKey, err := getDiscordPublicKey(stage)
	if err != nil {
		log.Printf("Failed to get Discord public key: %v", err)
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 500,
			Body:       `{"error": "Internal server error"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}, nil
	}

	// Verify signature using raw body bytes (NOT string concatenation)
	if !verifyDiscordSignature(signature, timestamp, bodyBytes, publicKey) {
		log.Printf("Discord signature verification failed")
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 401,
			Body:       `{"error": "Unauthorized"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}

		return response, nil
	}

	log.Printf("Discord signature verified successfully")

	// Parse JSON to check interaction type (AFTER signature verification)
	var interaction DiscordInteraction
	if err := json.Unmarshal(bodyBytes, &interaction); err != nil {
		log.Printf("Failed to parse interaction JSON: %v", err)
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 400,
			Body:       `{"error": "Invalid interaction payload"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}

		return response, nil
	}

	log.Printf("Interaction type: %d", interaction.Type)

	if interaction.Type == 1 {
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
			Body: `{"type":1}`,
		}

		return response, nil
	}

	// Get user ID from interaction (can be in user or member.user)
	userID := ""
	if interaction.User != nil {
		userID = interaction.User.ID
	} else if interaction.Member != nil && interaction.Member.User.ID != "" {
		userID = interaction.Member.User.ID
	}

	if userID == "" {
		log.Printf("No user ID found in interaction")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 400,
			Body:       `{"error": "Missing user information"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}, nil
	}

	// Check if user is whitelisted in hosts table
	_, exists := checkHostExists(userID)
	if !exists {
		log.Printf("User %s is not whitelisted, ignoring interaction", userID)
		// Return 200 OK but don't process (silently ignore)
		response := events.APIGatewayV2HTTPResponse{
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
			Body: `{"type": 4, "data": {"content": "You are not authorized to use this bot."}}`,
		}

		return response, nil
	}

	// Handle commands (check if interaction data contains a command)
	if interaction.Data != nil {
		// Log the interaction data to see what we're receiving
		dataJSON, _ := json.Marshal(interaction.Data)
		log.Printf("Interaction data: %s", string(dataJSON))

		if commandName, ok := interaction.Data["name"].(string); ok {
			log.Printf("Command name detected: %s", commandName)
			switch commandName {
			case "syrus":
				// Build response message
				responseMessage := "Received"

				// Check for debug mode: if debug option is true, append interaction JSON
				if options, ok := interaction.Data["options"].([]interface{}); ok {
					// Look for the debug option
					for _, option := range options {
						if optionMap, ok := option.(map[string]interface{}); ok {
							if name, ok := optionMap["name"].(string); ok && name == "debug" {
								if debugValue, ok := optionMap["value"].(bool); ok && debugValue {
									// Debug mode enabled - marshal the full interaction JSON
									interactionJSON, err := json.MarshalIndent(interaction, "", "  ")
									if err != nil {
										log.Printf("Failed to marshal interaction JSON: %v", err)
									} else {
										responseMessage = fmt.Sprintf("Received\n\n```json\nInteractionPayload: %s\n```", string(interactionJSON))
									}
									break
								}
							}
						}
					}
				}

				if err := sendMessageToQueue(interaction.ChannelID, responseMessage, interaction.Token); err != nil {
					log.Printf("Failed to send 'Received' message to queue: %v", err)
				}

				// Return type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) - will follow up via webhook
				response := events.APIGatewayV2HTTPResponse{
					StatusCode: 200,
					Headers: map[string]string{
						"Content-Type": "application/json",
					},
					Body: `{"type": 5}`,
				}

				return response, nil
			case "ping":
				// Send "Pong! 🏓" message via queue with interaction token
				if err := sendMessageToQueue(interaction.ChannelID, "Pong! 🏓", interaction.Token); err != nil {
					log.Printf("Failed to send ping response to queue: %v", err)
				}
				// Return type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) - will follow up via webhook
				response := events.APIGatewayV2HTTPResponse{
					StatusCode: 200,
					Headers: map[string]string{
						"Content-Type": "application/json",
					},
					Body: `{"type":5}`,
				}

				return response, nil
			}
		}
	}

	// TODO
	// 1. get campaign
	// 2. route the message to either configuring, play, cinematic queues
	// 3. respond 200 to the webhook

	// Log unhandled interaction with full payload
	interactionJSON, _ := json.Marshal(interaction)
	log.Printf("unhandled interaction type: %s", string(interactionJSON))

	// Return type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) - will follow up via webhook
	response := events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
		Body: `{"type": 4, "data": {}}`,
	}

	return response, nil
}

func main() {
	lambda.Start(handleRequest)
}
