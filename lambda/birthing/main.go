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

//go:embed assets/arcanos_maps.json
var mapsJSON []byte

// Config structures
type CampaignConfig struct {
	CampaignLengthProfiles map[string]LengthProfile `json:"campaignLengthProfiles"`
	BeatProfiles           map[string]BeatProfile   `json:"beatProfiles"`
	PlayStyleModifiers     map[string]interface{}   `json:"playStyleModifiers"`
	GlobalLimits           map[string]interface{}   `json:"globalLimits"`
	SamenessKillers        SamenessKillers          `json:"samenessKillers"`
	ExcludableMotifs       []string                 `json:"excludableMotifs"`
}

type SamenessKillers struct {
	GenreModifiers        []string `json:"genreModifiers"`
	PerspectiveBiases     []string `json:"perspectiveBiases"`
	EnvironmentalOddities []string `json:"environmentalOddities"`
}

type LengthProfile struct {
	Label                  string                 `json:"label"`
	EstimatedDurationHours int                    `json:"estimatedDurationHours"`
	MaxCombatScenes        int                    `json:"maxCombatScenes"`
	Selection              SelectionRules         `json:"selection"`
	Guardrails             map[string]interface{} `json:"guardrails"`
	VarianceRules          VarianceRules          `json:"varianceRules"`
}

type VarianceRules struct {
	ForceNonEnvironmentalThreat      bool     `json:"forceNonEnvironmentalThreat"`
	PreferCategories                 []string `json:"preferCategories"`
	ExcludeByDefault                 []string `json:"excludeByDefault"`
	AllowEnvironmentalThreat         bool     `json:"allowEnvironmentalThreat"`
	RequireNonEnvironmentalAntagonist bool     `json:"requireNonEnvironmentalAntagonist"`
	RequirePerspectiveBias           bool     `json:"requirePerspectiveBias"`
	RequireMultipleThreatCategories  bool     `json:"requireMultipleThreatCategories"`
	EnforceTerrainDiversity          bool     `json:"enforceTerrainDiversity"`
	RequireExpectationViolation      bool     `json:"requireExpectationViolation"`
	RequireSamenessKillers           int      `json:"requireSamenessKillers"`
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

// Maps structures
type MapData struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Areas       []AreaData `json:"areas"`
}

type AreaData struct {
	AreaID      int    `json:"areaId"`
	Name        string `json:"name"`
	Mood        string `json:"mood"`
	Description string `json:"description"`
}

// SelectionContext tracks anti-bias state
type SelectionContext struct {
	UsedTerrainCategories map[string]int
	UsedThreatCategories  map[string]int
	LastCombination       string
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

	dedupKey := fmt.Sprintf("birthing#%s", interactionID)

	result, err := svc.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(dedupTable),
		Key: map[string]*dynamodb.AttributeValue{
			"dedupKey": {S: aws.String(dedupKey)},
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

	dedupKey := fmt.Sprintf("birthing#%s", interactionID)
	expiresAt := time.Now().Add(24 * time.Hour).Unix()

	_, err = svc.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(dedupTable),
		Item: map[string]*dynamodb.AttributeValue{
			"dedupKey":  {S: aws.String(dedupKey)},
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
func sendToMessagingQueue(channelID, content, interactionID string) error {
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
		MessageGroupId:         aws.String(channelID),                 // Group by campaignID
		MessageDeduplicationId: aws.String(interactionID + "-seeded"), // Dedupe by interactionID
	})

	if err != nil {
		return fmt.Errorf("failed to send message to queue: %w", err)
	}

	log.Printf("Successfully sent message to messaging queue for channel %s", channelID)
	return nil
}

// sendToBlueprintingQueue sends a BlueprintMessage to the blueprinting SQS queue
func sendToBlueprintingQueue(blueprintMsg models.BlueprintMessage) error {
	queueURL := os.Getenv("SYRUS_BLUEPRINTING_QUEUE_URL")
	if queueURL == "" {
		return fmt.Errorf("SYRUS_BLUEPRINTING_QUEUE_URL environment variable not set")
	}

	sess, err := session.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	svc := sqs.New(sess)

	messageBodyJSON, err := json.Marshal(blueprintMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal blueprint message: %w", err)
	}

	_, err = svc.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(queueURL),
		MessageBody:            aws.String(string(messageBodyJSON)),
		MessageGroupId:         aws.String(blueprintMsg.CampaignID),
		MessageDeduplicationId: aws.String(blueprintMsg.InteractionID + "-blueprint"),
	})

	if err != nil {
		return fmt.Errorf("failed to send message to blueprinting queue: %w", err)
	}

	log.Printf("Successfully sent blueprint message to blueprinting queue for campaign %s", blueprintMsg.CampaignID)
	return nil
}

