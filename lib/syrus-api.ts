import { Construct } from 'constructs';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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
  public readonly api: apigatewayv2.HttpApi;
  public readonly lambdaFunction: lambda.Function;
  public readonly customDomainUrl: string;

  constructor(scope: Construct, id: string, props: WebhookApiProps) {
    super(scope, id);

    const { stageConfig, customDomain = false, hostsTableName } = props; // Temporarily disable custom domain

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

    // Create the Lambda function
    this.lambdaFunction = new lambda.Function(this, 'SyrusFunction', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/webhook')),
      handler: 'bootstrap',
      environment: {
        SYRUS_VERIFY_TOKEN: ssm.StringParameter.valueForStringParameter(this, '/syrus/dev/whatsapp/verify-token'),
        SYRUS_WA_TOKEN: ssm.StringParameter.valueForStringParameter(this, '/syrus/dev/whatsapp/access-token'),
        SYRUS_PHONE_ID: ssm.StringParameter.valueForStringParameter(this, '/syrus/dev/whatsapp/phone-number-id'),
        SYRUS_HOSTS_TABLE: hostsTableName || `syrus-hosts-${stageConfig.stage}`,
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

    // Add tags to Lambda function
    Tags.of(this.lambdaFunction).add('App', 'Syrus');
    Tags.of(this.lambdaFunction).add('Service', 'WhatsAppBot');
    Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
    Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());

    // Create HTTP API (v2) - much simpler and better for webhooks
    this.api = new apigatewayv2.HttpApi(this, 'SyrusApi', {
      apiName: `syrus-api-${stageConfig.stage}`,
      description: 'Syrus API for WhatsApp webhooks',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    // Add routes for webhook endpoints - HTTP APIs handle CORS automatically
    this.api.addRoutes({
      path: '/webhooks/wa',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration('SyrusIntegration', this.lambdaFunction),
    });

    if (customDomain) {
      // Create custom domain for HTTP API
      const domainNameResource = new apigatewayv2.DomainName(this, 'SyrusCustomDomain', {
        domainName: domainName,
        certificate: certificate,
      });

      // Map the custom domain to the HTTP API
      new apigatewayv2.ApiMapping(this, 'SyrusApiMapping', {
        api: this.api,
        domainName: domainNameResource,
      });

      // Create Route 53 record
      const recordName = stageConfig.stage === 'dev' ? 'api-dev' : 'api';
      new route53.ARecord(this, 'SyrusApiRecord', {
        zone: hostedZone,
        recordName: recordName,
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(domainNameResource.regionalDomainName, domainNameResource.regionalHostedZoneId)),
      });

      // Set the custom domain URL
      this.customDomainUrl = `https://${domainName}/webhooks/wa`;
    } else {
      // Use the default HTTP API endpoint
      this.customDomainUrl = `${this.api.apiEndpoint}/webhooks/wa`;
    }

    // Add tags to API Gateway
    Tags.of(this.api).add('App', 'Syrus');
    Tags.of(this.api).add('Service', 'WhatsAppBot');
    Tags.of(this.api).add('Stage', stageConfig.stage);
  }
}
