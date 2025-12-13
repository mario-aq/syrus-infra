"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyrusMvpStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const campaigns_table_1 = require("./campaigns-table");
const config_1 = require("./config");
class SyrusMvpStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const stageConfig = (0, config_1.getStageConfig)(props.stage);
        // Create the campaigns table
        const campaignsTable = (0, campaigns_table_1.createCampaignsTable)(this, stageConfig);
        // Add CloudFormation outputs
        new aws_cdk_lib_1.CfnOutput(this, 'CampaignsTableName', {
            value: campaignsTable.tableName,
            description: 'Name of the DynamoDB campaigns table',
            exportName: `SyrusTableName-${props.stage}`,
        });
    }
}
exports.SyrusMvpStack = SyrusMvpStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtbXZwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtbXZwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDZDQUEyRDtBQUMzRCx1REFBeUQ7QUFDekQscUNBQTBDO0FBTTFDLE1BQWEsYUFBYyxTQUFRLG1CQUFLO0lBQ3RDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxXQUFXLEdBQUcsSUFBQSx1QkFBYyxFQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVoRCw2QkFBNkI7UUFDN0IsTUFBTSxjQUFjLEdBQUcsSUFBQSxzQ0FBb0IsRUFBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFL0QsNkJBQTZCO1FBQzdCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDeEMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSxzQ0FBc0M7WUFDbkQsVUFBVSxFQUFFLGtCQUFrQixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWhCRCxzQ0FnQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBjcmVhdGVDYW1wYWlnbnNUYWJsZSB9IGZyb20gJy4vY2FtcGFpZ25zLXRhYmxlJztcbmltcG9ydCB7IGdldFN0YWdlQ29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuXG5pbnRlcmZhY2UgU3lydXNNdnBTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHN0YWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTeXJ1c012cFN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3lydXNNdnBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBzdGFnZUNvbmZpZyA9IGdldFN0YWdlQ29uZmlnKHByb3BzLnN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY2FtcGFpZ25zIHRhYmxlXG4gICAgY29uc3QgY2FtcGFpZ25zVGFibGUgPSBjcmVhdGVDYW1wYWlnbnNUYWJsZSh0aGlzLCBzdGFnZUNvbmZpZyk7XG5cbiAgICAvLyBBZGQgQ2xvdWRGb3JtYXRpb24gb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0NhbXBhaWduc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBjYW1wYWlnbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIGNhbXBhaWducyB0YWJsZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNUYWJsZU5hbWUtJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuICB9XG59XG4iXX0=