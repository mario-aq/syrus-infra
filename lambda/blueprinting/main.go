package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
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
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/sqs"
	"github.com/aws/aws-sdk-go/service/ssm"

	models "loros/syrus-models"
)

//go:embed assets/blueprintPrompt.txt
var blueprintPrompt string

//go:embed assets/boons.json
var boonsJSON string

//go:embed assets/sample-blueprint-short.json
var sampleBlueprintShort string

//go:embed assets/sample-blueprint-long.json
var sampleBlueprintLong string

//go:embed assets/sample-blueprint-epic.json
var sampleBlueprintEpic string

var (
	awsSession       *session.Session
	dynamodbClient   *dynamodb.DynamoDB
	s3Client         *s3.S3
	sqsClient        *sqs.SQS
	ssmClient        *ssm.SSM
	campaignsTable   string
	dedupTable       string
	messagingQueue   string
	imageGenQueue    string
	modelCacheBucket string
	stage            string
)

func init() {
	awsSession = session.Must(session.NewSession())
	dynamodbClient = dynamodb.New(awsSession)
	s3Client = s3.New(awsSession)
	sqsClient = sqs.New(awsSession)
	ssmClient = ssm.New(awsSession)

	campaignsTable = os.Getenv("SYRUS_CAMPAIGNS_TABLE")
	dedupTable = os.Getenv("SYRUS_DEDUP_TABLE")
	messagingQueue = os.Getenv("SYRUS_MESSAGING_QUEUE_URL")
	imageGenQueue = os.Getenv("SYRUS_IMAGEGEN_QUEUE_URL")
	modelCacheBucket = os.Getenv("SYRUS_MODEL_CACHE_BUCKET")
	stage = os.Getenv("SYRUS_STAGE")
}

func handler(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	log.Printf("Received %d messages from blueprinting queue", len(event.Records))

	var batchItemFailures []events.SQSBatchItemFailure

	for _, record := range event.Records {
		if err := processBlueprintMessage(ctx, record); err != nil {
			log.Printf("Failed to process message %s: %v", record.MessageId, err)
			batchItemFailures = append(batchItemFailures, events.SQSBatchItemFailure{
				ItemIdentifier: record.MessageId,
			})
		}
	}

	return events.SQSEventResponse{
		BatchItemFailures: batchItemFailures,
	}, nil
}

