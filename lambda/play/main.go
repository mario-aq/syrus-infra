package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	models "loros/syrus-models"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/aws/aws-sdk-go/service/sqs"
)

// Discord interaction structures (copied from webhook for play lambda)
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

// PlayRequest represents the message sent to the play queue
type PlayRequest struct {
	CampaignId        string             `json:"campaignId"`
	InteractionId     string             `json:"interactionId"`
	InteractionObject DiscordInteraction `json:"interactionObject"`
}

// HaikuResponse represents the response from the Haiku model
type HaikuResponse struct {
	Message              string `json:"message"`
	BeatAdvanced         bool   `json:"beatAdvanced"`
	RollRequired         bool   `json:"rollRequired"`
	RollType             string `json:"rollType"`
	CombatOccurred       bool   `json:"combatOccurred"`
	FailurePathActivated string `json:"failurePathActivated"`
	SuccessPathActivated string `json:"successPathActivated"`
	MemoryUpdates        struct {
		Flags []string `json:"flags"`
		Facts []string `json:"facts"`
	} `json:"memoryUpdates"`
	ImageTrigger string `json:"imageTrigger"`
}

// checkDedup checks if a message has already been processed
func checkDedup(interactionID string) (bool, error) {
	dedupTable := os.Getenv("SYRUS_DEDUP_TABLE")
	if dedupTable == "" {
		return false, fmt.Errorf("SYRUS_DEDUP_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return false, fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	dedupKey := fmt.Sprintf("play#%s", interactionID)

	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(dedupTable),
		Key: map[string]*dynamodb.AttributeValue{
			"dedupKey": {
				S: aws.String(dedupKey),
			},
		},
	})

	if err != nil {
		return false, fmt.Errorf("failed to check dedup table: %w", err)
	}

	return result.Item != nil, nil
}

// writeDedup marks a message as processed
func writeDedup(interactionID string) error {
	dedupTable := os.Getenv("SYRUS_DEDUP_TABLE")
	if dedupTable == "" {
		return fmt.Errorf("SYRUS_DEDUP_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	dedupKey := fmt.Sprintf("play#%s", interactionID)
	expiresAt := time.Now().Add(24 * time.Hour).Unix()

	_, err = svc.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(dedupTable),
		Item: map[string]*dynamodb.AttributeValue{
			"dedupKey": {
				S: aws.String(dedupKey),
			},
			"expiresAt": {
				N: aws.String(fmt.Sprintf("%d", expiresAt)),
			},
		},
	})

	if err != nil {
		return fmt.Errorf("failed to write to dedup table: %w", err)
	}

	return nil
}

// getCampaignByID retrieves a campaign by campaignId
func getCampaignByID(campaignID string) (*models.Campaign, error) {
	campaignsTable := os.Getenv("SYRUS_CAMPAIGNS_TABLE")
	if campaignsTable == "" {
		return nil, fmt.Errorf("SYRUS_CAMPAIGNS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {
				S: aws.String(campaignID),
			},
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to query campaigns table: %w", err)
	}

	if result.Item == nil {
		return nil, nil // Campaign not found
	}

	var campaign models.Campaign
	err = dynamodbattribute.UnmarshalMap(result.Item, &campaign)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal campaign: %w", err)
	}

	return &campaign, nil
}

// sendMessageToQueue sends a message to the messaging SQS queue
func sendMessageToQueue(channelID string, content string, interactionToken string, interactionID string) error {
	queueURL := os.Getenv("SYRUS_MESSAGING_QUEUE_URL")
	if queueURL == "" {
		return fmt.Errorf("SYRUS_MESSAGING_QUEUE_URL environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := sqs.New(sess)

	messageBody := map[string]interface{}{
		"channelId": channelID,
		"content":   content,
	}
	if interactionToken != "" {
		messageBody["interactionToken"] = interactionToken
	}
	messageBodyJSON, err := json.Marshal(messageBody)
	if err != nil {
		return fmt.Errorf("failed to marshal message body: %w", err)
	}

	_, err = svc.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(queueURL),
		MessageBody:            aws.String(string(messageBodyJSON)),
		MessageGroupId:         aws.String(channelID),
		MessageDeduplicationId: aws.String(interactionID + "-play"),
	})

	if err != nil {
		return fmt.Errorf("failed to send message to queue: %w", err)
	}

	log.Printf("Successfully sent message to queue for channel %s", channelID)
	return nil
}

