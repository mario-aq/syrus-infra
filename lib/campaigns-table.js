"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaignsTable = createCampaignsTable;
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * Creates the Campaigns DynamoDB table with GSI for the Syrus WhatsApp bot
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
function createCampaignsTable(scope, stageConfig) {
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
    aws_cdk_lib_1.Tags.of(table).add('App', 'Syrus');
    aws_cdk_lib_1.Tags.of(table).add('Service', 'WhatsAppBot');
    aws_cdk_lib_1.Tags.of(table).add('Stage', stageConfig.stage);
    return table;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FtcGFpZ25zLXRhYmxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2FtcGFpZ25zLXRhYmxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsb0RBMENDO0FBckRELHFEQUFxRDtBQUNyRCw2Q0FBbUM7QUFHbkM7Ozs7OztHQU1HO0FBQ0gsU0FBZ0Isb0JBQW9CLENBQUMsS0FBZ0IsRUFBRSxXQUF3QjtJQUM3RSxNQUFNLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1FBQ3hELFNBQVMsRUFBRSxtQkFBbUIsV0FBVyxDQUFDLEtBQUssRUFBRTtRQUNqRCxZQUFZLEVBQUU7WUFDWixJQUFJLEVBQUUsWUFBWTtZQUNsQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsMEVBQTBFO1FBQzFFLHdFQUF3RTtRQUN4RSx5QkFBeUI7UUFDekIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVztRQUM3QyxZQUFZLEVBQUUsV0FBVyxDQUFDLGFBQWEsQ0FBQyxZQUFZO1FBQ3BELGFBQWEsRUFBRSxXQUFXLENBQUMsYUFBYSxDQUFDLGFBQWE7UUFDdEQsYUFBYSxFQUFFLFdBQVcsQ0FBQyxhQUFhO1FBQ3hDLG1CQUFtQixFQUFFLEtBQUssRUFBRSw4Q0FBOEM7UUFFMUUsb0NBQW9DO1FBQ3BDLG1CQUFtQixFQUFFLEtBQUs7S0FDM0IsQ0FBQyxDQUFDO0lBRUgsZ0RBQWdEO0lBQ2hELEtBQUssQ0FBQyx1QkFBdUIsQ0FBQztRQUM1QixTQUFTLEVBQUUsY0FBYztRQUN6QixZQUFZLEVBQUU7WUFDWixJQUFJLEVBQUUsVUFBVTtZQUNoQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsWUFBWSxFQUFFLFdBQVcsQ0FBQyxXQUFXLENBQUMsWUFBWTtRQUNsRCxhQUFhLEVBQUUsV0FBVyxDQUFDLFdBQVcsQ0FBQyxhQUFhO1FBQ3BELGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUc7S0FDNUMsQ0FBQyxDQUFDO0lBRUgsV0FBVztJQUNYLGtCQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbkMsa0JBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM3QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvQyxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgeyBUYWdzIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgU3RhZ2VDb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgQ2FtcGFpZ25zIER5bmFtb0RCIHRhYmxlIHdpdGggR1NJIGZvciB0aGUgU3lydXMgV2hhdHNBcHAgYm90XG4gKlxuICogQHBhcmFtIHNjb3BlIFRoZSBDREsgY29uc3RydWN0IHNjb3BlXG4gKiBAcGFyYW0gc3RhZ2VDb25maWcgQ29uZmlndXJhdGlvbiBmb3IgdGhlIGRlcGxveW1lbnQgc3RhZ2VcbiAqIEByZXR1cm5zIFRoZSBEeW5hbW9EQiB0YWJsZSBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNhbXBhaWduc1RhYmxlKHNjb3BlOiBDb25zdHJ1Y3QsIHN0YWdlQ29uZmlnOiBTdGFnZUNvbmZpZyk6IGR5bmFtb2RiLlRhYmxlIHtcbiAgY29uc3QgdGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUoc2NvcGUsICdDYW1wYWlnbnNUYWJsZScsIHtcbiAgICB0YWJsZU5hbWU6IGBzeXJ1cy1jYW1wYWlnbnMtJHtzdGFnZUNvbmZpZy5zdGFnZX1gLFxuICAgIHBhcnRpdGlvbktleToge1xuICAgICAgbmFtZTogJ2NhbXBhaWduSWQnLFxuICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgfSxcbiAgICAvLyBOb3RlOiBObyBzb3J0IGtleSBmb3IgTVZQIC0gc3RhdHVzIGlzIG11dGFibGUgYW5kIGNhbXBhaWduSWQgaWRlbnRpZmllc1xuICAgIC8vIHRoZSBzaW5nbGUgY3VycmVudCBjYW1wYWlnbiBwZXIgZ3JvdXAvc29sby4gV2Ugb3ZlcndyaXRlIHJlY29yZHMgd2hlblxuICAgIC8vIGEgbmV3IGNhbXBhaWduIHN0YXJ0cy5cbiAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgcmVhZENhcGFjaXR5OiBzdGFnZUNvbmZpZy50YWJsZUNhcGFjaXR5LnJlYWRDYXBhY2l0eSxcbiAgICB3cml0ZUNhcGFjaXR5OiBzdGFnZUNvbmZpZy50YWJsZUNhcGFjaXR5LndyaXRlQ2FwYWNpdHksXG4gICAgcmVtb3ZhbFBvbGljeTogc3RhZ2VDb25maWcucmVtb3ZhbFBvbGljeSxcbiAgICBwb2ludEluVGltZVJlY292ZXJ5OiBmYWxzZSwgLy8gRGlzYWJsZWQgZm9yIE1WUCB0byBzdGF5IGZyZWUtdGllciBmcmllbmRseVxuXG4gICAgLy8gRW5hYmxlIFRUTCBvbiB0aGUgJ3R0bCcgYXR0cmlidXRlXG4gICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gIH0pO1xuXG4gIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGFjdGl2ZSBjYW1wYWlnbnMgYnkgaG9zdFxuICB0YWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgaW5kZXhOYW1lOiAnQnlIb3N0U3RhdHVzJyxcbiAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgIG5hbWU6ICdob3N0V2FJZCcsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIHNvcnRLZXk6IHtcbiAgICAgIG5hbWU6ICdzdGF0dXNDYW1wYWlnbicsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIHJlYWRDYXBhY2l0eTogc3RhZ2VDb25maWcuZ3NpQ2FwYWNpdHkucmVhZENhcGFjaXR5LFxuICAgIHdyaXRlQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLmdzaUNhcGFjaXR5LndyaXRlQ2FwYWNpdHksXG4gICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgfSk7XG5cbiAgLy8gQWRkIHRhZ3NcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdTZXJ2aWNlJywgJ1doYXRzQXBwQm90Jyk7XG4gIFRhZ3Mub2YodGFibGUpLmFkZCgnU3RhZ2UnLCBzdGFnZUNvbmZpZy5zdGFnZSk7XG5cbiAgcmV0dXJuIHRhYmxlO1xufVxuIl19