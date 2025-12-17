import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { StageConfig } from './config';
export interface WebhookApiProps {
    stageConfig: StageConfig;
    customDomain?: boolean;
    hostsTableName?: string;
    messagingQueue?: sqs.IQueue;
}
export declare class SyrusApi extends Construct {
    readonly api: apigatewayv2.HttpApi;
    readonly lambdaFunction: lambda.Function;
    readonly customDomainUrl: string;
    constructor(scope: Construct, id: string, props: WebhookApiProps);
}