func processBlueprintMessage(ctx context.Context, record events.SQSMessage) error {
	log.Printf("Processing blueprint message: %s", record.MessageId)

	// Parse the blueprint message
	var blueprintMsg models.BlueprintMessage
	if err := json.Unmarshal([]byte(record.Body), &blueprintMsg); err != nil {
		return fmt.Errorf("failed to unmarshal blueprint message: %w", err)
	}

	log.Printf("Campaign ID: %s, Interaction ID: %s", blueprintMsg.CampaignID, blueprintMsg.InteractionID)

	// Check dedup table
	if isDuplicate, err := checkDedup(blueprintMsg.InteractionID); err != nil {
		return fmt.Errorf("failed to check dedup: %w", err)
	} else if isDuplicate {
		log.Printf("Message already processed (interactionId: %s), skipping", blueprintMsg.InteractionID)
		return nil
	}

	// Fetch campaign from DynamoDB
	campaign, err := getCampaign(blueprintMsg.CampaignID)
	if err != nil {
		return fmt.Errorf("failed to get campaign: %w", err)
	}

	// Determine which model to use
	modelName := determineModel(campaign)
	log.Printf("Using model: %s", modelName)

	// Check S3 cache
	cacheKey := fmt.Sprintf("%s/blueprint/%s/response.json", blueprintMsg.CampaignID, modelName)
	cachedResponse, found, err := checkCache(cacheKey)
	if err != nil {
		return fmt.Errorf("failed to check cache: %w", err)
	}

	var claudeResponse string
	if found {
		log.Printf("Cache hit for campaign %s", blueprintMsg.CampaignID)
		claudeResponse = cachedResponse
	} else {
		log.Printf("Cache miss for campaign %s, calling Claude API", blueprintMsg.CampaignID)

		// Get API key from SSM
		apiKey, err := getAnthropicAPIKey()
		if err != nil {
			return fmt.Errorf("failed to get API key: %w", err)
		}

		// Call Claude API
		claudeResponse, err = callClaude(ctx, apiKey, modelName, blueprintMsg, campaign)
		if err != nil {
			return fmt.Errorf("failed to call Claude: %w", err)
		}

		// Save to cache
		if err := saveToCache(cacheKey, claudeResponse); err != nil {
			log.Printf("Warning: failed to save to cache: %v", err)
		}
	}

	// Parse and validate blueprint
	blueprint, introduction, err := parseAndValidateResponse(claudeResponse, blueprintMsg.Seeds)
	if err != nil {
		return fmt.Errorf("failed to parse/validate response: %w", err)
	}

	log.Printf("Blueprint validated: %s", blueprint.Title)

	// Update campaign with blueprint
	if err := updateCampaignWithBlueprint(blueprintMsg.CampaignID, blueprint); err != nil {
		return fmt.Errorf("failed to update campaign: %w", err)
	}

	// Check if campaign is already active (from a previous successful attempt)
	campaign, err = getCampaign(blueprintMsg.CampaignID)
	if err != nil {
		return fmt.Errorf("failed to get campaign: %w", err)
	}

	if campaign.Status == models.CampaignStatusActive {
		log.Printf("Campaign %s is already active, skipping message sends (likely a retry)", blueprintMsg.CampaignID)
		return nil
	}

	// Generate intro image if present in imagePlan
	var introImageS3Key string
	if introImage, exists := blueprint.ImagePlan["intro"]; exists && introImage.Prompt != "" {
		log.Printf("Generating intro image for campaign %s", blueprintMsg.CampaignID)
		s3Key, err := generateIntroImage(ctx, blueprintMsg.CampaignID, introImage.Prompt)
		if err != nil {
			log.Printf("Warning: failed to generate intro image: %v", err)
			// Don't fail the entire blueprint if intro image fails
		} else {
			introImageS3Key = s3Key
			// Update blueprint with S3 key
			if err := updateImagePlanS3Key(blueprintMsg.CampaignID, "intro", s3Key); err != nil {
				log.Printf("Warning: failed to update intro image S3 key: %v", err)
			}
		}
	}

	// Queue remaining images to imageGen queue
	if err := queueMilestoneImages(blueprintMsg.CampaignID, blueprintMsg.InteractionID, blueprint); err != nil {
		log.Printf("Warning: failed to queue milestone images: %v", err)
		// Don't fail the entire blueprint if image queueing fails
	}

	// Send introduction to messaging queue
	if err := sendIntroductionToMessaging(blueprintMsg.CampaignID, blueprintMsg.InteractionID, blueprint, introduction, introImageS3Key); err != nil {
		log.Printf("ERROR: Failed to send introduction messages: %v", err)
		return fmt.Errorf("failed to send introduction: %w", err)
	}

	log.Printf("Successfully sent all introduction messages for campaign %s", blueprintMsg.CampaignID)

	// Update campaign status to active
	if err := updateCampaignStatus(blueprintMsg.CampaignID, "active"); err != nil {
		return fmt.Errorf("failed to update campaign status: %w", err)
	}

	// Mark as processed in dedup table
	if err := markAsProcessed(blueprintMsg.InteractionID); err != nil {
		log.Printf("Warning: failed to mark as processed: %v", err)
	}

	log.Printf("Successfully processed blueprint for campaign %s", blueprintMsg.CampaignID)
	return nil
}

func checkDedup(interactionID string) (bool, error) {
	dedupKey := fmt.Sprintf("blueprinting#%s", interactionID)
	result, err := dynamodbClient.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(dedupTable),
		Key: map[string]*dynamodb.AttributeValue{
			"dedupKey": {S: aws.String(dedupKey)},
		},
	})
	if err != nil {
		return false, err
	}
	return result.Item != nil, nil
}

func markAsProcessed(interactionID string) error {
	dedupKey := fmt.Sprintf("blueprinting#%s", interactionID)
	ttl := time.Now().Add(24 * time.Hour).Unix()
	_, err := dynamodbClient.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(dedupTable),
		Item: map[string]*dynamodb.AttributeValue{
			"dedupKey":    {S: aws.String(dedupKey)},
			"expiresAt":   {N: aws.String(fmt.Sprintf("%d", ttl))},
			"processedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	return err
}

func getCampaign(campaignID string) (*models.Campaign, error) {
	result, err := dynamodbClient.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
	})
	if err != nil {
		return nil, err
	}
	if result.Item == nil {
		return nil, fmt.Errorf("campaign not found: %s", campaignID)
	}

	var campaign models.Campaign
	if err := dynamodbattribute.UnmarshalMap(result.Item, &campaign); err != nil {
		return nil, err
	}
	return &campaign, nil
}

