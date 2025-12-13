import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { createCampaignsTable, createHostsTable } from './campaigns-table';
import { getStageConfig } from './config';
import { SyrusApi } from './syrus-api';

interface SyrusMvpStackProps extends StackProps {
  stage: string;
}

export class SyrusMvpStack extends Stack {
  constructor(scope: Construct, id: string, props: SyrusMvpStackProps) {
    super(scope, id, props);

    const stageConfig = getStageConfig(props.stage);

    // Create the campaigns table
    const campaignsTable = createCampaignsTable(this, stageConfig);

    // Create the hosts table for whitelisting WhatsApp users
    const hostsTable = createHostsTable(this, stageConfig);

    // Note: WhatsApp SSM parameters are created manually via setup-secrets.sh
    // They should not be managed by CDK to avoid conflicts

    // Create the Syrus API with custom domain
    const syrusApi = new SyrusApi(this, 'SyrusApi', {
      stageConfig,
      customDomain: true,
      hostsTableName: hostsTable.tableName,
    });

    // Add CloudFormation outputs
    new CfnOutput(this, 'CampaignsTableName', {
      value: campaignsTable.tableName,
      description: 'Name of the DynamoDB campaigns table',
      exportName: `SyrusTableName-${props.stage}`,
    });

    new CfnOutput(this, 'HostsTableName', {
      value: hostsTable.tableName,
      description: 'Name of the DynamoDB hosts table',
      exportName: `SyrusHostsTableName-${props.stage}`,
    });

    new CfnOutput(this, 'SyrusApiUrl', {
      value: syrusApi.customDomainUrl,
      description: 'Syrus API URL with custom domain',
      exportName: `SyrusApiUrl-${props.stage}`,
    });

    new CfnOutput(this, 'SyrusLambdaArn', {
      value: syrusApi.lambdaFunction.functionArn,
      description: 'Syrus Lambda function ARN',
      exportName: `SyrusLambdaArn-${props.stage}`,
    });
  }
}
