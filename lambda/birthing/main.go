package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
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

//go:embed assets/campaign_seed_lambda_config.json
var configJSON []byte

//go:embed assets/campaign-blueprint-seeds.json
var seedsJSON []byte

// Config structures
type CampaignConfig struct {
	CampaignLengthProfiles map[string]LengthProfile `json:"campaignLengthProfiles"`
	BeatProfiles           map[string]BeatProfile   `json:"beatProfiles"`
	PlayStyleModifiers     map[string]interface{}   `json:"playStyleModifiers"`
	GlobalLimits           map[string]interface{}   `json:"globalLimits"`
}

type LengthProfile struct {
	Label                  string                 `json:"label"`
	EstimatedDurationHours int                    `json:"estimatedDurationHours"`
	Selection              SelectionRules         `json:"selection"`
	Guardrails             map[string]interface{} `json:"guardrails"`
}

type SelectionRules struct {
	Objective     MinMax `json:"objective"`
	Twists        MinMax `json:"twists"`
	Antagonists   MinMax `json:"antagonists"`
	SetPieces     MinMax `json:"setPieces"`
	Constraints   MinMax `json:"constraints"`
	FeaturedAreas MinMax `json:"featuredAreas"`
}

type MinMax struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type BeatProfile struct {
	Acts              int    `json:"acts"`
	BeatsPerAct       MinMax `json:"beatsPerAct"`
	AvgMinutesPerBeat int    `json:"avgMinutesPerBeat"`
	Notes             string `json:"notes"`
}

// Seeds structures
type CampaignSeeds struct {
	ObjectiveSeeds       []models.ObjectiveSeed  `json:"objectiveSeeds"`
	TwistCandidates      []models.TwistSeed      `json:"twistCandidates"`
	AntagonistCandidates []models.AntagonistSeed `json:"antagonistCandidates"`
	SetPieceCandidates   []models.SetPieceSeed   `json:"setPieceCandidates"`
	OptionalConstraints  []models.ConstraintSeed `json:"optionalConstraints"`
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

	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(dedupTable),
		Key: map[string]*dynamodb.AttributeValue{
			"dedupKey": {S: aws.String(interactionID)},
		},
	})

	if err != nil {
		return false, fmt.Errorf("failed to query dedup table: %w", err)
	}

	return result.Item != nil, nil
}

// writeDedup writes a deduplication record
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

	expiresAt := time.Now().Add(24 * time.Hour).Unix()

	_, err = svc.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(dedupTable),
		Item: map[string]*dynamodb.AttributeValue{
			"dedupKey":  {S: aws.String(interactionID)},
			"expiresAt": {N: aws.String(fmt.Sprintf("%d", expiresAt))},
		},
	})

	return err
}

// getCampaignByID retrieves a campaign by ID
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
			"campaignId": {S: aws.String(campaignID)},
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to get campaign: %w", err)
	}

	if result.Item == nil {
		return nil, nil
	}

	var campaign models.Campaign
	if err := dynamodbattribute.UnmarshalMap(result.Item, &campaign); err != nil {
		return nil, fmt.Errorf("failed to unmarshal campaign: %w", err)
	}

	return &campaign, nil
}

// sendToMessagingQueue sends a message to the messaging SQS queue
func sendToMessagingQueue(channelID, content string) error {
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
		ChannelID: channelID,
		Content:   content,
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

// selectRandomElements selects a random number of elements from a slice
func selectRandomElements[T any](items []T, min, max int) []T {
	count := rand.Intn(max-min+1) + min
	if count > len(items) {
		count = len(items)
	}

	// Shuffle and take first N
	shuffled := make([]T, len(items))
	copy(shuffled, items)
	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})

	return shuffled[:count]
}

