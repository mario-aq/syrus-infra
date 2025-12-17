package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFormatDebugPayload(t *testing.T) {
	// Create a sample Discord interaction payload
	interaction := DiscordInteraction{
		ID:   "123456789012345678",
		Type: 2, // APPLICATION_COMMAND
		Data: map[string]interface{}{
			"name": "debug",
			"id":   "987654321098765432",
		},
		GuildID:   "111111111111111111",
		ChannelID: "222222222222222222",
		User: &DiscordUser{
			ID:       "333333333333333333",
			Username: "testuser",
		},
		Token: "interaction_token_here",
	}

	result := formatDebugPayload(interaction)

	// Check that result contains expected parts
	if !contains(result, "Received:") {
		t.Error("formatDebugPayload should contain 'Received:'")
	}

	if !contains(result, "===>") {
		t.Error("formatDebugPayload should contain '===>'")
	}

	if !contains(result, "Response:") {
		t.Error("formatDebugPayload should contain 'Response:'")
	}

	if !contains(result, "123456789012345678") {
		t.Error("formatDebugPayload should contain the interaction ID")
	}

	if !contains(result, "debug") {
		t.Error("formatDebugPayload should contain the command name")
	}

	// Verify it's valid JSON by trying to unmarshal the payload part
	lines := strings.Split(result, "\n")
	payloadStart := false
	var jsonContent strings.Builder

	for _, line := range lines {
		if strings.TrimSpace(line) == "Received:" {
			payloadStart = true
			continue
		}
		if strings.TrimSpace(line) == "===>" {
			break
		}
		if payloadStart && strings.TrimSpace(line) != "" {
			jsonContent.WriteString(line + "\n")
		}
	}

	var parsedInteraction DiscordInteraction
	jsonStr := strings.TrimSpace(jsonContent.String())
	if jsonStr == "" {
		t.Error("formatDebugPayload should contain JSON payload")
		return
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsedInteraction); err != nil {
		t.Errorf("formatDebugPayload should produce valid JSON, got error: %v", err)
	}

	if parsedInteraction.ID != "123456789012345678" {
		t.Error("Parsed interaction should match original")
	}
}

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
