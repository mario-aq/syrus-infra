import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Duration, CfnOutput } from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';

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
}

export interface SqsFifoWithDlqResult {
  /** The main FIFO queue */
  queue: sqs.Queue;
  /** The dead letter queue */
  dlq: sqs.Queue;
}

/**
 * Creates a FIFO SQS queue with a FIFO dead letter queue
 */
export class SqsFifoWithDlq extends Construct {
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: SqsFifoWithDlqProps) {
    super(scope, id);

    const visibilityTimeout = props.visibilityTimeout || Duration.seconds(60);
    const retentionPeriod = props.retentionPeriod || Duration.days(4);
    const maxReceiveCount = props.maxReceiveCount || 5;

    // Create the dead letter queue first
    const dlqName = `syrus-${props.queueName}-dlq-${props.stage}.fifo`;
    this.dlq = new sqs.Queue(this, 'DLQ', {
      queueName: dlqName,
      fifo: true,
      contentBasedDeduplication: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: retentionPeriod,
    });

    // Create the main FIFO queue
    const queueName = `syrus-${props.queueName}-${props.stage}.fifo`;
    this.queue = new sqs.Queue(this, 'Queue', {
      queueName: queueName,
      fifo: true,
      contentBasedDeduplication: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: visibilityTimeout,
      retentionPeriod: retentionPeriod,
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: maxReceiveCount,
      },
    });

    // Add tags
    Tags.of(this.queue).add('App', 'Syrus');
    Tags.of(this.queue).add('Service', 'DiscordBot');
    Tags.of(this.queue).add('Stage', props.stage);

    Tags.of(this.dlq).add('App', 'Syrus');
    Tags.of(this.dlq).add('Service', 'DiscordBot');
    Tags.of(this.dlq).add('Stage', props.stage);
  }
}