// handlePlayRequest processes a single play request
func handlePlayRequest(ctx context.Context, playRequest PlayRequest) error {
	log.Printf("Processing play request for campaign %s, interaction %s", playRequest.CampaignId, playRequest.InteractionId)

	// Check dedup table for safety
	alreadyProcessed, err := checkDedup(playRequest.InteractionId)
	if err != nil {
		log.Printf("Failed to check dedup table: %v", err)
		return err
	}
	if alreadyProcessed {
		log.Printf("Interaction %s already processed, skipping", playRequest.InteractionId)
		return nil
	}

	// Parse interaction to determine what to do
	interaction := playRequest.InteractionObject

	// Check if this is a syrus command
	if interaction.Data != nil {
		if commandName, ok := interaction.Data["name"].(string); ok && commandName == "syrus" {
			// Parse options to determine subcommand and debug mode
			options, hasOptions := interaction.Data["options"].([]interface{})

			// Check for debug flag first (only for authorized user)
			debugMode := false
			if hasOptions {
				for _, opt := range options {
					if optMap, ok := opt.(map[string]interface{}); ok {
						if name, ok := optMap["name"].(string); ok && name == "debug" {
							if debugValue, ok := optMap["value"].(bool); ok && debugValue {
								// Only enable debug mode for authorized user
								userID := ""
								if interaction.User != nil {
									userID = interaction.User.ID
								} else if interaction.Member != nil && interaction.Member.User.ID != "" {
									userID = interaction.Member.User.ID
								}

								if userID == "1400583338720235591" {
									debugMode = true
									break
								}
							}
						}
					}
				}
			}

			// Send debug snapshot if debug mode is enabled
			if debugMode {
				if err := handleDebugMode(playRequest); err != nil {
					log.Printf("Failed to send debug mode response: %v", err)
					// Continue with normal processing even if debug fails
				}
			}

			// Parse for declare subcommand
			if hasOptions && len(options) > 0 {
				firstOption, ok := options[0].(map[string]interface{})
				if ok {
					if name, ok := firstOption["name"].(string); ok && name == "declare" {
						if declaration, ok := firstOption["value"].(string); ok {
							// Handle declare command
							return handleDeclareCommand(playRequest, declaration)
						}
					}
				}
			}
		}
	}

	// Unknown command or no valid subcommand found
	log.Printf("Unknown or invalid syrus command for interaction %s", playRequest.InteractionId)
	return sendMessageToQueue(playRequest.CampaignId, "*The mists of fate swirl uncertainly.* I do not understand this command, brave adventurer. Try `/syrus declare \"your action here\"` to weave your tale.", playRequest.InteractionObject.Token, playRequest.InteractionId)
}

