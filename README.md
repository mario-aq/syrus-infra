# syrus-infra

AWS CDK v2 infrastructure for Syrus, a WhatsApp chatbot dungeon master.

## DynamoDB Campaigns Table

### Table Schema

**Table Name**: `syrus-campaigns-${stage}` (where stage is `dev` or `prod`)

**Primary Key**:
- Partition Key: `campaignId` (string)

**Attributes**:
- `campaignId` (string): Primary key identifying the campaign
- `hostWaId` (string): WhatsApp ID of the campaign host
- `status` (string): Campaign status (`configuring`|`active`|`paused`|`ended`)
- `statusCampaign` (string): Composite key for GSI (`${status}#${campaignId}`)
- `createdAt` (number): Unix timestamp in seconds
- `updatedAt` (number): Unix timestamp in seconds
- `ttl` (number): Unix timestamp in seconds for TTL expiration
- `party` (map): Character sheet data keyed by WhatsApp ID

### Campaign ID Convention

Campaign IDs follow specific patterns based on campaign type:

- **Group campaigns**: WhatsApp `group_id` (e.g., `120363XXX@g.us`)
- **Solo campaigns**: `SOLO#<hostWaId>` (e.g., `SOLO#1234567890@c.us`)

### Overwrite Behavior

For MVP, each group/solo can only have one active campaign at a time. When a new campaign starts:
- Existing records are overwritten based on `campaignId`
- No sort key is used on the main table since `status` is mutable
- `campaignId` uniquely identifies the current campaign per group/solo

### Global Secondary Index (GSI)

**Index Name**: `ByHostStatus`
- **Partition Key**: `hostWaId` (string)
- **Sort Key**: `statusCampaign` (string)

**Purpose**: Enables efficient querying of active campaigns for a specific host using `begins_with("active#")`.

Example usage: Find all active campaigns hosted by a specific user.

## DynamoDB Hosts Table

### Table Schema

**Table Name**: `syrus-hosts-${stage}` (where stage is `dev` or `prod`)

**Primary Key**:
- Partition Key: `waId` (string) - WhatsApp user ID

**Attributes**:
- `waId` (string): WhatsApp user ID (e.g., `1234567890@c.us`)
- `name` (string): Display name of the user (optional)
- `addedAt` (string): ISO 8601 timestamp when user was added
- `ttl` (number): Unix timestamp in seconds for TTL expiration

### Purpose

The hosts table implements a whitelist system for WhatsApp users. Only users present in this table will receive acknowledgment messages from the bot when they send messages to the webhook.

### Free-Tier Friendly Configuration

**Provisioned Capacity**:
- Table: 1 RCU / 1 WCU
- GSI: 1 RCU / 1 WCU

**Cost Control Choices**:
- Uses provisioned billing mode with minimal capacity units to stay within AWS free tier limits
- No on-demand scaling configured to maintain predictable low costs
- Single-digit capacity units minimize monthly charges while supporting MVP traffic

**PITR**: Disabled for both dev and prod stages to avoid costs

**TTL**: Enabled on `ttl` attribute for automatic cleanup of expired campaigns

### Deployment

#### Prerequisites

**AWS Credentials Setup:**
- Configure your AWS credentials using `aws configure` or by setting up profiles in `~/.aws/credentials`
- The deployment scripts use the `arborquote` AWS profile
- If using a different profile, update the `AWS_PROFILE` environment variable in `package.json`

**Initial Setup:**
```bash
npm install
npm run bootstrap  # One-time setup for CDK in your AWS account
```

#### Using NPM Scripts (Recommended)

**Deploy to Development:**
```bash
npm run deploy:dev
```

**Deploy to Production:**
```bash
npm run deploy:prod
```

#### Manual CDK Commands

**Deploy to Development:**
```bash
npm run build
AWS_PROFILE=arborquote npx cdk deploy Syrus-dev
```

**Deploy to Production:**
```bash
npm run build
AWS_PROFILE=arborquote npx cdk deploy Syrus-prod
```

**Bootstrap (one-time setup):**
```bash
npm run bootstrap
```

**Synthesize templates:**
```bash
npm run synth
```

## Deployment Status ✅

**Successfully Deployed Resources:**
- ✅ **DynamoDB Table**: `syrus-campaigns-dev`
- ✅ **API Gateway with Custom Domain**: `https://api-dev.syrus.chat/webhooks/wa`
- ✅ **Lambda Function**: Go webhook handler with custom runtime
- ✅ **Route 53 DNS Records**: `api-dev.syrus.chat` → API Gateway
- ✅ **SSL Certificate**: ACM certificate for custom domain
- ✅ **SSM Parameters**: Created for WhatsApp credentials

**Next Steps:**
1. Create Discord public key SSM parameter: `/syrus/dev/discord/public-key`
2. Configure the interactions endpoint URL in Discord Developer Portal: `https://api-dev.syrus.chat/webhooks/d`
3. Test Discord interaction verification (Discord will send a PING)

