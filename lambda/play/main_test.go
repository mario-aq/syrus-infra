package main

import (
	"encoding/json"
	"testing"
)

func TestPlayRequestUnmarshal(t *testing.T) {
	jsonData := `{
		"campaignId": "test-campaign-123",
		"interactionId": "test-interaction-456",
		"interactionObject": {
			"id": "test-interaction-456",
			"type": 2,
			"data": {
				"name": "syrus",
				"options": [
					{
						"name": "declare",
						"value": "I attack the orc"
					}
				]
			},
			"channel_id": "test-channel-789",
			"token": "test-token"
		}
	}`

	var request PlayRequest
	err := json.Unmarshal([]byte(jsonData), &request)
	if err != nil {
		t.Fatalf("Failed to unmarshal PlayRequest: %v", err)
	}

	if request.CampaignId != "test-campaign-123" {
		t.Errorf("Expected campaignId 'test-campaign-123', got '%s'", request.CampaignId)
	}

	if request.InteractionId != "test-interaction-456" {
		t.Errorf("Expected interactionId 'test-interaction-456', got '%s'", request.InteractionId)
	}

	if request.InteractionObject.ID != "test-interaction-456" {
		t.Errorf("Expected interaction ID 'test-interaction-456', got '%s'", request.InteractionObject.ID)
	}

	if request.InteractionObject.ChannelID != "test-channel-789" {
		t.Errorf("Expected channel ID 'test-channel-789', got '%s'", request.InteractionObject.ChannelID)
	}
}

func TestHaikuResponseUnmarshal(t *testing.T) {
	jsonData := `{
		"message": "You swing your sword at the orc, connecting solidly!",
		"beatAdvanced": true,
		"rollRequired": false,
		"rollType": null,
		"combatOccurred": true,
		"failurePathActivated": null,
		"successPathActivated": null,
		"memoryUpdates": {
			"flags": ["orc_defeated"],
			"facts": ["The party defeated their first orc"]
		},
		"imageTrigger": null
	}`

	var response HaikuResponse
	err := json.Unmarshal([]byte(jsonData), &response)
	if err != nil {
		t.Fatalf("Failed to unmarshal HaikuResponse: %v", err)
	}

	if response.Message != "You swing your sword at the orc, connecting solidly!" {
		t.Errorf("Unexpected message: %s", response.Message)
	}

	if !response.BeatAdvanced {
		t.Error("Expected beatAdvanced to be true")
	}

	if !response.CombatOccurred {
		t.Error("Expected combatOccurred to be true")
	}

	if len(response.MemoryUpdates.Flags) != 1 || response.MemoryUpdates.Flags[0] != "orc_defeated" {
		t.Errorf("Unexpected memory flags: %v", response.MemoryUpdates.Flags)
	}
}
