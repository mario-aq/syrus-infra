import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Duration } from 'aws-cdk-lib';
export interface SqsFifoWithDlqProps {
    /** Queue name without .fifo suffix (e.g., 'inference' becomes 'syrus-inference-{stage}.fifo') */
    queueName: string;
    /** Deployment stage (dev/prod) */
    stage: string;
    /** Visibility timeout for messages (default: 60 seconds) */
    visibilityTimeout?: Duration;
    /** Message retention period (default: 4 days) */
    retentionPeriod?: Duration;
    /** Maximum receive count before moving to DLQ (default: 5) */
    maxReceiveCount?: number;
    /** Default batch size for Lambda event source (default: 1) */
    defaultBatchSize?: number;
}
export interface SqsFifoWithDlqResult {
    /** The main FIFO queue */
    queue: sqs.Queue;
    /** The dead letter queue */
    dlq: sqs.Queue;
    /** Default batch size for Lambda event source */
    defaultBatchSize: number;
}
/**
 * Creates a FIFO SQS queue with a FIFO dead letter queue
 */
export declare class SqsFifoWithDlq extends Construct {
    readonly queue: sqs.Queue;
    readonly dlq: sqs.Queue;
    readonly defaultBatchSize: number;
    constructor(scope: Construct, id: string, props: SqsFifoWithDlqProps);
}
