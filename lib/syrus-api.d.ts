import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { StageConfig } from './config';
export interface WebhookApiProps {
    stageConfig: StageConfig;
    customDomain?: boolean;
    hostsTableName?: string;
}
export declare class SyrusApi extends Construct {
    readonly api: apigateway.RestApi;
    readonly lambdaFunction: lambda.Function;
    readonly customDomainUrl: string;
    constructor(scope: Construct, id: string, props: WebhookApiProps);
}