### CloudFormation Outputs

- `CampaignsTableName`: Name of the DynamoDB campaigns table (`syrus-campaigns-dev`)
- `WebhookApiUrl`: Custom domain webhook URL (`https://api-dev.syrus.chat/webhooks/wa`)
- `WebhookLambdaArn`: Lambda function ARN for webhook processing
- Exported as: `SyrusTableName-${stage}`, `SyrusWebhookApiUrl-${stage}`, `SyrusWebhookLambdaArn-${stage}`

## WhatsApp Webhook Configuration

### Webhook Verification

WhatsApp requires webhook verification to confirm the endpoint is valid. The webhook supports both GET (verification) and POST (messages) requests.

**Webhook URL**: `https://api.syrus.chat/webhooks/wa`

**Verification Process**:
1. WhatsApp sends GET request with query parameters:
   - `hub.mode=subscribe`
   - `hub.verify_token=<SYRUS_VERIFY_TOKEN>`
   - `hub.challenge=<random_string>`
2. Lambda validates the token matches `SYRUS_VERIFY_TOKEN`
3. Returns 200 with the challenge string to complete verification

### Environment Variables

The following environment variables need to be configured via SSM Parameters:

- `SYRUS_VERIFY_TOKEN`: Used for webhook verification (GET requests)
- `SYRUS_WA_TOKEN`: WhatsApp Business API access token for sending messages
- `SYRUS_PHONE_ID`: Your WhatsApp Business API phone number ID
- `SYRUS_HOSTS_TABLE`: Name of the DynamoDB hosts table for user whitelisting

### WhatsApp Business API Setup

1. **Source Environment Variables**:
   ```bash
   source ~/.zshrc  # Load your SYRUS_* environment variables
   ```

2. **Create WhatsApp Business Account**:
   - Set up a WhatsApp Business Account
   - Get your Phone Number ID and Access Token
   - Update your `~/.zshrc` with the actual values

3. **Configure Webhook**:
   - **Webhook URL (Dev)**: `https://api-dev.syrus.chat/webhooks/wa`
   - **Webhook URL (Prod)**: `https://api.syrus.chat/webhooks/wa`
   - **Verify Token**: Value of `SYRUS_VERIFY_TOKEN` from your `~/.zshrc`

4. **Create SSM Parameters**:
   ```bash
   source ~/.zshrc  # Ensure environment variables are loaded

   aws ssm put-parameter \
     --name "/syrus/dev/whatsapp/verify-token" \
     --value "$SYRUS_VERIFY_TOKEN" \
     --type "String" \
     --profile arborquote

   aws ssm put-parameter \
     --name "/syrus/dev/whatsapp/access-token" \
     --value "$SYRUS_WA_TOKEN" \
     --type "String" \
     --profile arborquote

   aws ssm put-parameter \
     --name "/syrus/dev/whatsapp/phone-number-id" \
     --value "$SYRUS_PHONE_ID" \
     --type "String" \
     --profile arborquote
   ```

### Testing Webhook Verification

You can test webhook verification manually:

```bash
curl "https://api.syrus.chat/webhooks/wa?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### Testing Message Reception

Send a WhatsApp message to your business number and check:
1. CloudWatch logs for the Lambda function
2. **Only messages starting with `$yrus` or `/syrus` from whitelisted users**: The sender should receive an automatic "Received" message

#### Command Format

Syrus responds to messages that start with:
- `$yrus` - Dollar sign prefix
- `/syrus` - Slash prefix

**Examples:**
- `$yrus` - Basic command (responds with "Received")
- `$yrus help` - Help command (responds with "Received")
- `/syrus debug` - Debug command (responds with "Received" + full webhook payload)
- `$yrusdebug` - Also works (no space required)

**Note**: Only whitelisted users (in hosts table) will receive responses. Messages from non-whitelisted users or messages without valid prefixes are silently ignored.

#### Message Logging

When a whitelisted user sends a message, the Lambda function logs the complete incoming webhook payload in CloudWatch Logs for debugging and monitoring purposes. The log includes the user's name from the hosts table (if available) or their waId.

**Log Format:**
```
Incoming message from whitelisted user [NAME|waId]: [full JSON payload]
```

**Example with name:**
```
Incoming message from whitelisted user Mario Ricart: {
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123456789",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {...},
        "contacts": [...],
        "messages": [...]
      },
      "field": "messages"
    }]
  }]
}
```

**Example with waId (if no name):**
```
Incoming message from whitelisted user 19547088572: {...}
```

### Resource Tagging

All resources are tagged with:
- `App=Syrus`
- `Service=WhatsAppBot`
- `Stage=${stage}`

### Removal Policies

- **Development**: `DESTROY` - Resources are deleted when stack is destroyed
- **Production**: `RETAIN` - Resources persist when stack is destroyed for safety

## Inference System (Infrastructure Only)

Infrastructure components for a future Inference System. This section includes only infrastructure resources (queues, tables, compute) with no application logic, models, or inference code.

### SQS FIFO Queues

Two FIFO queues are created for message processing:

**Inference Queue**:
- Name: `syrus-inference-{stage}.fifo`
- Dead Letter Queue: `syrus-inference-dlq-{stage}.fifo`
- Purpose: Receives messages for inference processing
- Configuration:
  - FIFO ordering with `MessageGroupId = campaignId` (preserves ordering per campaign)
  - Content-based deduplication: disabled
  - Visibility timeout: 60 seconds
  - Retention period: 4 days
  - Encryption: SQS-managed (SSE-SQS)
  - Max receive count before DLQ: 5

**Messaging Queue**:
- Name: `syrus-messaging-{stage}.fifo`
- Dead Letter Queue: `syrus-messaging-dlq-{stage}.fifo`
- Purpose: Sends processed messages to messaging layer
- Configuration: Same as inference queue

**Important**: FIFO queues provide at-least-once delivery. The dedup table (below) enforces exactly-once processing semantics.

### DynamoDB Dedup Table

**Table Name**: `syrus-dedup-{stage}`

**Schema**:
- Partition Key: `dedupKey` (string)
- TTL Attribute: `expiresAt` (number, epoch seconds)

**Dedup Key Format**:

Deduplication is scoped per queue role, not global. Keys follow the format:

```
<queueRole>#<wamid>
```

Examples:
- `ingest#wamid.ABC123`
- `inference#wamid.ABC123`
- `messaging#wamid.ABC123`

