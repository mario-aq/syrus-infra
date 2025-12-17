import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';

/**
 * Creates a reusable IAM policy for sending messages to an SQS queue.
 * This can be attached to any Lambda function that needs to send messages.
 */
export class QueueOutgoingMessagePolicy extends Construct {
  public readonly policy: iam.Policy;

  constructor(scope: Construct, id: string, props: { queue: sqs.IQueue }) {
    super(scope, id);

    this.policy = new iam.Policy(this, 'Policy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sqs:SendMessage'],
          resources: [props.queue.queueArn],
        }),
      ],
    });
  }
}
