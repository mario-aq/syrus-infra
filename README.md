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

### CloudFormation Outputs

- `CampaignsTableName`: Name of the DynamoDB campaigns table
- Exported as: `SyrusTableName-${stage}`

### Resource Tagging

All resources are tagged with:
- `App=Syrus`
- `Service=WhatsAppBot`
- `Stage=${stage}`

### Removal Policies

- **Development**: `DESTROY` - Resources are deleted when stack is destroyed
- **Production**: `RETAIN` - Resources persist when stack is destroyed for safety
