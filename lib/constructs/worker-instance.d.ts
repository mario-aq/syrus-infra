import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
export interface WorkerInstanceProps {
    /** Deployment stage (dev/prod) */
    stage: string;
    /** Inference queue for reading messages */
    inferenceQueue: sqs.IQueue;
    /** Messaging queue for sending messages */
    messagingQueue: sqs.IQueue;
    /** Dedup table for idempotency */
    dedupTable: dynamodb.ITable;
    /** Network mode: 'public' uses default VPC, 'isolated' creates dedicated VPC with endpoints */
    networkMode: 'public' | 'isolated';
    /** Removal policy for the instance */
    removalPolicy: RemovalPolicy;
}
/**
 * Creates an EC2 worker instance with IAM role and placeholder systemd service
 */
export declare class WorkerInstance extends Construct {
    readonly instance: ec2.Instance;
    readonly vpc?: ec2.Vpc;
    readonly securityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: WorkerInstanceProps);
}
