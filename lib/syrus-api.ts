import { Construct } from 'constructs';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';
import { StageConfig } from './config';

export interface WebhookApiProps {
  stageConfig: StageConfig;
  customDomain?: boolean;
  hostsTableName?: string;
}

export class SyrusApi extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly lambdaFunction: lambda.Function;
  public readonly authorizerFunction: lambda.Function;
  public readonly customDomainUrl: string;

  constructor(scope: Construct, id: string, props: WebhookApiProps) {
    super(scope, id);

    const { stageConfig, customDomain = false, hostsTableName } = props;

    // Custom domain setup
    const domainName = stageConfig.stage === 'dev' ? 'api-dev.syrus.chat' : 'api.syrus.chat';

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z08867313GKFNLESF4SYL',
      zoneName: 'syrus.chat',
    });

    const certificate = new acm.Certificate(this, 'WebhookCertificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create the authorizer Lambda function
    this.authorizerFunction = new lambda.Function(this, 'SyrusAuthorizerFunction', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/authorizer')),
      handler: 'bootstrap',
      environment: {
        SYRUS_STAGE: stageConfig.stage,
      },
      timeout: Duration.seconds(10),
      memorySize: 256,
    });

    // Grant authorizer permission to read SSM parameters
    this.authorizerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/whatsapp/*`,
      ],
    }));

    // Add tags to authorizer Lambda function
    Tags.of(this.authorizerFunction).add('App', 'Syrus');
    Tags.of(this.authorizerFunction).add('Service', 'WhatsAppBot');
    Tags.of(this.authorizerFunction).add('Stage', stageConfig.stage);

    // Create the webhook Lambda function
    this.lambdaFunction = new lambda.Function(this, 'SyrusFunction', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/webhook')),
      handler: 'bootstrap',
      environment: {
        SYRUS_VERIFY_TOKEN: ssm.StringParameter.valueForStringParameter(this, `/syrus/${stageConfig.stage}/whatsapp/verify-token`),
        SYRUS_WA_TOKEN: ssm.StringParameter.valueForStringParameter(this, `/syrus/${stageConfig.stage}/whatsapp/access-token`),
        SYRUS_PHONE_ID: ssm.StringParameter.valueForStringParameter(this, `/syrus/${stageConfig.stage}/whatsapp/phone-number-id`),
        SYRUS_HOSTS_TABLE: hostsTableName || `syrus-hosts-${stageConfig.stage}`,
        SYRUS_STAGE: stageConfig.stage,
      },
      timeout: Duration.seconds(30),
      memorySize: 256,
    });

    // Add DynamoDB permissions for hosts table access
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
      ],
      resources: [`arn:aws:dynamodb:${Stack.of(this).region}:${Stack.of(this).account}:table/syrus-hosts-${stageConfig.stage}`],
    }));

    // Add SSM permissions for app secret access (for signature verification)
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/whatsapp/*`,
      ],
    }));

    // Add SYRUS_STAGE environment variable
    this.lambdaFunction.addEnvironment('SYRUS_STAGE', stageConfig.stage);

    // Add tags to Lambda function
    Tags.of(this.lambdaFunction).add('App', 'Syrus');
    Tags.of(this.lambdaFunction).add('Service', 'WhatsAppBot');
    Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
    Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());

    // Create REST API first
    this.api = new apigateway.RestApi(this, 'SyrusApi', {
      restApiName: `syrus-api-${stageConfig.stage}`,
      description: 'Syrus API for WhatsApp webhooks',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Hub-Signature-256'],
      },
    });

    // Grant API Gateway permission to invoke the authorizer
    this.authorizerFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Note: We're not using the authorizer for POST requests since REST API
    // request authorizers don't reliably receive the request body.
    // Signature validation is done in the webhook Lambda function instead.

    // Create Lambda integrations
    const lambdaIntegration = new apigateway.LambdaIntegration(this.lambdaFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    // Create resource path: /webhooks/wa
    const webhooksResource = this.api.root.addResource('webhooks');
    const waResource = webhooksResource.addResource('wa');

    // Add GET method for webhook verification (no authorizer)
    waResource.addMethod('GET', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // Add POST method for webhook messages (no authorizer - signature validation in Lambda)
    // Signature validation is done in the webhook Lambda function since REST API
    // request authorizers don't reliably receive the request body
    waResource.addMethod('POST', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // Configure throttling using UsagePlan
    const usagePlan = this.api.addUsagePlan('SyrusUsagePlan', {
      name: `syrus-usage-plan-${stageConfig.stage}`,
      throttle: {
        rateLimit: 10,  // 10 requests per second
        burstLimit: 20, // Burst limit of 20 requests
      },
    });

    // Associate usage plan with the API stage
    const stage = this.api.deploymentStage;
    usagePlan.addApiStage({
      stage: stage,
    });

    if (customDomain) {
      // Create custom domain for REST API
      const domainNameResource = new apigateway.DomainName(this, 'SyrusCustomDomain', {
        domainName: domainName,
        certificate: certificate,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });

      // Map the custom domain to the REST API
      new apigateway.BasePathMapping(this, 'SyrusApiMapping', {
        domainName: domainNameResource,
        restApi: this.api,
      });

      // Create Route 53 record
      const recordName = stageConfig.stage === 'dev' ? 'api-dev' : 'api';
      new route53.ARecord(this, 'SyrusApiRecord', {
        zone: hostedZone,
        recordName: recordName,
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(domainNameResource)),
      });

      // Set the custom domain URL
      this.customDomainUrl = `https://${domainName}/webhooks/wa`;
    } else {
      // Use the default REST API endpoint
      this.customDomainUrl = `${this.api.url}webhooks/wa`;
    }

    // Add tags to API Gateway
    Tags.of(this.api).add('App', 'Syrus');
    Tags.of(this.api).add('Service', 'WhatsAppBot');
    Tags.of(this.api).add('Stage', stageConfig.stage);
  }
}
