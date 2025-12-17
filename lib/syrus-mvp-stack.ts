import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { createCampaignsTable, createHostsTable } from './campaigns-table';
import { getStageConfig } from './config';
import { SyrusApi } from './syrus-api';
import { SqsFifoWithDlq } from './constructs/sqs-fifo-with-dlq';
import { DedupTable } from './constructs/dedup-table';

interface SyrusMvpStackProps extends StackProps {
  stage: string;
}

export class SyrusMvpStack extends Stack {
  constructor(scope: Construct, id: string, props: SyrusMvpStackProps) {
    super(scope, id, props);

    const stageConfig = getStageConfig(props.stage);

    // Create the campaigns table
    const campaignsTable = createCampaignsTable(this, stageConfig);

    // Create the hosts table for whitelisting Discord users
    const hostsTable = createHostsTable(this, stageConfig);

    // Messaging Infrastructure
    // Create SQS FIFO queue for messaging (needed before SyrusApi)
    const messagingQueue = new SqsFifoWithDlq(this, 'MessagingQueue', {
      queueName: 'messaging',
      stage: props.stage,
    });

    // Create the Syrus API with custom domain
    const syrusApi = new SyrusApi(this, 'SyrusApi', {
      stageConfig,
      customDomain: true,
      hostsTableName: hostsTable.tableName,
      messagingQueue: messagingQueue.queue,
    });

    // Add CloudFormation outputs
    new CfnOutput(this, 'CampaignsTableName', {
      value: campaignsTable.tableName,
      description: 'Name of the DynamoDB campaigns table',
      exportName: `SyrusTableName-${props.stage}`,
    });

    new CfnOutput(this, 'HostsTableName', {
      value: hostsTable.tableName,
      description: 'Name of the DynamoDB hosts table',
      exportName: `SyrusHostsTableName-${props.stage}`,
    });

    new CfnOutput(this, 'SyrusApiUrl', {
      value: syrusApi.customDomainUrl,
      description: 'Syrus API URL with custom domain',
      exportName: `SyrusApiUrl-${props.stage}`,
    });

    new CfnOutput(this, 'SyrusLambdaArn', {
      value: syrusApi.lambdaFunction.functionArn,
      description: 'Syrus Lambda function ARN',
      exportName: `SyrusLambdaArn-${props.stage}`,
    });

    // Create dedup table
    const dedupTable = new DedupTable(this, 'DedupTable', {
      stage: props.stage,
      removalPolicy: stageConfig.removalPolicy,
    });

    // Create messaging Lambda function
    const messagingFunction = new lambda.Function(this, 'MessagingFunction', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/messaging')),
      handler: 'bootstrap',
      environment: {
        SYRUS_DISCORD_BOT_TOKEN_PARAM: `/syrus/${stageConfig.stage}/discord/bot-token`,
        SYRUS_STAGE: stageConfig.stage,
      },
      timeout: Duration.seconds(30),
      memorySize: 256,
    });

    // Add SSM permissions for Discord bot token and app ID access
    messagingFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
      ],
      resources: [
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/bot-token`,
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/app-id`,
      ],
    }));

    // Add SQS permissions for messaging queue
    messagingFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
      ],
      resources: [messagingQueue.queue.queueArn],
    }));

    // Add SQS event source mapping
    messagingFunction.addEventSource(new lambdaEventSources.SqsEventSource(messagingQueue.queue, {
      batchSize: 10, // SQS FIFO limit
      reportBatchItemFailures: true,
    }));

    // CloudFormation outputs for Messaging Infrastructure
    new CfnOutput(this, 'MessagingQueueUrl', {
      value: messagingQueue.queue.queueUrl,
      description: 'URL of the messaging FIFO queue',
      exportName: `SyrusMessagingQueueUrl-${props.stage}`,
    });

    new CfnOutput(this, 'MessagingQueueArn', {
      value: messagingQueue.queue.queueArn,
      description: 'ARN of the messaging FIFO queue',
      exportName: `SyrusMessagingQueueArn-${props.stage}`,
    });

    new CfnOutput(this, 'MessagingDlqUrl', {
      value: messagingQueue.dlq.queueUrl,
      description: 'URL of the messaging dead letter queue',
      exportName: `SyrusMessagingDlqUrl-${props.stage}`,
    });

    new CfnOutput(this, 'MessagingDlqArn', {
      value: messagingQueue.dlq.queueArn,
      description: 'ARN of the messaging dead letter queue',
      exportName: `SyrusMessagingDlqArn-${props.stage}`,
    });

    new CfnOutput(this, 'DedupTableName', {
      value: dedupTable.table.tableName,
      description: 'Name of the DynamoDB dedup table',
      exportName: `SyrusDedupTableName-${props.stage}`,
    });

    new CfnOutput(this, 'DedupTableArn', {
      value: dedupTable.table.tableArn,
      description: 'ARN of the DynamoDB dedup table',
      exportName: `SyrusDedupTableArn-${props.stage}`,
    });

    new CfnOutput(this, 'MessagingLambdaArn', {
      value: messagingFunction.functionArn,
      description: 'ARN of the messaging Lambda function',
      exportName: `SyrusMessagingLambdaArn-${props.stage}`,
    });
  }
}