func determineModel(campaign *models.Campaign) string {
	if campaign.ModelPolicy.Blueprint == "haiku" {
		return "haiku"
	}
	return "sonnet" // default
}

func checkCache(cacheKey string) (string, bool, error) {
	result, err := s3Client.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(modelCacheBucket),
		Key:    aws.String(cacheKey),
	})
	if err != nil {
		if strings.Contains(err.Error(), "NoSuchKey") {
			return "", false, nil
		}
		return "", false, err
	}
	defer result.Body.Close()

	buf := new(strings.Builder)
	bodyBytes, err := io.ReadAll(result.Body)
	if err != nil {
		return "", false, err
	}
	buf.WriteString(string(bodyBytes))
	return buf.String(), true, nil
}

func saveToCache(cacheKey, content string) error {
	_, err := s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(modelCacheBucket),
		Key:         aws.String(cacheKey),
		Body:        strings.NewReader(content),
		ContentType: aws.String("text/plain"),
	})
	return err
}

func getAnthropicAPIKey() (string, error) {
	paramName := fmt.Sprintf("/syrus/%s/anthropic/api-key", stage)
	result, err := ssmClient.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true),
	})
	if err != nil {
		return "", err
	}
	return *result.Parameter.Value, nil
}

func callClaude(ctx context.Context, apiKey, modelName string, blueprintMsg models.BlueprintMessage, campaign *models.Campaign) (string, error) {
	// Build the prompt
	userPrompt, err := buildPrompt(blueprintMsg, campaign)
	if err != nil {
		return "", fmt.Errorf("failed to build prompt: %w", err)
	}

	// Determine model ID and max tokens
	var modelID string
	var maxTokens int
	if modelName == "haiku" {
		modelID = "claude-3-5-haiku-20241022"
		maxTokens = 8000 // Haiku max is 8192, use 8000 for safety
	} else {
		modelID = "claude-sonnet-4-20250514"
		maxTokens = 16000
	}

	// Call Anthropic API
	// Note: This is a simplified implementation. In production, use the official SDK or HTTP client.
	log.Printf("Calling Claude API with model %s", modelID)

	// For now, we'll use a placeholder since the actual API call requires HTTP client setup
	// In production, implement proper Anthropic API call here
	return callAnthropicAPI(ctx, apiKey, modelID, maxTokens, blueprintPrompt, userPrompt)
}

func buildPrompt(blueprintMsg models.BlueprintMessage, campaign *models.Campaign) (string, error) {
	// Build configuration section
	configJSON, err := json.MarshalIndent(map[string]interface{}{
		"campaignLength": campaign.CampaignType,
		"playStyle":      "synchronous", // TODO: get from campaign config
		"partySize":      len(campaign.Party.Members),
		"difficulty":     "standard", // TODO: get from campaign config
		"magicPresence":  "medium",   // TODO: get from campaign config
		"campaignTone":   "",         // TODO: get from campaign config
	}, "", "  ")
	if err != nil {
		return "", err
	}

	// Build beat profile section
	beatProfileJSON, err := json.MarshalIndent(blueprintMsg.Seeds.BeatProfile, "", "  ")
	if err != nil {
		return "", err
	}

	// Build seed package section
	seedsJSON, err := json.MarshalIndent(blueprintMsg.Seeds, "", "  ")
	if err != nil {
		return "", err
	}

	// Select appropriate sample blueprint based on campaign type
	var sampleBlueprint string
	switch campaign.CampaignType {
	case models.CampaignTypeShort:
		sampleBlueprint = sampleBlueprintShort
	case models.CampaignTypeLong:
		sampleBlueprint = sampleBlueprintLong
	case models.CampaignTypeEpic:
		sampleBlueprint = sampleBlueprintEpic
	default:
		sampleBlueprint = sampleBlueprintLong // Default to long
	}

	// Assemble full prompt
	prompt := fmt.Sprintf(`Please generate a campaign blueprint.

<configuration>
%s
</configuration>

<beatProfile>
%s
</beatProfile>

<availableBoons>
%s
</availableBoons>

<seedPackage>
%s
</seedPackage>

<exampleBlueprint>
%s
</exampleBlueprint>`,
		string(configJSON),
		string(beatProfileJSON),
		boonsJSON,
		string(seedsJSON),
		sampleBlueprint,
	)

	return prompt, nil
}

