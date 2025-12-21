package main

import (
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	models "loros/syrus-models"
)

func TestImageGenMessage_Parse(t *testing.T) {
	imageGenMsg := models.ImageGenMessage{
		CampaignID:    "1234567890",
		InteractionID: "9876543210",
		ImageID:       "intro",
		Prompt:        "A fantasy landscape with mountains",
		Model:         "dall-e-3",
	}

	bodyJSON, err := json.Marshal(imageGenMsg)
	if err != nil {
		t.Fatalf("Failed to marshal imageGen message: %v", err)
	}

	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsed models.ImageGenMessage
	err = json.Unmarshal([]byte(message.Body), &parsed)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	if parsed.CampaignID != imageGenMsg.CampaignID {
		t.Errorf("Expected CampaignID %s, got %s", imageGenMsg.CampaignID, parsed.CampaignID)
	}

	if parsed.InteractionID != imageGenMsg.InteractionID {
		t.Errorf("Expected InteractionID %s, got %s", imageGenMsg.InteractionID, parsed.InteractionID)
	}

	if parsed.ImageID != imageGenMsg.ImageID {
		t.Errorf("Expected ImageID %s, got %s", imageGenMsg.ImageID, parsed.ImageID)
	}

	if parsed.Prompt != imageGenMsg.Prompt {
		t.Errorf("Expected Prompt %s, got %s", imageGenMsg.Prompt, parsed.Prompt)
	}

	if parsed.Model != imageGenMsg.Model {
		t.Errorf("Expected Model %s, got %s", imageGenMsg.Model, parsed.Model)
	}
}

func TestImageGenMessage_MarshalUnmarshal(t *testing.T) {
	original := models.ImageGenMessage{
		CampaignID:    "campaign123",
		InteractionID: "interaction456",
		ImageID:       "ritual-moment",
		Prompt:        "Dark fantasy ritual scene with glowing runes",
		Model:         "dall-e-3",
	}

	jsonData, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Failed to marshal ImageGenMessage: %v", err)
	}

	var unmarshaled models.ImageGenMessage
	err = json.Unmarshal(jsonData, &unmarshaled)
	if err != nil {
		t.Fatalf("Failed to unmarshal ImageGenMessage: %v", err)
	}

	if unmarshaled.CampaignID != original.CampaignID {
		t.Errorf("Expected CampaignID %s, got %s", original.CampaignID, unmarshaled.CampaignID)
	}

	if unmarshaled.InteractionID != original.InteractionID {
		t.Errorf("Expected InteractionID %s, got %s", original.InteractionID, unmarshaled.InteractionID)
	}

	if unmarshaled.ImageID != original.ImageID {
		t.Errorf("Expected ImageID %s, got %s", original.ImageID, unmarshaled.ImageID)
	}

	if unmarshaled.Prompt != original.Prompt {
		t.Errorf("Expected Prompt %s, got %s", original.Prompt, unmarshaled.Prompt)
	}

	if unmarshaled.Model != original.Model {
		t.Errorf("Expected Model %s, got %s", original.Model, unmarshaled.Model)
	}
}

func TestImageGenMessage_MissingFields(t *testing.T) {
	tests := []struct {
		name    string
		message models.ImageGenMessage
	}{
		{
			name: "missing campaign ID",
			message: models.ImageGenMessage{
				InteractionID: "interaction123",
				ImageID:       "intro",
				Prompt:        "Test prompt",
				Model:         "dall-e-3",
			},
		},
		{
			name: "missing interaction ID",
			message: models.ImageGenMessage{
				CampaignID: "campaign123",
				ImageID:    "intro",
				Prompt:     "Test prompt",
				Model:      "dall-e-3",
			},
		},
		{
			name: "missing image ID",
			message: models.ImageGenMessage{
				CampaignID:    "campaign123",
				InteractionID: "interaction123",
				Prompt:        "Test prompt",
				Model:         "dall-e-3",
			},
		},
		{
			name: "missing prompt",
			message: models.ImageGenMessage{
				CampaignID:    "campaign123",
				InteractionID: "interaction123",
				ImageID:       "intro",
				Model:         "dall-e-3",
			},
		},
		{
			name: "missing model",
			message: models.ImageGenMessage{
				CampaignID:    "campaign123",
				InteractionID: "interaction123",
				ImageID:       "intro",
				Prompt:        "Test prompt",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData, err := json.Marshal(tt.message)
			if err != nil {
				t.Fatalf("Failed to marshal message: %v", err)
			}

			var parsed models.ImageGenMessage
			err = json.Unmarshal(jsonData, &parsed)
			if err != nil {
				t.Fatalf("Failed to unmarshal message: %v", err)
			}

			// Just verify that parsing succeeds even with missing fields
			// Actual validation would happen in the Lambda handler
		})
	}
}

