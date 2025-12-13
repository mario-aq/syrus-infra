"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyrusMvpStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const campaigns_table_1 = require("./campaigns-table");
const config_1 = require("./config");
const syrus_api_1 = require("./syrus-api");
class SyrusMvpStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const stageConfig = (0, config_1.getStageConfig)(props.stage);
        // Create the campaigns table
        const campaignsTable = (0, campaigns_table_1.createCampaignsTable)(this, stageConfig);
        // Create the hosts table for whitelisting WhatsApp users
        const hostsTable = (0, campaigns_table_1.createHostsTable)(this, stageConfig);
        // Note: WhatsApp SSM parameters are created manually via setup-secrets.sh
        // They should not be managed by CDK to avoid conflicts
        // Create the Syrus API with custom domain
        const syrusApi = new syrus_api_1.SyrusApi(this, 'SyrusApi', {
            stageConfig,
            customDomain: true,
            hostsTableName: hostsTable.tableName,
        });
        // Add CloudFormation outputs
        new aws_cdk_lib_1.CfnOutput(this, 'CampaignsTableName', {
            value: campaignsTable.tableName,
            description: 'Name of the DynamoDB campaigns table',
            exportName: `SyrusTableName-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'HostsTableName', {
            value: hostsTable.tableName,
            description: 'Name of the DynamoDB hosts table',
            exportName: `SyrusHostsTableName-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'SyrusApiUrl', {
            value: syrusApi.customDomainUrl,
            description: 'Syrus API URL with custom domain',
            exportName: `SyrusApiUrl-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'SyrusLambdaArn', {
            value: syrusApi.lambdaFunction.functionArn,
            description: 'Syrus Lambda function ARN',
            exportName: `SyrusLambdaArn-${props.stage}`,
        });
    }
}
exports.SyrusMvpStack = SyrusMvpStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtbXZwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtbXZwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDZDQUEyRDtBQUMzRCx1REFBMkU7QUFDM0UscUNBQTBDO0FBQzFDLDJDQUF1QztBQU12QyxNQUFhLGFBQWMsU0FBUSxtQkFBSztJQUN0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sV0FBVyxHQUFHLElBQUEsdUJBQWMsRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFaEQsNkJBQTZCO1FBQzdCLE1BQU0sY0FBYyxHQUFHLElBQUEsc0NBQW9CLEVBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRS9ELHlEQUF5RDtRQUN6RCxNQUFNLFVBQVUsR0FBRyxJQUFBLGtDQUFnQixFQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUV2RCwwRUFBMEU7UUFDMUUsdURBQXVEO1FBRXZELDBDQUEwQztRQUMxQyxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUM5QyxXQUFXO1lBQ1gsWUFBWSxFQUFFLElBQUk7WUFDbEIsY0FBYyxFQUFFLFVBQVUsQ0FBQyxTQUFTO1NBQ3JDLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxjQUFjLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsc0NBQXNDO1lBQ25ELFVBQVUsRUFBRSxrQkFBa0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUM1QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3BDLEtBQUssRUFBRSxVQUFVLENBQUMsU0FBUztZQUMzQixXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLFVBQVUsRUFBRSx1QkFBdUIsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNqQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGVBQWU7WUFDL0IsV0FBVyxFQUFFLGtDQUFrQztZQUMvQyxVQUFVLEVBQUUsZUFBZSxLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxjQUFjLENBQUMsV0FBVztZQUMxQyxXQUFXLEVBQUUsMkJBQTJCO1lBQ3hDLFVBQVUsRUFBRSxrQkFBa0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvQ0Qsc0NBK0NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgQ2ZuT3V0cHV0IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgY3JlYXRlQ2FtcGFpZ25zVGFibGUsIGNyZWF0ZUhvc3RzVGFibGUgfSBmcm9tICcuL2NhbXBhaWducy10YWJsZSc7XG5pbXBvcnQgeyBnZXRTdGFnZUNvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7IFN5cnVzQXBpIH0gZnJvbSAnLi9zeXJ1cy1hcGknO1xuXG5pbnRlcmZhY2UgU3lydXNNdnBTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHN0YWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTeXJ1c012cFN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3lydXNNdnBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBzdGFnZUNvbmZpZyA9IGdldFN0YWdlQ29uZmlnKHByb3BzLnN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY2FtcGFpZ25zIHRhYmxlXG4gICAgY29uc3QgY2FtcGFpZ25zVGFibGUgPSBjcmVhdGVDYW1wYWlnbnNUYWJsZSh0aGlzLCBzdGFnZUNvbmZpZyk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGhvc3RzIHRhYmxlIGZvciB3aGl0ZWxpc3RpbmcgV2hhdHNBcHAgdXNlcnNcbiAgICBjb25zdCBob3N0c1RhYmxlID0gY3JlYXRlSG9zdHNUYWJsZSh0aGlzLCBzdGFnZUNvbmZpZyk7XG5cbiAgICAvLyBOb3RlOiBXaGF0c0FwcCBTU00gcGFyYW1ldGVycyBhcmUgY3JlYXRlZCBtYW51YWxseSB2aWEgc2V0dXAtc2VjcmV0cy5zaFxuICAgIC8vIFRoZXkgc2hvdWxkIG5vdCBiZSBtYW5hZ2VkIGJ5IENESyB0byBhdm9pZCBjb25mbGljdHNcblxuICAgIC8vIENyZWF0ZSB0aGUgU3lydXMgQVBJIHdpdGggY3VzdG9tIGRvbWFpblxuICAgIGNvbnN0IHN5cnVzQXBpID0gbmV3IFN5cnVzQXBpKHRoaXMsICdTeXJ1c0FwaScsIHtcbiAgICAgIHN0YWdlQ29uZmlnLFxuICAgICAgY3VzdG9tRG9tYWluOiB0cnVlLFxuICAgICAgaG9zdHNUYWJsZU5hbWU6IGhvc3RzVGFibGUudGFibGVOYW1lLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIENsb3VkRm9ybWF0aW9uIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdDYW1wYWlnbnNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogY2FtcGFpZ25zVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiBjYW1wYWlnbnMgdGFibGUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzVGFibGVOYW1lLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0hvc3RzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGhvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiBob3N0cyB0YWJsZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNIb3N0c1RhYmxlTmFtZS0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTeXJ1c0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBzeXJ1c0FwaS5jdXN0b21Eb21haW5VcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N5cnVzIEFQSSBVUkwgd2l0aCBjdXN0b20gZG9tYWluJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0FwaVVybC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTeXJ1c0xhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBzeXJ1c0FwaS5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3lydXMgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNMYW1iZGFBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuICB9XG59XG4iXX0=