func callAnthropicAPI(ctx context.Context, apiKey, modelID string, maxTokens int, systemPrompt, userPrompt string) (string, error) {
	log.Printf("Calling Anthropic API with model %s (max tokens: %d)", modelID, maxTokens)

	// Build request payload
	payload := map[string]interface{}{
		"model":       modelID,
		"max_tokens":  maxTokens,
		"temperature": 0.7,
		"system":      systemPrompt,
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": userPrompt,
			},
		},
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(payloadJSON))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	// Make API call
	client := &http.Client{
		Timeout: 4 * time.Minute, // Claude can take a while
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var apiResponse struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
	}

	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(apiResponse.Content) == 0 {
		return "", fmt.Errorf("API returned empty content")
	}

	responseText := apiResponse.Content[0].Text
	log.Printf("Received response from Claude (length: %d characters, stop reason: %s)", len(responseText), apiResponse.StopReason)

	return responseText, nil
}

func parseAndValidateResponse(response string, seeds models.CampaignSeeds) (*models.Blueprint, string, error) {
	log.Printf("Parsing Claude response (length: %d chars)", len(response))

	// Parse the JSON response from Claude
	var claudeResponse struct {
		Blueprint json.RawMessage `json:"blueprint"`
		Intro     string          `json:"intro"`
	}

	if err := json.Unmarshal([]byte(response), &claudeResponse); err != nil {
		// Log the first 500 chars for debugging
		previewLen := 500
		if len(response) < previewLen {
			previewLen = len(response)
		}
		log.Printf("Failed to parse JSON. Response preview: %s", response[:previewLen])
		return nil, "", fmt.Errorf("failed to parse JSON response: %w", err)
	}

	// Parse the blueprint
	var blueprint models.Blueprint
	if err := json.Unmarshal(claudeResponse.Blueprint, &blueprint); err != nil {
		return nil, "", fmt.Errorf("failed to parse blueprint JSON: %w", err)
	}

	// Validate blueprint
	if err := validateBlueprint(&blueprint, seeds); err != nil {
		return nil, "", fmt.Errorf("blueprint validation failed: %w", err)
	}

	log.Printf("Successfully parsed and validated blueprint: %s", blueprint.Title)

	return &blueprint, claudeResponse.Intro, nil
}

func validateBlueprint(blueprint *models.Blueprint, seeds models.CampaignSeeds) error {
	// Required fields
	if blueprint.Title == "" {
		return fmt.Errorf("missing required field: title")
	}
	if blueprint.Premise == "" {
		return fmt.Errorf("missing required field: premise")
	}
	if len(blueprint.ThematicPillars) != 3 {
		return fmt.Errorf("thematicPillars must have exactly 3 elements, got %d", len(blueprint.ThematicPillars))
	}

	// Acts validation
	expectedActs := seeds.BeatProfile.Acts
	if len(blueprint.Acts) != expectedActs {
		return fmt.Errorf("acts count mismatch: expected %d, got %d", expectedActs, len(blueprint.Acts))
	}

	// TODO: Add more validation as needed:
	// - Validate area names match featured areas
	// - Validate NPC firstAppearanceAct values
	// - Validate boon names match available boons
	// - Validate end states structure

	return nil
}