// handleDebugMode sends a truncated debug snapshot
func handleDebugMode(playRequest PlayRequest) error {
	// Get campaign state
	campaign, err := getCampaignByID(playRequest.CampaignId)
	if err != nil {
		log.Printf("Failed to get campaign: %v", err)
		return sendMessageToQueue(playRequest.CampaignId, "*The ancient tomes refuse to open.* Debug failed: cannot access campaign data.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	}

	// Create truncated debug response (Discord 2000 char limit)
	debugInfo := fmt.Sprintf(`**🧙‍♂️ Debug Mode Active**

**Campaign:** %s
**Status:** %s
**Current Act:** %d
**Current Beat:** %d
**Players:** %d

**Failure Paths:** %d
**End States:** %d

**Memory:** %d acts tracked`,
		campaign.CampaignID,
		campaign.Status,
		campaign.Runtime.CurrentAct,
		campaign.Runtime.CurrentBeat,
		len(campaign.Party.Members),
		len(campaign.Blueprint.FailurePaths),
		3, // EndStates struct has 3 fields: Success, Compromised, Failure
		len(campaign.Memory.PerAct),
	)

	// Add a note about full data availability
	debugInfo += "\n\n*📜 Extended diagnostics recorded for debugging*"

	return sendMessageToQueue(playRequest.CampaignId, debugInfo, playRequest.InteractionObject.Token, playRequest.InteractionId)
}

// handleDeclareCommand processes a /syrus declare command
func handleDeclareCommand(playRequest PlayRequest, declaration string) error {
	log.Printf("Processing declare command: %s", declaration)

	// Get campaign
	campaign, err := getCampaignByID(playRequest.CampaignId)
	if err != nil {
		log.Printf("Failed to get campaign: %v", err)
		return sendMessageToQueue(playRequest.CampaignId, "*The ancient tomes refuse to open.* I cannot find your tale in the chronicles. The threads of fate may be frayed.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	}
	if campaign == nil {
		return sendMessageToQueue(playRequest.CampaignId, "*The pages of destiny remain blank.* This tale has not yet begun. The story awaits your first step.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	}

	// Validate campaign status
	switch campaign.Status {
	case models.CampaignStatusEnded:
		return sendMessageToQueue(playRequest.CampaignId, "*The final page has been written.* This adventure has passed into legend. The tale is complete, the heroes immortalized in song. Try `/syrus start` to begin a new tale.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	case models.CampaignStatusConfiguring:
		return sendMessageToQueue(playRequest.CampaignId, "*The ink is still wet on the contract.* Your campaign is still being prepared. The world awaits your final choices.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	case models.CampaignStatusActive:
		// Check lifecycle for paused state
		if campaign.Lifecycle.Paused {
			return sendMessageToQueue(playRequest.CampaignId, "*Time itself holds its breath.* The tale rests in stasis, waiting for the moment to continue. Try `/syrus resume` to continue the story.", playRequest.InteractionObject.Token, playRequest.InteractionId)
		}
		// Transition to playing if currently active (not playing)
		if campaign.Status != models.CampaignStatusPlaying {
			// TODO: Update campaign status to "playing" in DynamoDB
			log.Printf("Transitioning campaign %s to playing status", playRequest.CampaignId)
		}
	}

	// Load current act and memory
	currentAct := campaign.Runtime.CurrentAct
	if currentAct < 0 || currentAct >= len(campaign.Blueprint.Acts) {
		return sendMessageToQueue(playRequest.CampaignId, "*The ancient runes have been defiled.* The structure of this tale is corrupted. Seek the wisdom of the elders to restore the chronicle.", playRequest.InteractionObject.Token, playRequest.InteractionId)
	}

	act := campaign.Blueprint.Acts[currentAct]
	memory := campaign.Memory.PerAct[fmt.Sprintf("%d", currentAct)]

	// Ensure memory structure exists
	if memory.Beats == nil {
		memory.Beats = new(int)
	}
	if memory.CombatSceneCount == nil {
		memory.CombatSceneCount = new(int)
	}
	if memory.Flags == nil {
		memory.Flags = []string{}
	}
	if memory.Failures == nil {
		memory.Failures = []string{}
	}
	if memory.Successes == nil {
		memory.Successes = []string{}
	}

	// TODO: Call Haiku model with proper input
	// For now, provide a simple response
	message := fmt.Sprintf("*Your words echo through the ages...* \"%s\"\n\n*In the shadowed depths of %s, fate begins to unfold...*", declaration, act.PrimaryArea)

	return sendMessageToQueue(playRequest.CampaignId, message, playRequest.InteractionObject.Token, playRequest.InteractionId)
}

// handleSQSRequest processes SQS events
func handleSQSRequest(ctx context.Context, sqsEvent events.SQSEvent) error {
	var errors []error

	for _, message := range sqsEvent.Records {
		var playRequest PlayRequest
		if err := json.Unmarshal([]byte(message.Body), &playRequest); err != nil {
			log.Printf("Failed to unmarshal play request: %v", err)
			errors = append(errors, err)
			continue
		}

		if err := handlePlayRequest(ctx, playRequest); err != nil {
			log.Printf("Failed to process play request: %v", err)
			errors = append(errors, err)
			continue
		}

		// Mark as processed in dedup table
		if err := writeDedup(playRequest.InteractionId); err != nil {
			log.Printf("Failed to write dedup: %v", err)
			// Don't add to errors - message was processed successfully, dedup is just safety
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
