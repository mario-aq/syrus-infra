import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';

export interface DedupTableProps {
  /** Deployment stage (dev/prod) */
  stage: string;
  /** Removal policy for the table */
  removalPolicy: RemovalPolicy;
}

/**
 * Creates a DynamoDB table for message deduplication
 * 
 * Schema:
 * - Partition key: dedupKey (string)
 * - TTL attribute: expiresAt (number, epoch seconds)
 * 
 * Dedup key format: <queueRole>#<wamid>
 * Examples: ingest#wamid.ABC123, inference#wamid.ABC123, messaging#wamid.ABC123
 */
export class DedupTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DedupTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'DedupTable', {
      tableName: `syrus-dedup-${props.stage}`,
      partitionKey: {
        name: 'dedupKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: props.removalPolicy,
      pointInTimeRecovery: false, // Disabled for cost control
      deletionProtection: false,
      // Enable TTL on the 'expiresAt' attribute (24 hours)
      timeToLiveAttribute: 'expiresAt',
    });

    // Add tags
    Tags.of(this.table).add('App', 'Syrus');
    Tags.of(this.table).add('Service', 'DiscordBot');
    Tags.of(this.table).add('Stage', props.stage);
  }
}
