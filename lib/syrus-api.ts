import { Construct } from 'constructs';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Stack } from 'aws-cdk-lib';
import { StageConfig } from './config';
import { QueueOutgoingMessagePolicy } from './constructs/queue-outgoing-message-policy';

export interface WebhookApiProps {
  stageConfig: StageConfig;
  customDomain?: boolean;
  hostsTableName?: string;
  messagingQueue?: sqs.IQueue;
  configuringQueue?: sqs.IQueue;
}

export class SyrusApi extends Construct {
  public readonly api: apigatewayv2.HttpApi;
  public readonly lambdaFunction: lambda.Function;
  public readonly customDomainUrl: string;

  constructor(scope: Construct, id: string, props: WebhookApiProps) {
    super(scope, id);

    const { stageConfig, customDomain = false, hostsTableName, messagingQueue, configuringQueue } = props;

    // Custom domain setup
    const domainName = 'webhooks.syrus.chat';

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z08867313GKFNLESF4SYL',
      zoneName: 'syrus.chat',
    });

    const certificate = new acm.Certificate(this, 'WebhookCertificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create the webhook Lambda function
    this.lambdaFunction = new lambda.Function(this, 'SyrusFunction', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/webhook')),
      handler: 'bootstrap',
      environment: {
        SYRUS_DISCORD_PUBLIC_KEY_PARAM: `/syrus/${stageConfig.stage}/discord/public-key`,
        SYRUS_DISCORD_APP_ID_PARAM: `/syrus/${stageConfig.stage}/discord/app-id`,
        SYRUS_HOSTS_TABLE: hostsTableName || `syrus-${stageConfig.stage}-hosts`,
        SYRUS_STAGE: stageConfig.stage,
        ...(messagingQueue ? { SYRUS_MESSAGING_QUEUE_URL: messagingQueue.queueUrl } : {}),
        ...(configuringQueue ? { SYRUS_CONFIGURING_QUEUE_URL: configuringQueue.queueUrl } : {}),
      },
      timeout: Duration.seconds(30),
      memorySize: 256,
    });

    // Add DynamoDB permissions for hosts table access
    const actualHostsTableName = hostsTableName || `syrus-${stageConfig.stage}-hosts`;
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
      ],
      resources: [`arn:aws:dynamodb:${Stack.of(this).region}:${Stack.of(this).account}:table/${actualHostsTableName}`],
    }));

    // Add SSM permissions for Discord public key and app ID access
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/public-key`,
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/app-id`,
      ],
    }));

    // Add SQS permissions for messaging queue if provided
    if (messagingQueue) {
      const queuePolicy = new QueueOutgoingMessagePolicy(this, 'QueueOutgoingMessagePolicy', {
        queue: messagingQueue,
      });
      queuePolicy.policy.attachToRole(this.lambdaFunction.role!);
    }

    // Add SQS permissions for configuring queue if provided
    if (configuringQueue) {
      const configuringQueuePolicy = new QueueOutgoingMessagePolicy(this, 'ConfiguringQueueOutgoingMessagePolicy', {
        queue: configuringQueue,
      });
      configuringQueuePolicy.policy.attachToRole(this.lambdaFunction.role!);
    }

    // Add SYRUS_STAGE environment variable
    this.lambdaFunction.addEnvironment('SYRUS_STAGE', stageConfig.stage);

    // Add tags to Lambda function
    Tags.of(this.lambdaFunction).add('App', 'Syrus');
    Tags.of(this.lambdaFunction).add('Service', 'DiscordBot');
    Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
    Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());

    // Create HTTP API (v2) - required for Discord Ed25519 signature verification
    // HTTP API passes raw request body byte-for-byte without transformations
    this.api = new apigatewayv2.HttpApi(this, 'SyrusApi', {
      apiName: `syrus-api-${stageConfig.stage}`,
      description: 'Syrus API for Discord interactions',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type', 'X-Signature-Ed25519', 'X-Signature-Timestamp'],
      },
    });

    // Create Lambda integration with HTTP API
    // No request/response transformations - raw body passes through
    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      this.lambdaFunction
    );

    // Add POST route at /discord path for Discord interactions
    this.api.addRoutes({
      path: '/discord',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    if (customDomain) {
      // Create custom domain for HTTP API
      const domainNameResource = new apigatewayv2.DomainName(this, 'SyrusCustomDomain', {
        domainName: domainName,
        certificate: certificate,
      });

      // Map the custom domain to the HTTP API
      new apigatewayv2.ApiMapping(this, 'SyrusApiMapping', {
        domainName: domainNameResource,
        api: this.api,
      });

      // Create Route 53 record
      new route53.ARecord(this, 'SyrusApiRecord', {
        zone: hostedZone,
        recordName: 'webhooks',
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
          domainNameResource.regionalDomainName,
          domainNameResource.regionalHostedZoneId
        )),
      });

      // Set the custom domain URL with /discord path
      this.customDomainUrl = `https://${domainName}/discord`;
    } else {
      // Use the default HTTP API endpoint (root path)
      this.customDomainUrl = `${this.api.url}`;
    }

    // Add tags to API Gateway
    Tags.of(this.api).add('App', 'Syrus');
    Tags.of(this.api).add('Service', 'DiscordBot');
    Tags.of(this.api).add('Stage', stageConfig.stage);
  }
}
