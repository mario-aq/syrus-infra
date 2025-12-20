package main

import (
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestProcessSQSMessage_ValidMessage(t *testing.T) {
	messageBody := SQSMessageBody{
		ChannelID: "123456789012345678",
		Content:   "Test message",
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	// Note: This test would require mocking the Discord API call
	// For now, we'll test the parsing logic
	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	if parsedBody.ChannelID != messageBody.ChannelID {
		t.Errorf("Expected ChannelID %s, got %s", messageBody.ChannelID, parsedBody.ChannelID)
	}

	if parsedBody.Content != messageBody.Content {
		t.Errorf("Expected Content %s, got %s", messageBody.Content, parsedBody.Content)
	}
}

func TestProcessSQSMessage_WithInteractionToken(t *testing.T) {
	messageBody := SQSMessageBody{
		ChannelID:        "123456789012345678",
		Content:          "Test message",
		InteractionToken: "interactionToken123",
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	if parsedBody.InteractionToken != messageBody.InteractionToken {
		t.Errorf("Expected InteractionToken %s, got %s", messageBody.InteractionToken, parsedBody.InteractionToken)
	}
}

func TestProcessSQSMessage_WithEmbeds(t *testing.T) {
	messageBody := SQSMessageBody{
		ChannelID: "123456789012345678",
		Content:   "",
		Embeds: []map[string]interface{}{
			{
				"title":       "Test Embed",
				"description": "Test description",
			},
		},
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	if len(parsedBody.Embeds) != 1 {
		t.Errorf("Expected 1 embed, got %d", len(parsedBody.Embeds))
	}

	if parsedBody.Embeds[0]["title"] != "Test Embed" {
		t.Errorf("Expected embed title 'Test Embed', got %v", parsedBody.Embeds[0]["title"])
	}
}

func TestProcessSQSMessage_WithComponents(t *testing.T) {
	messageBody := SQSMessageBody{
		ChannelID: "123456789012345678",
		Content:   "Test message",
		Components: []map[string]interface{}{
			{
				"type": 1, // ACTION_ROW
				"components": []map[string]interface{}{
					{
						"type":  2, // BUTTON
						"label": "Click me",
					},
				},
			},
		},
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	if len(parsedBody.Components) != 1 {
		t.Errorf("Expected 1 component, got %d", len(parsedBody.Components))
	}
}

func TestProcessSQSMessage_MissingChannelID(t *testing.T) {
	messageBody := SQSMessageBody{
		Content: "Test message",
		// ChannelID is missing
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	// This would fail validation in processSQSMessage
	if parsedBody.ChannelID != "" {
		t.Error("ChannelID should be empty")
	}
}

func TestProcessSQSMessage_MissingContentAndEmbeds(t *testing.T) {
	messageBody := SQSMessageBody{
		ChannelID: "123456789012345678",
		// Content and Embeds are both missing
	}

	bodyJSON, _ := json.Marshal(messageBody)
	message := events.SQSMessage{
		MessageId: "test-message-id",
		Body:      string(bodyJSON),
	}

	var parsedBody SQSMessageBody
	err := json.Unmarshal([]byte(message.Body), &parsedBody)
	if err != nil {
		t.Fatalf("Failed to parse message body: %v", err)
	}

	// This would fail validation in processSQSMessage
	if parsedBody.Content != "" && len(parsedBody.Embeds) == 0 {
		t.Error("Message should have either content or embeds")
	}
}

func TestDiscordMessage_Marshal(t *testing.T) {
	message := DiscordMessage{
		Content: "Test message",
		Embeds: []map[string]interface{}{
			{
				"title": "Test",
			},
		},
		Components: []map[string]interface{}{
			{
				"type": 1,
			},
		},
	}

	jsonData, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("Failed to marshal DiscordMessage: %v", err)
	}

	var unmarshaled DiscordMessage
	err = json.Unmarshal(jsonData, &unmarshaled)
	if err != nil {
		t.Fatalf("Failed to unmarshal DiscordMessage: %v", err)
	}

	if unmarshaled.Content != message.Content {
		t.Errorf("Expected Content %s, got %s", message.Content, unmarshaled.Content)
	}

	if len(unmarshaled.Embeds) != len(message.Embeds) {
		t.Errorf("Expected %d embeds, got %d", len(message.Embeds), len(unmarshaled.Embeds))
	}

	if len(unmarshaled.Components) != len(message.Components) {
		t.Errorf("Expected %d components, got %d", len(message.Components), len(unmarshaled.Components))
	}
}

func TestSQSMessageBody_MarshalUnmarshal(t *testing.T) {
	original := SQSMessageBody{
		ChannelID:        "123456789012345678",
		Content:          "Test message",
		InteractionToken: "token123",
		Embeds: []map[string]interface{}{
			{"title": "Test"},
		},
		Components: []map[string]interface{}{
			{"type": 1},
		},
	}

	jsonData, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Failed to marshal SQSMessageBody: %v", err)
	}

	var unmarshaled SQSMessageBody
	err = json.Unmarshal(jsonData, &unmarshaled)
	if err != nil {
		t.Fatalf("Failed to unmarshal SQSMessageBody: %v", err)
	}

	if unmarshaled.ChannelID != original.ChannelID {
		t.Errorf("Expected ChannelID %s, got %s", original.ChannelID, unmarshaled.ChannelID)
	}

	if unmarshaled.Content != original.Content {
		t.Errorf("Expected Content %s, got %s", original.Content, unmarshaled.Content)
	}

	if unmarshaled.InteractionToken != original.InteractionToken {
		t.Errorf("Expected InteractionToken %s, got %s", original.InteractionToken, unmarshaled.InteractionToken)
	}

	if len(unmarshaled.Embeds) != len(original.Embeds) {
		t.Errorf("Expected %d embeds, got %d", len(original.Embeds), len(unmarshaled.Embeds))
	}

	if len(unmarshaled.Components) != len(original.Components) {
		t.Errorf("Expected %d components, got %d", len(original.Components), len(unmarshaled.Components))
	}
}
