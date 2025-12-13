import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';
import { StageConfig } from './config';

/**
 * Creates the Campaigns DynamoDB table with GSI for the Syrus WhatsApp bot
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
export function createCampaignsTable(scope: Construct, stageConfig: StageConfig): dynamodb.Table {
  const table = new dynamodb.Table(scope, 'CampaignsTable', {
    tableName: `syrus-campaigns-${stageConfig.stage}`,
    partitionKey: {
      name: 'campaignId',
      type: dynamodb.AttributeType.STRING,
    },
    // Note: No sort key for MVP - status is mutable and campaignId identifies
    // the single current campaign per group/solo. We overwrite records when
    // a new campaign starts.
    billingMode: dynamodb.BillingMode.PROVISIONED,
    readCapacity: stageConfig.tableCapacity.readCapacity,
    writeCapacity: stageConfig.tableCapacity.writeCapacity,
    removalPolicy: stageConfig.removalPolicy,
    pointInTimeRecovery: false, // Disabled for MVP to stay free-tier friendly

    // Enable TTL on the 'ttl' attribute
    timeToLiveAttribute: 'ttl',
  });

  // Add GSI for querying active campaigns by host
  table.addGlobalSecondaryIndex({
    indexName: 'ByHostStatus',
    partitionKey: {
      name: 'hostWaId',
      type: dynamodb.AttributeType.STRING,
    },
    sortKey: {
      name: 'statusCampaign',
      type: dynamodb.AttributeType.STRING,
    },
    readCapacity: stageConfig.gsiCapacity.readCapacity,
    writeCapacity: stageConfig.gsiCapacity.writeCapacity,
    projectionType: dynamodb.ProjectionType.ALL,
  });

  // Add tags
  Tags.of(table).add('App', 'Syrus');
  Tags.of(table).add('Service', 'WhatsAppBot');
  Tags.of(table).add('Stage', stageConfig.stage);

  return table;
}

/**
 * Creates the Hosts DynamoDB table for whitelisting WhatsApp users
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
export function createHostsTable(scope: Construct, stageConfig: StageConfig): dynamodb.Table {
  const table = new dynamodb.Table(scope, 'HostsTable', {
    tableName: `syrus-hosts-${stageConfig.stage}`,
    partitionKey: {
      name: 'waId',
      type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PROVISIONED,
    readCapacity: stageConfig.tableCapacity.readCapacity,
    writeCapacity: stageConfig.tableCapacity.writeCapacity,
    removalPolicy: stageConfig.removalPolicy,
    pointInTimeRecovery: false, // Disabled for MVP to stay free-tier friendly

    // Enable TTL on the 'ttl' attribute
    timeToLiveAttribute: 'ttl',
  });

  // Add tags
  Tags.of(table).add('App', 'Syrus');
  Tags.of(table).add('Service', 'WhatsAppBot');
  Tags.of(table).add('Stage', stageConfig.stage);

  return table;
}
