package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/sqs"
	"github.com/aws/aws-sdk-go/service/ssm"

	models "loros/syrus-models"
)

var (
	awsSession       *session.Session
	dynamodbClient   *dynamodb.DynamoDB
	s3Client         *s3.S3
	sqsClient        *sqs.SQS
	ssmClient        *ssm.SSM
	campaignsTable   string
	dedupTable       string
	messagingQueue   string
	modelCacheBucket string
	stage            string
)

func init() {
	awsSession = session.Must(session.NewSession())
	dynamodbClient = dynamodb.New(awsSession)
	s3Client = s3.New(awsSession)
	sqsClient = sqs.New(awsSession)
	ssmClient = ssm.New(awsSession)

	campaignsTable = os.Getenv("SYRUS_CAMPAIGNS_TABLE")
	dedupTable = os.Getenv("SYRUS_DEDUP_TABLE")
	messagingQueue = os.Getenv("SYRUS_MESSAGING_QUEUE_URL")
	modelCacheBucket = os.Getenv("SYRUS_MODEL_CACHE_BUCKET")
	stage = os.Getenv("SYRUS_STAGE")
}

func handler(ctx context.Context, event events.SQSEvent) (events.SQSEventResponse, error) {
	log.Printf("Received %d messages from imageGen queue", len(event.Records))

	var batchItemFailures []events.SQSBatchItemFailure

	for _, record := range event.Records {
		if err := processImageGenMessage(ctx, record); err != nil {
			log.Printf("Failed to process message %s: %v", record.MessageId, err)
			batchItemFailures = append(batchItemFailures, events.SQSBatchItemFailure{
				ItemIdentifier: record.MessageId,
			})
		}
	}

	return events.SQSEventResponse{
		BatchItemFailures: batchItemFailures,
	}, nil
}

func processImageGenMessage(ctx context.Context, record events.SQSMessage) error {
	log.Printf("Processing imageGen message: %s", record.MessageId)

	// Parse the imageGen message
	var imageGenMsg models.ImageGenMessage
	if err := json.Unmarshal([]byte(record.Body), &imageGenMsg); err != nil {
		return fmt.Errorf("failed to unmarshal imageGen message: %w", err)
	}

	log.Printf("Campaign ID: %s, Image ID: %s", imageGenMsg.CampaignID, imageGenMsg.ImageID)

	// Check dedup table
	dedupKey := fmt.Sprintf("%s-%s", imageGenMsg.InteractionID, imageGenMsg.ImageID)
	if isDuplicate, err := checkDedup(dedupKey); err != nil {
		return fmt.Errorf("failed to check dedup: %w", err)
	} else if isDuplicate {
		log.Printf("Message already processed (dedupKey: %s), skipping", dedupKey)
		return nil
	}

	// Check S3 cache (for retries)
	s3Key := fmt.Sprintf("%s/images/%s.png", imageGenMsg.CampaignID, imageGenMsg.ImageID)
	if cached, err := checkS3Cache(s3Key); err != nil {
		log.Printf("Warning: failed to check S3 cache: %v", err)
	} else if cached {
		log.Printf("Image already cached in S3: %s", s3Key)
		// Use cached image - send to messaging queue
		if err := sendImageToMessaging(imageGenMsg.CampaignID, imageGenMsg.ImageID, s3Key); err != nil {
			return fmt.Errorf("failed to send cached image to messaging: %w", err)
		}
		// Mark as processed
		if err := markAsProcessed(dedupKey); err != nil {
			log.Printf("Warning: failed to mark as processed: %v", err)
		}
		return nil
	}

	// Get API key from SSM
	apiKey, err := getOpenAIAPIKey()
	if err != nil {
		return fmt.Errorf("failed to get API key: %w", err)
	}

	// Call OpenAI DALL-E 3 API
	imageURL, err := callOpenAI(ctx, apiKey, imageGenMsg.Prompt, imageGenMsg.Model)
	if err != nil {
		return fmt.Errorf("failed to call OpenAI: %w", err)
	}

	// Download image from OpenAI URL
	imageData, err := downloadImage(ctx, imageURL)
	if err != nil {
		return fmt.Errorf("failed to download image: %w", err)
	}

	// Upload to S3
	if err := uploadToS3(s3Key, imageData); err != nil {
		return fmt.Errorf("failed to upload to S3: %w", err)
	}

	// Update campaign blueprint with S3 key
	if err := updateBlueprintS3Key(imageGenMsg.CampaignID, imageGenMsg.ImageID, s3Key); err != nil {
		return fmt.Errorf("failed to update blueprint: %w", err)
	}

	// Send to messaging queue
	if err := sendImageToMessaging(imageGenMsg.CampaignID, imageGenMsg.ImageID, s3Key); err != nil {
		return fmt.Errorf("failed to send to messaging: %w", err)
	}

	// Mark as processed in dedup table
	if err := markAsProcessed(dedupKey); err != nil {
		log.Printf("Warning: failed to mark as processed: %v", err)
	}

	log.Printf("Successfully processed image generation for campaign %s, image %s", imageGenMsg.CampaignID, imageGenMsg.ImageID)
	return nil
}

func checkDedup(dedupKey string) (bool, error) {
	fullDedupKey := fmt.Sprintf("imagegen#%s", dedupKey)
	result, err := dynamodbClient.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(dedupTable),
		Key: map[string]*dynamodb.AttributeValue{
			"dedupKey": {S: aws.String(fullDedupKey)},
		},
	})
	if err != nil {
		return false, err
	}
	return result.Item != nil, nil
}