func updateCampaignWithBlueprint(campaignID string, blueprint *models.Blueprint) error {
	blueprintJSON, err := dynamodbattribute.MarshalMap(blueprint)
	if err != nil {
		return err
	}

	_, err = dynamodbClient.UpdateItem(&dynamodb.UpdateItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
		UpdateExpression: aws.String("SET blueprint = :blueprint, lastUpdatedAt = :lastUpdatedAt"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":blueprint":     {M: blueprintJSON},
			":lastUpdatedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	return err
}

func updateCampaignStatus(campaignID string, status string) error {
	_, err := dynamodbClient.UpdateItem(&dynamodb.UpdateItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
		UpdateExpression: aws.String("SET #status = :status, lastUpdatedAt = :lastUpdatedAt"),
		ExpressionAttributeNames: map[string]*string{
			"#status": aws.String("status"),
		},
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":status":        {S: aws.String(status)},
			":lastUpdatedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to update campaign status to %s: %w", status, err)
	}
	log.Printf("Updated campaign %s status to: %s", campaignID, status)
	return nil
}

func sendIntroductionToMessaging(campaignID, interactionID string, blueprint *models.Blueprint, introduction, introImageS3Key string) error {
	log.Printf("DEBUG: sendIntroductionToMessaging called - campaignID: %s, interactionID: %s, hasIntroImage: %v",
		campaignID, interactionID, introImageS3Key != "")

	// Get the campaign to find the channel ID
	campaign, err := getCampaign(campaignID)
	if err != nil {
		log.Printf("ERROR: Failed to get campaign: %v", err)
		return fmt.Errorf("failed to get campaign for messaging: %w", err)
	}

	log.Printf("DEBUG: Campaign retrieved - channelID: %s", campaign.Meta.ChannelID)

	// Message 1: Campaign Title with optional intro image attachment
	titleMsg := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   fmt.Sprintf("This is the thread now drawn from the weave:\n## %s", blueprint.Title),
	}

	// If intro image was generated, add it as attachment
	if introImageS3Key != "" {
		log.Printf("DEBUG: Adding intro image S3 key to message: %s", introImageS3Key)
		titleMsg.Attachments = []models.Attachment{
			{
				Name:        "intro.png",
				Data:        introImageS3Key, // Send S3 key, not base64 data
				ContentType: "image/png",
			},
		}
	} else {
		log.Printf("DEBUG: No intro image to attach")
	}

	log.Printf("DEBUG: Sending title message to queue")
	titleMsgJSON, err := json.Marshal(titleMsg)
	if err != nil {
		log.Printf("ERROR: Failed to marshal title message: %v", err)
		return fmt.Errorf("failed to marshal title message: %w", err)
	}
	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(titleMsgJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(interactionID + "-title"),
	})
	if err != nil {
		log.Printf("ERROR: Failed to send title message to SQS: %v", err)
		return fmt.Errorf("failed to send title message: %w", err)
	}
	log.Printf("DEBUG: Title message sent successfully")

	// Message 2: Campaign Premise
	log.Printf("DEBUG: Sending premise message")
	premiseMsg := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   blueprint.Premise,
	}
	premiseMsgJSON, err := json.Marshal(premiseMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal premise message: %w", err)
	}
	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(premiseMsgJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(interactionID + "-premise"),
	})
	if err != nil {
		log.Printf("ERROR: Failed to send premise message to SQS: %v", err)
		return fmt.Errorf("failed to send premise message: %w", err)
	}
	log.Printf("DEBUG: Premise message sent successfully")

	// Message 3: Introduction
	log.Printf("DEBUG: Sending introduction message")
	introMsg := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   introduction,
	}
	introMsgJSON, err := json.Marshal(introMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal intro message: %w", err)
	}
	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(introMsgJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(interactionID + "-intro"),
	})
	if err != nil {
		log.Printf("ERROR: Failed to send intro message to SQS: %v", err)
		return fmt.Errorf("failed to send intro message: %w", err)
	}
	log.Printf("DEBUG: Introduction message sent successfully")

	// Message 4: "The weave listens now."
	log.Printf("DEBUG: Sending weave message")
	weaveMsg := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   "The weave listens now.",
	}
	weaveMsgJSON, err := json.Marshal(weaveMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal weave message: %w", err)
	}
	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(weaveMsgJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(interactionID + "-weave"),
	})
	if err != nil {
		log.Printf("ERROR: Failed to send weave message to SQS: %v", err)
		return fmt.Errorf("failed to send weave message: %w", err)
	}
	log.Printf("DEBUG: Weave message sent successfully")

	// Message 5: How to Act (ephemeral)
	log.Printf("DEBUG: Sending how-to-act message")
	howToActMsg := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   "How to act:\nUse /syrus declare to state what your character does, intends, or investigates.\n\nExample:\n/syrus declare I step forward and address the council.",
		Flags:     64, // Ephemeral flag
	}
	howToActMsgJSON, err := json.Marshal(howToActMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal how-to-act message: %w", err)
	}
	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(howToActMsgJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(interactionID + "-howto"),
	})
	if err != nil {
		log.Printf("ERROR: Failed to send how-to-act message to SQS: %v", err)
	}

	log.Printf("DEBUG: All 5 intro messages sent successfully")
	return err
}

