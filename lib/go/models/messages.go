package models

// ConfiguringMessage represents a message sent to the configuring queue
type ConfiguringMessage struct {
	ChannelID        string                   `json:"channelId"`
	HostID           string                   `json:"hostId"`
	InteractionID    string                   `json:"interactionId"`
	InteractionToken string                   `json:"interactionToken"`
	CampaignType     CampaignType             `json:"campaignType,omitempty"` // Deprecated - use Options
	Options          []map[string]interface{} `json:"options"`
}

// MessagingQueueMessage represents a message sent to the messaging queue
type MessagingQueueMessage struct {
	ChannelID        string                   `json:"channelId"`
	Content          string                   `json:"content"`
	Embeds           []map[string]interface{} `json:"embeds,omitempty"`
	Components       []map[string]interface{} `json:"components,omitempty"`
	InteractionToken string                   `json:"interactionToken,omitempty"`
	Flags            int                      `json:"flags,omitempty"` // Discord message flags (e.g., 64 for ephemeral)
	Attachments      []Attachment             `json:"attachments,omitempty"`
}

// Attachment represents a file attachment to send to Discord
type Attachment struct {
	Name        string `json:"name"`
	Data        string `json:"data"`        // base64-encoded file data
	ContentType string `json:"contentType"` // e.g., "image/png"
}

// BirthingMessage represents a message sent to the birthing queue
type BirthingMessage struct {
	CampaignID    string `json:"campaignId"`
	InteractionID string `json:"interactionId"`
}

// BlueprintMessage represents generated campaign seeds for blueprinting
type BlueprintMessage struct {
	CampaignID    string        `json:"campaignId"`
	InteractionID string        `json:"interactionId"`
	Seeds         CampaignSeeds `json:"seeds"`
}

// ImageGenMessage represents a message sent to the image generation queue
type ImageGenMessage struct {
	CampaignID    string `json:"campaignId"`
	InteractionID string `json:"interactionId"`
	ImageID       string `json:"imageId"`
	Prompt        string `json:"prompt"`
	Model         string `json:"model"`
}

// CampaignSeeds contains the randomly selected blueprint elements
type CampaignSeeds struct {
	Objective   ObjectiveSeed    `json:"objective"`
	Twists      []TwistSeed      `json:"twists"`
	Antagonists []AntagonistSeed `json:"antagonists"`
	SetPieces   []SetPieceSeed   `json:"setPieces"`
	Constraints []ConstraintSeed `json:"constraints"`
	BeatProfile BeatProfile      `json:"beatProfile"`

	// Variance injectors
	Map                  MapSeed           `json:"map"`
	FeaturedAreas        []AreaSeed        `json:"featuredAreas"`
	MaxCombatScenes      int               `json:"maxCombatScenes"`
	GenreModifier        string            `json:"genreModifier,omitempty"`
	PerspectiveBias      string            `json:"perspectiveBias,omitempty"`
	MoralAsymmetry       bool              `json:"moralAsymmetry"`
	EnvironmentalOddity  string            `json:"environmentalOddity,omitempty"`
	ExcludedMotifs       []string          `json:"excludedMotifs"`
	ExpectationViolation *ExpectationBreak `json:"expectationViolation,omitempty"`
}

// MapSeed represents a selected map
type MapSeed struct {
	MapID       string `json:"mapId"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// AreaSeed represents a featured area within a map
type AreaSeed struct {
	AreaID      int    `json:"areaId"`
	Name        string `json:"name"`
	Mood        string `json:"mood"`
	Description string `json:"description"`
}

// ExpectationBreak represents a structural expectation violation in an act
type ExpectationBreak struct {
	ActNumber int    `json:"actNumber"`
	Type      string `json:"type"` // "inversion" | "removal" | "prematureResolution"
}

// ObjectiveSeed represents a campaign objective
type ObjectiveSeed struct {
	ObjectiveID           string            `json:"objectiveId"`
	Name                  string            `json:"name"`
	Description           string            `json:"description"`
	Stakes                map[string]string `json:"stakes"`
	Complexity            string            `json:"complexity"`
	TerrainCategory       string            `json:"terrainCategory,omitempty"`
	PrimaryThreatCategory string            `json:"primaryThreatCategory,omitempty"`
	ResolutionStyle       string            `json:"resolutionStyle,omitempty"` // violent, tactical, survival, moral, puzzle
}

// TwistSeed represents a campaign twist
type TwistSeed struct {
	TwistID        string `json:"twistId"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Severity       string `json:"severity"`
	RecommendedAct int    `json:"recommendedAct"`
}

// AntagonistSeed represents a campaign antagonist
type AntagonistSeed struct {
	AntagonistID          string   `json:"antagonistId"`
	Name                  string   `json:"name"`
	Nature                string   `json:"nature"`
	Goal                  string   `json:"goal"`
	Methods               []string `json:"methods"`
	ThreatLevel           string   `json:"threatLevel"`
	PresenceStyle         string   `json:"presenceStyle"`
	TerrainCategory       string   `json:"terrainCategory,omitempty"`
	PrimaryThreatCategory string   `json:"primaryThreatCategory,omitempty"`
}

// SetPieceSeed represents a campaign set piece
type SetPieceSeed struct {
	SetPieceID         string `json:"setPieceId"`
	Name               string `json:"name"`
	PrimaryChallenge   string `json:"primaryChallenge"`
	FailureConsequence string `json:"failureConsequence"`
	RecommendedAct     int    `json:"recommendedAct"`
}

// ConstraintSeed represents a campaign constraint
type ConstraintSeed struct {
	ConstraintID string   `json:"constraintId"`
	Description  string   `json:"description"`
	Effects      []string `json:"effects"`
	Weight       int      `json:"weight,omitempty"` // Higher weight = more likely to be selected
}

// MinMaxRange represents a min/max range
type MinMaxRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// BeatProfile represents the pacing structure for a campaign
type BeatProfile struct {
	Acts              int         `json:"acts"`
	BeatsPerAct       MinMaxRange `json:"beatsPerAct"`
	AvgMinutesPerBeat int         `json:"avgMinutesPerBeat"`
	Notes             string      `json:"notes"`
}
