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
        // Create the authorizer Lambda function
        this.authorizerFunction = new lambda.Function(this, 'SyrusAuthorizerFunction', {
            runtime: lambda.Runtime.PROVIDED_AL2023,
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/authorizer')),
            handler: 'bootstrap',
            environment: {
                SYRUS_STAGE: stageConfig.stage,
            },
            timeout: aws_cdk_lib_1.Duration.seconds(10),
            memorySize: 256,
        });
        // Grant authorizer permission to read SSM parameters
        this.authorizerFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
            ],
            resources: [
                `arn:aws:ssm:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/whatsapp/*`,
            ],
        }));
        // Add tags to authorizer Lambda function
        aws_cdk_lib_2.Tags.of(this.authorizerFunction).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.authorizerFunction).add('Service', 'WhatsAppBot');
        aws_cdk_lib_2.Tags.of(this.authorizerFunction).add('Stage', stageConfig.stage);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2Qyw2QkFBNkI7QUFDN0IsNkNBQXVDO0FBQ3ZDLDZDQUFtQztBQUNuQyxpREFBaUQ7QUFDakQseURBQXlEO0FBQ3pELG1EQUFtRDtBQUNuRCwyREFBMkQ7QUFDM0QsMERBQTBEO0FBQzFELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsNkNBQW9DO0FBU3BDLE1BQWEsUUFBUyxTQUFRLHNCQUFTO0lBTXJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQUUsV0FBVyxFQUFFLFlBQVksR0FBRyxLQUFLLEVBQUUsY0FBYyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXBFLHNCQUFzQjtRQUN0QixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO1FBRXpGLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNqRixZQUFZLEVBQUUsdUJBQXVCO1lBQ3JDLFFBQVEsRUFBRSxZQUFZO1NBQ3ZCLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDbEUsVUFBVSxFQUFFLFVBQVU7WUFDdEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO1NBQzFELENBQUMsQ0FBQztRQUVILHdDQUF3QztRQUN4QyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxD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LEtBQUssQ0FBQztZQUNuRSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO2dCQUMxQyxJQUFJLEVBQUUsVUFBVTtnQkFDaEIsVUFBVSxFQUFFLFVBQVU7Z0JBQ3RCLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2FBQ3pGLENBQUMsQ0FBQztZQUVILDRCQUE0QjtZQUM1QixJQUFJLENBQUMsZUFBZSxHQUFHLFdBQVcsVUFBVSxjQUFjLENBQUM7UUFDN0QsQ0FBQzthQUFNLENBQUM7WUFDTixvQ0FBb0M7WUFDcEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxhQUFhLENBQUM7UUFDdEQsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNoRCxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQztDQUNGO0FBekxELDRCQXlMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGFncyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTdGFnZUNvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBXZWJob29rQXBpUHJvcHMge1xuICBzdGFnZUNvbmZpZzogU3RhZ2VDb25maWc7XG4gIGN1c3RvbURvbWFpbj86IGJvb2xlYW47XG4gIGhvc3RzVGFibGVOYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU3lydXNBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYXV0aG9yaXplckZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21Eb21haW5Vcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2ViaG9va0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHsgc3RhZ2VDb25maWcsIGN1c3RvbURvbWFpbiA9IGZhbHNlLCBob3N0c1RhYmxlTmFtZSB9ID0gcHJvcHM7XG5cbiAgICAvLyBDdXN0b20gZG9tYWluIHNldHVwXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHN0YWdlQ29uZmlnLnN0YWdlID09PSAnZGV2JyA/ICdhcGktZGV2LnN5cnVzLmNoYXQnIDogJ2FwaS5zeXJ1cy5jaGF0JztcblxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgaG9zdGVkWm9uZUlkOiAnWjA4ODY3MzEzR0tGTkxFU0Y0U1lMJyxcbiAgICAgIHpvbmVOYW1lOiAnc3lydXMuY2hhdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ1dlYmhvb2tDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICB2YWxpZGF0aW9uOiBhY20uQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnMoaG9zdGVkWm9uZSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGF1dGhvcml6ZXIgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5hdXRob3JpemVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTeXJ1c0F1dGhvcml6ZXJGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMjAyMyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2F1dGhvcml6ZXInKSksXG4gICAgICBoYW5kbGVyOiAnYm9vdHN0cmFwJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNZUlVTX1NUQUdFOiBzdGFnZUNvbmZpZy5zdGFnZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IGF1dGhvcml6ZXIgcGVybWlzc2lvbiB0byByZWFkIFNTTSBwYXJhbWV0ZXJzXG4gICAgdGhpcy5hdXRob3JpemVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzc206JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06cGFyYW1ldGVyL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L3doYXRzYXBwLypgLFxuICAgICAgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgdGFncyB0byBhdXRob3JpemVyIExhbWJkYSBmdW5jdGlvblxuICAgIFRhZ3Mub2YodGhpcy5hdXRob3JpemVyRnVuY3Rpb24pLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih0aGlzLmF1dGhvcml6ZXJGdW5jdGlvbikuYWRkKCdTZXJ2aWNlJywgJ1doYXRzQXBwQm90Jyk7XG4gICAgVGFncy5vZih0aGlzLmF1dGhvcml6ZXJGdW5jdGlvbikuYWRkKCdTdGFnZScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgd2ViaG9vayBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3lydXNGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMjAyMyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3dlYmhvb2snKSksXG4gICAgICBoYW5kbGVyOiAnYm9vdHN0cmFwJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNZUlVTX1ZFUklGWV9UT0tFTjogc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcih0aGlzLCBgL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L3doYXRzYXBwL3ZlcmlmeS10b2tlbmApLFxuICAgICAgICBTWVJVU19XQV9UT0tFTjogc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcih0aGlzLCBgL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L3doYXRzYXBwL2FjY2Vzcy10b2tlbmApLFxuICAgICAgICBTWVJVU19QSE9ORV9JRDogc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcih0aGlzLCBgL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L3doYXRzYXBwL3Bob25lLW51bWJlci1pZGApLFxuICAgICAgICBTWVJVU19IT1NUU19UQUJMRTogaG9zdHNUYWJsZU5hbWUgfHwgYHN5cnVzLWhvc3RzLSR7c3RhZ2VDb25maWcuc3RhZ2V9YCxcbiAgICAgICAgU1lSVVNfU1RBR0U6IHN0YWdlQ29uZmlnLnN0YWdlLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBob3N0cyB0YWJsZSBhY2Nlc3NcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTp0YWJsZS9zeXJ1cy1ob3N0cy0ke3N0YWdlQ29uZmlnLnN0YWdlfWBdLFxuICAgIH0pKTtcblxuICAgIC8vIEFkZCBTU00gcGVybWlzc2lvbnMgZm9yIGFwcCBzZWNyZXQgYWNjZXNzIChmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvbilcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzc206R2V0UGFyYW1ldGVyJyxcbiAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6c3NtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnBhcmFtZXRlci9zeXJ1cy8ke3N0YWdlQ29uZmlnLnN0YWdlfS93aGF0c2FwcC8qYCxcbiAgICAgIF0sXG4gICAgfSkpO1xuXG4gICAgLy8gQWRkIFNZUlVTX1NUQUdFIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbi5hZGRFbnZpcm9ubWVudCgnU1lSVVNfU1RBR0UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG5cbiAgICAvLyBBZGQgdGFncyB0byBMYW1iZGEgZnVuY3Rpb25cbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih0aGlzLmxhbWJkYUZ1bmN0aW9uKS5hZGQoJ1NlcnZpY2UnLCAnV2hhdHNBcHBCb3QnKTtcbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG4gICAgVGFncy5vZih0aGlzLmxhbWJkYUZ1bmN0aW9uKS5hZGQoJ0xhc3RVcGRhdGVkJywgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcblxuICAgIC8vIENyZWF0ZSBSRVNUIEFQSSBmaXJzdFxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnU3lydXNBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYHN5cnVzLWFwaS0ke3N0YWdlQ29uZmlnLnN0YWdlfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N5cnVzIEFQSSBmb3IgV2hhdHNBcHAgd2ViaG9va3MnLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdYLUFtei1EYXRlJywgJ0F1dGhvcml6YXRpb24nLCAnWC1BcGktS2V5JywgJ1gtQW16LVNlY3VyaXR5LVRva2VuJywgJ1gtSHViLVNpZ25hdHVyZS0yNTYnXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBBUEkgR2F0ZXdheSBwZXJtaXNzaW9uIHRvIGludm9rZSB0aGUgYXV0aG9yaXplclxuICAgIHRoaXMuYXV0aG9yaXplckZ1bmN0aW9uLmdyYW50SW52b2tlKG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYXBpZ2F0ZXdheS5hbWF6b25hd3MuY29tJykpO1xuXG4gICAgLy8gTm90ZTogV2UncmUgbm90IHVzaW5nIHRoZSBhdXRob3JpemVyIGZvciBQT1NUIHJlcXVlc3RzIHNpbmNlIFJFU1QgQVBJXG4gICAgLy8gcmVxdWVzdCBhdXRob3JpemVycyBkb24ndCByZWxpYWJseSByZWNlaXZlIHRoZSByZXF1ZXN0IGJvZHkuXG4gICAgLy8gU2lnbmF0dXJlIHZhbGlkYXRpb24gaXMgZG9uZSBpbiB0aGUgd2ViaG9vayBMYW1iZGEgZnVuY3Rpb24gaW5zdGVhZC5cblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgaW50ZWdyYXRpb25zXG4gICAgY29uc3QgbGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmxhbWJkYUZ1bmN0aW9uLCB7XG4gICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7ICdhcHBsaWNhdGlvbi9qc29uJzogJ3sgXCJzdGF0dXNDb2RlXCI6IFwiMjAwXCIgfScgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSByZXNvdXJjZSBwYXRoOiAvd2ViaG9va3Mvd2FcbiAgICBjb25zdCB3ZWJob29rc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnd2ViaG9va3MnKTtcbiAgICBjb25zdCB3YVJlc291cmNlID0gd2ViaG9va3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgnd2EnKTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kIGZvciB3ZWJob29rIHZlcmlmaWNhdGlvbiAobm8gYXV0aG9yaXplcilcbiAgICB3YVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgUE9TVCBtZXRob2QgZm9yIHdlYmhvb2sgbWVzc2FnZXMgKG5vIGF1dGhvcml6ZXIgLSBzaWduYXR1cmUgdmFsaWRhdGlvbiBpbiBMYW1iZGEpXG4gICAgLy8gU2lnbmF0dXJlIHZhbGlkYXRpb24gaXMgZG9uZSBpbiB0aGUgd2ViaG9vayBMYW1iZGEgZnVuY3Rpb24gc2luY2UgUkVTVCBBUElcbiAgICAvLyByZXF1ZXN0IGF1dGhvcml6ZXJzIGRvbid0IHJlbGlhYmx5IHJlY2VpdmUgdGhlIHJlcXVlc3QgYm9keVxuICAgIHdhUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICAvLyBDb25maWd1cmUgdGhyb3R0bGluZyB1c2luZyBVc2FnZVBsYW5cbiAgICBjb25zdCB1c2FnZVBsYW4gPSB0aGlzLmFwaS5hZGRVc2FnZVBsYW4oJ1N5cnVzVXNhZ2VQbGFuJywge1xuICAgICAgbmFtZTogYHN5cnVzLXVzYWdlLXBsYW4tJHtzdGFnZUNvbmZpZy5zdGFnZX1gLFxuICAgICAgdGhyb3R0bGU6IHtcbiAgICAgICAgcmF0ZUxpbWl0OiAxMCwgIC8vIDEwIHJlcXVlc3RzIHBlciBzZWNvbmRcbiAgICAgICAgYnVyc3RMaW1pdDogMjAsIC8vIEJ1cnN0IGxpbWl0IG9mIDIwIHJlcXVlc3RzXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIHVzYWdlIHBsYW4gd2l0aCB0aGUgQVBJIHN0YWdlXG4gICAgY29uc3Qgc3RhZ2UgPSB0aGlzLmFwaS5kZXBsb3ltZW50U3RhZ2U7XG4gICAgdXNhZ2VQbGFuLmFkZEFwaVN0YWdlKHtcbiAgICAgIHN0YWdlOiBzdGFnZSxcbiAgICB9KTtcblxuICAgIGlmIChjdXN0b21Eb21haW4pIHtcbiAgICAgIC8vIENyZWF0ZSBjdXN0b20gZG9tYWluIGZvciBSRVNUIEFQSVxuICAgICAgY29uc3QgZG9tYWluTmFtZVJlc291cmNlID0gbmV3IGFwaWdhdGV3YXkuRG9tYWluTmFtZSh0aGlzLCAnU3lydXNDdXN0b21Eb21haW4nLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICAgIGNlcnRpZmljYXRlOiBjZXJ0aWZpY2F0ZSxcbiAgICAgICAgc2VjdXJpdHlQb2xpY3k6IGFwaWdhdGV3YXkuU2VjdXJpdHlQb2xpY3kuVExTXzFfMixcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNYXAgdGhlIGN1c3RvbSBkb21haW4gdG8gdGhlIFJFU1QgQVBJXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5CYXNlUGF0aE1hcHBpbmcodGhpcywgJ1N5cnVzQXBpTWFwcGluZycsIHtcbiAgICAgICAgZG9tYWluTmFtZTogZG9tYWluTmFtZVJlc291cmNlLFxuICAgICAgICByZXN0QXBpOiB0aGlzLmFwaSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgUm91dGUgNTMgcmVjb3JkXG4gICAgICBjb25zdCByZWNvcmROYW1lID0gc3RhZ2VDb25maWcuc3RhZ2UgPT09ICdkZXYnID8gJ2FwaS1kZXYnIDogJ2FwaSc7XG4gICAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdTeXJ1c0FwaVJlY29yZCcsIHtcbiAgICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgcmVjb3JkTmFtZTogcmVjb3JkTmFtZSxcbiAgICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMobmV3IHRhcmdldHMuQXBpR2F0ZXdheURvbWFpbihkb21haW5OYW1lUmVzb3VyY2UpKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTZXQgdGhlIGN1c3RvbSBkb21haW4gVVJMXG4gICAgICB0aGlzLmN1c3RvbURvbWFpblVybCA9IGBodHRwczovLyR7ZG9tYWluTmFtZX0vd2ViaG9va3Mvd2FgO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVc2UgdGhlIGRlZmF1bHQgUkVTVCBBUEkgZW5kcG9pbnRcbiAgICAgIHRoaXMuY3VzdG9tRG9tYWluVXJsID0gYCR7dGhpcy5hcGkudXJsfXdlYmhvb2tzL3dhYDtcbiAgICB9XG5cbiAgICAvLyBBZGQgdGFncyB0byBBUEkgR2F0ZXdheVxuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih0aGlzLmFwaSkuYWRkKCdTZXJ2aWNlJywgJ1doYXRzQXBwQm90Jyk7XG4gICAgVGFncy5vZih0aGlzLmFwaSkuYWRkKCdTdGFnZScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcbiAgfVxufVxuIl19