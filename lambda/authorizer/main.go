package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ssm"
)

// RestAPIAuthorizerRequest represents the input to a REQUEST-type Lambda authorizer for REST API
type RestAPIAuthorizerRequest struct {
	Type                  string            `json:"type"`
	MethodArn             string            `json:"methodArn"`
	Resource              string            `json:"resource"`
	Path                  string            `json:"path"`
	HTTPMethod            string            `json:"httpMethod"`
	Headers               map[string]string `json:"headers"`
	QueryStringParameters map[string]string `json:"queryStringParameters"`
	PathParameters        map[string]string `json:"pathParameters"`
	StageVariables        map[string]string `json:"stageVariables"`
	RequestContext        struct {
		AccountID    string `json:"accountId"`
		APIID        string `json:"apiId"`
		HTTPMethod   string `json:"httpMethod"`
		Path         string `json:"path"`
		RequestID    string `json:"requestId"`
		ResourceID   string `json:"resourceId"`
		ResourcePath string `json:"resourcePath"`
		Stage        string `json:"stage"`
	} `json:"requestContext"`
	Body string `json:"body"`
}

// WebhookPayload represents the WhatsApp webhook payload structure for validation
type WebhookPayload struct {
	Object string         `json:"object"`
	Entry  []WebhookEntry `json:"entry"`
}

type WebhookEntry struct {
	ID      string          `json:"id"`
	Changes []WebhookChange `json:"changes"`
}

type WebhookChange struct {
	Value WebhookValue `json:"value"`
	Field string       `json:"field"`
}

type WebhookValue struct {
	MessagingProduct string `json:"messaging_product"`
}

// getAppSecret retrieves the WhatsApp app secret from SSM Parameter Store
func getAppSecret(stage string) (string, error) {
	// Create AWS session
	sess, err := session.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	// Create SSM client
	svc := ssm.New(sess)

	// Get parameter with stage-aware path
	paramName := fmt.Sprintf("/syrus/%s/whatsapp/app-secret", stage)
	result, err := svc.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true),
	})

	if err != nil {
		return "", fmt.Errorf("failed to get parameter %s: %w", paramName, err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return "", fmt.Errorf("parameter %s not found or has no value", paramName)
	}

	return *result.Parameter.Value, nil
}

// verifySignature verifies the WhatsApp webhook signature using X-Hub-Signature-256 header
func verifySignature(signatureHeader, body, appSecret string) bool {
	// Check if signature header exists
	if signatureHeader == "" {
		log.Printf("Missing X-Hub-Signature-256 header")
		return false
	}

	// Remove the "sha256=" prefix from the signature header
	if !strings.HasPrefix(signatureHeader, "sha256=") {
		log.Printf("Invalid signature format: %s", signatureHeader)
		return false
	}
	expectedSignature := strings.TrimPrefix(signatureHeader, "sha256=")

	// Compute HMAC-SHA256 of the raw body using the app secret
	h := hmac.New(sha256.New, []byte(appSecret))
	h.Write([]byte(body))
	computedSignature := hex.EncodeToString(h.Sum(nil))

	// Compare signatures using constant-time comparison
	isValid := hmac.Equal([]byte(expectedSignature), []byte(computedSignature))
	if !isValid {
		log.Printf("Signature verification failed - expected: %s, computed: %s", expectedSignature, computedSignature)
	}
	return isValid
}

// validateSchema validates the webhook payload schema
func validateSchema(body string) error {
	var payload WebhookPayload
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return fmt.Errorf("invalid JSON payload: %w", err)
	}

	// Validate object field
	if payload.Object == "" {
		return fmt.Errorf("missing 'object' field")
	}

	// Validate entry array
	if len(payload.Entry) == 0 {
		return fmt.Errorf("missing or empty 'entry' array")
	}

	// Validate messaging_product in each entry
	for i, entry := range payload.Entry {
		if len(entry.Changes) == 0 {
			return fmt.Errorf("entry[%d] has no changes", i)
		}
		for j, change := range entry.Changes {
			if change.Value.MessagingProduct != "whatsapp" {
				return fmt.Errorf("entry[%d].changes[%d].value.messaging_product must be 'whatsapp', got: %s", i, j, change.Value.MessagingProduct)
			}
		}
	}

	return nil
}