// selectRandomMap selects a random map from the maps data
func selectRandomMap(mapsData map[string]MapData) (string, MapData) {
	keys := make([]string, 0, len(mapsData))
	for k := range mapsData {
		keys = append(keys, k)
	}
	if len(keys) == 0 {
		return "", MapData{}
	}
	mapID := keys[rand.Intn(len(keys))]
	return mapID, mapsData[mapID]
}

// selectFeaturedAreas selects random areas from a map
func selectFeaturedAreas(mapData MapData, count int) []AreaData {
	if count > len(mapData.Areas) {
		count = len(mapData.Areas)
	}
	return selectRandomElements(mapData.Areas, count, count)
}

// selectObjectiveWithBias selects an objective while avoiding recent patterns
func selectObjectiveWithBias(objectives []models.ObjectiveSeed, profile LengthProfile) models.ObjectiveSeed {
	eligible := make([]models.ObjectiveSeed, 0)
	preferred := make([]models.ObjectiveSeed, 0)

	for _, obj := range objectives {
		// Apply variance rules
		if profile.VarianceRules.ForceNonEnvironmentalThreat && obj.PrimaryThreatCategory == "ecological" {
			continue
		}

		// D&D Rule: Prefer actionable resolution styles (violent, tactical, survival)
		isActionable := obj.ResolutionStyle == "violent" || obj.ResolutionStyle == "tactical" || obj.ResolutionStyle == "survival"

		// Check if preferred category
		if len(profile.VarianceRules.PreferCategories) > 0 {
			categoryMatch := false
			for _, cat := range profile.VarianceRules.PreferCategories {
				if obj.PrimaryThreatCategory == cat || obj.TerrainCategory == cat {
					categoryMatch = true
					break
				}
			}
			if categoryMatch {
				eligible = append(eligible, obj)
				if isActionable {
					preferred = append(preferred, obj)
				}
			}
		} else {
			eligible = append(eligible, obj)
			if isActionable {
				preferred = append(preferred, obj)
			}
		}
	}

	// If we have preferred actionable objectives, strongly bias towards them (80%)
	if len(preferred) > 0 && rand.Float32() < 0.8 {
		return preferred[rand.Intn(len(preferred))]
	}

	// If no eligible, fall back to all non-excluded
	if len(eligible) == 0 {
		for _, obj := range objectives {
			if profile.VarianceRules.ForceNonEnvironmentalThreat && obj.PrimaryThreatCategory == "ecological" {
				continue
			}
			eligible = append(eligible, obj)
		}
	}

	if len(eligible) == 0 {
		eligible = objectives
	}

	return eligible[rand.Intn(len(eligible))]
}

// selectAntagonistsWithBias selects antagonists while enforcing diversity
func selectAntagonistsWithBias(antagonists []models.AntagonistSeed, profile LengthProfile, min, max int) []models.AntagonistSeed {
	count := min
	if max > min {
		count = min + rand.Intn(max-min+1)
	}
	if count > len(antagonists) {
		count = len(antagonists)
	}

	eligible := make([]models.AntagonistSeed, len(antagonists))
	copy(eligible, antagonists)

	// Cap metaphysical antagonists to max 1 per campaign (D&D rule)
	maxMetaphysical := 1
	metaphysicalCount := 0

	// Ensure at least one direct presenceStyle for Act 1 (D&D rule)
	var directAntagonists []models.AntagonistSeed
	var nonDirectAntagonists []models.AntagonistSeed
	for _, ant := range eligible {
		if ant.PresenceStyle == "direct" {
			directAntagonists = append(directAntagonists, ant)
		} else {
			nonDirectAntagonists = append(nonDirectAntagonists, ant)
		}
	}

	selected := make([]models.AntagonistSeed, 0)

	// FIRST: Ensure at least one direct antagonist
	if len(directAntagonists) > 0 {
		idx := rand.Intn(len(directAntagonists))
		selected = append(selected, directAntagonists[idx])
		if directAntagonists[idx].PrimaryThreatCategory == "metaphysical" {
			metaphysicalCount++
		}
		// Remove from both lists
		directAntagonists = append(directAntagonists[:idx], directAntagonists[idx+1:]...)
	}

	// Rebuild eligible pool
	eligible = append(directAntagonists, nonDirectAntagonists...)

	// Apply variance rules for remaining slots
	if profile.VarianceRules.RequireMultipleThreatCategories {
		// Ensure diversity in threat categories
		usedCategories := make(map[string]bool)
		if len(selected) > 0 {
			usedCategories[selected[0].PrimaryThreatCategory] = true
		}

		for len(selected) < count && len(eligible) > 0 {
			idx := rand.Intn(len(eligible))
			ant := eligible[idx]

			// Skip if metaphysical and already at cap
			if ant.PrimaryThreatCategory == "metaphysical" && metaphysicalCount >= maxMetaphysical {
				eligible = append(eligible[:idx], eligible[idx+1:]...)
				continue
			}

			// Prefer antagonists with different categories
			if !usedCategories[ant.PrimaryThreatCategory] || len(selected) >= count/2 {
				selected = append(selected, ant)
				usedCategories[ant.PrimaryThreatCategory] = true
				if ant.PrimaryThreatCategory == "metaphysical" {
					metaphysicalCount++
				}
			}

			// Remove from eligible
			eligible = append(eligible[:idx], eligible[idx+1:]...)
		}
		return selected
	}

	// Standard random selection with metaphysical cap
	rand.Shuffle(len(eligible), func(i, j int) { eligible[i], eligible[j] = eligible[j], eligible[i] })
	for len(selected) < count && len(eligible) > 0 {
		ant := eligible[0]
		eligible = eligible[1:]

		// Skip if metaphysical and already at cap
		if ant.PrimaryThreatCategory == "metaphysical" && metaphysicalCount >= maxMetaphysical {
			continue
		}

		selected = append(selected, ant)
		if ant.PrimaryThreatCategory == "metaphysical" {
			metaphysicalCount++
		}
	}

	return selected
}

// generateVarianceInjectors creates sameness killers based on campaign type
func generateVarianceInjectors(profile LengthProfile, config *CampaignConfig) (string, string, string, []string) {
	var genreModifier, perspectiveBias, environmentalOddity string
	excludedMotifs := make([]string, 0)

	killersCount := profile.VarianceRules.RequireSamenessKillers

	// Select genre modifier
	if killersCount > 0 && len(config.SamenessKillers.GenreModifiers) > 0 {
		genreModifier = config.SamenessKillers.GenreModifiers[rand.Intn(len(config.SamenessKillers.GenreModifiers))]
	}

	// Select perspective bias
	if profile.VarianceRules.RequirePerspectiveBias && len(config.SamenessKillers.PerspectiveBiases) > 0 {
		perspectiveBias = config.SamenessKillers.PerspectiveBiases[rand.Intn(len(config.SamenessKillers.PerspectiveBiases))]
	}

	// Randomly select environmental oddity
	if killersCount > 1 && rand.Float32() < 0.4 && len(config.SamenessKillers.EnvironmentalOddities) > 0 {
		environmentalOddity = config.SamenessKillers.EnvironmentalOddities[rand.Intn(len(config.SamenessKillers.EnvironmentalOddities))]
	}

	// Select 2-3 excluded motifs
	if len(config.ExcludableMotifs) > 0 {
		motifsCount := 2 + rand.Intn(2) // 2 or 3
		if motifsCount > len(config.ExcludableMotifs) {
			motifsCount = len(config.ExcludableMotifs)
		}
		excludedMotifs = selectRandomElements(config.ExcludableMotifs, motifsCount, motifsCount)
	}

	// Add default excludes from variance rules
	for _, motif := range profile.VarianceRules.ExcludeByDefault {
		found := false
		for _, em := range excludedMotifs {
			if em == motif {
				found = true
				break
			}
		}
		if !found {
			excludedMotifs = append(excludedMotifs, motif)
		}
	}

	return genreModifier, perspectiveBias, environmentalOddity, excludedMotifs
}

