"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyrusApi = void 0;
const constructs_1 = require("constructs");
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cdk_lib_2 = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const route53 = require("aws-cdk-lib/aws-route53");
const targets = require("aws-cdk-lib/aws-route53-targets");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const ssm = require("aws-cdk-lib/aws-ssm");
const iam = require("aws-cdk-lib/aws-iam");
const aws_cdk_lib_3 = require("aws-cdk-lib");
class SyrusApi extends constructs_1.Construct {
    constructor(scope, id, props) {
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 256,
        });
        // Add DynamoDB permissions for hosts table access
        this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'dynamodb:GetItem',
                'dynamodb:Query',
            ],
            resources: [`arn:aws:dynamodb:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:table/syrus-hosts-${stageConfig.stage}`],
        }));
        // Add SSM permissions for app secret access (for signature verification)
        this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
            ],
            resources: [
                `arn:aws:ssm:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/whatsapp/*`,
            ],
        }));
        // Add SYRUS_STAGE environment variable
        this.lambdaFunction.addEnvironment('SYRUS_STAGE', stageConfig.stage);
        // Add tags to Lambda function
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Service', 'WhatsAppBot');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());
        // Create REST API
        this.api = new apigateway.RestApi(this, 'SyrusApi', {
            restApiName: `syrus-api-${stageConfig.stage}`,
            description: 'Syrus API for WhatsApp webhooks',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Hub-Signature-256'],
            },
        });
        // Create Lambda integration
        const lambdaIntegration = new apigateway.LambdaIntegration(this.lambdaFunction, {
            requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
        });
        // Create resource path: /webhooks/wa
        const webhooksResource = this.api.root.addResource('webhooks');
        const waResource = webhooksResource.addResource('wa');
        // Add GET method for webhook verification
        waResource.addMethod('GET', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        // Add POST method for webhook messages
        // Signature validation is done in the webhook Lambda function
        waResource.addMethod('POST', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        // Configure throttling using UsagePlan
        const usagePlan = this.api.addUsagePlan('SyrusUsagePlan', {
            name: `syrus-usage-plan-${stageConfig.stage}`,
            throttle: {
                rateLimit: 10, // 10 requests per second
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
        }
        else {
            // Use the default REST API endpoint
            this.customDomainUrl = `${this.api.url}webhooks/wa`;
        }
        // Add tags to API Gateway
        aws_cdk_lib_2.Tags.of(this.api).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.api).add('Service', 'WhatsAppBot');
        aws_cdk_lib_2.Tags.of(this.api).add('Stage', stageConfig.stage);
    }
}
exports.SyrusApi = SyrusApi;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2Qyw2QkFBNkI7QUFDN0IsNkNBQXVDO0FBQ3ZDLDZDQUFtQztBQUNuQyxpREFBaUQ7QUFDakQseURBQXlEO0FBQ3pELG1EQUFtRDtBQUNuRCwyREFBMkQ7QUFDM0QsMERBQTBEO0FBQzFELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsNkNBQW9DO0FBU3BDLE1BQWEsUUFBUyxTQUFRLHNCQUFTO0lBS3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQUUsV0FBVyxFQUFFLFlBQVksR0FBRyxLQUFLLEVBQUUsY0FBYyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXBFLHNCQUFzQjtRQUN0QixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO1FBRXpGLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNqRixZQUFZLEVBQUUsdUJBQXVCO1lBQ3JDLFFBQVEsRUFBRSxZQUFZO1NBQ3ZCLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDbEUsVUFBVSxFQUFFLFVBQVU7WUFDdEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO1NBQzFELENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FB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Q0FBQztZQUVILDRCQUE0QjtZQUM1QixJQUFJLENBQUMsZUFBZSxHQUFHLFdBQVcsVUFBVSxjQUFjLENBQUM7UUFDN0QsQ0FBQzthQUFNLENBQUM7WUFDTixvQ0FBb0M7WUFDcEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxhQUFhLENBQUM7UUFDdEQsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNoRCxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQztDQUNGO0FBcEpELDRCQW9KQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGFncyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTdGFnZUNvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBXZWJob29rQXBpUHJvcHMge1xuICBzdGFnZUNvbmZpZzogU3RhZ2VDb25maWc7XG4gIGN1c3RvbURvbWFpbj86IGJvb2xlYW47XG4gIGhvc3RzVGFibGVOYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU3lydXNBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tRG9tYWluVXJsOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFdlYmhvb2tBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7IHN0YWdlQ29uZmlnLCBjdXN0b21Eb21haW4gPSBmYWxzZSwgaG9zdHNUYWJsZU5hbWUgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3VzdG9tIGRvbWFpbiBzZXR1cFxuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBzdGFnZUNvbmZpZy5zdGFnZSA9PT0gJ2RldicgPyAnYXBpLWRldi5zeXJ1cy5jaGF0JyA6ICdhcGkuc3lydXMuY2hhdCc7XG5cbiAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGhvc3RlZFpvbmVJZDogJ1owODg2NzMxM0dLRk5MRVNGNFNZTCcsXG4gICAgICB6b25lTmFtZTogJ3N5cnVzLmNoYXQnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2VydGlmaWNhdGUgPSBuZXcgYWNtLkNlcnRpZmljYXRlKHRoaXMsICdXZWJob29rQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKGhvc3RlZFpvbmUpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSB3ZWJob29rIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTeXJ1c0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyMDIzLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvd2ViaG9vaycpKSxcbiAgICAgIGhhbmRsZXI6ICdib290c3RyYXAnLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU1lSVVNfVkVSSUZZX1RPS0VOOiBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKHRoaXMsIGAvc3lydXMvJHtzdGFnZUNvbmZpZy5zdGFnZX0vd2hhdHNhcHAvdmVyaWZ5LXRva2VuYCksXG4gICAgICAgIFNZUlVTX1dBX1RPS0VOOiBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKHRoaXMsIGAvc3lydXMvJHtzdGFnZUNvbmZpZy5zdGFnZX0vd2hhdHNhcHAvYWNjZXNzLXRva2VuYCksXG4gICAgICAgIFNZUlVTX1BIT05FX0lEOiBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKHRoaXMsIGAvc3lydXMvJHtzdGFnZUNvbmZpZy5zdGFnZX0vd2hhdHNhcHAvcGhvbmUtbnVtYmVyLWlkYCksXG4gICAgICAgIFNZUlVTX0hPU1RTX1RBQkxFOiBob3N0c1RhYmxlTmFtZSB8fCBgc3lydXMtaG9zdHMtJHtzdGFnZUNvbmZpZy5zdGFnZX1gLFxuICAgICAgICBTWVJVU19TVEFHRTogc3RhZ2VDb25maWcuc3RhZ2UsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGhvc3RzIHRhYmxlIGFjY2Vzc1xuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnRhYmxlL3N5cnVzLWhvc3RzLSR7c3RhZ2VDb25maWcuc3RhZ2V9YF0sXG4gICAgfSkpO1xuXG4gICAgLy8gQWRkIFNTTSBwZXJtaXNzaW9ucyBmb3IgYXBwIHNlY3JldCBhY2Nlc3MgKGZvciBzaWduYXR1cmUgdmVyaWZpY2F0aW9uKVxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzc206JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06cGFyYW1ldGVyL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L3doYXRzYXBwLypgLFxuICAgICAgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgU1lSVVNfU1RBR0UgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLmFkZEVudmlyb25tZW50KCdTWVJVU19TVEFHRScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcblxuICAgIC8vIEFkZCB0YWdzIHRvIExhbWJkYSBmdW5jdGlvblxuICAgIFRhZ3Mub2YodGhpcy5sYW1iZGFGdW5jdGlvbikuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnU2VydmljZScsICdXaGF0c0FwcEJvdCcpO1xuICAgIFRhZ3Mub2YodGhpcy5sYW1iZGFGdW5jdGlvbikuYWRkKCdTdGFnZScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnTGFzdFVwZGF0ZWQnLCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpO1xuXG4gICAgLy8gQ3JlYXRlIFJFU1QgQVBJXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdTeXJ1c0FwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgc3lydXMtYXBpLSR7c3RhZ2VDb25maWcuc3RhZ2V9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3lydXMgQVBJIGZvciBXaGF0c0FwcCB3ZWJob29rcycsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknLCAnWC1BbXotU2VjdXJpdHktVG9rZW4nLCAnWC1IdWItU2lnbmF0dXJlLTI1NiddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgaW50ZWdyYXRpb25cbiAgICBjb25zdCBsYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMubGFtYmRhRnVuY3Rpb24sIHtcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHsgJ2FwcGxpY2F0aW9uL2pzb24nOiAneyBcInN0YXR1c0NvZGVcIjogXCIyMDBcIiB9JyB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHJlc291cmNlIHBhdGg6IC93ZWJob29rcy93YVxuICAgIGNvbnN0IHdlYmhvb2tzUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCd3ZWJob29rcycpO1xuICAgIGNvbnN0IHdhUmVzb3VyY2UgPSB3ZWJob29rc1Jlc291cmNlLmFkZFJlc291cmNlKCd3YScpO1xuXG4gICAgLy8gQWRkIEdFVCBtZXRob2QgZm9yIHdlYmhvb2sgdmVyaWZpY2F0aW9uXG4gICAgd2FSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIFBPU1QgbWV0aG9kIGZvciB3ZWJob29rIG1lc3NhZ2VzXG4gICAgLy8gU2lnbmF0dXJlIHZhbGlkYXRpb24gaXMgZG9uZSBpbiB0aGUgd2ViaG9vayBMYW1iZGEgZnVuY3Rpb25cbiAgICB3YVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgLy8gQ29uZmlndXJlIHRocm90dGxpbmcgdXNpbmcgVXNhZ2VQbGFuXG4gICAgY29uc3QgdXNhZ2VQbGFuID0gdGhpcy5hcGkuYWRkVXNhZ2VQbGFuKCdTeXJ1c1VzYWdlUGxhbicsIHtcbiAgICAgIG5hbWU6IGBzeXJ1cy11c2FnZS1wbGFuLSR7c3RhZ2VDb25maWcuc3RhZ2V9YCxcbiAgICAgIHRocm90dGxlOiB7XG4gICAgICAgIHJhdGVMaW1pdDogMTAsICAvLyAxMCByZXF1ZXN0cyBwZXIgc2Vjb25kXG4gICAgICAgIGJ1cnN0TGltaXQ6IDIwLCAvLyBCdXJzdCBsaW1pdCBvZiAyMCByZXF1ZXN0c1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSB1c2FnZSBwbGFuIHdpdGggdGhlIEFQSSBzdGFnZVxuICAgIGNvbnN0IHN0YWdlID0gdGhpcy5hcGkuZGVwbG95bWVudFN0YWdlO1xuICAgIHVzYWdlUGxhbi5hZGRBcGlTdGFnZSh7XG4gICAgICBzdGFnZTogc3RhZ2UsXG4gICAgfSk7XG5cbiAgICBpZiAoY3VzdG9tRG9tYWluKSB7XG4gICAgICAvLyBDcmVhdGUgY3VzdG9tIGRvbWFpbiBmb3IgUkVTVCBBUElcbiAgICAgIGNvbnN0IGRvbWFpbk5hbWVSZXNvdXJjZSA9IG5ldyBhcGlnYXRld2F5LkRvbWFpbk5hbWUodGhpcywgJ1N5cnVzQ3VzdG9tRG9tYWluJywge1xuICAgICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lLFxuICAgICAgICBjZXJ0aWZpY2F0ZTogY2VydGlmaWNhdGUsXG4gICAgICAgIHNlY3VyaXR5UG9saWN5OiBhcGlnYXRld2F5LlNlY3VyaXR5UG9saWN5LlRMU18xXzIsXG4gICAgICB9KTtcblxuICAgICAgLy8gTWFwIHRoZSBjdXN0b20gZG9tYWluIHRvIHRoZSBSRVNUIEFQSVxuICAgICAgbmV3IGFwaWdhdGV3YXkuQmFzZVBhdGhNYXBwaW5nKHRoaXMsICdTeXJ1c0FwaU1hcHBpbmcnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IGRvbWFpbk5hbWVSZXNvdXJjZSxcbiAgICAgICAgcmVzdEFwaTogdGhpcy5hcGksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIFJvdXRlIDUzIHJlY29yZFxuICAgICAgY29uc3QgcmVjb3JkTmFtZSA9IHN0YWdlQ29uZmlnLnN0YWdlID09PSAnZGV2JyA/ICdhcGktZGV2JyA6ICdhcGknO1xuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU3lydXNBcGlSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6IHJlY29yZE5hbWUsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLkFwaUdhdGV3YXlEb21haW4oZG9tYWluTmFtZVJlc291cmNlKSksXG4gICAgICB9KTtcblxuICAgICAgLy8gU2V0IHRoZSBjdXN0b20gZG9tYWluIFVSTFxuICAgICAgdGhpcy5jdXN0b21Eb21haW5VcmwgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9L3dlYmhvb2tzL3dhYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIHRoZSBkZWZhdWx0IFJFU1QgQVBJIGVuZHBvaW50XG4gICAgICB0aGlzLmN1c3RvbURvbWFpblVybCA9IGAke3RoaXMuYXBpLnVybH13ZWJob29rcy93YWA7XG4gICAgfVxuXG4gICAgLy8gQWRkIHRhZ3MgdG8gQVBJIEdhdGV3YXlcbiAgICBUYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ0FwcCcsICdTeXJ1cycpO1xuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnU2VydmljZScsICdXaGF0c0FwcEJvdCcpO1xuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG4gIH1cbn1cbiJdfQ==