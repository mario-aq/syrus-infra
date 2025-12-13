"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyrusApi = void 0;
const constructs_1 = require("constructs");
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cdk_lib_2 = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigatewayv2 = require("aws-cdk-lib/aws-apigatewayv2");
const apigatewayv2Integrations = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const route53 = require("aws-cdk-lib/aws-route53");
const targets = require("aws-cdk-lib/aws-route53-targets");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const ssm = require("aws-cdk-lib/aws-ssm");
const iam = require("aws-cdk-lib/aws-iam");
const aws_cdk_lib_3 = require("aws-cdk-lib");
class SyrusApi extends constructs_1.Construct {
    constructor(scope, id, props) {
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
        // Add tags to Lambda function
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Service', 'WhatsAppBot');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());
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
        }
        else {
            // Use the default HTTP API endpoint
            this.customDomainUrl = `${this.api.apiEndpoint}/webhooks/wa`;
        }
        // Add tags to API Gateway
        aws_cdk_lib_2.Tags.of(this.api).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.api).add('Service', 'WhatsAppBot');
        aws_cdk_lib_2.Tags.of(this.api).add('Stage', stageConfig.stage);
    }
}
exports.SyrusApi = SyrusApi;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2Qyw2QkFBNkI7QUFDN0IsNkNBQXVDO0FBQ3ZDLDZDQUFtQztBQUNuQyxpREFBaUQ7QUFFakQsNkRBQTZEO0FBQzdELHNGQUFzRjtBQUN0RixtREFBbUQ7QUFDbkQsMkRBQTJEO0FBQzNELDBEQUEwRDtBQUMxRCwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDZDQUFvQztBQVNwQyxNQUFhLFFBQVMsU0FBUSxzQkFBUztJQUtyQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFdBQVcsRUFBRSxZQUFZLEdBQUcsS0FBSyxFQUFFLGNBQWMsRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLG9DQUFvQztRQUV6RyxzQkFBc0I7UUFDdEIsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztRQUV6RixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDakYsWUFBWSxFQUFFLHVCQUF1QjtZQUNyQyxRQUFRLEVBQUUsWUFBWTtTQUN2QixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ2xFLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztTQUMxRCxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLGNBQWMsR0FB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QWMsQ0FBQztRQUMvRCxDQUFDO1FBRUQsMEJBQTBCO1FBQzFCLGtCQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3RDLGtCQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQ2hELGtCQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNwRCxDQUFDO0NBQ0Y7QUF4R0QsNEJBd0dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUYWdzIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djJJbnRlZ3JhdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTdGFnZUNvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBXZWJob29rQXBpUHJvcHMge1xuICBzdGFnZUNvbmZpZzogU3RhZ2VDb25maWc7XG4gIGN1c3RvbURvbWFpbj86IGJvb2xlYW47XG4gIGhvc3RzVGFibGVOYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU3lydXNBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5djIuSHR0cEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21Eb21haW5Vcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2ViaG9va0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHsgc3RhZ2VDb25maWcsIGN1c3RvbURvbWFpbiA9IGZhbHNlLCBob3N0c1RhYmxlTmFtZSB9ID0gcHJvcHM7IC8vIFRlbXBvcmFyaWx5IGRpc2FibGUgY3VzdG9tIGRvbWFpblxuXG4gICAgLy8gQ3VzdG9tIGRvbWFpbiBzZXR1cFxuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBzdGFnZUNvbmZpZy5zdGFnZSA9PT0gJ2RldicgPyAnYXBpLWRldi5zeXJ1cy5jaGF0JyA6ICdhcGkuc3lydXMuY2hhdCc7XG5cbiAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGhvc3RlZFpvbmVJZDogJ1owODg2NzMxM0dLRk5MRVNGNFNZTCcsXG4gICAgICB6b25lTmFtZTogJ3N5cnVzLmNoYXQnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2VydGlmaWNhdGUgPSBuZXcgYWNtLkNlcnRpZmljYXRlKHRoaXMsICdXZWJob29rQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKGhvc3RlZFpvbmUpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3lydXNGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMjAyMyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3dlYmhvb2snKSksXG4gICAgICBoYW5kbGVyOiAnYm9vdHN0cmFwJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNZUlVTX1ZFUklGWV9UT0tFTjogc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcih0aGlzLCAnL3N5cnVzL2Rldi93aGF0c2FwcC92ZXJpZnktdG9rZW4nKSxcbiAgICAgICAgU1lSVVNfV0FfVE9LRU46IHNzbS5TdHJpbmdQYXJhbWV0ZXIudmFsdWVGb3JTdHJpbmdQYXJhbWV0ZXIodGhpcywgJy9zeXJ1cy9kZXYvd2hhdHNhcHAvYWNjZXNzLXRva2VuJyksXG4gICAgICAgIFNZUlVTX1BIT05FX0lEOiBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKHRoaXMsICcvc3lydXMvZGV2L3doYXRzYXBwL3Bob25lLW51bWJlci1pZCcpLFxuICAgICAgICBTWVJVU19IT1NUU19UQUJMRTogaG9zdHNUYWJsZU5hbWUgfHwgYHN5cnVzLWhvc3RzLSR7c3RhZ2VDb25maWcuc3RhZ2V9YCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICB9KTtcblxuICAgIC8vIEFkZCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgaG9zdHMgdGFibGUgYWNjZXNzXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06dGFibGUvc3lydXMtaG9zdHMtJHtzdGFnZUNvbmZpZy5zdGFnZX1gXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgdGFncyB0byBMYW1iZGEgZnVuY3Rpb25cbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih0aGlzLmxhbWJkYUZ1bmN0aW9uKS5hZGQoJ1NlcnZpY2UnLCAnV2hhdHNBcHBCb3QnKTtcbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG4gICAgVGFncy5vZih0aGlzLmxhbWJkYUZ1bmN0aW9uKS5hZGQoJ0xhc3RVcGRhdGVkJywgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcblxuICAgIC8vIENyZWF0ZSBIVFRQIEFQSSAodjIpIC0gbXVjaCBzaW1wbGVyIGFuZCBiZXR0ZXIgZm9yIHdlYmhvb2tzXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheXYyLkh0dHBBcGkodGhpcywgJ1N5cnVzQXBpJywge1xuICAgICAgYXBpTmFtZTogYHN5cnVzLWFwaS0ke3N0YWdlQ29uZmlnLnN0YWdlfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N5cnVzIEFQSSBmb3IgV2hhdHNBcHAgd2ViaG9va3MnLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFthcGlnYXRld2F5djIuQ29yc0h0dHBNZXRob2QuR0VULCBhcGlnYXRld2F5djIuQ29yc0h0dHBNZXRob2QuUE9TVCwgYXBpZ2F0ZXdheXYyLkNvcnNIdHRwTWV0aG9kLk9QVElPTlNdLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknLCAnWC1BbXotU2VjdXJpdHktVG9rZW4nXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcm91dGVzIGZvciB3ZWJob29rIGVuZHBvaW50cyAtIEhUVFAgQVBJcyBoYW5kbGUgQ09SUyBhdXRvbWF0aWNhbGx5XG4gICAgdGhpcy5hcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6ICcvd2ViaG9va3Mvd2EnLFxuICAgICAgbWV0aG9kczogW2FwaWdhdGV3YXl2Mi5IdHRwTWV0aG9kLkdFVCwgYXBpZ2F0ZXdheXYyLkh0dHBNZXRob2QuUE9TVF0sXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IGFwaWdhdGV3YXl2MkludGVncmF0aW9ucy5IdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1N5cnVzSW50ZWdyYXRpb24nLCB0aGlzLmxhbWJkYUZ1bmN0aW9uKSxcbiAgICB9KTtcblxuICAgIGlmIChjdXN0b21Eb21haW4pIHtcbiAgICAgIC8vIENyZWF0ZSBjdXN0b20gZG9tYWluIGZvciBIVFRQIEFQSVxuICAgICAgY29uc3QgZG9tYWluTmFtZVJlc291cmNlID0gbmV3IGFwaWdhdGV3YXl2Mi5Eb21haW5OYW1lKHRoaXMsICdTeXJ1c0N1c3RvbURvbWFpbicsIHtcbiAgICAgICAgZG9tYWluTmFtZTogZG9tYWluTmFtZSxcbiAgICAgICAgY2VydGlmaWNhdGU6IGNlcnRpZmljYXRlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1hcCB0aGUgY3VzdG9tIGRvbWFpbiB0byB0aGUgSFRUUCBBUElcbiAgICAgIG5ldyBhcGlnYXRld2F5djIuQXBpTWFwcGluZyh0aGlzLCAnU3lydXNBcGlNYXBwaW5nJywge1xuICAgICAgICBhcGk6IHRoaXMuYXBpLFxuICAgICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lUmVzb3VyY2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIFJvdXRlIDUzIHJlY29yZFxuICAgICAgY29uc3QgcmVjb3JkTmFtZSA9IHN0YWdlQ29uZmlnLnN0YWdlID09PSAnZGV2JyA/ICdhcGktZGV2JyA6ICdhcGknO1xuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU3lydXNBcGlSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6IHJlY29yZE5hbWUsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLkFwaUdhdGV3YXl2MkRvbWFpblByb3BlcnRpZXMoZG9tYWluTmFtZVJlc291cmNlLnJlZ2lvbmFsRG9tYWluTmFtZSwgZG9tYWluTmFtZVJlc291cmNlLnJlZ2lvbmFsSG9zdGVkWm9uZUlkKSksXG4gICAgICB9KTtcblxuICAgICAgLy8gU2V0IHRoZSBjdXN0b20gZG9tYWluIFVSTFxuICAgICAgdGhpcy5jdXN0b21Eb21haW5VcmwgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9L3dlYmhvb2tzL3dhYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIHRoZSBkZWZhdWx0IEhUVFAgQVBJIGVuZHBvaW50XG4gICAgICB0aGlzLmN1c3RvbURvbWFpblVybCA9IGAke3RoaXMuYXBpLmFwaUVuZHBvaW50fS93ZWJob29rcy93YWA7XG4gICAgfVxuXG4gICAgLy8gQWRkIHRhZ3MgdG8gQVBJIEdhdGV3YXlcbiAgICBUYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ0FwcCcsICdTeXJ1cycpO1xuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnU2VydmljZScsICdXaGF0c0FwcEJvdCcpO1xuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG4gIH1cbn1cbiJdfQ==