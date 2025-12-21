package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/ssm"
)

// DiscordMessage represents the message structure sent to Discord API
type DiscordMessage struct {
	Content    string                   `json:"content,omitempty"`
	Embeds     []map[string]interface{} `json:"embeds,omitempty"`
	Components []map[string]interface{} `json:"components,omitempty"`
	Flags      int                      `json:"flags,omitempty"` // Discord message flags (e.g., 64 for ephemeral)
}

// SQSMessageBody represents the message structure in SQS
type SQSMessageBody struct {
	ChannelID        string                   `json:"channelId"`
	Content          string                   `json:"content"`
	Embeds           []map[string]interface{} `json:"embeds,omitempty"`
	Components       []map[string]interface{} `json:"components,omitempty"`
	InteractionToken string                   `json:"interactionToken,omitempty"`
	Flags            int                      `json:"flags,omitempty"` // Discord message flags
	Attachments      []Attachment             `json:"attachments,omitempty"`
}

// Attachment represents a file attachment
type Attachment struct {
	Name        string `json:"name"`
	Data        string `json:"data"`        // S3 key OR base64-encoded data
	ContentType string `json:"contentType"` // e.g., "image/png"
}

var (
	awsSession       *session.Session
	s3Client         *s3.S3
	modelCacheBucket string
)

func init() {
	awsSession = session.Must(session.NewSession())
	s3Client = s3.New(awsSession)
	modelCacheBucket = os.Getenv("SYRUS_MODEL_CACHE_BUCKET")
}

// getImageFromS3 retrieves an image from S3 and returns it as base64-encoded string
func getImageFromS3(s3Key string) (string, error) {
	result, err := s3Client.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(modelCacheBucket),
		Key:    aws.String(s3Key),
	})
	if err != nil {
		return "", fmt.Errorf("failed to get object from S3: %w", err)
	}
	defer result.Body.Close()

	imageData, err := io.ReadAll(result.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read S3 object body: %w", err)
	}

	return base64.StdEncoding.EncodeToString(imageData), nil
}

