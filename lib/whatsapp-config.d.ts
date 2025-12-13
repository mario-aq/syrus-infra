import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { StageConfig } from './config';
export interface WhatsAppConfigProps {
    stageConfig: StageConfig;
}
/**
 * Creates SSM parameters for WhatsApp API configuration
 * These need to be populated with actual WhatsApp credentials
 */
export declare class WhatsAppConfig extends Construct {
    readonly verifyTokenParameter: ssm.StringParameter;
    readonly accessTokenParameter: ssm.StringParameter;
    readonly phoneNumberIdParameter: ssm.StringParameter;
    constructor(scope: Construct, id: string, props: WhatsAppConfigProps);
}
