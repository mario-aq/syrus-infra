import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';

export interface ConfirmationsTableProps {
  /** Deployment stage (dev/prod) */
  stage: string;
  /** Removal policy for the table */
  removalPolicy: RemovalPolicy;
}

/**
 * Creates a DynamoDB table for campaign action confirmations
 * 
 * Schema:
 * - Partition key: campaignId (string)
 * - TTL attribute: expiresAt (number, epoch seconds)
 * 
 * Used for time-limited confirmations (e.g., campaign end confirmation)
 * Records automatically expire after TTL (default 60 seconds)
 */
export class ConfirmationsTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ConfirmationsTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'ConfirmationsTable', {
      tableName: `syrus-confirmations-${props.stage}`,
      partitionKey: {
        name: 'campaignId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: props.removalPolicy,
      pointInTimeRecovery: false, // Disabled for cost control
      deletionProtection: false,
      // Enable TTL on the 'expiresAt' attribute (60 seconds default)
      timeToLiveAttribute: 'expiresAt',
    });

    // Add tags
    Tags.of(this.table).add('App', 'Syrus');
    Tags.of(this.table).add('Service', 'DiscordBot');
    Tags.of(this.table).add('Stage', props.stage);
  }
}
