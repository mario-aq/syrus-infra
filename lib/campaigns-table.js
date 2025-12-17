"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaignsTable = createCampaignsTable;
exports.createHostsTable = createHostsTable;
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * Creates the Campaigns DynamoDB table with GSI for the Syrus Discord bot
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
function createCampaignsTable(scope, stageConfig) {
    const table = new dynamodb.Table(scope, 'CampaignsTable', {
        tableName: `syrus-${stageConfig.stage}-campaigns`,
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
            name: 'hostId',
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
    aws_cdk_lib_1.Tags.of(table).add('Service', 'DiscordBot');
    aws_cdk_lib_1.Tags.of(table).add('Stage', stageConfig.stage);
    return table;
}
/**
 * Creates the Hosts DynamoDB table for whitelisting Discord users
 *
 * @param scope The CDK construct scope
 * @param stageConfig Configuration for the deployment stage
 * @returns The DynamoDB table construct
 */
function createHostsTable(scope, stageConfig) {
    const table = new dynamodb.Table(scope, 'HostsTable', {
        tableName: `syrus-${stageConfig.stage}-hosts`,
        partitionKey: {
            name: 'id',
            type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
            name: 'source',
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
    aws_cdk_lib_1.Tags.of(table).add('App', 'Syrus');
    aws_cdk_lib_1.Tags.of(table).add('Service', 'DiscordBot');
    aws_cdk_lib_1.Tags.of(table).add('Stage', stageConfig.stage);
    return table;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FtcGFpZ25zLXRhYmxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2FtcGFpZ25zLXRhYmxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsb0RBMENDO0FBU0QsNENBMkJDO0FBekZELHFEQUFxRDtBQUNyRCw2Q0FBbUM7QUFHbkM7Ozs7OztHQU1HO0FBQ0gsU0FBZ0Isb0JBQW9CLENBQUMsS0FBZ0IsRUFBRSxXQUF3QjtJQUM3RSxNQUFNLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1FBQ3hELFNBQVMsRUFBRSxTQUFTLFdBQVcsQ0FBQyxLQUFLLFlBQVk7UUFDakQsWUFBWSxFQUFFO1lBQ1osSUFBSSxFQUFFLFlBQVk7WUFDbEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUNwQztRQUNELDBFQUEwRTtRQUMxRSx3RUFBd0U7UUFDeEUseUJBQXlCO1FBQ3pCLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLFdBQVc7UUFDN0MsWUFBWSxFQUFFLFdBQVcsQ0FBQyxhQUFhLENBQUMsWUFBWTtRQUNwRCxhQUFhLEVBQUUsV0FBVyxDQUFDLGFBQWEsQ0FBQyxhQUFhO1FBQ3RELGFBQWEsRUFBRSxXQUFXLENBQUMsYUFBYTtRQUN4QyxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsOENBQThDO1FBRTFFLG9DQUFvQztRQUNwQyxtQkFBbUIsRUFBRSxLQUFLO0tBQzNCLENBQUMsQ0FBQztJQUVILGdEQUFnRDtJQUNoRCxLQUFLLENBQUMsdUJBQXVCLENBQUM7UUFDNUIsU0FBUyxFQUFFLGNBQWM7UUFDekIsWUFBWSxFQUFFO1lBQ1osSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsWUFBWSxFQUFFLFdBQVcsQ0FBQyxXQUFXLENBQUMsWUFBWTtRQUNsRCxhQUFhLEVBQUUsV0FBVyxDQUFDLFdBQVcsQ0FBQyxhQUFhO1FBQ3BELGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUc7S0FDNUMsQ0FBQyxDQUFDO0lBRUgsV0FBVztJQUNYLGtCQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbkMsa0JBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUM1QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvQyxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxTQUFnQixnQkFBZ0IsQ0FBQyxLQUFnQixFQUFFLFdBQXdCO0lBQ3pFLE1BQU0sS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFO1FBQ3BELFNBQVMsRUFBRSxTQUFTLFdBQVcsQ0FBQyxLQUFLLFFBQVE7UUFDN0MsWUFBWSxFQUFFO1lBQ1osSUFBSSxFQUFFLElBQUk7WUFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDO1FBQ0QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVztRQUM3QyxZQUFZLEVBQUUsV0FBVyxDQUFDLGFBQWEsQ0FBQyxZQUFZO1FBQ3BELGFBQWEsRUFBRSxXQUFXLENBQUMsYUFBYSxDQUFDLGFBQWE7UUFDdEQsYUFBYSxFQUFFLFdBQVcsQ0FBQyxhQUFhO1FBQ3hDLG1CQUFtQixFQUFFLEtBQUssRUFBRSw4Q0FBOEM7UUFFMUUsb0NBQW9DO1FBQ3BDLG1CQUFtQixFQUFFLEtBQUs7S0FDM0IsQ0FBQyxDQUFDO0lBRUgsV0FBVztJQUNYLGtCQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbkMsa0JBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUM1QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvQyxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgeyBUYWdzIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgU3RhZ2VDb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgQ2FtcGFpZ25zIER5bmFtb0RCIHRhYmxlIHdpdGggR1NJIGZvciB0aGUgU3lydXMgRGlzY29yZCBib3RcbiAqXG4gKiBAcGFyYW0gc2NvcGUgVGhlIENESyBjb25zdHJ1Y3Qgc2NvcGVcbiAqIEBwYXJhbSBzdGFnZUNvbmZpZyBDb25maWd1cmF0aW9uIGZvciB0aGUgZGVwbG95bWVudCBzdGFnZVxuICogQHJldHVybnMgVGhlIER5bmFtb0RCIHRhYmxlIGNvbnN0cnVjdFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2FtcGFpZ25zVGFibGUoc2NvcGU6IENvbnN0cnVjdCwgc3RhZ2VDb25maWc6IFN0YWdlQ29uZmlnKTogZHluYW1vZGIuVGFibGUge1xuICBjb25zdCB0YWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZShzY29wZSwgJ0NhbXBhaWduc1RhYmxlJywge1xuICAgIHRhYmxlTmFtZTogYHN5cnVzLSR7c3RhZ2VDb25maWcuc3RhZ2V9LWNhbXBhaWduc2AsXG4gICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICBuYW1lOiAnY2FtcGFpZ25JZCcsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIC8vIE5vdGU6IE5vIHNvcnQga2V5IGZvciBNVlAgLSBzdGF0dXMgaXMgbXV0YWJsZSBhbmQgY2FtcGFpZ25JZCBpZGVudGlmaWVzXG4gICAgLy8gdGhlIHNpbmdsZSBjdXJyZW50IGNhbXBhaWduIHBlciBncm91cC9zb2xvLiBXZSBvdmVyd3JpdGUgcmVjb3JkcyB3aGVuXG4gICAgLy8gYSBuZXcgY2FtcGFpZ24gc3RhcnRzLlxuICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICByZWFkQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLnRhYmxlQ2FwYWNpdHkucmVhZENhcGFjaXR5LFxuICAgIHdyaXRlQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLnRhYmxlQ2FwYWNpdHkud3JpdGVDYXBhY2l0eSxcbiAgICByZW1vdmFsUG9saWN5OiBzdGFnZUNvbmZpZy5yZW1vdmFsUG9saWN5LFxuICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGZhbHNlLCAvLyBEaXNhYmxlZCBmb3IgTVZQIHRvIHN0YXkgZnJlZS10aWVyIGZyaWVuZGx5XG5cbiAgICAvLyBFbmFibGUgVFRMIG9uIHRoZSAndHRsJyBhdHRyaWJ1dGVcbiAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcbiAgfSk7XG5cbiAgLy8gQWRkIEdTSSBmb3IgcXVlcnlpbmcgYWN0aXZlIGNhbXBhaWducyBieSBob3N0XG4gIHRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICBpbmRleE5hbWU6ICdCeUhvc3RTdGF0dXMnLFxuICAgIHBhcnRpdGlvbktleToge1xuICAgICAgbmFtZTogJ2hvc3RJZCcsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIHNvcnRLZXk6IHtcbiAgICAgIG5hbWU6ICdzdGF0dXNDYW1wYWlnbicsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIHJlYWRDYXBhY2l0eTogc3RhZ2VDb25maWcuZ3NpQ2FwYWNpdHkucmVhZENhcGFjaXR5LFxuICAgIHdyaXRlQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLmdzaUNhcGFjaXR5LndyaXRlQ2FwYWNpdHksXG4gICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgfSk7XG5cbiAgLy8gQWRkIHRhZ3NcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdTZXJ2aWNlJywgJ0Rpc2NvcmRCb3QnKTtcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdTdGFnZScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcblxuICByZXR1cm4gdGFibGU7XG59XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgSG9zdHMgRHluYW1vREIgdGFibGUgZm9yIHdoaXRlbGlzdGluZyBEaXNjb3JkIHVzZXJzXG4gKlxuICogQHBhcmFtIHNjb3BlIFRoZSBDREsgY29uc3RydWN0IHNjb3BlXG4gKiBAcGFyYW0gc3RhZ2VDb25maWcgQ29uZmlndXJhdGlvbiBmb3IgdGhlIGRlcGxveW1lbnQgc3RhZ2VcbiAqIEByZXR1cm5zIFRoZSBEeW5hbW9EQiB0YWJsZSBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhvc3RzVGFibGUoc2NvcGU6IENvbnN0cnVjdCwgc3RhZ2VDb25maWc6IFN0YWdlQ29uZmlnKTogZHluYW1vZGIuVGFibGUge1xuICBjb25zdCB0YWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZShzY29wZSwgJ0hvc3RzVGFibGUnLCB7XG4gICAgdGFibGVOYW1lOiBgc3lydXMtJHtzdGFnZUNvbmZpZy5zdGFnZX0taG9zdHNgLFxuICAgIHBhcnRpdGlvbktleToge1xuICAgICAgbmFtZTogJ2lkJyxcbiAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgIH0sXG4gICAgc29ydEtleToge1xuICAgICAgbmFtZTogJ3NvdXJjZScsXG4gICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICB9LFxuICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICByZWFkQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLnRhYmxlQ2FwYWNpdHkucmVhZENhcGFjaXR5LFxuICAgIHdyaXRlQ2FwYWNpdHk6IHN0YWdlQ29uZmlnLnRhYmxlQ2FwYWNpdHkud3JpdGVDYXBhY2l0eSxcbiAgICByZW1vdmFsUG9saWN5OiBzdGFnZUNvbmZpZy5yZW1vdmFsUG9saWN5LFxuICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGZhbHNlLCAvLyBEaXNhYmxlZCBmb3IgTVZQIHRvIHN0YXkgZnJlZS10aWVyIGZyaWVuZGx5XG5cbiAgICAvLyBFbmFibGUgVFRMIG9uIHRoZSAndHRsJyBhdHRyaWJ1dGVcbiAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcbiAgfSk7XG5cbiAgLy8gQWRkIHRhZ3NcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdBcHAnLCAnU3lydXMnKTtcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdTZXJ2aWNlJywgJ0Rpc2NvcmRCb3QnKTtcbiAgVGFncy5vZih0YWJsZSkuYWRkKCdTdGFnZScsIHN0YWdlQ29uZmlnLnN0YWdlKTtcblxuICByZXR1cm4gdGFibGU7XG59XG4iXX0=