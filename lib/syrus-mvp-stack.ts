import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { createCampaignsTable } from './campaigns-table';
import { getStageConfig } from './config';

interface SyrusMvpStackProps extends StackProps {
  stage: string;
}

export class SyrusMvpStack extends Stack {
  constructor(scope: Construct, id: string, props: SyrusMvpStackProps) {
    super(scope, id, props);

    const stageConfig = getStageConfig(props.stage);

    // Create the campaigns table
    const campaignsTable = createCampaignsTable(this, stageConfig);

    // Add CloudFormation outputs
    new CfnOutput(this, 'CampaignsTableName', {
      value: campaignsTable.tableName,
      description: 'Name of the DynamoDB campaigns table',
      exportName: `SyrusTableName-${props.stage}`,
    });
  }
}
