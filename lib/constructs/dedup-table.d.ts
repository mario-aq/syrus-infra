import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
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
export declare class DedupTable extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props: DedupTableProps);
}
