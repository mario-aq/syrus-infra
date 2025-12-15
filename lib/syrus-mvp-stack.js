"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyrusMvpStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const campaigns_table_1 = require("./campaigns-table");
const config_1 = require("./config");
const syrus_api_1 = require("./syrus-api");
const sqs_fifo_with_dlq_1 = require("./constructs/sqs-fifo-with-dlq");
const dedup_table_1 = require("./constructs/dedup-table");
const worker_instance_1 = require("./constructs/worker-instance");
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
        // Inference System Infrastructure
        // Read network mode from context (default: 'public')
        const workerNetworkMode = this.node.tryGetContext('workerNetworkMode') || 'public';
        if (workerNetworkMode !== 'public' && workerNetworkMode !== 'isolated') {
            throw new Error(`Invalid workerNetworkMode: ${workerNetworkMode}. Must be 'public' or 'isolated'`);
        }
        // Create SQS FIFO queues
        const inferenceQueue = new sqs_fifo_with_dlq_1.SqsFifoWithDlq(this, 'InferenceQueue', {
            queueName: 'inference',
            stage: props.stage,
        });
        const messagingQueue = new sqs_fifo_with_dlq_1.SqsFifoWithDlq(this, 'MessagingQueue', {
            queueName: 'messaging',
            stage: props.stage,
        });
        // Create dedup table
        const dedupTable = new dedup_table_1.DedupTable(this, 'DedupTable', {
            stage: props.stage,
            removalPolicy: stageConfig.removalPolicy,
        });
        // Create worker instance
        const workerInstance = new worker_instance_1.WorkerInstance(this, 'WorkerInstance', {
            stage: props.stage,
            inferenceQueue: inferenceQueue.queue,
            messagingQueue: messagingQueue.queue,
            dedupTable: dedupTable.table,
            networkMode: workerNetworkMode,
            removalPolicy: stageConfig.removalPolicy,
        });
        // CloudFormation outputs for Inference System
        new aws_cdk_lib_1.CfnOutput(this, 'InferenceQueueUrl', {
            value: inferenceQueue.queue.queueUrl,
            description: 'URL of the inference FIFO queue',
            exportName: `SyrusInferenceQueueUrl-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'InferenceQueueArn', {
            value: inferenceQueue.queue.queueArn,
            description: 'ARN of the inference FIFO queue',
            exportName: `SyrusInferenceQueueArn-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'InferenceDlqUrl', {
            value: inferenceQueue.dlq.queueUrl,
            description: 'URL of the inference dead letter queue',
            exportName: `SyrusInferenceDlqUrl-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'InferenceDlqArn', {
            value: inferenceQueue.dlq.queueArn,
            description: 'ARN of the inference dead letter queue',
            exportName: `SyrusInferenceDlqArn-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'MessagingQueueUrl', {
            value: messagingQueue.queue.queueUrl,
            description: 'URL of the messaging FIFO queue',
            exportName: `SyrusMessagingQueueUrl-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'MessagingQueueArn', {
            value: messagingQueue.queue.queueArn,
            description: 'ARN of the messaging FIFO queue',
            exportName: `SyrusMessagingQueueArn-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'MessagingDlqUrl', {
            value: messagingQueue.dlq.queueUrl,
            description: 'URL of the messaging dead letter queue',
            exportName: `SyrusMessagingDlqUrl-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'MessagingDlqArn', {
            value: messagingQueue.dlq.queueArn,
            description: 'ARN of the messaging dead letter queue',
            exportName: `SyrusMessagingDlqArn-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'DedupTableName', {
            value: dedupTable.table.tableName,
            description: 'Name of the DynamoDB dedup table',
            exportName: `SyrusDedupTableName-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'DedupTableArn', {
            value: dedupTable.table.tableArn,
            description: 'ARN of the DynamoDB dedup table',
            exportName: `SyrusDedupTableArn-${props.stage}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'WorkerInstanceId', {
            value: workerInstance.instance.instanceId,
            description: 'Instance ID of the worker EC2 instance',
            exportName: `SyrusWorkerInstanceId-${props.stage}`,
        });
    }
}
exports.SyrusMvpStack = SyrusMvpStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtbXZwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtbXZwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDZDQUEyRDtBQUMzRCx1REFBMkU7QUFDM0UscUNBQTBDO0FBQzFDLDJDQUF1QztBQUN2QyxzRUFBZ0U7QUFDaEUsMERBQXNEO0FBQ3RELGtFQUE4RDtBQU05RCxNQUFhLGFBQWMsU0FBUSxtQkFBSztJQUN0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sV0FBVyxHQUFHLElBQUEsdUJBQWMsRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFaEQsNkJBQTZCO1FBQzdCLE1BQU0sY0FBYyxHQUFHLElBQUEsc0NBQW9CLEVBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRS9ELHlEQUF5RDtRQUN6RCxNQUFNLFVBQVUsR0FBRyxJQUFBLGtDQUFnQixFQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUV2RCwwRUFBMEU7UUFDMUUsdURBQXVEO1FBRXZELDBDQUEwQztRQUMxQyxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUM5QyxXQUFXO1lBQ1gsWUFBWSxFQUFFLElBQUk7WUFDbEIsY0FBYyxFQUFFLFVBQVUsQ0FBQyxTQUFTO1NBQ3JDLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxjQUFjLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsc0NBQXNDO1lBQ25ELFVBQVUsRUFBRSxrQkFBa0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUM1QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3BDLEtBQUssRUFBRSxVQUFVLENBQUMsU0FBUztZQUMzQixXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLFVBQVUsRUFBRSx1QkFBdUIsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNqQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGVBQWU7WUFDL0IsV0FBVyxFQUFFLGtDQUFrQztZQUMvQyxVQUFVLEVBQUUsZUFBZSxLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxjQUFjLENBQUMsV0FBVztZQUMxQyxXQUFXLEVBQUUsMkJBQTJCO1lBQ3hDLFVBQVUsRUFBRSxrQkFBa0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUM1QyxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMscURBQXFEO1FBQ3JELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsSUFBSSxRQUFRLENBQUM7UUFDbkYsSUFBSSxpQkFBaUIsS0FBSyxRQUFRLElBQUksaUJBQWlCLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDdkUsTUFBTSxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsaUJBQWlCLGtDQUFrQyxDQUFDLENBQUM7UUFDckcsQ0FBQztRQUVELHlCQUF5QjtRQUN6QixNQUFNLGNBQWMsR0FBRyxJQUFJLGtDQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2hFLFNBQVMsRUFBRSxXQUFXO1lBQ3RCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztTQUNuQixDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxJQUFJLGtDQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2hFLFNBQVMsRUFBRSxXQUFXO1lBQ3RCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztTQUNuQixDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsTUFBTSxVQUFVLEdBQUcsSUFBSSx3QkFBVSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEQsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1lBQ2xCLGFBQWEsRUFBRSxXQUFXLENBQUMsYUFBYTtTQUN6QyxDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsTUFBTSxjQUFjLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsY0FBYyxFQUFFLGNBQWMsQ0FBQyxLQUFLO1lBQ3BDLGNBQWMsRUFBRSxjQUFjLENBQUMsS0FBSztZQUNwQyxVQUFVLEVBQUUsVUFBVSxDQUFDLEtBQUs7WUFDNUIsV0FBVyxFQUFFLGlCQUEwQztZQUN2RCxhQUFhLEVBQUUsV0FBVyxDQUFDLGFBQWE7U0FDekMsQ0FBQyxDQUFDO1FBRUgsOENBQThDO1FBQzlDLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsUUFBUTtZQUNwQyxXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLFVBQVUsRUFBRSwwQkFBMEIsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNwRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLFFBQVE7WUFDcEMsV0FBVyxFQUFFLGlDQUFpQztZQUM5QyxVQUFVLEVBQUUsMEJBQTBCLEtBQUssQ0FBQyxLQUFLLEVBQUU7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNyQyxLQUFLLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxRQUFRO1lBQ2xDLFdBQVcsRUFBRSx3Q0FBd0M7WUFDckQsVUFBVSxFQUFFLHdCQUF3QixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDckMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsUUFBUTtZQUNsQyxXQUFXLEVBQUUsd0NBQXdDO1lBQ3JELFVBQVUsRUFBRSx3QkFBd0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNsRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLFFBQVE7WUFDcEMsV0FBVyxFQUFFLGlDQUFpQztZQUM5QyxVQUFVLEVBQUUsMEJBQTBCLEtBQUssQ0FBQyxLQUFLLEVBQUU7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxRQUFRO1lBQ3BDLFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsVUFBVSxFQUFFLDBCQUEwQixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ3BELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDckMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsUUFBUTtZQUNsQyxXQUFXLEVBQUUsd0NBQXdDO1lBQ3JELFVBQVUsRUFBRSx3QkFBd0IsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNsRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3JDLEtBQUssRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVE7WUFDbEMsV0FBVyxFQUFFLHdDQUF3QztZQUNyRCxVQUFVLEVBQUUsd0JBQXdCLEtBQUssQ0FBQyxLQUFLLEVBQUU7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwQyxLQUFLLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxTQUFTO1lBQ2pDLFdBQVcsRUFBRSxrQ0FBa0M7WUFDL0MsVUFBVSxFQUFFLHVCQUF1QixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVE7WUFDaEMsV0FBVyxFQUFFLGlDQUFpQztZQUM5QyxVQUFVLEVBQUUsc0JBQXNCLEtBQUssQ0FBQyxLQUFLLEVBQUU7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN0QyxLQUFLLEVBQUUsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVO1lBQ3pDLFdBQVcsRUFBRSx3Q0FBd0M7WUFDckQsVUFBVSxFQUFFLHlCQUF5QixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ25ELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXBKRCxzQ0FvSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBjcmVhdGVDYW1wYWlnbnNUYWJsZSwgY3JlYXRlSG9zdHNUYWJsZSB9IGZyb20gJy4vY2FtcGFpZ25zLXRhYmxlJztcbmltcG9ydCB7IGdldFN0YWdlQ29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHsgU3lydXNBcGkgfSBmcm9tICcuL3N5cnVzLWFwaSc7XG5pbXBvcnQgeyBTcXNGaWZvV2l0aERscSB9IGZyb20gJy4vY29uc3RydWN0cy9zcXMtZmlmby13aXRoLWRscSc7XG5pbXBvcnQgeyBEZWR1cFRhYmxlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RlZHVwLXRhYmxlJztcbmltcG9ydCB7IFdvcmtlckluc3RhbmNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3dvcmtlci1pbnN0YW5jZSc7XG5cbmludGVyZmFjZSBTeXJ1c012cFN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgc3RhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFN5cnVzTXZwU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTeXJ1c012cFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHN0YWdlQ29uZmlnID0gZ2V0U3RhZ2VDb25maWcocHJvcHMuc3RhZ2UpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjYW1wYWlnbnMgdGFibGVcbiAgICBjb25zdCBjYW1wYWlnbnNUYWJsZSA9IGNyZWF0ZUNhbXBhaWduc1RhYmxlKHRoaXMsIHN0YWdlQ29uZmlnKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgaG9zdHMgdGFibGUgZm9yIHdoaXRlbGlzdGluZyBXaGF0c0FwcCB1c2Vyc1xuICAgIGNvbnN0IGhvc3RzVGFibGUgPSBjcmVhdGVIb3N0c1RhYmxlKHRoaXMsIHN0YWdlQ29uZmlnKTtcblxuICAgIC8vIE5vdGU6IFdoYXRzQXBwIFNTTSBwYXJhbWV0ZXJzIGFyZSBjcmVhdGVkIG1hbnVhbGx5IHZpYSBzZXR1cC1zZWNyZXRzLnNoXG4gICAgLy8gVGhleSBzaG91bGQgbm90IGJlIG1hbmFnZWQgYnkgQ0RLIHRvIGF2b2lkIGNvbmZsaWN0c1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBTeXJ1cyBBUEkgd2l0aCBjdXN0b20gZG9tYWluXG4gICAgY29uc3Qgc3lydXNBcGkgPSBuZXcgU3lydXNBcGkodGhpcywgJ1N5cnVzQXBpJywge1xuICAgICAgc3RhZ2VDb25maWcsXG4gICAgICBjdXN0b21Eb21haW46IHRydWUsXG4gICAgICBob3N0c1RhYmxlTmFtZTogaG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgQ2xvdWRGb3JtYXRpb24gb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0NhbXBhaWduc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBjYW1wYWlnbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIGNhbXBhaWducyB0YWJsZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNUYWJsZU5hbWUtJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnSG9zdHNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogaG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIGhvc3RzIHRhYmxlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0hvc3RzVGFibGVOYW1lLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1N5cnVzQXBpVXJsJywge1xuICAgICAgdmFsdWU6IHN5cnVzQXBpLmN1c3RvbURvbWFpblVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3lydXMgQVBJIFVSTCB3aXRoIGN1c3RvbSBkb21haW4nLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzQXBpVXJsLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1N5cnVzTGFtYmRhQXJuJywge1xuICAgICAgdmFsdWU6IHN5cnVzQXBpLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTeXJ1cyBMYW1iZGEgZnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0xhbWJkYUFybi0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICAvLyBJbmZlcmVuY2UgU3lzdGVtIEluZnJhc3RydWN0dXJlXG4gICAgLy8gUmVhZCBuZXR3b3JrIG1vZGUgZnJvbSBjb250ZXh0IChkZWZhdWx0OiAncHVibGljJylcbiAgICBjb25zdCB3b3JrZXJOZXR3b3JrTW9kZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd3b3JrZXJOZXR3b3JrTW9kZScpIHx8ICdwdWJsaWMnO1xuICAgIGlmICh3b3JrZXJOZXR3b3JrTW9kZSAhPT0gJ3B1YmxpYycgJiYgd29ya2VyTmV0d29ya01vZGUgIT09ICdpc29sYXRlZCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB3b3JrZXJOZXR3b3JrTW9kZTogJHt3b3JrZXJOZXR3b3JrTW9kZX0uIE11c3QgYmUgJ3B1YmxpYycgb3IgJ2lzb2xhdGVkJ2ApO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBTUVMgRklGTyBxdWV1ZXNcbiAgICBjb25zdCBpbmZlcmVuY2VRdWV1ZSA9IG5ldyBTcXNGaWZvV2l0aERscSh0aGlzLCAnSW5mZXJlbmNlUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICdpbmZlcmVuY2UnLFxuICAgICAgc3RhZ2U6IHByb3BzLnN0YWdlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWVzc2FnaW5nUXVldWUgPSBuZXcgU3FzRmlmb1dpdGhEbHEodGhpcywgJ01lc3NhZ2luZ1F1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAnbWVzc2FnaW5nJyxcbiAgICAgIHN0YWdlOiBwcm9wcy5zdGFnZSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBkZWR1cCB0YWJsZVxuICAgIGNvbnN0IGRlZHVwVGFibGUgPSBuZXcgRGVkdXBUYWJsZSh0aGlzLCAnRGVkdXBUYWJsZScsIHtcbiAgICAgIHN0YWdlOiBwcm9wcy5zdGFnZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHN0YWdlQ29uZmlnLnJlbW92YWxQb2xpY3ksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgd29ya2VyIGluc3RhbmNlXG4gICAgY29uc3Qgd29ya2VySW5zdGFuY2UgPSBuZXcgV29ya2VySW5zdGFuY2UodGhpcywgJ1dvcmtlckluc3RhbmNlJywge1xuICAgICAgc3RhZ2U6IHByb3BzLnN0YWdlLFxuICAgICAgaW5mZXJlbmNlUXVldWU6IGluZmVyZW5jZVF1ZXVlLnF1ZXVlLFxuICAgICAgbWVzc2FnaW5nUXVldWU6IG1lc3NhZ2luZ1F1ZXVlLnF1ZXVlLFxuICAgICAgZGVkdXBUYWJsZTogZGVkdXBUYWJsZS50YWJsZSxcbiAgICAgIG5ldHdvcmtNb2RlOiB3b3JrZXJOZXR3b3JrTW9kZSBhcyAncHVibGljJyB8ICdpc29sYXRlZCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZUNvbmZpZy5yZW1vdmFsUG9saWN5LFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gb3V0cHV0cyBmb3IgSW5mZXJlbmNlIFN5c3RlbVxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0luZmVyZW5jZVF1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IGluZmVyZW5jZVF1ZXVlLnF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgb2YgdGhlIGluZmVyZW5jZSBGSUZPIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0luZmVyZW5jZVF1ZXVlVXJsLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0luZmVyZW5jZVF1ZXVlQXJuJywge1xuICAgICAgdmFsdWU6IGluZmVyZW5jZVF1ZXVlLnF1ZXVlLnF1ZXVlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIGluZmVyZW5jZSBGSUZPIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0luZmVyZW5jZVF1ZXVlQXJuLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0luZmVyZW5jZURscVVybCcsIHtcbiAgICAgIHZhbHVlOiBpbmZlcmVuY2VRdWV1ZS5kbHEucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgaW5mZXJlbmNlIGRlYWQgbGV0dGVyIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0luZmVyZW5jZURscVVybC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdJbmZlcmVuY2VEbHFBcm4nLCB7XG4gICAgICB2YWx1ZTogaW5mZXJlbmNlUXVldWUuZGxxLnF1ZXVlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIGluZmVyZW5jZSBkZWFkIGxldHRlciBxdWV1ZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNJbmZlcmVuY2VEbHFBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTWVzc2FnaW5nUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogbWVzc2FnaW5nUXVldWUucXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgbWVzc2FnaW5nIEZJRk8gcXVldWUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzTWVzc2FnaW5nUXVldWVVcmwtJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTWVzc2FnaW5nUXVldWVBcm4nLCB7XG4gICAgICB2YWx1ZTogbWVzc2FnaW5nUXVldWUucXVldWUucXVldWVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgbWVzc2FnaW5nIEZJRk8gcXVldWUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzTWVzc2FnaW5nUXVldWVBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTWVzc2FnaW5nRGxxVXJsJywge1xuICAgICAgdmFsdWU6IG1lc3NhZ2luZ1F1ZXVlLmRscS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIG9mIHRoZSBtZXNzYWdpbmcgZGVhZCBsZXR0ZXIgcXVldWUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzTWVzc2FnaW5nRGxxVXJsLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ01lc3NhZ2luZ0RscUFybicsIHtcbiAgICAgIHZhbHVlOiBtZXNzYWdpbmdRdWV1ZS5kbHEucXVldWVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgbWVzc2FnaW5nIGRlYWQgbGV0dGVyIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c01lc3NhZ2luZ0RscUFybi0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdEZWR1cFRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBkZWR1cFRhYmxlLnRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgRHluYW1vREIgZGVkdXAgdGFibGUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzRGVkdXBUYWJsZU5hbWUtJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGVkdXBUYWJsZUFybicsIHtcbiAgICAgIHZhbHVlOiBkZWR1cFRhYmxlLnRhYmxlLnRhYmxlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIER5bmFtb0RCIGRlZHVwIHRhYmxlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0RlZHVwVGFibGVBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnV29ya2VySW5zdGFuY2VJZCcsIHtcbiAgICAgIHZhbHVlOiB3b3JrZXJJbnN0YW5jZS5pbnN0YW5jZS5pbnN0YW5jZUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdJbnN0YW5jZSBJRCBvZiB0aGUgd29ya2VyIEVDMiBpbnN0YW5jZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNXb3JrZXJJbnN0YW5jZUlkLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcbiAgfVxufVxuIl19