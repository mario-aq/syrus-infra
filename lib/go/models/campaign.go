package models

import "time"

// CampaignStatus represents the possible states of a campaign
type CampaignStatus string

const (
	// CampaignStatusActive indicates the campaign is actively running
	CampaignStatusActive CampaignStatus = "active"
	// CampaignStatusConfiguring indicates the campaign is being set up
	CampaignStatusConfiguring CampaignStatus = "configuring"
	// CampaignStatusEnded indicates the campaign has concluded
	CampaignStatusEnded CampaignStatus = "ended"
)

// CampaignType represents the scope and duration of a campaign
type CampaignType string

const (
	// CampaignTypeShort represents a brief, focused campaign (1-3 sessions)
	CampaignTypeShort CampaignType = "short"
	// CampaignTypeLong represents a standard campaign (4-10 sessions)
	CampaignTypeLong CampaignType = "long"
	// CampaignTypeEpic represents an extended campaign (10+ sessions)
	CampaignTypeEpic CampaignType = "epic"
)

// DecisionModel represents who controls the decision-making in the campaign
type DecisionModel string

const (
	// DecisionModelHost indicates the host makes all decisions
	DecisionModelHost DecisionModel = "host"
	// DecisionModelGroup indicates the group votes on decisions
	DecisionModelGroup DecisionModel = "group"
	// DecisionModelFlexible indicates a flexible decision-making model
	DecisionModelFlexible DecisionModel = "flexible"
)

// Campaign represents the complete campaign structure
type Campaign struct {
	CampaignID    string         `json:"campaignId" dynamodbav:"campaignId"`
	CampaignType  CampaignType   `json:"campaignType" dynamodbav:"campaignType"`
	DecisionModel DecisionModel  `json:"decisionModel" dynamodbav:"decisionModel"`
	Status        CampaignStatus `json:"status" dynamodbav:"status"`
	Lifecycle     Lifecycle      `json:"lifecycle" dynamodbav:"lifecycle"`
	CreatedAt     time.Time      `json:"createdAt" dynamodbav:"createdAt"`
	LastUpdatedAt time.Time      `json:"lastUpdatedAt" dynamodbav:"lastUpdatedAt"`
	HostID        string         `json:"hostId" dynamodbav:"hostId"`
	Source        string         `json:"source" dynamodbav:"source"`
	Meta          CampaignMeta   `json:"meta" dynamodbav:"meta"`
	Party         Party          `json:"party" dynamodbav:"party"`
	Blueprint     Blueprint      `json:"blueprint" dynamodbav:"blueprint"`
	Runtime       RuntimeState   `json:"runtime" dynamodbav:"runtime"`
	Memory        Memory         `json:"memory" dynamodbav:"memory"`
	CostTracking  CostTracking   `json:"costTracking" dynamodbav:"costTracking"`
	ModelPolicy   ModelPolicy    `json:"modelPolicy" dynamodbav:"modelPolicy"`
}

// Lifecycle represents campaign lifecycle state
type Lifecycle struct {
	Paused     bool       `json:"paused" dynamodbav:"paused"`
	EndedAt    *time.Time `json:"endedAt,omitempty" dynamodbav:"endedAt,omitempty"`
	EndedState *string    `json:"endedState,omitempty" dynamodbav:"endedState,omitempty"`
	ArchivedAt *time.Time `json:"archivedAt,omitempty" dynamodbav:"archivedAt,omitempty"`
}

// CampaignMeta contains campaign metadata
type CampaignMeta struct {
	Mode          string  `json:"mode" dynamodbav:"mode"`
	GuildID       *string `json:"guildId" dynamodbav:"guildId"`
	ChannelID     string  `json:"channelId" dynamodbav:"channelId"`
	EngineVersion string  `json:"engineVersion" dynamodbav:"engineVersion"`
	Narrator      string  `json:"narrator" dynamodbav:"narrator"`
}

// Party represents the party structure
type Party struct {
	Members           []PartyMember `json:"members" dynamodbav:"members"`
	Boons             Boons         `json:"boons" dynamodbav:"boons"`
	SpectatorsAllowed bool          `json:"spectatorsAllowed" dynamodbav:"spectatorsAllowed"`
	MaxActivePlayers  int           `json:"maxActivePlayers" dynamodbav:"maxActivePlayers"`
}

// PartyMember represents a member of the party
type PartyMember struct {
	UserID   string    `json:"userId" dynamodbav:"userId"`
	Role     string    `json:"role" dynamodbav:"role"`
	JoinedAt time.Time `json:"joinedAt" dynamodbav:"joinedAt"`
}

// Boons represents available boons
type Boons struct {
	Available []interface{} `json:"available" dynamodbav:"available"`
}

// Blueprint represents the campaign blueprint
type Blueprint struct {
	Title             string                   `json:"title" dynamodbav:"title"`
	Premise           string                   `json:"premise" dynamodbav:"premise"`
	ThematicPillars   []string                 `json:"thematicPillars" dynamodbav:"thematicPillars"`
	BeatQualification BeatQualification        `json:"beatQualification" dynamodbav:"beatQualification"`
	IngredientBinding IngredientBinding        `json:"ingredientBinding" dynamodbav:"ingredientBinding"`
	Acts              []Act                    `json:"acts" dynamodbav:"acts"`
	MajorForces       map[string]MajorForce    `json:"majorForces" dynamodbav:"majorForces"`
	NPCs              map[string]NPC           `json:"npcs" dynamodbav:"npcs"`
	BoonPlan          []BoonPlanEntry          `json:"boonPlan" dynamodbav:"boonPlan"`
	FailurePaths      []FailurePath            `json:"failurePaths" dynamodbav:"failurePaths"`
	EndStates         EndStates                `json:"endStates" dynamodbav:"endStates"`
	MemoryDirectives  MemoryDirectives         `json:"memoryDirectives" dynamodbav:"memoryDirectives"`
	ImagePlan         map[string]ImagePlanItem `json:"imagePlan" dynamodbav:"imagePlan"`
	CombatConstraints CombatConstraints        `json:"combatConstraints" dynamodbav:"combatConstraints"`
}

// CombatConstraints defines combat guidance for narrative purposes
type CombatConstraints struct {
	MaxCombatScenes    int               `json:"maxCombatScenes" dynamodbav:"maxCombatScenes"`
	CombatIntent       map[string]string `json:"combatIntent" dynamodbav:"combatIntent"`
	CombatTriggers     []string          `json:"combatTriggers" dynamodbav:"combatTriggers"`
	CombatOutcomesMust []string          `json:"combatOutcomesMust" dynamodbav:"combatOutcomesMust"`
}

// BeatQualification defines what counts as a beat
type BeatQualification struct {
	CountsWhen       []string `json:"countsWhen" dynamodbav:"countsWhen"`
	DoesNotCountWhen []string `json:"doesNotCountWhen" dynamodbav:"doesNotCountWhen"`
}

// IngredientBinding represents campaign ingredients
type IngredientBinding struct {
	ObjectiveSeed string   `json:"objectiveSeed" dynamodbav:"objectiveSeed"`
	Twists        []string `json:"twists" dynamodbav:"twists"`
	Antagonists   []string `json:"antagonists" dynamodbav:"antagonists"`
	SetPieces     []string `json:"setPieces" dynamodbav:"setPieces"`
}

// Act represents a campaign act
type Act struct {
	ActNumber        int              `json:"actNumber" dynamodbav:"actNumber"`
	Name             string           `json:"name" dynamodbav:"name"`
	PrimaryArea      string           `json:"primaryArea" dynamodbav:"primaryArea"`
	NarrativePurpose string           `json:"narrativePurpose" dynamodbav:"narrativePurpose"`
	PrimaryDanger    string           `json:"primaryDanger,omitempty" dynamodbav:"primaryDanger,omitempty"`
	ExpectedBeats    int              `json:"expectedBeats" dynamodbav:"expectedBeats"`
	BeatVariance     int              `json:"beatVariance" dynamodbav:"beatVariance"`
	LateActSignals   LateActSignals   `json:"lateActSignals" dynamodbav:"lateActSignals"`
	BeatGuidance     BeatGuidance     `json:"beatGuidance" dynamodbav:"beatGuidance"`
	Completion       Completion       `json:"completion" dynamodbav:"completion"`
	FailureFallback  *FailureFallback `json:"failureFallback,omitempty" dynamodbav:"failureFallback,omitempty"`
	Escalation       Escalation       `json:"escalation" dynamodbav:"escalation"`
}

// LateActSignals defines when to apply pressure to advance the act
type LateActSignals struct {
	SoftPressureAtBeat int `json:"softPressureAtBeat" dynamodbav:"softPressureAtBeat"`
	HardPressureAtBeat int `json:"hardPressureAtBeat" dynamodbav:"hardPressureAtBeat"`
}

// BeatGuidance provides narrative guidance for act progression
type BeatGuidance struct {
	Purpose             string   `json:"purpose" dynamodbav:"purpose"`
	ExpectedProgression []string `json:"expectedProgression" dynamodbav:"expectedProgression"`
	AllowedResolutions  []string `json:"allowedResolutions" dynamodbav:"allowedResolutions"`
}

// FailureFallback defines conditions to advance act despite failure
type FailureFallback struct {
	AdvanceActOn []string `json:"advanceActOn" dynamodbav:"advanceActOn"`
}

// Completion represents act completion criteria
type Completion struct {
	Type      string   `json:"type" dynamodbav:"type"`
	Condition string   `json:"condition" dynamodbav:"condition"`
	Prompt    string   `json:"prompt,omitempty" dynamodbav:"prompt,omitempty"`
	Options   []string `json:"options,omitempty" dynamodbav:"options,omitempty"`
}

// Escalation represents act escalation rules
type Escalation struct {
	OnDelay   string   `json:"onDelay" dynamodbav:"onDelay"`
	MaxDelays int      `json:"maxDelays" dynamodbav:"maxDelays"`
	Effects   []string `json:"effects" dynamodbav:"effects"`
}

// MajorForce represents a major antagonistic force
type MajorForce struct {
	InitialPresence    Presence       `json:"initialPresence" dynamodbav:"initialPresence"`
	Escalations        []Escalation2  `json:"escalations,omitempty" dynamodbav:"escalations,omitempty"`
	FinalConfrontation *Confrontation `json:"finalConfrontation,omitempty" dynamodbav:"finalConfrontation,omitempty"`
}

// Presence represents the presence of a force
type Presence struct {
	Act         int    `json:"act" dynamodbav:"act"`
	Mode        string `json:"mode" dynamodbav:"mode"`
	Description string `json:"description" dynamodbav:"description"`
}

// Escalation2 represents force escalation (different from act escalation)
type Escalation2 struct {
	Act         int    `json:"act" dynamodbav:"act"`
	Mode        string `json:"mode" dynamodbav:"mode"`
	Description string `json:"description" dynamodbav:"description"`
}

// Confrontation represents a final confrontation
type Confrontation struct {
	Act      int    `json:"act" dynamodbav:"act"`
	Location string `json:"location" dynamodbav:"location"`
}

// NPC represents a non-player character
type NPC struct {
	Name               string `json:"name" dynamodbav:"name"`
	Role               string `json:"role" dynamodbav:"role"`
	FirstAppearanceAct int    `json:"firstAppearanceAct,omitempty" dynamodbav:"firstAppearanceAct,omitempty"`
	IdentityHidden     bool   `json:"identityHidden,omitempty" dynamodbav:"identityHidden,omitempty"`
}

// BoonPlanEntry represents a boon plan entry
type BoonPlanEntry struct {
	Trigger string       `json:"trigger" dynamodbav:"trigger"`
	Boons   []BoonOption `json:"boons" dynamodbav:"boons"`
}

// BoonOption represents a boon option
type BoonOption struct {
	Name        string `json:"name" dynamodbav:"name"`
	Weight      int    `json:"weight" dynamodbav:"weight"`
	Description string `json:"description" dynamodbav:"description"`
}

// FailurePath represents a failure path
type FailurePath struct {
	ID          string `json:"id" dynamodbav:"id"`
	Trigger     string `json:"trigger" dynamodbav:"trigger"`
	Consequence string `json:"consequence" dynamodbav:"consequence"`
}

// EndStates represents possible campaign end states
type EndStates struct {
	Success     string `json:"success" dynamodbav:"success"`
	Compromised string `json:"compromised" dynamodbav:"compromised"`
	Failure     string `json:"failure" dynamodbav:"failure"`
}

// MemoryDirectives represents memory tracking directives
type MemoryDirectives struct {
	CanonicalFacts   []string            `json:"canonicalFacts" dynamodbav:"canonicalFacts"`
	RelationshipAxes []RelationshipAxis  `json:"relationshipAxes" dynamodbav:"relationshipAxes"`
	DecisionFlags    []string            `json:"decisionFlags" dynamodbav:"decisionFlags"`
	ActSummaryFocus  map[string][]string `json:"actSummaryFocus" dynamodbav:"actSummaryFocus"`
}

// RelationshipAxis represents a relationship tracking axis
type RelationshipAxis struct {
	Entity string   `json:"entity" dynamodbav:"entity"`
	States []string `json:"states" dynamodbav:"states"`
}

// ImagePlanItem represents an image plan entry
type ImagePlanItem struct {
	Description      string `json:"description" dynamodbav:"description"`
	SendWhen         string `json:"sendWhen" dynamodbav:"sendWhen"`
	NarrativePurpose string `json:"narrativePurpose" dynamodbav:"narrativePurpose"`
	Prompt           string `json:"prompt" dynamodbav:"prompt"`
	S3Key            string `json:"s3Key" dynamodbav:"s3Key"`
}

// RuntimeState represents the runtime state of the campaign
type RuntimeState struct {
	CurrentAct         int       `json:"currentAct" dynamodbav:"currentAct"`
	CurrentBeat        int       `json:"currentBeat" dynamodbav:"currentBeat"`
	TurnState          TurnState `json:"turnState" dynamodbav:"turnState"`
	ActiveFailurePaths []string  `json:"activeFailurePaths" dynamodbav:"activeFailurePaths"`
	Pressure           Pressure  `json:"pressure" dynamodbav:"pressure"`
}

// TurnState represents the current turn state
type TurnState struct {
	Mode           string          `json:"mode" dynamodbav:"mode"`
	ActiveDecision *ActiveDecision `json:"activeDecision" dynamodbav:"activeDecision"`
}

// ActiveDecision represents an active decision awaiting response
type ActiveDecision struct {
	Prompt    string    `json:"prompt" dynamodbav:"prompt"`
	Type      string    `json:"type" dynamodbav:"type"`
	Options   []string  `json:"options" dynamodbav:"options"`
	ExpiresAt time.Time `json:"expiresAt" dynamodbav:"expiresAt"`
}

// Pressure represents campaign pressure/urgency
type Pressure struct {
	Level  int      `json:"level" dynamodbav:"level"`
	Causes []string `json:"causes" dynamodbav:"causes"`
}

// Memory represents campaign memory
type Memory struct {
	Global GlobalMemory         `json:"global" dynamodbav:"global"`
	PerAct map[string]ActMemory `json:"perAct" dynamodbav:"perAct"`
}

// GlobalMemory represents global campaign memory
type GlobalMemory struct {
	CanonicalFacts map[string]interface{} `json:"canonicalFacts" dynamodbav:"canonicalFacts"`
	Relationships  map[string]interface{} `json:"relationships" dynamodbav:"relationships"`
	DecisionFlags  map[string]interface{} `json:"decisionFlags" dynamodbav:"decisionFlags"`
}

// ActMemory represents memory for a specific act
type ActMemory struct {
	Summary             *string                `json:"summary" dynamodbav:"summary"`
	KeyDecisions        []interface{}          `json:"keyDecisions" dynamodbav:"keyDecisions"`
	RelationshipChanges map[string]interface{} `json:"relationshipChanges" dynamodbav:"relationshipChanges"`
	Notes               []interface{}          `json:"notes" dynamodbav:"notes"`
}

// CostTracking represents cost tracking
type CostTracking struct {
	SoftLimits       SoftLimits `json:"softLimits" dynamodbav:"softLimits"`
	Usage            Usage      `json:"usage" dynamodbav:"usage"`
	EstimatedCostUSD float64    `json:"estimatedCostUSD" dynamodbav:"estimatedCostUSD"`
}

// SoftLimits represents cost soft limits
type SoftLimits struct {
	SonnetCalls int `json:"sonnetCalls" dynamodbav:"sonnetCalls"`
	HaikuCalls  int `json:"haikuCalls" dynamodbav:"haikuCalls"`
	ImageCalls  int `json:"imageCalls" dynamodbav:"imageCalls"`
}

// Usage represents current usage
type Usage struct {
	SonnetCalls int `json:"sonnetCalls" dynamodbav:"sonnetCalls"`
	HaikuCalls  int `json:"haikuCalls" dynamodbav:"haikuCalls"`
	ImageCalls  int `json:"imageCalls" dynamodbav:"imageCalls"`
}

// Model represents the AI model selection options
type Model string

const (
	// ModelHaiku represents the Claude Haiku model (fast, cost-effective)
	ModelHaiku Model = "haiku"
	// ModelSonnet represents the Claude Sonnet model (balanced performance)
	ModelSonnet Model = "sonnet"
	// ModelNanoBanana represents the Nano Banana model
	ModelNanoBanana Model = "nano_banana"
	// ModelOpenAI represents the OpenAI DALL-E model (image generation)
	ModelOpenAI Model = "openai-dalle"
)

// ModelPolicy represents model selection policy
type ModelPolicy struct {
	IntentParsing Model `json:"intentParsing" dynamodbav:"intentParsing"`
	Narration     Model `json:"narration" dynamodbav:"narration"`
	Cinematics    Model `json:"cinematics" dynamodbav:"cinematics"`
	Blueprint     Model `json:"blueprint" dynamodbav:"blueprint"`
	ImageGen      Model `json:"imageGen" dynamodbav:"imageGen"`
}