func generateIntroImage(ctx context.Context, campaignID, prompt string) (string, error) {
	s3Key := fmt.Sprintf("%s/images/intro.png", campaignID)

	// Check S3 cache first
	_, err := s3Client.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(modelCacheBucket),
		Key:    aws.String(s3Key),
	})
	if err == nil {
		log.Printf("Intro image already cached: %s", s3Key)
		return s3Key, nil
	}

	// Get API key
	apiKey, err := getOpenAIAPIKey()
	if err != nil {
		return "", fmt.Errorf("failed to get API key: %w", err)
	}

	// Call OpenAI API
	imageURL, err := callOpenAIImageAPI(ctx, apiKey, prompt)
	if err != nil {
		return "", fmt.Errorf("failed to call OpenAI: %w", err)
	}

	// Download image
	imageData, err := downloadImageFromURL(ctx, imageURL)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}

	// Upload to S3
	_, err = s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(modelCacheBucket),
		Key:         aws.String(s3Key),
		Body:        bytes.NewReader(imageData),
		ContentType: aws.String("image/png"),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	log.Printf("Successfully generated and cached intro image")
	return s3Key, nil
}

func getOpenAIAPIKey() (string, error) {
	paramName := fmt.Sprintf("/syrus/%s/openai/api-key", stage)
	result, err := ssmClient.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true),
	})
	if err != nil {
		return "", err
	}
	return *result.Parameter.Value, nil
}

func callOpenAIImageAPI(ctx context.Context, apiKey, prompt string) (string, error) {
	log.Printf("Calling OpenAI DALL-E 3 API")

	payload := map[string]interface{}{
		"model":   "dall-e-3",
		"prompt":  prompt,
		"n":       1,
		"size":    "1024x1024",
		"quality": "standard",
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/images/generations", bytes.NewReader(payloadJSON))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResponse struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(apiResponse.Data) == 0 {
		return "", fmt.Errorf("API returned empty data")
	}

	return apiResponse.Data[0].URL, nil
}

func downloadImageFromURL(ctx context.Context, imageURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

func updateImagePlanS3Key(campaignID, imageID, s3Key string) error {
	updateExpr := "SET blueprint.imagePlan.#imageId.s3Key = :s3Key, lastUpdatedAt = :lastUpdatedAt"

	_, err := dynamodbClient.UpdateItem(&dynamodb.UpdateItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
		UpdateExpression: aws.String(updateExpr),
		ExpressionAttributeNames: map[string]*string{
			"#imageId": aws.String(imageID),
		},
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":s3Key":         {S: aws.String(s3Key)},
			":lastUpdatedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	return err
}

func queueMilestoneImages(campaignID, interactionID string, blueprint *models.Blueprint) error {
	if imageGenQueue == "" {
		log.Printf("ImageGen queue URL not configured, skipping milestone images")
		return nil
	}

	for imageID, imagePlan := range blueprint.ImagePlan {
		// Skip intro image (already generated)
		if imageID == "intro" {
			continue
		}

		// Skip if no prompt
		if imagePlan.Prompt == "" {
			continue
		}

		// Create imageGen message
		imageGenMsg := models.ImageGenMessage{
			CampaignID:    campaignID,
			InteractionID: interactionID,
			ImageID:       imageID,
			Prompt:        imagePlan.Prompt,
			Model:         "dall-e-3",
		}

		msgJSON, err := json.Marshal(imageGenMsg)
		if err != nil {
			log.Printf("Warning: failed to marshal imageGen message for %s: %v", imageID, err)
			continue
		}

		_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
			QueueUrl:               aws.String(imageGenQueue),
			MessageBody:            aws.String(string(msgJSON)),
			MessageGroupId:         aws.String(campaignID),
			MessageDeduplicationId: aws.String(fmt.Sprintf("%s-%s", interactionID, imageID)),
		})
		if err != nil {
			log.Printf("Warning: failed to queue imageGen for %s: %v", imageID, err)
			continue
		}

		log.Printf("Queued imageGen for image %s", imageID)
	}

	return nil
}

func main() {
	lambda.Start(handler)
}