// generateExpectationViolation creates an expectation break for an act
func generateExpectationViolation(beatProfile BeatProfile) *models.ExpectationBreak {
	if beatProfile.Acts < 2 {
		return nil
	}

	types := []string{"inversion", "removal", "prematureResolution"}
	actNumber := 2 + rand.Intn(beatProfile.Acts-1) // Acts 2-N

	return &models.ExpectationBreak{
		ActNumber: actNumber,
		Type:      types[rand.Intn(len(types))],
	}
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

// selectWeightedConstraints selects constraints based on weight (D&D bias: attrition > politics)
func selectWeightedConstraints(constraints []models.ConstraintSeed, min, max int) []models.ConstraintSeed {
	count := rand.Intn(max-min+1) + min
	if count > len(constraints) {
		count = len(constraints)
	}
	if count == 0 {
		return []models.ConstraintSeed{}
	}

	// Calculate total weight
	totalWeight := 0
	for _, c := range constraints {
		weight := c.Weight
		if weight == 0 {
			weight = 1 // Default weight
		}
		totalWeight += weight
	}

	selected := make([]models.ConstraintSeed, 0, count)
	remaining := make([]models.ConstraintSeed, len(constraints))
	copy(remaining, constraints)

	// Select 'count' constraints using weighted random selection
	for i := 0; i < count && len(remaining) > 0; i++ {
		// Recalculate total weight for remaining items
		totalWeight = 0
		for _, c := range remaining {
			weight := c.Weight
			if weight == 0 {
				weight = 1
			}
			totalWeight += weight
		}

		// Pick a random number and find which constraint it falls into
		r := rand.Intn(totalWeight)
		sum := 0
		selectedIdx := 0

		for idx, c := range remaining {
			weight := c.Weight
			if weight == 0 {
				weight = 1
			}
			sum += weight
			if r < sum {
				selectedIdx = idx
				break
			}
		}

		selected = append(selected, remaining[selectedIdx])
		// Remove selected constraint from remaining
		remaining = append(remaining[:selectedIdx], remaining[selectedIdx+1:]...)
	}

	return selected
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

	// Parse maps
	var mapsData map[string]MapData
	if err := json.Unmarshal(mapsJSON, &mapsData); err != nil {
		return nil, fmt.Errorf("failed to parse maps: %w", err)
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

	// Select map and featured areas
	mapID, selectedMap := selectRandomMap(mapsData)
	featuredAreas := selectFeaturedAreas(selectedMap, profile.Selection.FeaturedAreas.Min+rand.Intn(profile.Selection.FeaturedAreas.Max-profile.Selection.FeaturedAreas.Min+1))

	// Convert to model types
	mapSeed := models.MapSeed{
		MapID:       mapID,
		Name:        selectedMap.Name,
		Description: selectedMap.Description,
	}

	areaSeed := make([]models.AreaSeed, len(featuredAreas))
	for i, area := range featuredAreas {
		areaSeed[i] = models.AreaSeed{
			AreaID:      area.AreaID,
			Name:        area.Name,
			Mood:        area.Mood,
			Description: area.Description,
		}
	}

	// Generate variance injectors
	genreModifier, perspectiveBias, environmentalOddity, excludedMotifs := generateVarianceInjectors(profile, &config)

	// Select objective with bias
	objective := selectObjectiveWithBias(seeds.ObjectiveSeeds, profile)

	// Select antagonists with bias for diversity
	antagonists := selectAntagonistsWithBias(seeds.AntagonistCandidates, profile, profile.Selection.Antagonists.Min, profile.Selection.Antagonists.Max)

	// Generate expectation violation if required
	var expectationViolation *models.ExpectationBreak
	if profile.VarianceRules.RequireExpectationViolation {
		expectationViolation = generateExpectationViolation(beatProfile)
	}

	// Select random seeds based on profile rules
	result := &models.CampaignSeeds{
		Objective:            objective,
		Twists:               selectRandomElements(seeds.TwistCandidates, profile.Selection.Twists.Min, profile.Selection.Twists.Max),
		Antagonists:          antagonists,
		SetPieces:            selectRandomElements(seeds.SetPieceCandidates, profile.Selection.SetPieces.Min, profile.Selection.SetPieces.Max),
		Constraints:          selectWeightedConstraints(seeds.OptionalConstraints, profile.Selection.Constraints.Min, profile.Selection.Constraints.Max),
		Map:                  mapSeed,
		FeaturedAreas:        areaSeed,
		MaxCombatScenes:      profile.MaxCombatScenes,
		GenreModifier:        genreModifier,
		PerspectiveBias:      perspectiveBias,
		MoralAsymmetry:       rand.Float32() < 0.3, // 30% chance
		EnvironmentalOddity:  environmentalOddity,
		ExcludedMotifs:       excludedMotifs,
		ExpectationViolation: expectationViolation,
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

	log.Printf("Selected seeds: map=%s, areas=%d, objective=%s, twists=%d, antagonists=%d, setPieces=%d, constraints=%d, maxCombat=%d",
		mapID, len(featuredAreas), result.Objective.ObjectiveID, len(result.Twists), len(result.Antagonists), len(result.SetPieces), len(result.Constraints), result.MaxCombatScenes)
	log.Printf("Variance: genre=%s, perspective=%s, oddity=%s, excludedMotifs=%v", genreModifier, perspectiveBias, environmentalOddity, excludedMotifs)
	if expectationViolation != nil {
		log.Printf("Expectation violation: act=%d, type=%s", expectationViolation.ActNumber, expectationViolation.Type)
	}
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
		if err := sendToMessagingQueue(messageBody.CampaignID, "The threads blur and tangle. I cannot see the campaign. Try again when the pattern settles.", messageBody.InteractionID); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Don't retry on infrastructure errors
	}

	if campaign == nil {
		log.Printf("Campaign %s not found", messageBody.CampaignID)
		if err := sendToMessagingQueue(messageBody.CampaignID, "I sense no campaign here. The threads have vanished.", messageBody.InteractionID); err != nil {
			log.Printf("Failed to send error message: %v", err)
		}
		return nil // Successfully handled - sent error message
	}

	// Generate blueprint seeds
	blueprintSeeds, err := generateBlueprintSeeds(campaign)
	if err != nil {
		log.Printf("Failed to generate blueprint seeds: %v", err)
		if err := sendToMessagingQueue(messageBody.CampaignID, "The pattern resists. I cannot cast the seeds. Try again.", messageBody.InteractionID); err != nil {
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

	// Send to blueprinting queue
	if err := sendToBlueprintingQueue(blueprintMessage); err != nil {
		log.Printf("Failed to send to blueprinting queue: %v", err)
		return fmt.Errorf("failed to send blueprint message: %w", err)
	}

	// Write to dedup table
	if err := writeDedup(messageBody.InteractionID); err != nil {
		log.Printf("Warning: failed to write to dedup table: %v", err)
		// Don't fail the entire operation if dedup write fails
	}

	// Send success message to messaging queue
	successMessage := `The seeds are cast.
Foundations shimmer beneath the surface—objective, twists, forces in motion.
The adventure is being woven. This may take a moment as the threads align...`

	if err := sendToMessagingQueue(messageBody.CampaignID, successMessage, messageBody.InteractionID); err != nil {
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
