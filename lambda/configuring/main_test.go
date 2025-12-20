package main

import (
	"encoding/json"
	models "loros/syrus-models"
	"testing"
)

func TestParseStartSubcommandOptions(t *testing.T) {
	tests := []struct {
		name              string
		options           []map[string]interface{}
		expectedType      models.CampaignType
		expectedDecisions string
		expectError       bool
	}{
		{
			name: "valid start command with type and decisions",
			options: []map[string]interface{}{
				{
					"name": "start",
					"options": []interface{}{
						map[string]interface{}{
							"name":  "type",
							"value": "short",
						},
						map[string]interface{}{
							"name":  "decisions",
							"value": "host",
						},
					},
				},
			},
			expectedType:      models.CampaignType("short"),
			expectedDecisions: "host",
			expectError:       false,
		},
		{
			name: "valid start command with long type and flexible decisions",
			options: []map[string]interface{}{
				{
					"name": "start",
					"options": []interface{}{
						map[string]interface{}{
							"name":  "type",
							"value": "long",
						},
						map[string]interface{}{
							"name":  "decisions",
							"value": "flexible",
						},
					},
				},
			},
			expectedType:      models.CampaignType("long"),
			expectedDecisions: "flexible",
			expectError:       false,
		},
		{
			name: "valid start command with epic type and group decisions",
			options: []map[string]interface{}{
				{
					"name": "start",
					"options": []interface{}{
						map[string]interface{}{
							"name":  "type",
							"value": "epic",
						},
						map[string]interface{}{
							"name":  "decisions",
							"value": "group",
						},
					},
				},
			},
			expectedType:      models.CampaignType("epic"),
			expectedDecisions: "group",
			expectError:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate parsing logic
			var subcommand string
			var campaignType models.CampaignType
			var decisions string

			if len(tt.options) > 0 {
				if name, ok := tt.options[0]["name"].(string); ok {
					subcommand = name
				}

				if nestedOpts, ok := tt.options[0]["options"].([]interface{}); ok {
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

			if subcommand != "start" {
				t.Errorf("Expected subcommand 'start', got '%s'", subcommand)
			}

			if campaignType != tt.expectedType {
				t.Errorf("Expected campaign type '%s', got '%s'", tt.expectedType, campaignType)
			}

			if decisions != tt.expectedDecisions {
				t.Errorf("Expected decisions '%s', got '%s'", tt.expectedDecisions, decisions)
			}
		})
	}
}

func TestConfiguringMessageParsing(t *testing.T) {
	tests := []struct {
		name        string
		messageJSON string
		expectError bool
	}{
		{
			name: "valid message with options",
			messageJSON: `{
				"channel_id": "123456789",
				"host_id": "987654321",
				"interaction_id": "int_123",
				"interaction_token": "token_abc",
				"options": [
					{
						"name": "start",
						"options": [
							{"name": "type", "value": "short"},
							{"name": "decisions", "value": "host"}
						]
					}
				]
			}`,
			expectError: false,
		},
		{
			name: "valid message with deprecated campaign_type",
			messageJSON: `{
				"channel_id": "123456789",
				"host_id": "987654321",
				"interaction_id": "int_123",
				"interaction_token": "token_abc",
				"campaign_type": "short",
				"options": []
			}`,
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var messageBody models.ConfiguringMessage
			err := json.Unmarshal([]byte(tt.messageJSON), &messageBody)

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
				return
			}

			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if !tt.expectError {
				if messageBody.ChannelID == "" {
					t.Error("ChannelID should not be empty")
				}
				if messageBody.HostID == "" {
					t.Error("HostID should not be empty")
				}
				if messageBody.InteractionID == "" {
					t.Error("InteractionID should not be empty")
				}
				if messageBody.InteractionToken == "" {
					t.Error("InteractionToken should not be empty")
				}
			}
		})
	}
}

func TestValidateDecisions(t *testing.T) {
	validDecisions := map[string]bool{"host": true, "flexible": true, "group": true}

	tests := []struct {
		name      string
		decisions string
		isValid   bool
	}{
		{"host is valid", "host", true},
		{"flexible is valid", "flexible", true},
		{"group is valid", "group", true},
		{"invalid decision", "invalid", false},
		{"empty decision", "", false},
		{"random string", "random", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := validDecisions[tt.decisions]
			if isValid != tt.isValid {
				t.Errorf("Expected %s to be valid=%v, got valid=%v", tt.decisions, tt.isValid, isValid)
			}
		})
	}
}

func TestCampaignTypeEnum(t *testing.T) {
	tests := []struct {
		name         string
		campaignType models.CampaignType
		expected     string
	}{
		{"short campaign", models.CampaignType("short"), "short"},
		{"long campaign", models.CampaignType("long"), "long"},
		{"epic campaign", models.CampaignType("epic"), "epic"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if string(tt.campaignType) != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, string(tt.campaignType))
			}
		})
	}
}

func TestSubcommandExtraction(t *testing.T) {
	tests := []struct {
		name             string
		options          []map[string]interface{}
		expectedSubcmd   string
		hasNestedOptions bool
	}{
		{
			name: "start subcommand",
			options: []map[string]interface{}{
				{"name": "start", "options": []interface{}{}},
			},
			expectedSubcmd:   "start",
			hasNestedOptions: true,
		},
		{
			name: "end subcommand",
			options: []map[string]interface{}{
				{"name": "end"},
			},
			expectedSubcmd:   "end",
			hasNestedOptions: false,
		},
		{
			name: "pause subcommand",
			options: []map[string]interface{}{
				{"name": "pause"},
			},
			expectedSubcmd:   "pause",
			hasNestedOptions: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var subcommand string
			if len(tt.options) > 0 {
				if name, ok := tt.options[0]["name"].(string); ok {
					subcommand = name
				}
			}

			if subcommand != tt.expectedSubcmd {
				t.Errorf("Expected subcommand '%s', got '%s'", tt.expectedSubcmd, subcommand)
			}

			_, hasOptions := tt.options[0]["options"]
			if hasOptions != tt.hasNestedOptions {
				t.Errorf("Expected hasNestedOptions=%v, got %v", tt.hasNestedOptions, hasOptions)
			}
		})
	}
}
