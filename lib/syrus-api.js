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
const iam = require("aws-cdk-lib/aws-iam");
const aws_cdk_lib_3 = require("aws-cdk-lib");
class SyrusApi extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { stageConfig, customDomain = false, hostsTableName } = props;
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
            },
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 256,
        });
        // Add DynamoDB permissions for hosts table access
        const actualHostsTableName = hostsTableName || `syrus-${stageConfig.stage}-hosts`;
        this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'dynamodb:GetItem',
                'dynamodb:Query',
            ],
            resources: [`arn:aws:dynamodb:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:table/${actualHostsTableName}`],
        }));
        // Add SSM permissions for Discord public key and app ID access
        this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
            ],
            resources: [
                `arn:aws:ssm:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/public-key`,
                `arn:aws:ssm:${aws_cdk_lib_3.Stack.of(this).region}:${aws_cdk_lib_3.Stack.of(this).account}:parameter/syrus/${stageConfig.stage}/discord/app-id`,
            ],
        }));
        // Add SYRUS_STAGE environment variable
        this.lambdaFunction.addEnvironment('SYRUS_STAGE', stageConfig.stage);
        // Add tags to Lambda function
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Service', 'DiscordBot');
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('Stage', stageConfig.stage);
        aws_cdk_lib_2.Tags.of(this.lambdaFunction).add('LastUpdated', new Date().toISOString());
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
        const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration('LambdaIntegration', this.lambdaFunction);
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
                target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(domainNameResource.regionalDomainName, domainNameResource.regionalHostedZoneId)),
            });
            // Set the custom domain URL with /discord path
            this.customDomainUrl = `https://${domainName}/discord`;
        }
        else {
            // Use the default HTTP API endpoint (root path)
            this.customDomainUrl = `${this.api.url}`;
        }
        // Add tags to API Gateway
        aws_cdk_lib_2.Tags.of(this.api).add('App', 'Syrus');
        aws_cdk_lib_2.Tags.of(this.api).add('Service', 'DiscordBot');
        aws_cdk_lib_2.Tags.of(this.api).add('Stage', stageConfig.stage);
    }
}
exports.SyrusApi = SyrusApi;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2Qyw2QkFBNkI7QUFDN0IsNkNBQXVDO0FBQ3ZDLDZDQUFtQztBQUNuQyxpREFBaUQ7QUFDakQsNkRBQTZEO0FBQzdELHNGQUFzRjtBQUN0RixtREFBbUQ7QUFDbkQsMkRBQTJEO0FBQzNELDBEQUEwRDtBQUUxRCwyQ0FBMkM7QUFDM0MsNkNBQW9DO0FBU3BDLE1BQWEsUUFBUyxTQUFRLHNCQUFTO0lBS3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQUUsV0FBVyxFQUFFLFlBQVksR0FBRyxLQUFLLEVBQUUsY0FBYyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXBFLHNCQUFzQjtRQUN0QixNQUFNLFVBQVUsR0FBRyxxQkFBcUIsQ0FBQztRQUV6QyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDakYsWUFBWSxFQUFFLHVCQUF1QjtZQUNyQyxRQUFRLEVBQUUsWUFBWTtTQUN2QixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ2xFLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLFVBQVUsRUFBRSxHQUFHLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztTQUMxRCxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUMvRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxlQUFl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QUFTLENBQUMsSUFBSSxPQUFPLENBQUMsNEJBQTRCLENBQzdFLGtCQUFrQixDQUFDLGtCQUFrQixFQUNyQyxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FDeEMsQ0FBQzthQUNILENBQUMsQ0FBQztZQUVILCtDQUErQztZQUMvQyxJQUFJLENBQUMsZUFBZSxHQUFHLFdBQVcsVUFBVSxVQUFVLENBQUM7UUFDekQsQ0FBQzthQUFNLENBQUM7WUFDTixnREFBZ0Q7WUFDaEQsSUFBSSxDQUFDLGVBQWUsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0MsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMvQyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQztDQUNGO0FBbElELDRCQWtJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGFncyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXl2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXl2MkludGVncmF0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBTdGFjayB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFN0YWdlQ29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdlYmhvb2tBcGlQcm9wcyB7XG4gIHN0YWdlQ29uZmlnOiBTdGFnZUNvbmZpZztcbiAgY3VzdG9tRG9tYWluPzogYm9vbGVhbjtcbiAgaG9zdHNUYWJsZU5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTeXJ1c0FwaSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXl2Mi5IdHRwQXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbURvbWFpblVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXZWJob29rQXBpUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBzdGFnZUNvbmZpZywgY3VzdG9tRG9tYWluID0gZmFsc2UsIGhvc3RzVGFibGVOYW1lIH0gPSBwcm9wcztcblxuICAgIC8vIEN1c3RvbSBkb21haW4gc2V0dXBcbiAgICBjb25zdCBkb21haW5OYW1lID0gJ3dlYmhvb2tzLnN5cnVzLmNoYXQnO1xuXG4gICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBob3N0ZWRab25lSWQ6ICdaMDg4NjczMTNHS0ZOTEVTRjRTWUwnLFxuICAgICAgem9uZU5hbWU6ICdzeXJ1cy5jaGF0JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNlcnRpZmljYXRlID0gbmV3IGFjbS5DZXJ0aWZpY2F0ZSh0aGlzLCAnV2ViaG9va0NlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyhob3N0ZWRab25lKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgd2ViaG9vayBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3lydXNGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMjAyMyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3dlYmhvb2snKSksXG4gICAgICBoYW5kbGVyOiAnYm9vdHN0cmFwJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNZUlVTX0RJU0NPUkRfUFVCTElDX0tFWV9QQVJBTTogYC9zeXJ1cy8ke3N0YWdlQ29uZmlnLnN0YWdlfS9kaXNjb3JkL3B1YmxpYy1rZXlgLFxuICAgICAgICBTWVJVU19ESVNDT1JEX0FQUF9JRF9QQVJBTTogYC9zeXJ1cy8ke3N0YWdlQ29uZmlnLnN0YWdlfS9kaXNjb3JkL2FwcC1pZGAsXG4gICAgICAgIFNZUlVTX0hPU1RTX1RBQkxFOiBob3N0c1RhYmxlTmFtZSB8fCBgc3lydXMtJHtzdGFnZUNvbmZpZy5zdGFnZX0taG9zdHNgLFxuICAgICAgICBTWVJVU19TVEFHRTogc3RhZ2VDb25maWcuc3RhZ2UsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGhvc3RzIHRhYmxlIGFjY2Vzc1xuICAgIGNvbnN0IGFjdHVhbEhvc3RzVGFibGVOYW1lID0gaG9zdHNUYWJsZU5hbWUgfHwgYHN5cnVzLSR7c3RhZ2VDb25maWcuc3RhZ2V9LWhvc3RzYDtcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTp0YWJsZS8ke2FjdHVhbEhvc3RzVGFibGVOYW1lfWBdLFxuICAgIH0pKTtcblxuICAgIC8vIEFkZCBTU00gcGVybWlzc2lvbnMgZm9yIERpc2NvcmQgcHVibGljIGtleSBhbmQgYXBwIElEIGFjY2Vzc1xuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnMnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzc206JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06cGFyYW1ldGVyL3N5cnVzLyR7c3RhZ2VDb25maWcuc3RhZ2V9L2Rpc2NvcmQvcHVibGljLWtleWAsXG4gICAgICAgIGBhcm46YXdzOnNzbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpwYXJhbWV0ZXIvc3lydXMvJHtzdGFnZUNvbmZpZy5zdGFnZX0vZGlzY29yZC9hcHAtaWRgLFxuICAgICAgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgU1lSVVNfU1RBR0UgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLmFkZEVudmlyb25tZW50KCdTWVJVU19TVEFHRScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcblxuICAgIC8vIEFkZCB0YWdzIHRvIExhbWJkYSBmdW5jdGlvblxuICAgIFRhZ3Mub2YodGhpcy5sYW1iZGFGdW5jdGlvbikuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgICBUYWdzLm9mKHRoaXMubGFtYmRhRnVuY3Rpb24pLmFkZCgnU2VydmljZScsICdEaXNjb3JkQm90Jyk7XG4gICAgVGFncy5vZih0aGlzLmxhbWJkYUZ1bmN0aW9uKS5hZGQoJ1N0YWdlJywgc3RhZ2VDb25maWcuc3RhZ2UpO1xuICAgIFRhZ3Mub2YodGhpcy5sYW1iZGFGdW5jdGlvbikuYWRkKCdMYXN0VXBkYXRlZCcsIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSk7XG5cbiAgICAvLyBDcmVhdGUgSFRUUCBBUEkgKHYyKSAtIHJlcXVpcmVkIGZvciBEaXNjb3JkIEVkMjU1MTkgc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICAgIC8vIEhUVFAgQVBJIHBhc3NlcyByYXcgcmVxdWVzdCBib2R5IGJ5dGUtZm9yLWJ5dGUgd2l0aG91dCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5djIuSHR0cEFwaSh0aGlzLCAnU3lydXNBcGknLCB7XG4gICAgICBhcGlOYW1lOiBgc3lydXMtYXBpLSR7c3RhZ2VDb25maWcuc3RhZ2V9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3lydXMgQVBJIGZvciBEaXNjb3JkIGludGVyYWN0aW9ucycsXG4gICAgICBjb3JzUHJlZmxpZ2h0OiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICAgIGFsbG93TWV0aG9kczogW2FwaWdhdGV3YXl2Mi5Db3JzSHR0cE1ldGhvZC5QT1NUXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdYLVNpZ25hdHVyZS1FZDI1NTE5JywgJ1gtU2lnbmF0dXJlLVRpbWVzdGFtcCddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgaW50ZWdyYXRpb24gd2l0aCBIVFRQIEFQSVxuICAgIC8vIE5vIHJlcXVlc3QvcmVzcG9uc2UgdHJhbnNmb3JtYXRpb25zIC0gcmF3IGJvZHkgcGFzc2VzIHRocm91Z2hcbiAgICBjb25zdCBsYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5djJJbnRlZ3JhdGlvbnMuSHR0cExhbWJkYUludGVncmF0aW9uKFxuICAgICAgJ0xhbWJkYUludGVncmF0aW9uJyxcbiAgICAgIHRoaXMubGFtYmRhRnVuY3Rpb25cbiAgICApO1xuXG4gICAgLy8gQWRkIFBPU1Qgcm91dGUgYXQgL2Rpc2NvcmQgcGF0aCBmb3IgRGlzY29yZCBpbnRlcmFjdGlvbnNcbiAgICB0aGlzLmFwaS5hZGRSb3V0ZXMoe1xuICAgICAgcGF0aDogJy9kaXNjb3JkJyxcbiAgICAgIG1ldGhvZHM6IFthcGlnYXRld2F5djIuSHR0cE1ldGhvZC5QT1NUXSxcbiAgICAgIGludGVncmF0aW9uOiBsYW1iZGFJbnRlZ3JhdGlvbixcbiAgICB9KTtcblxuICAgIGlmIChjdXN0b21Eb21haW4pIHtcbiAgICAgIC8vIENyZWF0ZSBjdXN0b20gZG9tYWluIGZvciBIVFRQIEFQSVxuICAgICAgY29uc3QgZG9tYWluTmFtZVJlc291cmNlID0gbmV3IGFwaWdhdGV3YXl2Mi5Eb21haW5OYW1lKHRoaXMsICdTeXJ1c0N1c3RvbURvbWFpbicsIHtcbiAgICAgICAgZG9tYWluTmFtZTogZG9tYWluTmFtZSxcbiAgICAgICAgY2VydGlmaWNhdGU6IGNlcnRpZmljYXRlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1hcCB0aGUgY3VzdG9tIGRvbWFpbiB0byB0aGUgSFRUUCBBUElcbiAgICAgIG5ldyBhcGlnYXRld2F5djIuQXBpTWFwcGluZyh0aGlzLCAnU3lydXNBcGlNYXBwaW5nJywge1xuICAgICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lUmVzb3VyY2UsXG4gICAgICAgIGFwaTogdGhpcy5hcGksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIFJvdXRlIDUzIHJlY29yZFxuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU3lydXNBcGlSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6ICd3ZWJob29rcycsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKG5ldyB0YXJnZXRzLkFwaUdhdGV3YXl2MkRvbWFpblByb3BlcnRpZXMoXG4gICAgICAgICAgZG9tYWluTmFtZVJlc291cmNlLnJlZ2lvbmFsRG9tYWluTmFtZSxcbiAgICAgICAgICBkb21haW5OYW1lUmVzb3VyY2UucmVnaW9uYWxIb3N0ZWRab25lSWRcbiAgICAgICAgKSksXG4gICAgICB9KTtcblxuICAgICAgLy8gU2V0IHRoZSBjdXN0b20gZG9tYWluIFVSTCB3aXRoIC9kaXNjb3JkIHBhdGhcbiAgICAgIHRoaXMuY3VzdG9tRG9tYWluVXJsID0gYGh0dHBzOi8vJHtkb21haW5OYW1lfS9kaXNjb3JkYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIHRoZSBkZWZhdWx0IEhUVFAgQVBJIGVuZHBvaW50IChyb290IHBhdGgpXG4gICAgICB0aGlzLmN1c3RvbURvbWFpblVybCA9IGAke3RoaXMuYXBpLnVybH1gO1xuICAgIH1cblxuICAgIC8vIEFkZCB0YWdzIHRvIEFQSSBHYXRld2F5XG4gICAgVGFncy5vZih0aGlzLmFwaSkuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgICBUYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ1NlcnZpY2UnLCAnRGlzY29yZEJvdCcpO1xuICAgIFRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG4gIH1cbn1cbiJdfQ==