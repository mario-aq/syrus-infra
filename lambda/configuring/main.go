package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
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

// checkHostExists checks if a host exists in the hosts table
func checkHostExists(hostID string) (*models.Host, error) {
	hostsTable := os.Getenv("SYRUS_HOSTS_TABLE")
	if hostsTable == "" {
		return nil, fmt.Errorf("SYRUS_HOSTS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(hostsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"id": {
				S: aws.String(hostID),
			},
			"source": {
				S: aws.String("discord"),
			},
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to query hosts table: %w", err)
	}

	if result.Item == nil {
		return nil, nil // Host not found
	}

	var host models.Host
	err = dynamodbattribute.UnmarshalMap(result.Item, &host)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal host: %w", err)
	}

	return &host, nil
}

// getCampaignByChannelID retrieves a campaign using channelId as campaignId
func getCampaignByChannelID(channelID string) (*models.Campaign, error) {
	campaignsTable := os.Getenv("SYRUS_CAMPAIGNS_TABLE")
	if campaignsTable == "" {
		return nil, fmt.Errorf("SYRUS_CAMPAIGNS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	// Use channelId as campaignId (partition key)
	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {
				S: aws.String(channelID),
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

// isCampaignEnded checks if a campaign is ended
func isCampaignEnded(campaign *models.Campaign) bool {
	if campaign == nil {
		return false
	}
	// Check both status == "ended" AND lifecycle.endedAt != nil
	return campaign.Status == models.CampaignStatusEnded || campaign.Lifecycle.EndedAt != nil
}

// sendToMessagingQueue sends a message to the messaging queue
func sendToMessagingQueue(channelID, content, interactionToken string) error {
	queueURL := os.Getenv("SYRUS_MESSAGING_QUEUE_URL")
	if queueURL == "" {
		return fmt.Errorf("SYRUS_MESSAGING_QUEUE_URL environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := sqs.New(sess)

	message := models.MessagingQueueMessage{
		ChannelID:        channelID,
		Content:          content,
		InteractionToken: interactionToken,
	}

	messageBodyJSON, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message body: %w", err)
	}

	_, err = svc.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(queueURL),
		MessageBody:            aws.String(string(messageBodyJSON)),
		MessageGroupId:         aws.String("discord-responses"),
		MessageDeduplicationId: aws.String(fmt.Sprintf("%s-%d", channelID, time.Now().UnixNano())),
	})

	if err != nil {
		return fmt.Errorf("failed to send message to queue: %w", err)
	}

	log.Printf("Successfully sent message to messaging queue for channel %s", channelID)
	return nil
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

	dedupKey := fmt.Sprintf("configuring#%s", interactionID)

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

	dedupKey := fmt.Sprintf("configuring#%s", interactionID)
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

	log.Printf("Marked interaction %s as processed in dedup table", interactionID)
	return nil
}

// createPlaceholderCampaign creates a placeholder campaign
func createPlaceholderCampaign(channelID, hostID string, campaignType models.CampaignType, decisionModel models.DecisionModel, stage string) (*models.Campaign, error) {
	now := time.Now().UTC()

	campaign := &models.Campaign{
		CampaignID:    channelID, // Use channelId as campaignId
		CampaignType:  campaignType,
		DecisionModel: decisionModel,
		Status:        models.CampaignStatusConfiguring,
		Lifecycle: models.Lifecycle{
			Paused:     false,
			EndedAt:    nil,
			EndedState: nil,
			ArchivedAt: nil,
		},
		CreatedAt:     now,
		LastUpdatedAt: now,
		HostID:        hostID,
		Source:        "discord",
		Meta: models.CampaignMeta{
			Mode:          "group",
			GuildID:       nil,
			ChannelID:     channelID,
			EngineVersion: "loros-campaign-v1",
			Narrator:      "syrus",
		},
		Party: models.Party{
			Members: []models.PartyMember{
				{
					UserID:   hostID,
					Role:     "host",
					JoinedAt: now,
				},
			},
			Boons: models.Boons{
				Available: []interface{}{},
			},
			SpectatorsAllowed: true,
			MaxActivePlayers:  9,
		},
		Blueprint: models.Blueprint{
			Title:           "New Campaign",
			Premise:         "A new adventure begins...",
			ThematicPillars: []string{},
			IngredientBinding: models.IngredientBinding{
				ObjectiveSeed: "",
				Twists:        []string{},
				Antagonists:   []string{},
				SetPieces:     []string{},
			},
			Acts:         []models.Act{},
			MajorForces:  map[string]models.MajorForce{},
			NPCs:         map[string]models.NPC{},
			BoonPlan:     []models.BoonPlanEntry{},
			FailurePaths: []models.FailurePath{},
			EndStates: models.EndStates{
				Success:     "",
				Compromised: "",
				Failure:     "",
			},
			MemoryDirectives: models.MemoryDirectives{
				CanonicalFacts:   []string{},
				RelationshipAxes: []models.RelationshipAxis{},
				DecisionFlags:    []string{},
				ActSummaryFocus:  map[string][]string{},
			},
			ImagePlan: map[string]models.ImagePlanItem{},
		},
		Runtime: models.RuntimeState{
			CurrentAct:  1,
			CurrentBeat: 0,
			TurnState: models.TurnState{
				Mode:           "group",
				ActiveDecision: nil,
			},
			ActiveFailurePaths: []string{},
			Pressure: models.Pressure{
				Level:  0,
				Causes: []string{},
			},
		},
		Memory: models.Memory{
			Global: models.GlobalMemory{
				CanonicalFacts: map[string]interface{}{},
				Relationships:  map[string]interface{}{},
				DecisionFlags:  map[string]interface{}{},
			},
			PerAct: map[string]models.ActMemory{},
		},
		CostTracking: models.CostTracking{
			SoftLimits: models.SoftLimits{
				SonnetCalls: 10,
				HaikuCalls:  1000,
				ImageCalls:  10,
			},
			Usage: models.Usage{
				SonnetCalls: 0,
				HaikuCalls:  0,
				ImageCalls:  0,
			},
			EstimatedCostUSD: 0.0,
		},
		ModelPolicy: models.ModelPolicy{
			IntentParsing: models.ModelHaiku,
			Narration:     models.ModelHaiku,
			Cinematics:    models.ModelSonnet,
			Blueprint:     models.ModelSonnet,
			ImageGen:      models.ModelNanoBanana,
		},
	}

	return campaign, nil
}

// saveCampaign saves a campaign to DynamoDB
func saveCampaign(campaign *models.Campaign) error {
	campaignsTable := os.Getenv("SYRUS_CAMPAIGNS_TABLE")
	if campaignsTable == "" {
		return fmt.Errorf("SYRUS_CAMPAIGNS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := dynamodb.New(sess)

	av, err := dynamodbattribute.MarshalMap(campaign)
	if err != nil {
		return fmt.Errorf("failed to marshal campaign: %w", err)
	}

	_, err = svc.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(campaignsTable),
		Item:      av,
	})

	if err != nil {
		return fmt.Errorf("failed to save campaign: %w", err)
	}

	log.Printf("Successfully saved campaign %s", campaign.CampaignID)
	return nil
}

// processSQSMessage processes a single SQS message
func processSQSMessage(message events.SQSMessage, stage string) error {
	// Parse message body
	var messageBody models.ConfiguringMessage
	if err := json.Unmarshal([]byte(message.Body), &messageBody); err != nil {
		return fmt.Errorf("failed to parse message body: %w", err)
	}

	log.Printf("Processing configuring message for channel %s, host %s", messageBody.ChannelID, messageBody.HostID)

	// Validate required fields
	if messageBody.ChannelID == "" {
		return fmt.Errorf("missing required field: channel_id")
	}
	if messageBody.HostID == "" {
		return fmt.Errorf("missing required field: host_id")
	}
	if messageBody.InteractionID == "" {
		return fmt.Errorf("missing required field: interaction_id")
	}
	if len(messageBody.Options) == 0 {
		return fmt.Errorf("missing required field: options")
	}

	// Parse subcommand from options
	var subcommand string
	if len(messageBody.Options) > 0 {
		if name, ok := messageBody.Options[0]["name"].(string); ok {
			subcommand = name
		}
	}

	log.Printf("Parsed subcommand: %s", subcommand)

	// Check deduplication FIRST (before any business logic)
	alreadyProcessed, err := checkDedup(messageBody.InteractionID)
	if err != nil {
		log.Printf("Warning: failed to check dedup table: %v", err)
		// Continue processing - don't fail on dedup check errors
	} else if alreadyProcessed {
		log.Printf("Message already processed (interaction %s), skipping", messageBody.InteractionID)
		return nil // Successfully handled - already processed
	}

	// Check if host exists
	host, err := checkHostExists(messageBody.HostID)
	if err != nil {
		log.Printf("Failed to check host: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads flicker with uncertainty. Try again when the loom is stable.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry on infrastructure errors after sending message
	}
	if host == nil {
		log.Printf("Host %s not whitelisted", messageBody.HostID)
		if err := sendToMessagingQueue(messageBody.ChannelID, "I sense your presence, but you are not yet bound to the loom. The weaver must grant you passage first.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send unauthorized message: %v", err)
		}
		return nil // Successfully handled - sent error message
	}
	log.Printf("Host %s is whitelisted", messageBody.HostID)

	// Now handle subcommand-specific logic after all validations
	switch subcommand {
	case "start":
		return handleStartCampaign(messageBody, stage)
	case "end":
		return handleEndCampaign(messageBody, stage)
	default:
		log.Printf("Unhandled campaign subcommand: %s", subcommand)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads know not this command. Speak more clearly, and I shall listen.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}
}

// handleStartCampaign handles the /campaign start subcommand
func handleStartCampaign(messageBody models.ConfiguringMessage, stage string) error {
	// Check for existing campaign using channelId as campaignId
	campaign, err := getCampaignByChannelID(messageBody.ChannelID)
	if err != nil {
		log.Printf("Failed to check for existing campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads blur and tangle. I cannot see clearly. Try again when the pattern settles.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry on infrastructure errors after sending message
	}

	// If campaign exists and is not ended, send error message
	if campaign != nil && !isCampaignEnded(campaign) {
		log.Printf("Active campaign already exists for channel %s", messageBody.ChannelID)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The loom only weaves one story per channel. Your tale still unfolds here—finish what you have begun, or let it end before starting anew.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Successfully handled - sent error message
	}

	// Extract start subcommand parameters
	var campaignType models.CampaignType
	var decisions string

	if len(messageBody.Options) > 0 {
		if nestedOpts, ok := messageBody.Options[0]["options"].([]interface{}); ok {
			for _, opt := range nestedOpts {
				if optMap, ok := opt.(map[string]interface{}); ok {
					name, _ := optMap["name"].(string)
					switch name {
					case "type":
						if typeStr, ok := optMap["value"].(string); ok {
							campaignType = models.CampaignType(typeStr)
						}
					case "decisions":
						if decisionStr, ok := optMap["value"].(string); ok {
							decisions = decisionStr
						}
					}
				}
			}
		}
	}

	log.Printf("Start campaign - type: %s, decisions: %s", campaignType, decisions)

	// Validate campaign type
	if campaignType == "" {
		log.Printf("Missing campaign type for /campaign start")
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern lacks shape. You must choose a campaign type.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	// Validate decisions
	if decisions == "" {
		log.Printf("Missing decisions option for /campaign start")
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads await direction. Who shall guide the choices?", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	// Validate decisions value
	validDecisions := map[string]bool{"host": true, "flexible": true, "group": true}
	if !validDecisions[decisions] {
		log.Printf("Invalid decisions value: %s", decisions)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The path you choose is unclear. Speak: host, flexible, or group.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	// Create new placeholder campaign
	log.Printf("Creating new campaign for channel %s with type %s", messageBody.ChannelID, campaignType)
	newCampaign, err := createPlaceholderCampaign(messageBody.ChannelID, messageBody.HostID, campaignType, models.DecisionModel(decisions), stage)
	if err != nil {
		log.Printf("Failed to create placeholder campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern resists. Something in the weave is wrong. I cannot begin.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry after sending error message
	}

	// Save campaign to DynamoDB
	if err := saveCampaign(newCampaign); err != nil {
		log.Printf("Failed to save campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads slip through my grasp. I cannot hold the pattern. Try again.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry after sending error message
	}

	// Mark as processed in dedup table
	if err := writeDedup(messageBody.InteractionID); err != nil {
		log.Printf("Warning: failed to write to dedup table: %v", err)
		// Don't fail the entire operation if dedup write fails
	}

	// Send success message to the channel
	successMessage := `I feel the tension in the threads.
A campaign takes form — pulled from chance, bound by choice.
Hold steady. The weaving begins.`
	if err := sendToMessagingQueue(messageBody.ChannelID, successMessage, messageBody.InteractionToken); err != nil {
		log.Printf("Warning: failed to send success message: %v", err)
		// Don't fail if success message fails - campaign was created
	}

	log.Printf("Successfully created campaign for channel %s", messageBody.ChannelID)
	return nil
}

// handleEndCampaign handles the /campaign end subcommand
func handleEndCampaign(messageBody models.ConfiguringMessage, stage string) error {
	// Check if campaign exists
	campaign, err := getCampaignByChannelID(messageBody.ChannelID)
	if err != nil {
		log.Printf("Failed to check for existing campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads blur and tangle. I cannot see clearly. Try again when the pattern settles.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry on infrastructure errors after sending message
	}

	if campaign == nil || isCampaignEnded(campaign) {
		log.Printf("No active campaign found for channel %s", messageBody.ChannelID)
		if err := sendToMessagingQueue(messageBody.ChannelID, "There are no threads here to sever. The loom is empty, waiting.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Successfully handled - sent error message
	}

	// Check if this is a confirmation
	hasConfirm := false
	if len(messageBody.Options) > 0 {
		if nestedOpts, ok := messageBody.Options[0]["options"].([]interface{}); ok {
			for _, opt := range nestedOpts {
				if optMap, ok := opt.(map[string]interface{}); ok {
					if name, _ := optMap["name"].(string); name == "confirm" {
						hasConfirm = true
						break
					}
				}
			}
		}
	}

	if hasConfirm {
		return handleEndConfirm(messageBody, campaign, stage)
	} else {
		return createEndConfirmation(messageBody, campaign, stage)
	}
}

// createEndConfirmation creates a confirmation record for ending a campaign
func createEndConfirmation(messageBody models.ConfiguringMessage, campaign *models.Campaign, stage string) error {
	confirmationsTable := os.Getenv("SYRUS_CONFIRMATIONS_TABLE")
	if confirmationsTable == "" {
		return fmt.Errorf("SYRUS_CONFIRMATIONS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		log.Printf("Failed to create AWS session: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern resists. Something in the weave is wrong.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	svc := dynamodb.New(sess)

	expiresAt := time.Now().Add(60 * time.Second).Unix()

	_, err = svc.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(confirmationsTable),
		Item: map[string]*dynamodb.AttributeValue{
			"campaignId":       {S: aws.String(campaign.CampaignID)},
			"confirmationType": {S: aws.String("campaign_end")},
			"expiresAt":        {N: aws.String(fmt.Sprintf("%d", expiresAt))},
			"channelId":        {S: aws.String(messageBody.ChannelID)},
			"hostId":           {S: aws.String(messageBody.HostID)},
		},
	})

	if err != nil {
		log.Printf("Failed to write confirmation record: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern resists. Something in the weave is wrong.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	message := `The threads you have woven will unravel.
This choice is final—no thread can be respun, no moment relived.
Fate demands certainty.
If you are sure, whisper /campaign end confirm within 60 heartbeats.`

	if err := sendToMessagingQueue(messageBody.ChannelID, message, messageBody.InteractionToken); err != nil {
		log.Printf("Failed to send confirmation message: %v", err)
		return nil
	}

	log.Printf("Created end confirmation for campaign %s", campaign.CampaignID)
	return nil
}

// handleEndConfirm validates confirmation and ends the campaign
func handleEndConfirm(messageBody models.ConfiguringMessage, campaign *models.Campaign, stage string) error {
	confirmationsTable := os.Getenv("SYRUS_CONFIRMATIONS_TABLE")
	if confirmationsTable == "" {
		return fmt.Errorf("SYRUS_CONFIRMATIONS_TABLE environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		log.Printf("Failed to create AWS session: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern resists. Something in the weave is wrong.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	svc := dynamodb.New(sess)

	// Read confirmation record
	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(confirmationsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaign.CampaignID)},
		},
	})

	if err != nil {
		log.Printf("Failed to read confirmation record: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The pattern resists. Something in the weave is wrong.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	if result.Item == nil {
		log.Printf("No confirmation record found for campaign %s", campaign.CampaignID)
		message := `I sense no pending fate here.
The threads remain as they were.
Perhaps you never called for their ending, or time has already swept your words away.`
		if err := sendToMessagingQueue(messageBody.ChannelID, message, messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	// Check TTL
	if expiresAtAttr, ok := result.Item["expiresAt"]; ok && expiresAtAttr.N != nil {
		expiresAt, parseErr := strconv.ParseInt(*expiresAtAttr.N, 10, 64)
		if parseErr != nil {
			log.Printf("Failed to parse expiresAt: %v", parseErr)
		} else if time.Now().Unix() > expiresAt {
			log.Printf("Confirmation expired for campaign %s", campaign.CampaignID)
			message := `Time has passed.
Your words came too late—the moment has faded.
If you still wish to end this tale, speak /campaign end once more.`
			if err := sendToMessagingQueue(messageBody.ChannelID, message, messageBody.InteractionToken); err != nil {
				log.Printf("Failed to send error message: %v", err)
			}
			return nil
		}
	}

	// Delete confirmation (prevent reuse)
	_, err = svc.DeleteItem(&dynamodb.DeleteItemInput{
		TableName: aws.String(confirmationsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaign.CampaignID)},
		},
	})
	if err != nil {
		log.Printf("Warning: failed to delete confirmation record: %v", err)
		// Continue anyway - better to end the campaign
	}

	// End the campaign
	now := time.Now()
	campaign.Status = models.CampaignStatusEnded
	campaign.Lifecycle.EndedAt = &now
	campaign.LastUpdatedAt = now

	if err := saveCampaign(campaign); err != nil {
		log.Printf("Failed to save ended campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.ChannelID, "The threads slip through my grasp. I cannot hold the pattern. Try again.", messageBody.InteractionToken); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil
	}

	// Write dedup
	if err := writeDedup(messageBody.InteractionID); err != nil {
		log.Printf("Warning: failed to write to dedup table: %v", err)
		// Don't fail the entire operation if dedup write fails
	}

	message := `It is done.
The threads have been cut, the story released back into the void.
What was woven here exists now only in memory—yours, and the echo of what once lived.`

	if err := sendToMessagingQueue(messageBody.ChannelID, message, messageBody.InteractionToken); err != nil {
		log.Printf("Warning: failed to send success message: %v", err)
		// Don't fail if success message fails - campaign was ended
	}

	log.Printf("Successfully ended campaign %s", campaign.CampaignID)
	return nil
}

// handleSQSRequest handles SQS events
func handleSQSRequest(ctx context.Context, sqsEvent events.SQSEvent) error {
	// Get stage from environment
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
	}

	// Process each message in the batch
	var errors []error
	for _, record := range sqsEvent.Records {
		log.Printf("Processing message: %s", record.MessageId)

		if err := processSQSMessage(record, stage); err != nil {
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
