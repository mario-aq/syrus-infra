package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFormatDebugPayload(t *testing.T) {
	// Create a sample webhook payload
	payload := WebhookPayload{
		Object: "whatsapp_business_account",
		Entry: []WebhookEntry{
			{
				ID: "123456789",
				Changes: []WebhookChange{
					{
						Value: WebhookValue{
							MessagingProduct: "whatsapp",
							Metadata: WebhookMetadata{
								DisplayPhoneNumber: "15551234567",
								PhoneNumberID:      "123456789",
							},
							Contacts: []WebhookContact{
								{
									Profile: WebhookProfile{
										Name: "John Doe",
									},
									WaID: "15559876543",
								},
							},
							Messages: []IndividualMessage{
								{
									From:      "15559876543",
									ID:        "wamid.xxx",
									Timestamp: "1734123456",
									Text: WebhookText{
										Body: "/syrus debug test",
									},
									Type: "text",
								},
							},
						},
						Field: "messages",
					},
				},
			},
		},
	}

	result := formatDebugPayload(payload)

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

	if !contains(result, "whatsapp_business_account") {
		t.Error("formatDebugPayload should contain the payload object")
	}

	if !contains(result, "/syrus debug test") {
		t.Error("formatDebugPayload should contain the original message")
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

	var parsedPayload WebhookPayload
	jsonStr := strings.TrimSpace(jsonContent.String())
	if jsonStr == "" {
		t.Error("formatDebugPayload should contain JSON payload")
		return
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsedPayload); err != nil {
		t.Errorf("formatDebugPayload should produce valid JSON, got error: %v", err)
	}

	if parsedPayload.Object != "whatsapp_business_account" {
		t.Error("Parsed payload should match original")
	}
}

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
