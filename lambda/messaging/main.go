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
	"github.com/aws/aws-sdk-go/service/ssm"
)

// DiscordMessage represents the message structure sent to Discord API
type DiscordMessage struct {
	Content    string                   `json:"content,omitempty"`
	Embeds     []map[string]interface{} `json:"embeds,omitempty"`
	Components []map[string]interface{} `json:"components,omitempty"`
}

// SQSMessageBody represents the message structure in SQS
type SQSMessageBody struct {
	ChannelID        string                   `json:"channel_id"`
	Content          string                   `json:"content"`
	Embeds           []map[string]interface{} `json:"embeds,omitempty"`
	Components       []map[string]interface{} `json:"components,omitempty"`
	InteractionToken string                   `json:"interaction_token,omitempty"`
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
func sendDiscordMessage(channelID string, message DiscordMessage, botToken string, interactionToken string, applicationID string) error {
	var url string
	if interactionToken != "" && applicationID != "" {
		// Use webhook endpoint to resolve the interaction
		url = fmt.Sprintf("https://discord.com/api/v10/webhooks/%s/%s", applicationID, interactionToken)
	} else {
		// Use channel messages endpoint
		url = fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages", channelID)
	}

	// Marshal message to JSON
	jsonData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	// Webhook endpoint doesn't need Authorization header (token in URL is sufficient)
	// Channel messages endpoint requires Bot token
	if interactionToken == "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bot %s", botToken))
	}
	req.Header.Set("Content-Type", "application/json")

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord API returned status %d: %s", resp.StatusCode, resp.Status)
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
		return fmt.Errorf("missing required field: channel_id")
	}
	if messageBody.Content == "" && len(messageBody.Embeds) == 0 {
		return fmt.Errorf("missing required field: content or embeds")
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
	if err := sendDiscordMessage(messageBody.ChannelID, discordMsg, botToken, messageBody.InteractionToken, applicationID); err != nil {
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
