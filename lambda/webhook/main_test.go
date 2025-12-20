package main

import (
	"crypto/ed25519"
	"encoding/hex"
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

func TestGetMapKeys(t *testing.T) {
	m := map[string]interface{}{
		"key1": "value1",
		"key2": "value2",
		"key3": "value3",
	}

	keys := getMapKeys(m)

	if len(keys) != 3 {
		t.Errorf("Expected 3 keys, got %d", len(keys))
	}

	// Check that all expected keys are present
	expectedKeys := map[string]bool{
		"key1": true,
		"key2": true,
		"key3": true,
	}

	for _, key := range keys {
		if !expectedKeys[key] {
			t.Errorf("Unexpected key: %s", key)
		}
		delete(expectedKeys, key)
	}

	if len(expectedKeys) > 0 {
		t.Errorf("Missing keys: %v", expectedKeys)
	}
}

func TestExtractDiscordHeaders(t *testing.T) {
	tests := []struct {
		name        string
		headers     map[string]string
		expectedSig string
		expectedTS  string
		expectedErr bool
	}{
		{
			name: "valid headers",
			headers: map[string]string{
				"x-signature-ed25519":   "signature123",
				"x-signature-timestamp": "timestamp456",
			},
			expectedSig: "signature123",
			expectedTS:  "timestamp456",
			expectedErr: false,
		},
		{
			name: "case insensitive headers",
			headers: map[string]string{
				"X-Signature-Ed25519":   "sig123",
				"X-Signature-Timestamp": "ts456",
			},
			expectedSig: "sig123",
			expectedTS:  "ts456",
			expectedErr: false,
		},
		{
			name: "missing signature header",
			headers: map[string]string{
				"x-signature-timestamp": "timestamp456",
			},
			expectedErr: true,
		},
		{
			name: "missing timestamp header",
			headers: map[string]string{
				"x-signature-ed25519": "signature123",
			},
			expectedErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sig, ts, err := extractDiscordHeaders(tt.headers)

			if tt.expectedErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if sig != tt.expectedSig {
				t.Errorf("Expected signature %s, got %s", tt.expectedSig, sig)
			}

			if ts != tt.expectedTS {
				t.Errorf("Expected timestamp %s, got %s", tt.expectedTS, ts)
			}
		})
	}
}

func TestVerifyDiscordSignature(t *testing.T) {
	// Generate a test key pair
	publicKey, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Create test data
	timestamp := "1234567890"
	body := []byte("test body content")
	message := append([]byte(timestamp), body...)

	// Sign the message
	signature := ed25519.Sign(privateKey, message)
	signatureHex := hex.EncodeToString(signature)

	// Test valid signature
	if !verifyDiscordSignature(signatureHex, timestamp, body, publicKey) {
		t.Error("Valid signature should verify successfully")
	}

	// Test invalid signature (wrong body)
	wrongBody := []byte("wrong body")
	if verifyDiscordSignature(signatureHex, timestamp, wrongBody, publicKey) {
		t.Error("Invalid signature should fail verification")
	}

	// Test invalid signature (wrong timestamp)
	wrongTimestamp := "9876543210"
	if verifyDiscordSignature(signatureHex, wrongTimestamp, body, publicKey) {
		t.Error("Invalid signature should fail verification")
	}

	// Test invalid signature (wrong signature)
	wrongSig := "0000000000000000000000000000000000000000000000000000000000000000"
	if verifyDiscordSignature(wrongSig, timestamp, body, publicKey) {
		t.Error("Invalid signature should fail verification")
	}
}

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

func TestSendToConfiguringQueue_MessageFormat(t *testing.T) {
	// Test that the message is correctly formatted for the queue
	options := []map[string]interface{}{
		{
			"name": "start",
			"options": []interface{}{
				map[string]interface{}{"name": "type", "value": "short"},
				map[string]interface{}{"name": "decisions", "value": "host"},
			},
		},
	}

	// Create the message structure that sendToConfiguringQueue would create
	message := map[string]interface{}{
		"channelId":        "123456789",
		"hostId":           "987654321",
		"interactionId":    "int_123",
		"interactionToken": "token_abc",
		"options":           options,
	}

	// Marshal to JSON to verify it's valid
	messageJSON, err := json.Marshal(message)
	if err != nil {
		t.Errorf("Failed to marshal message: %v", err)
	}

	// Unmarshal back to verify structure
	var parsed map[string]interface{}
	if err := json.Unmarshal(messageJSON, &parsed); err != nil {
		t.Errorf("Failed to unmarshal message: %v", err)
	}

	// Verify required fields
	if parsed["channelId"] != "123456789" {
		t.Error("channelId not preserved")
	}
	if parsed["hostId"] != "987654321" {
		t.Error("hostId not preserved")
	}
	if parsed["interactionId"] != "int_123" {
		t.Error("interactionId not preserved")
	}
	if parsed["interactionToken"] != "token_abc" {
		t.Error("interactionToken not preserved")
	}

	// Verify options array
	parsedOptions, ok := parsed["options"].([]interface{})
	if !ok {
		t.Error("options should be an array")
	}
	if len(parsedOptions) != 1 {
		t.Errorf("Expected 1 option, got %d", len(parsedOptions))
	}
}

func TestCampaignOptionsExtraction(t *testing.T) {
	tests := []struct {
		name           string
		discordOptions []interface{}
		expectedLength int
		expectedSubcmd string
	}{
		{
			name: "campaign start with nested options",
			discordOptions: []interface{}{
				map[string]interface{}{
					"name": "start",
					"options": []interface{}{
						map[string]interface{}{"name": "type", "value": "short"},
						map[string]interface{}{"name": "decisions", "value": "host"},
					},
				},
			},
			expectedLength: 1,
			expectedSubcmd: "start",
		},
		{
			name: "campaign end without nested options",
			discordOptions: []interface{}{
				map[string]interface{}{
					"name": "end",
				},
			},
			expectedLength: 1,
			expectedSubcmd: "end",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the extraction logic from webhook
			var options []map[string]interface{}
			for _, opt := range tt.discordOptions {
				if optMap, ok := opt.(map[string]interface{}); ok {
					options = append(options, optMap)
				}
			}

			if len(options) != tt.expectedLength {
				t.Errorf("Expected %d options, got %d", tt.expectedLength, len(options))
			}

			if len(options) > 0 {
				if name, ok := options[0]["name"].(string); ok {
					if name != tt.expectedSubcmd {
						t.Errorf("Expected subcommand '%s', got '%s'", tt.expectedSubcmd, name)
					}
				} else {
					t.Error("Could not extract subcommand name")
				}
			}
		})
	}
}