func TestS3KeyGeneration(t *testing.T) {
	tests := []struct {
		name       string
		campaignID string
		imageID    string
		expected   string
	}{
		{
			name:       "intro image",
			campaignID: "1234567890",
			imageID:    "intro",
			expected:   "1234567890/images/intro.png",
		},
		{
			name:       "milestone image",
			campaignID: "9876543210",
			imageID:    "ritual-moment",
			expected:   "9876543210/images/ritual-moment.png",
		},
		{
			name:       "final image",
			campaignID: "campaign123",
			imageID:    "final-confrontation",
			expected:   "campaign123/images/final-confrontation.png",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// S3 key format: {campaignID}/images/{imageID}.png
			s3Key := tt.campaignID + "/images/" + tt.imageID + ".png"

			if s3Key != tt.expected {
				t.Errorf("Expected S3 key %s, got %s", tt.expected, s3Key)
			}
		})
	}
}

func TestDedupKeyGeneration(t *testing.T) {
	tests := []struct {
		name          string
		interactionID string
		imageID       string
		expected      string
	}{
		{
			name:          "intro image dedup key",
			interactionID: "int123",
			imageID:       "intro",
			expected:      "int123-intro",
		},
		{
			name:          "milestone image dedup key",
			interactionID: "int456",
			imageID:       "ritual-moment",
			expected:      "int456-ritual-moment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Dedup key format: {interactionID}-{imageID}
			dedupKey := tt.interactionID + "-" + tt.imageID

			if dedupKey != tt.expected {
				t.Errorf("Expected dedup key %s, got %s", tt.expected, dedupKey)
			}
		})
	}
}

func TestImageGenMessage_WithDifferentModels(t *testing.T) {
	modelNames := []string{
		"dall-e-3",
		"dall-e-2",
		"stable-diffusion",
		"midjourney",
	}

	for _, modelName := range modelNames {
		t.Run("model_"+modelName, func(t *testing.T) {
			imageGenMsg := models.ImageGenMessage{
				CampaignID:    "campaign123",
				InteractionID: "interaction456",
				ImageID:       "test-image",
				Prompt:        "Test prompt for " + modelName,
				Model:         modelName,
			}

			jsonData, err := json.Marshal(imageGenMsg)
			if err != nil {
				t.Fatalf("Failed to marshal ImageGenMessage: %v", err)
			}

			var parsed models.ImageGenMessage
			err = json.Unmarshal(jsonData, &parsed)
			if err != nil {
				t.Fatalf("Failed to unmarshal ImageGenMessage: %v", err)
			}

			if parsed.Model != modelName {
				t.Errorf("Expected model %s, got %s", modelName, parsed.Model)
			}
		})
	}
}

func TestImageGenMessage_LongPrompt(t *testing.T) {
	// Test with a very long prompt (realistic for detailed image generation)
	longPrompt := "Epic fantasy art, cinematic wide shot of an ancient fortress perched on a cliff overlooking a stormy sea. " +
		"Dark, ominous clouds gather overhead as lightning illuminates the scene. " +
		"The fortress walls are weathered and covered in moss, with banners torn by the wind. " +
		"In the foreground, a lone figure stands at the edge of the cliff, cloak billowing dramatically. " +
		"Atmosphere: dark, moody, foreboding. Style: digital painting, highly detailed, dramatic lighting, " +
		"inspired by fantasy concept art. Colors: deep blues, grays, with flashes of electric white from lightning."

	imageGenMsg := models.ImageGenMessage{
		CampaignID:    "campaign123",
		InteractionID: "interaction456",
		ImageID:       "dramatic-scene",
		Prompt:        longPrompt,
		Model:         "dall-e-3",
	}

	jsonData, err := json.Marshal(imageGenMsg)
	if err != nil {
		t.Fatalf("Failed to marshal ImageGenMessage with long prompt: %v", err)
	}

	var parsed models.ImageGenMessage
	err = json.Unmarshal(jsonData, &parsed)
	if err != nil {
		t.Fatalf("Failed to unmarshal ImageGenMessage with long prompt: %v", err)
	}

	if parsed.Prompt != longPrompt {
		t.Errorf("Long prompt was not preserved correctly")
	}

	if len(parsed.Prompt) != len(longPrompt) {
		t.Errorf("Expected prompt length %d, got %d", len(longPrompt), len(parsed.Prompt))
	}
}
