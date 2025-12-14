package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseSyrusCommand(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected struct {
			prefix  string
			command string
			args    []string
		}
	}{
		{
			name:  "empty syrus command",
			input: "$yrus",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "$yrus",
				command: "",
				args:    []string{},
			},
		},
		{
			name:  "syrus with help command",
			input: "$yrus help",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "$yrus",
				command: "help",
				args:    []string{},
			},
		},
		{
			name:  "syrus debug with args",
			input: "$yrus debug test message here",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "$yrus",
				command: "debug",
				args:    []string{"test", "message", "here"},
			},
		},
		{
			name:  "syrus attached to word",
			input: "$yrusdebug",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "$yrus",
				command: "debug",
				args:    []string{},
			},
		},
		{
			name:  "slash syrus command",
			input: "/syrus",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "/syrus",
				command: "",
				args:    []string{},
			},
		},
		{
			name:  "slash syrus debug",
			input: "/syrus debug payload",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "/syrus",
				command: "debug",
				args:    []string{"payload"},
			},
		},
		{
			name:  "non-syrus message",
			input: "hello world",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "",
				command: "",
				args:    []string{},
			},
		},
		{
			name:  "message starting with syrus but not prefix",
			input: "my message syrus help",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "",
				command: "",
				args:    []string{},
			},
		},
		{
			name:  "empty string",
			input: "",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "",
				command: "",
				args:    []string{},
			},
		},
		{
			name:  "just dollar sign",
			input: "$",
			expected: struct {
				prefix  string
				command string
				args    []string
			}{
				prefix:  "",
				command: "",
				args:    []string{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prefix, command, args := parseSyrusCommand(tt.input)

			if prefix != tt.expected.prefix {
				t.Errorf("parseSyrusCommand(%q) prefix = %q, want %q", tt.input, prefix, tt.expected.prefix)
			}

			if command != tt.expected.command {
				t.Errorf("parseSyrusCommand(%q) command = %q, want %q", tt.input, command, tt.expected.command)
			}

			if len(args) != len(tt.expected.args) {
				t.Errorf("parseSyrusCommand(%q) args length = %d, want %d", tt.input, len(args), len(tt.expected.args))
			}

			for i, arg := range args {
				if i >= len(tt.expected.args) {
					t.Errorf("parseSyrusCommand(%q) extra arg[%d] = %q", tt.input, i, arg)
					continue
				}
				if arg != tt.expected.args[i] {
					t.Errorf("parseSyrusCommand(%q) args[%d] = %q, want %q", tt.input, i, arg, tt.expected.args[i])
				}
			}
		})
	}
}

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
