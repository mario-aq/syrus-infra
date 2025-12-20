package models

// ConfiguringMessage represents a message sent to the configuring queue
type ConfiguringMessage struct {
	ChannelID        string                   `json:"channel_id"`
	HostID           string                   `json:"host_id"`
	InteractionID    string                   `json:"interaction_id"`
	InteractionToken string                   `json:"interaction_token"`
	CampaignType     CampaignType             `json:"campaign_type,omitempty"` // Deprecated - use Options
	Options          []map[string]interface{} `json:"options"`
}

// MessagingQueueMessage represents a message sent to the messaging queue
type MessagingQueueMessage struct {
	ChannelID        string                   `json:"channel_id"`
	Content          string                   `json:"content"`
	Embeds           []map[string]interface{} `json:"embeds,omitempty"`
	Components       []map[string]interface{} `json:"components,omitempty"`
	InteractionToken string                   `json:"interaction_token,omitempty"`
}
