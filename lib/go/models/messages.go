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

// CampaignSeeds contains the randomly selected blueprint elements
type CampaignSeeds struct {
	Objective   ObjectiveSeed    `json:"objective"`
	Twists      []TwistSeed      `json:"twists"`
	Antagonists []AntagonistSeed `json:"antagonists"`
	SetPieces   []SetPieceSeed   `json:"setPieces"`
	Constraints []ConstraintSeed `json:"constraints"`
	BeatProfile BeatProfile      `json:"beatProfile"`
}

// ObjectiveSeed represents a campaign objective
type ObjectiveSeed struct {
	ObjectiveID string            `json:"objectiveId"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Stakes      map[string]string `json:"stakes"`
	Complexity  string            `json:"complexity"`
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
	AntagonistID  string   `json:"antagonistId"`
	Name          string   `json:"name"`
	Nature        string   `json:"nature"`
	Goal          string   `json:"goal"`
	Methods       []string `json:"methods"`
	ThreatLevel   string   `json:"threatLevel"`
	PresenceStyle string   `json:"presenceStyle"`
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
