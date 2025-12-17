import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { StageConfig } from './config';
/**
 * Creates the Campaigns DynamoDB table with GSI for the Syrus Discord bot
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
export declare function createCampaignsTable(scope: Construct, stageConfig: StageConfig): dynamodb.Table;
/**
 * Creates the Hosts DynamoDB table for whitelisting Discord users
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
export declare function createHostsTable(scope: Construct, stageConfig: StageConfig): dynamodb.Table;