func handleRequest(ctx context.Context, event RestAPIAuthorizerRequest) (events.APIGatewayCustomAuthorizerResponse, error) {
	log.Printf("AUTHORIZER STARTED - Event received")
	log.Printf("Authorizer invoked - Type: %s, HTTPMethod: %s, Path: %s, MethodArn: %s",
		event.Type,
		event.HTTPMethod,
		event.Path,
		event.MethodArn)
	log.Printf("Body length: %d", len(event.Body))

	// Get stage from environment variable or default to dev
	stage := os.Getenv("SYRUS_STAGE")
	if stage == "" {
		stage = "dev"
		log.Printf("SYRUS_STAGE not set, defaulting to 'dev'")
	}

	// Allow GET requests (webhook verification) without signature check
	if event.HTTPMethod == "GET" {
		log.Printf("Allowing GET request (webhook verification)")
		return events.APIGatewayCustomAuthorizerResponse{
			PrincipalID: "whatsapp-webhook",
			PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
				Version: "2012-10-17",
				Statement: []events.IAMPolicyStatement{
					{
						Action:   []string{"execute-api:Invoke"},
						Effect:   "Allow",
						Resource: []string{event.MethodArn},
					},
				},
			},
		}, nil
	}

	// For POST requests, verify signature and validate schema
	if event.HTTPMethod == "POST" {
		// Get the raw body
		// REST API authorizers receive the body as-is (not base64 encoded for JSON)
		body := event.Body
		log.Printf("Body received, length: %d", len(body))

		// Get signature header (case-insensitive lookup)
		signatureHeader := ""
		for key, value := range event.Headers {
			if strings.EqualFold(key, "x-hub-signature-256") {
				signatureHeader = value
				break
			}
		}

		// Verify signature
		if signatureHeader == "" {
			log.Printf("Missing X-Hub-Signature-256 header")
			return events.APIGatewayCustomAuthorizerResponse{
				PrincipalID: "whatsapp-webhook",
				PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
					Version: "2012-10-17",
					Statement: []events.IAMPolicyStatement{
						{
							Action:   []string{"execute-api:Invoke"},
							Effect:   "Deny",
							Resource: []string{event.MethodArn},
						},
					},
				},
			}, nil
		}

		// Get app secret from SSM
		appSecret, err := getAppSecret(stage)
		if err != nil {
			log.Printf("Failed to get app secret: %v", err)
			return events.APIGatewayCustomAuthorizerResponse{
				PrincipalID: "whatsapp-webhook",
				PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
					Version: "2012-10-17",
					Statement: []events.IAMPolicyStatement{
						{
							Action:   []string{"execute-api:Invoke"},
							Effect:   "Deny",
							Resource: []string{event.MethodArn},
						},
					},
				},
			}, nil
		}

		// Verify signature
		if !verifySignature(signatureHeader, body, appSecret) {
			log.Printf("Signature verification failed")
			return events.APIGatewayCustomAuthorizerResponse{
				PrincipalID: "whatsapp-webhook",
				PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
					Version: "2012-10-17",
					Statement: []events.IAMPolicyStatement{
						{
							Action:   []string{"execute-api:Invoke"},
							Effect:   "Deny",
							Resource: []string{event.MethodArn},
						},
					},
				},
			}, nil
		}

		// Validate schema
		if err := validateSchema(body); err != nil {
			log.Printf("Schema validation failed: %v", err)
			return events.APIGatewayCustomAuthorizerResponse{
				PrincipalID: "whatsapp-webhook",
				PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
					Version: "2012-10-17",
					Statement: []events.IAMPolicyStatement{
						{
							Action:   []string{"execute-api:Invoke"},
							Effect:   "Deny",
							Resource: []string{event.MethodArn},
						},
					},
				},
			}, nil
		}

		log.Printf("POST request authorized - signature and schema valid")
		return events.APIGatewayCustomAuthorizerResponse{
			PrincipalID: "whatsapp-webhook",
			PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
				Version: "2012-10-17",
				Statement: []events.IAMPolicyStatement{
					{
						Action:   []string{"execute-api:Invoke"},
						Effect:   "Allow",
						Resource: []string{event.MethodArn},
					},
				},
			},
		}, nil
	}

	// Deny all other methods
	log.Printf("Denying request for unsupported method: %s", event.HTTPMethod)
	return events.APIGatewayCustomAuthorizerResponse{
		PrincipalID: "whatsapp-webhook",
		PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
			Version: "2012-10-17",
			Statement: []events.IAMPolicyStatement{
				{
					Action:   []string{"execute-api:Invoke"},
					Effect:   "Deny",
					Resource: []string{event.MethodArn},
				},
			},
		},
	}, nil
}

func main() {
	lambda.Start(handleRequest)
}
