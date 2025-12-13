import { Construct } from 'constructs';
import { Tags } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { StageConfig } from './config';

export interface WhatsAppConfigProps {
  stageConfig: StageConfig;
}

/**
 * Creates SSM parameters for WhatsApp API configuration
 * These need to be populated with actual WhatsApp credentials
 */
export class WhatsAppConfig extends Construct {
  public readonly verifyTokenParameter: ssm.StringParameter;
  public readonly accessTokenParameter: ssm.StringParameter;
  public readonly phoneNumberIdParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: WhatsAppConfigProps) {
    super(scope, id);

    const { stageConfig } = props;

    // Create SSM parameters for WhatsApp credentials
    // These will need to be populated manually or through CI/CD
    this.verifyTokenParameter = new ssm.StringParameter(this, 'WhatsAppVerifyToken', {
      parameterName: `/syrus/${stageConfig.stage}/whatsapp/verify-token`,
      stringValue: 'PLACEHOLDER_VERIFY_TOKEN_UPDATE_MANUALLY',
      description: 'WhatsApp Business API Webhook Verify Token',
    });

    this.accessTokenParameter = new ssm.StringParameter(this, 'WhatsAppAccessToken', {
      parameterName: `/syrus/${stageConfig.stage}/whatsapp/access-token`,
      stringValue: 'PLACEHOLDER_ACCESS_TOKEN_UPDATE_MANUALLY',
      description: 'WhatsApp Business API Access Token (WA_TOKEN)',
    });

    this.phoneNumberIdParameter = new ssm.StringParameter(this, 'WhatsAppPhoneNumberId', {
      parameterName: `/syrus/${stageConfig.stage}/whatsapp/phone-number-id`,
      stringValue: 'PLACEHOLDER_PHONE_NUMBER_ID_UPDATE_MANUALLY',
      description: 'WhatsApp Business API Phone Number ID',
    });

    // Add tags
    Tags.of(this.verifyTokenParameter).add('App', 'Syrus');
    Tags.of(this.verifyTokenParameter).add('Service', 'WhatsAppBot');
    Tags.of(this.verifyTokenParameter).add('Stage', stageConfig.stage);

    Tags.of(this.accessTokenParameter).add('App', 'Syrus');
    Tags.of(this.accessTokenParameter).add('Service', 'WhatsAppBot');
    Tags.of(this.accessTokenParameter).add('Stage', stageConfig.stage);

    Tags.of(this.phoneNumberIdParameter).add('App', 'Syrus');
    Tags.of(this.phoneNumberIdParameter).add('Service', 'WhatsAppBot');
    Tags.of(this.phoneNumberIdParameter).add('Stage', stageConfig.stage);
  }
}
