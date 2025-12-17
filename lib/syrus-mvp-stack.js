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
        // Create the hosts table for whitelisting Discord users
        const hostsTable = (0, campaigns_table_1.createHostsTable)(this, stageConfig);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtbXZwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3lydXMtbXZwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDZDQUEyRDtBQUMzRCx1REFBMkU7QUFDM0UscUNBQTBDO0FBQzFDLDJDQUF1QztBQUN2QyxzRUFBZ0U7QUFDaEUsMERBQXNEO0FBQ3RELGtFQUE4RDtBQU05RCxNQUFhLGFBQWMsU0FBUSxtQkFBSztJQUN0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sV0FBVyxHQUFHLElBQUEsdUJBQWMsRUFBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFaEQsNkJBQTZCO1FBQzdCLE1BQU0sY0FBYyxHQUFHLElBQUEsc0NBQW9CLEVBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRS9ELHdEQUF3RDtRQUN4RCxNQUFNLFVBQVUsR0FBRyxJQUFBLGtDQUFnQixFQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUV2RCwwQ0FBMEM7UUFDMUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDOUMsV0FBVztZQUNYLFlBQVksRUFBRSxJQUFJO1lBQ2xCLGNBQWMsRUFBRSxVQUFVLENBQUMsU0FBUztTQUNyQyxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsY0FBYyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLHNDQUFzQztZQUNuRCxVQUFVLEVBQUUsa0JBQWtCLEtBQUssQ0FBQyxLQUFLLEVBQUU7U0FDNUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNw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QUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBUztZQUNqQyxXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLFVBQVUsRUFBRSx1QkFBdUIsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuQyxLQUFLLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRO1lBQ2hDLFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsVUFBVSxFQUFFLHNCQUFzQixLQUFLLENBQUMsS0FBSyxFQUFFO1NBQ2hELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDdEMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUN6QyxXQUFXLEVBQUUsd0NBQXdDO1lBQ3JELFVBQVUsRUFBRSx5QkFBeUIsS0FBSyxDQUFDLEtBQUssRUFBRTtTQUNuRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFqSkQsc0NBaUpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgQ2ZuT3V0cHV0IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgY3JlYXRlQ2FtcGFpZ25zVGFibGUsIGNyZWF0ZUhvc3RzVGFibGUgfSBmcm9tICcuL2NhbXBhaWducy10YWJsZSc7XG5pbXBvcnQgeyBnZXRTdGFnZUNvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7IFN5cnVzQXBpIH0gZnJvbSAnLi9zeXJ1cy1hcGknO1xuaW1wb3J0IHsgU3FzRmlmb1dpdGhEbHEgfSBmcm9tICcuL2NvbnN0cnVjdHMvc3FzLWZpZm8td2l0aC1kbHEnO1xuaW1wb3J0IHsgRGVkdXBUYWJsZSB9IGZyb20gJy4vY29uc3RydWN0cy9kZWR1cC10YWJsZSc7XG5pbXBvcnQgeyBXb3JrZXJJbnN0YW5jZSB9IGZyb20gJy4vY29uc3RydWN0cy93b3JrZXItaW5zdGFuY2UnO1xuXG5pbnRlcmZhY2UgU3lydXNNdnBTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHN0YWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTeXJ1c012cFN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3lydXNNdnBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBzdGFnZUNvbmZpZyA9IGdldFN0YWdlQ29uZmlnKHByb3BzLnN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY2FtcGFpZ25zIHRhYmxlXG4gICAgY29uc3QgY2FtcGFpZ25zVGFibGUgPSBjcmVhdGVDYW1wYWlnbnNUYWJsZSh0aGlzLCBzdGFnZUNvbmZpZyk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGhvc3RzIHRhYmxlIGZvciB3aGl0ZWxpc3RpbmcgRGlzY29yZCB1c2Vyc1xuICAgIGNvbnN0IGhvc3RzVGFibGUgPSBjcmVhdGVIb3N0c1RhYmxlKHRoaXMsIHN0YWdlQ29uZmlnKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgU3lydXMgQVBJIHdpdGggY3VzdG9tIGRvbWFpblxuICAgIGNvbnN0IHN5cnVzQXBpID0gbmV3IFN5cnVzQXBpKHRoaXMsICdTeXJ1c0FwaScsIHtcbiAgICAgIHN0YWdlQ29uZmlnLFxuICAgICAgY3VzdG9tRG9tYWluOiB0cnVlLFxuICAgICAgaG9zdHNUYWJsZU5hbWU6IGhvc3RzVGFibGUudGFibGVOYW1lLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIENsb3VkRm9ybWF0aW9uIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdDYW1wYWlnbnNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogY2FtcGFpZ25zVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiBjYW1wYWlnbnMgdGFibGUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzVGFibGVOYW1lLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0hvc3RzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGhvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiBob3N0cyB0YWJsZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNIb3N0c1RhYmxlTmFtZS0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTeXJ1c0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBzeXJ1c0FwaS5jdXN0b21Eb21haW5VcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N5cnVzIEFQSSBVUkwgd2l0aCBjdXN0b20gZG9tYWluJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0FwaVVybC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdTeXJ1c0xhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBzeXJ1c0FwaS5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3lydXMgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNMYW1iZGFBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgLy8gSW5mZXJlbmNlIFN5c3RlbSBJbmZyYXN0cnVjdHVyZVxuICAgIC8vIFJlYWQgbmV0d29yayBtb2RlIGZyb20gY29udGV4dCAoZGVmYXVsdDogJ3B1YmxpYycpXG4gICAgY29uc3Qgd29ya2VyTmV0d29ya01vZGUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnd29ya2VyTmV0d29ya01vZGUnKSB8fCAncHVibGljJztcbiAgICBpZiAod29ya2VyTmV0d29ya01vZGUgIT09ICdwdWJsaWMnICYmIHdvcmtlck5ldHdvcmtNb2RlICE9PSAnaXNvbGF0ZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgd29ya2VyTmV0d29ya01vZGU6ICR7d29ya2VyTmV0d29ya01vZGV9LiBNdXN0IGJlICdwdWJsaWMnIG9yICdpc29sYXRlZCdgKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgU1FTIEZJRk8gcXVldWVzXG4gICAgY29uc3QgaW5mZXJlbmNlUXVldWUgPSBuZXcgU3FzRmlmb1dpdGhEbHEodGhpcywgJ0luZmVyZW5jZVF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAnaW5mZXJlbmNlJyxcbiAgICAgIHN0YWdlOiBwcm9wcy5zdGFnZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lc3NhZ2luZ1F1ZXVlID0gbmV3IFNxc0ZpZm9XaXRoRGxxKHRoaXMsICdNZXNzYWdpbmdRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ21lc3NhZ2luZycsXG4gICAgICBzdGFnZTogcHJvcHMuc3RhZ2UsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZGVkdXAgdGFibGVcbiAgICBjb25zdCBkZWR1cFRhYmxlID0gbmV3IERlZHVwVGFibGUodGhpcywgJ0RlZHVwVGFibGUnLCB7XG4gICAgICBzdGFnZTogcHJvcHMuc3RhZ2UsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZUNvbmZpZy5yZW1vdmFsUG9saWN5LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHdvcmtlciBpbnN0YW5jZVxuICAgIGNvbnN0IHdvcmtlckluc3RhbmNlID0gbmV3IFdvcmtlckluc3RhbmNlKHRoaXMsICdXb3JrZXJJbnN0YW5jZScsIHtcbiAgICAgIHN0YWdlOiBwcm9wcy5zdGFnZSxcbiAgICAgIGluZmVyZW5jZVF1ZXVlOiBpbmZlcmVuY2VRdWV1ZS5xdWV1ZSxcbiAgICAgIG1lc3NhZ2luZ1F1ZXVlOiBtZXNzYWdpbmdRdWV1ZS5xdWV1ZSxcbiAgICAgIGRlZHVwVGFibGU6IGRlZHVwVGFibGUudGFibGUsXG4gICAgICBuZXR3b3JrTW9kZTogd29ya2VyTmV0d29ya01vZGUgYXMgJ3B1YmxpYycgfCAnaXNvbGF0ZWQnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogc3RhZ2VDb25maWcucmVtb3ZhbFBvbGljeSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRm9ybWF0aW9uIG91dHB1dHMgZm9yIEluZmVyZW5jZSBTeXN0ZW1cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdJbmZlcmVuY2VRdWV1ZVVybCcsIHtcbiAgICAgIHZhbHVlOiBpbmZlcmVuY2VRdWV1ZS5xdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIG9mIHRoZSBpbmZlcmVuY2UgRklGTyBxdWV1ZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNJbmZlcmVuY2VRdWV1ZVVybC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdJbmZlcmVuY2VRdWV1ZUFybicsIHtcbiAgICAgIHZhbHVlOiBpbmZlcmVuY2VRdWV1ZS5xdWV1ZS5xdWV1ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBpbmZlcmVuY2UgRklGTyBxdWV1ZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNJbmZlcmVuY2VRdWV1ZUFybi0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdJbmZlcmVuY2VEbHFVcmwnLCB7XG4gICAgICB2YWx1ZTogaW5mZXJlbmNlUXVldWUuZGxxLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgb2YgdGhlIGluZmVyZW5jZSBkZWFkIGxldHRlciBxdWV1ZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNJbmZlcmVuY2VEbHFVcmwtJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnSW5mZXJlbmNlRGxxQXJuJywge1xuICAgICAgdmFsdWU6IGluZmVyZW5jZVF1ZXVlLmRscS5xdWV1ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBpbmZlcmVuY2UgZGVhZCBsZXR0ZXIgcXVldWUnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzSW5mZXJlbmNlRGxxQXJuLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ01lc3NhZ2luZ1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IG1lc3NhZ2luZ1F1ZXVlLnF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgb2YgdGhlIG1lc3NhZ2luZyBGSUZPIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c01lc3NhZ2luZ1F1ZXVlVXJsLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ01lc3NhZ2luZ1F1ZXVlQXJuJywge1xuICAgICAgdmFsdWU6IG1lc3NhZ2luZ1F1ZXVlLnF1ZXVlLnF1ZXVlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIG1lc3NhZ2luZyBGSUZPIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c01lc3NhZ2luZ1F1ZXVlQXJuLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ01lc3NhZ2luZ0RscVVybCcsIHtcbiAgICAgIHZhbHVlOiBtZXNzYWdpbmdRdWV1ZS5kbHEucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgbWVzc2FnaW5nIGRlYWQgbGV0dGVyIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c01lc3NhZ2luZ0RscVVybC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdNZXNzYWdpbmdEbHFBcm4nLCB7XG4gICAgICB2YWx1ZTogbWVzc2FnaW5nUXVldWUuZGxxLnF1ZXVlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIG1lc3NhZ2luZyBkZWFkIGxldHRlciBxdWV1ZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNNZXNzYWdpbmdEbHFBcm4tJHtwcm9wcy5zdGFnZX1gLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGVkdXBUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogZGVkdXBUYWJsZS50YWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIGRlZHVwIHRhYmxlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBTeXJ1c0RlZHVwVGFibGVOYW1lLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0RlZHVwVGFibGVBcm4nLCB7XG4gICAgICB2YWx1ZTogZGVkdXBUYWJsZS50YWJsZS50YWJsZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBEeW5hbW9EQiBkZWR1cCB0YWJsZScsXG4gICAgICBleHBvcnROYW1lOiBgU3lydXNEZWR1cFRhYmxlQXJuLSR7cHJvcHMuc3RhZ2V9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1dvcmtlckluc3RhbmNlSWQnLCB7XG4gICAgICB2YWx1ZTogd29ya2VySW5zdGFuY2UuaW5zdGFuY2UuaW5zdGFuY2VJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSW5zdGFuY2UgSUQgb2YgdGhlIHdvcmtlciBFQzIgaW5zdGFuY2UnLFxuICAgICAgZXhwb3J0TmFtZTogYFN5cnVzV29ya2VySW5zdGFuY2VJZC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==