**Configuration**:
- Billing mode: PROVISIONED (5 RCU, 5 WCU)
- TTL: Enabled on `expiresAt` attribute (24 hours)
- Point-in-time recovery: OFF
- Deletion protection: OFF

**Usage**: Before processing a message, check if a dedup key exists. If it exists, skip processing (already handled). If not, process the message and write the dedup key with `expiresAt` set to 24 hours from now.

### EC2 Worker Instance

A placeholder EC2 instance intended to act as a future background worker.

**Instance Configuration**:
- Type: `t3.micro`
- AMI: Amazon Linux 2023 (latest)
- Root volume: 16 GB gp3
- Access: AWS Systems Manager (SSM) only (no SSH keypair)

**IAM Permissions**:
- `AmazonSSMManagedInstanceCore` (for SSM access)
- SQS permissions:
  - `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`, `sqs:GetQueueAttributes` on inference queue
  - `sqs:SendMessage` on messaging queue
- DynamoDB permissions:
  - `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:UpdateItem` on dedup table

**User Data**:
- Installs `jq`
- Creates placeholder systemd service: `/etc/systemd/system/syrus-worker.service`
- Service uses `ExecStart=/bin/true` (placeholder - no actual worker logic)
- Service is enabled and started automatically
- User data logs to `/var/log/user-data.log`

**Networking Modes**:

The worker can be deployed in two network modes, controlled by CDK context flag `workerNetworkMode`:

1. **Public Mode** (default):
   - Uses default VPC
   - Public subnet
   - Security group: No inbound rules, outbound HTTPS (443) only
   - No NAT Gateway required

2. **Isolated Mode**:
   - Creates dedicated VPC with isolated subnets only
   - No Internet Gateway
   - No NAT Gateway
   - VPC endpoints for: SSM, EC2Messages, SSMMessages, SQS, CloudWatch Logs
   - Security group: Egress only to VPC endpoints
   - Maximum network isolation

To use isolated mode:
```bash
cdk deploy --context workerNetworkMode=isolated
```

**Connecting to Worker**:

Access the instance via AWS Systems Manager Session Manager:

```bash
# Get instance ID from CloudFormation outputs
aws ssm start-session --target <instance-id>
```

### CloudFormation Outputs

The following outputs are available for the Inference System:

- `InferenceQueueUrl` / `InferenceQueueArn`: Inference queue URL and ARN
- `InferenceDlqUrl` / `InferenceDlqArn`: Inference DLQ URL and ARN
- `MessagingQueueUrl` / `MessagingQueueArn`: Messaging queue URL and ARN
- `MessagingDlqUrl` / `MessagingDlqArn`: Messaging DLQ URL and ARN
- `DedupTableName` / `DedupTableArn`: Dedup table name and ARN
- `WorkerInstanceId`: EC2 worker instance ID

All outputs are exported with the pattern: `Syrus{ResourceName}-{stage}`

### Design Principles

1. **FIFO Ordering**: Messages are ordered per campaign using `MessageGroupId = campaignId`
2. **Exactly-Once Processing**: FIFO queues provide at-least-once delivery; the dedup table enforces exactly-once processing effects
3. **Cost Optimization**: 
   - No NAT Gateway
   - No ALB/NLB
   - Single EC2 instance
   - PROVISIONED DynamoDB capacity (5 RCU/WCU)
   - SQS SSE-SQS encryption (no KMS costs)
4. **Infrastructure Only**: No application logic, models, or inference code is included in this infrastructure