// getDiscordBotToken retrieves the Discord bot token from SSM Parameter Store
func getDiscordBotToken(stage string) (string, error) {
	sess, err := session.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := ssm.New(sess)
	paramName := fmt.Sprintf("/syrus/%s/discord/bot-token", stage)
	result, err := svc.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true), // Bot token is SecureString, needs decryption
	})

	if err != nil {
		return "", fmt.Errorf("failed to get parameter %s: %w", paramName, err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return "", fmt.Errorf("parameter %s not found or has no value", paramName)
	}

	return *result.Parameter.Value, nil
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

// sendDiscordMessage sends a message to Discord
// If interactionToken is provided, uses webhook endpoint to resolve the interaction
// Otherwise, uses channel messages endpoint
func sendDiscordMessage(channelID string, message DiscordMessage, botToken string, interactionToken string, applicationID string, attachments []Attachment) error {
	var url string
	var method string

	if interactionToken != "" && applicationID != "" {
		// Use webhook endpoint to edit the original deferred interaction response
		url = fmt.Sprintf("https://discord.com/api/v10/webhooks/%s/%s/messages/@original", applicationID, interactionToken)
		method = "PATCH"
	} else {
		// Use channel messages endpoint
		url = fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages", channelID)
		method = "POST"
	}

	var req *http.Request
	var err error

	// If we have attachments, use multipart form data
	if len(attachments) > 0 {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// Add JSON payload
		payloadJSON, err := json.Marshal(message)
		if err != nil {
			return fmt.Errorf("failed to marshal message: %w", err)
		}
		if err := writer.WriteField("payload_json", string(payloadJSON)); err != nil {
			return fmt.Errorf("failed to write payload_json: %w", err)
		}

		// Add attachments
		for i, attachment := range attachments {
			var fileData []byte
			var err error

			// Check if Data is an S3 key or base64-encoded data
			// S3 keys will have forward slashes and not be valid base64 (or will be a path pattern)
			if strings.Contains(attachment.Data, "/") && !strings.Contains(attachment.Data, " ") {
				// Likely an S3 key - fetch from S3
				log.Printf("Fetching attachment from S3: %s", attachment.Data)
				base64Data, err := getImageFromS3(attachment.Data)
				if err != nil {
					log.Printf("Warning: failed to fetch from S3, trying as base64: %v", err)
					// Fall back to treating as base64
					fileData, err = base64.StdEncoding.DecodeString(attachment.Data)
					if err != nil {
						return fmt.Errorf("failed to decode attachment data: %w", err)
					}
				} else {
					// Successfully fetched from S3, now decode the base64
					fileData, err = base64.StdEncoding.DecodeString(base64Data)
					if err != nil {
						return fmt.Errorf("failed to decode S3 image data: %w", err)
					}
				}
			} else {
				// Decode base64 data directly
				fileData, err = base64.StdEncoding.DecodeString(attachment.Data)
				if err != nil {
					return fmt.Errorf("failed to decode attachment data: %w", err)
				}
			}

			// Create form file
			part, err := writer.CreateFormFile(fmt.Sprintf("files[%d]", i), attachment.Name)
			if err != nil {
				return fmt.Errorf("failed to create form file: %w", err)
			}

			if _, err := part.Write(fileData); err != nil {
				return fmt.Errorf("failed to write file data: %w", err)
			}
		}

		if err := writer.Close(); err != nil {
			return fmt.Errorf("failed to close multipart writer: %w", err)
		}

		req, err = http.NewRequest(method, url, body)
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())
	} else {
		// No attachments, use JSON
		jsonData, err := json.Marshal(message)
		if err != nil {
			return fmt.Errorf("failed to marshal message: %w", err)
		}

		req, err = http.NewRequest(method, url, bytes.NewBuffer(jsonData))
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
	}

	// Set authorization header
	// Webhook endpoint doesn't need Authorization header (token in URL is sufficient)
	// Channel messages endpoint requires Bot token
	if interactionToken == "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bot %s", botToken))
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second, // Increased timeout for file uploads
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)

		// Handle rate limiting (429) with retry
		if resp.StatusCode == 429 {
			// Parse rate limit response
			var rateLimitResp struct {
				Message    string  `json:"message"`
				RetryAfter float64 `json:"retry_after"`
				Global     bool    `json:"global"`
			}
			if err := json.Unmarshal(body, &rateLimitResp); err == nil && rateLimitResp.RetryAfter > 0 {
				// Wait for the retry_after duration plus a small buffer
				sleepDuration := time.Duration(rateLimitResp.RetryAfter*1000)*time.Millisecond + 100*time.Millisecond
				log.Printf("Rate limited, sleeping for %.2f seconds", sleepDuration.Seconds())
				time.Sleep(sleepDuration)

				// Retry the request once
				resp2, err := client.Do(req)
				if err != nil {
					return fmt.Errorf("failed to send request on retry: %w", err)
				}
				defer resp2.Body.Close()

				if resp2.StatusCode < 200 || resp2.StatusCode >= 300 {
					body2, _ := io.ReadAll(resp2.Body)
					return fmt.Errorf("discord API returned status %d on retry: %s", resp2.StatusCode, string(body2))
				}

				log.Printf("Successfully sent message after rate limit retry")
				return nil
			}
		}

		return fmt.Errorf("discord API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// processSQSMessage processes a single SQS message
func processSQSMessage(message events.SQSMessage, botToken string, stage string) error {
	// Parse message body
	var messageBody SQSMessageBody
	if err := json.Unmarshal([]byte(message.Body), &messageBody); err != nil {
		return fmt.Errorf("failed to parse message body: %w", err)
	}

	// Validate required fields
	if messageBody.ChannelID == "" {
		return fmt.Errorf("missing required field: channelId")
	}
	if messageBody.Content == "" && len(messageBody.Embeds) == 0 && len(messageBody.Attachments) == 0 {
		return fmt.Errorf("missing required field: content, embeds, or attachments")
	}

	// Build Discord message
	discordMsg := DiscordMessage{
		Content: messageBody.Content,
	}
	if len(messageBody.Embeds) > 0 {
		discordMsg.Embeds = messageBody.Embeds
	}
	if len(messageBody.Components) > 0 {
		discordMsg.Components = messageBody.Components
	}
	if messageBody.Flags > 0 {
		discordMsg.Flags = messageBody.Flags
	}

	// Get application ID from SSM if we have an interaction token
	var applicationID string
	if messageBody.InteractionToken != "" {
		appID, err := getDiscordAppID(stage)
		if err != nil {
			return fmt.Errorf("failed to get Discord app ID: %w", err)
		}
		applicationID = appID
	}

	// Send to Discord
	if err := sendDiscordMessage(messageBody.ChannelID, discordMsg, botToken, messageBody.InteractionToken, applicationID, messageBody.Attachments); err != nil {
		return fmt.Errorf("failed to send message to Discord: %w", err)
	}

	log.Printf("Successfully sent message to channel %s", messageBody.ChannelID)
	return nil
}

// handleSQSRequest handles SQS events
func handleSQSRequest(ctx context.Context, sqsEvent events.SQSEvent) error {
	// Get stage from environment
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
	}

	// Get Discord bot token from SSM (cache it for the batch)
	botToken, err := getDiscordBotToken(stage)
	if err != nil {
		return fmt.Errorf("failed to get Discord bot token: %w", err)
	}

	// Process each message in the batch
	var errors []error
	for _, record := range sqsEvent.Records {
		log.Printf("Processing message: %s", record.MessageId)

		if err := processSQSMessage(record, botToken, stage); err != nil {
			log.Printf("Error processing message %s: %v", record.MessageId, err)
			errors = append(errors, fmt.Errorf("message %s: %w", record.MessageId, err))
			// Continue processing other messages
		}
	}

	// If any messages failed, return error (SQS will retry failed messages)
	if len(errors) > 0 {
		return fmt.Errorf("failed to process %d message(s): %v", len(errors), errors)
	}

	return nil
}

func main() {
	lambda.Start(handleSQSRequest)
}
