import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
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
export declare class ConfirmationsTable extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string, props: ConfirmationsTableProps);
}