func markAsProcessed(dedupKey string) error {
	fullDedupKey := fmt.Sprintf("imagegen#%s", dedupKey)
	ttl := time.Now().Add(24 * time.Hour).Unix()
	_, err := dynamodbClient.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(dedupTable),
		Item: map[string]*dynamodb.AttributeValue{
			"dedupKey":    {S: aws.String(fullDedupKey)},
			"expiresAt":   {N: aws.String(fmt.Sprintf("%d", ttl))},
			"processedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	return err
}

func checkS3Cache(s3Key string) (bool, error) {
	_, err := s3Client.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(modelCacheBucket),
		Key:    aws.String(s3Key),
	})
	if err != nil {
		if strings.Contains(err.Error(), "NotFound") || strings.Contains(err.Error(), "NoSuchKey") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func getOpenAIAPIKey() (string, error) {
	paramName := fmt.Sprintf("/syrus/%s/openai/api-key", stage)
	result, err := ssmClient.GetParameter(&ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(true),
	})
	if err != nil {
		return "", err
	}
	return *result.Parameter.Value, nil
}

func callOpenAI(ctx context.Context, apiKey, prompt, model string) (string, error) {
	log.Printf("Calling OpenAI DALL-E API with model %s", model)

	payload := map[string]interface{}{
		"model":   model,
		"prompt":  prompt,
		"n":       1,
		"size":    "1024x1024",
		"quality": "standard",
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/images/generations", bytes.NewReader(payloadJSON))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResponse struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(apiResponse.Data) == 0 {
		return "", fmt.Errorf("API returned empty data")
	}

	log.Printf("Received image URL from OpenAI")
	return apiResponse.Data[0].URL, nil
}

func downloadImage(ctx context.Context, imageURL string) ([]byte, error) {
	log.Printf("Downloading image from OpenAI URL")

	req, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read image data: %w", err)
	}

	log.Printf("Downloaded image: %d bytes", len(imageData))
	return imageData, nil
}

func uploadToS3(s3Key string, imageData []byte) error {
	log.Printf("Uploading image to S3: %s", s3Key)

	_, err := s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(modelCacheBucket),
		Key:         aws.String(s3Key),
		Body:        bytes.NewReader(imageData),
		ContentType: aws.String("image/png"),
	})
	if err != nil {
		return fmt.Errorf("failed to upload to S3: %w", err)
	}

	log.Printf("Successfully uploaded image to S3")
	return nil
}

func updateBlueprintS3Key(campaignID, imageID, s3Key string) error {
	log.Printf("Updating blueprint with S3 key for image %s", imageID)

	updateExpr := fmt.Sprintf("SET blueprint.imagePlan.#imageId.s3Key = :s3Key, lastUpdatedAt = :lastUpdatedAt")

	_, err := dynamodbClient.UpdateItem(&dynamodb.UpdateItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
		UpdateExpression: aws.String(updateExpr),
		ExpressionAttributeNames: map[string]*string{
			"#imageId": aws.String(imageID),
		},
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":s3Key":         {S: aws.String(s3Key)},
			":lastUpdatedAt": {S: aws.String(time.Now().UTC().Format(time.RFC3339))},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to update campaign: %w", err)
	}

	log.Printf("Successfully updated blueprint")
	return nil
}

func sendImageToMessaging(campaignID, imageID, s3Key string) error {
	log.Printf("Sending image to messaging queue")

	campaign, err := getCampaign(campaignID)
	if err != nil {
		return fmt.Errorf("failed to get campaign: %w", err)
	}

	result, err := s3Client.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(modelCacheBucket),
		Key:    aws.String(s3Key),
	})
	if err != nil {
		return fmt.Errorf("failed to get image from S3: %w", err)
	}
	defer result.Body.Close()

	imageData, err := io.ReadAll(result.Body)
	if err != nil {
		return fmt.Errorf("failed to read image data: %w", err)
	}

	imageBase64 := base64.StdEncoding.EncodeToString(imageData)

	message := models.MessagingQueueMessage{
		ChannelID: campaign.Meta.ChannelID,
		Content:   "",
		Attachments: []models.Attachment{
			{
				Name:        fmt.Sprintf("%s.png", imageID),
				Data:        imageBase64,
				ContentType: "image/png",
			},
		},
	}

	messageJSON, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	_, err = sqsClient.SendMessage(&sqs.SendMessageInput{
		QueueUrl:               aws.String(messagingQueue),
		MessageBody:            aws.String(string(messageJSON)),
		MessageGroupId:         aws.String(campaignID),
		MessageDeduplicationId: aws.String(fmt.Sprintf("image-%s", imageID)),
	})
	if err != nil {
		return fmt.Errorf("failed to send message to queue: %w", err)
	}

	log.Printf("Successfully sent image to messaging queue")
	return nil
}

func getCampaign(campaignID string) (*models.Campaign, error) {
	result, err := dynamodbClient.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(campaignsTable),
		Key: map[string]*dynamodb.AttributeValue{
			"campaignId": {S: aws.String(campaignID)},
		},
	})
	if err != nil {
		return nil, err
	}
	if result.Item == nil {
		return nil, fmt.Errorf("campaign not found: %s", campaignID)
	}

	var campaign models.Campaign
	if err := dynamodbattribute.UnmarshalMap(result.Item, &campaign); err != nil {
		return nil, err
	}
	return &campaign, nil
}

func main() {
	lambda.Start(handler)
}