// generateBlueprintSeeds generates random campaign seeds based on campaign type
func generateBlueprintSeeds(campaign *models.Campaign) (*models.CampaignSeeds, error) {
	// Parse configuration
	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Parse seeds
	var seeds CampaignSeeds
	if err := json.Unmarshal(seedsJSON, &seeds); err != nil {
		return nil, fmt.Errorf("failed to parse seeds: %w", err)
	}

	// Get length profile for campaign type
	profileKey := string(campaign.CampaignType)
	profile, ok := config.CampaignLengthProfiles[profileKey]
	if !ok {
		return nil, fmt.Errorf("unknown campaign type: %s", campaign.CampaignType)
	}

	// Get beat profile for campaign type
	beatProfile, ok := config.BeatProfiles[profileKey]
	if !ok {
		return nil, fmt.Errorf("unknown beat profile for campaign type: %s", campaign.CampaignType)
	}

	log.Printf("Generating seeds for campaign type '%s' with profile: %+v", profileKey, profile.Selection)

	// Seed random number generator
	rand.Seed(time.Now().UnixNano())

	// Select random seeds based on profile rules
	result := &models.CampaignSeeds{
		Twists:      selectRandomElements(seeds.TwistCandidates, profile.Selection.Twists.Min, profile.Selection.Twists.Max),
		Antagonists: selectRandomElements(seeds.AntagonistCandidates, profile.Selection.Antagonists.Min, profile.Selection.Antagonists.Max),
		SetPieces:   selectRandomElements(seeds.SetPieceCandidates, profile.Selection.SetPieces.Min, profile.Selection.SetPieces.Max),
		Constraints: selectRandomElements(seeds.OptionalConstraints, profile.Selection.Constraints.Min, profile.Selection.Constraints.Max),
		BeatProfile: models.BeatProfile{
			Acts: beatProfile.Acts,
			BeatsPerAct: models.MinMaxRange{
				Min: beatProfile.BeatsPerAct.Min,
				Max: beatProfile.BeatsPerAct.Max,
			},
			AvgMinutesPerBeat: beatProfile.AvgMinutesPerBeat,
			Notes:             beatProfile.Notes,
		},
	}

	// Select exactly 1 objective
	if len(seeds.ObjectiveSeeds) > 0 {
		result.Objective = seeds.ObjectiveSeeds[rand.Intn(len(seeds.ObjectiveSeeds))]
	}

	log.Printf("Selected seeds: objective=%s, twists=%d, antagonists=%d, setPieces=%d, constraints=%d",
		result.Objective.ObjectiveID, len(result.Twists), len(result.Antagonists), len(result.SetPieces), len(result.Constraints))
	log.Printf("Beat profile: acts=%d, beatsPerAct=%d-%d, avgMinutesPerBeat=%d",
		result.BeatProfile.Acts, result.BeatProfile.BeatsPerAct.Min, result.BeatProfile.BeatsPerAct.Max, result.BeatProfile.AvgMinutesPerBeat)

	return result, nil
}

// processSQSMessage processes a single SQS message
func processSQSMessage(message events.SQSMessage, stage string) error {
	// Parse message body
	var messageBody models.BirthingMessage
	if err := json.Unmarshal([]byte(message.Body), &messageBody); err != nil {
		return fmt.Errorf("failed to parse message body: %w", err)
	}

	log.Printf("Processing birthing message for campaign %s", messageBody.CampaignID)

	// Validate required fields
	if messageBody.CampaignID == "" {
		return fmt.Errorf("missing required field: campaignId")
	}
	if messageBody.InteractionID == "" {
		return fmt.Errorf("missing required field: interactionId")
	}

	// Check deduplication
	alreadyProcessed, err := checkDedup(messageBody.InteractionID)
	if err != nil {
		log.Printf("Warning: failed to check dedup table: %v", err)
		// Continue processing - don't fail on dedup check errors
	} else if alreadyProcessed {
		log.Printf("Message already processed (interaction %s), skipping", messageBody.InteractionID)
		return nil // Successfully handled - already processed
	}

	// Load campaign from DynamoDB
	campaign, err := getCampaignByID(messageBody.CampaignID)
	if err != nil {
		log.Printf("Failed to get campaign: %v", err)
		if err := sendToMessagingQueue(messageBody.CampaignID, "The threads blur and tangle. I cannot see the campaign. Try again when the pattern settles."); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry on infrastructure errors
	}

	if campaign == nil {
		log.Printf("Campaign %s not found", messageBody.CampaignID)
		if err := sendToMessagingQueue(messageBody.CampaignID, "I sense no campaign here. The threads have vanished."); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Successfully handled - sent error message
	}

	// Generate blueprint seeds
	blueprintSeeds, err := generateBlueprintSeeds(campaign)
	if err != nil {
		log.Printf("Failed to generate blueprint seeds: %v", err)
		if err := sendToMessagingQueue(messageBody.CampaignID, "The pattern resists. I cannot cast the seeds. Try again."); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry after sending error message
	}

	// Create BlueprintMessage
	blueprintMessage := models.BlueprintMessage{
		CampaignID:    messageBody.CampaignID,
		InteractionID: messageBody.InteractionID,
		Seeds:         *blueprintSeeds,
	}

	// Log the blueprint message (will be sent to blueprinting queue later)
	blueprintJSON, err := json.MarshalIndent(blueprintMessage, "", "  ")
	if err != nil {
		log.Printf("Failed to marshal blueprint message: %v", err)
	} else {
		log.Printf("Generated BlueprintMessage:\n%s", string(blueprintJSON))
	}

	// Write to dedup table
	if err := writeDedup(messageBody.InteractionID); err != nil {
		log.Printf("Warning: failed to write to dedup table: %v", err)
		// Don't fail the entire operation if dedup write fails
	}

	// Send success message to messaging queue
	successMessage := `The seeds are cast.
Foundations shimmer beneath the surface—objective, twists, forces in motion.
The blueprint awaits the weaver's hand.`

	if err := sendToMessagingQueue(messageBody.CampaignID, successMessage); err != nil {
		log.Printf("Warning: failed to send success message: %v", err)
		// Don't fail if success message fails - seeds were generated
	}

	log.Printf("Successfully generated blueprint seeds for campaign %s", messageBody.CampaignID)
	return nil
}

// handleSQSRequest handles incoming SQS events
func handleSQSRequest(ctx context.Context, sqsEvent events.SQSEvent) error {
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
	}

	log.Printf("Received %d SQS message(s)", len(sqsEvent.Records))

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
