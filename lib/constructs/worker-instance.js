"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerInstance = void 0;
const constructs_1 = require("constructs");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * Creates an EC2 worker instance with IAM role and placeholder systemd service
 */
class WorkerInstance extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        let vpc;
        let subnetSelection;
        let securityGroup;
        if (props.networkMode === 'isolated') {
            // Create dedicated VPC with isolated subnets
            this.vpc = new ec2.Vpc(this, 'WorkerVpc', {
                maxAzs: 2,
                natGateways: 0, // No NAT to keep costs minimal
                subnetConfiguration: [
                    {
                        name: 'Isolated',
                        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                        cidrMask: 24,
                    },
                ],
            });
            vpc = this.vpc;
            subnetSelection = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };
            // Create VPC endpoints for AWS services
            // SSM, SSM Messages, and EC2 Messages are interface endpoints
            this.vpc.addInterfaceEndpoint('SsmEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.SSM,
            });
            this.vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
            });
            this.vpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
            });
            // Interface endpoints for SQS and CloudWatch Logs
            this.vpc.addInterfaceEndpoint('SqsEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.SQS,
            });
            this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
                service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            });
            // Security group: egress only to VPC endpoints
            securityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
                vpc: this.vpc,
                description: 'Security group for worker instance',
                allowAllOutbound: false, // Explicitly control egress
            });
            // Allow HTTPS egress to VPC endpoints (for interface endpoints)
            securityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(443), 'Allow HTTPS to VPC endpoints');
        }
        else {
            // Public mode: use default VPC
            // Check if we have account/region (required for VPC lookup)
            const stack = aws_cdk_lib_1.Stack.of(this);
            if (aws_cdk_lib_1.Token.isUnresolved(stack.account) || aws_cdk_lib_1.Token.isUnresolved(stack.region)) {
                // During synth without account/region, create a minimal VPC
                // This will be replaced with the actual default VPC lookup during deployment
                this.vpc = new ec2.Vpc(this, 'DefaultVpc', {
                    maxAzs: 2,
                    natGateways: 0,
                    subnetConfiguration: [
                        {
                            name: 'Public',
                            subnetType: ec2.SubnetType.PUBLIC,
                            cidrMask: 24,
                        },
                    ],
                });
                vpc = this.vpc;
            }
            else {
                // We have account/region, can do the lookup
                vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
                    isDefault: true,
                });
            }
            subnetSelection = { subnetType: ec2.SubnetType.PUBLIC };
            // Security group: no inbound, outbound HTTPS only
            securityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
                vpc: vpc,
                description: 'Security group for worker instance',
                allowAllOutbound: false,
            });
            securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS outbound');
        }
        this.securityGroup = securityGroup;
        // Create IAM role for the worker
        const workerRole = new iam.Role(this, 'WorkerRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ],
        });
        // Add inline policy for SQS and DynamoDB access
        workerRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:ChangeMessageVisibility',
                'sqs:GetQueueAttributes',
            ],
            resources: [props.inferenceQueue.queueArn],
        }));
        workerRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sqs:SendMessage'],
            resources: [props.messagingQueue.queueArn],
        }));
        workerRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [props.dedupTable.tableArn],
        }));
        // Create instance profile
        const instanceProfile = new iam.InstanceProfile(this, 'WorkerInstanceProfile', {
            role: workerRole,
        });
        // User data script
        const userData = ec2.UserData.forLinux();
        userData.addCommands('#!/bin/bash', 'set -e', 'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1', '', '# Install jq', 'yum update -y', 'yum install -y jq', '', '# Create placeholder systemd service', 'cat > /etc/systemd/system/syrus-worker.service << \'EOF\'', '[Unit]', 'Description=Syrus Worker Service', 'After=network.target', '', '[Service]', 'Type=simple', '# This is a placeholder service that will later consume SQS messages', '# Dedup keys will be written to DynamoDB', '# Messages will be forwarded to another queue', 'ExecStart=/bin/true', 'Restart=always', 'RestartSec=10', '', '[Install]', 'WantedBy=multi-user.target', 'EOF', '', '# Enable and start the service', 'systemctl daemon-reload', 'systemctl enable syrus-worker.service', 'systemctl start syrus-worker.service', '', 'echo "User data script completed successfully"');
        // Get latest Amazon Linux 2023 AMI
        const ami = ec2.MachineImage.latestAmazonLinux2023({
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
        });
        // Create EC2 instance
        this.instance = new ec2.Instance(this, 'WorkerInstance', {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            machineImage: ami,
            vpc: vpc,
            vpcSubnets: subnetSelection,
            securityGroup: securityGroup,
            role: workerRole,
            userData: userData,
            blockDevices: [
                {
                    deviceName: '/dev/xvda',
                    volume: ec2.BlockDeviceVolume.ebs(16, {
                        volumeType: ec2.EbsDeviceVolumeType.GP3,
                        encrypted: true,
                    }),
                },
            ],
            // No SSH keypair - access via SSM only
            requireImdsv2: true,
        });
        // Apply removal policy
        if (props.removalPolicy === aws_cdk_lib_1.RemovalPolicy.DESTROY) {
            this.instance.applyRemovalPolicy(aws_cdk_lib_1.RemovalPolicy.DESTROY);
        }
        else {
            this.instance.applyRemovalPolicy(aws_cdk_lib_1.RemovalPolicy.RETAIN);
        }
        // Add tags
        aws_cdk_lib_1.Tags.of(this.instance).add('App', 'Syrus');
        aws_cdk_lib_1.Tags.of(this.instance).add('Service', 'WhatsAppBot');
        aws_cdk_lib_1.Tags.of(this.instance).add('Stage', props.stage);
        aws_cdk_lib_1.Tags.of(this.instance).add('Name', `syrus-worker-${props.stage}`);
        aws_cdk_lib_1.Tags.of(workerRole).add('App', 'Syrus');
        aws_cdk_lib_1.Tags.of(workerRole).add('Service', 'WhatsAppBot');
        aws_cdk_lib_1.Tags.of(workerRole).add('Stage', props.stage);
    }
}
exports.WorkerInstance = WorkerInstance;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyLWluc3RhbmNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid29ya2VyLWluc3RhbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUF1QztBQUN2QywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBRzNDLDZDQUFnRTtBQWlCaEU7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQUszQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsSUFBSSxHQUFhLENBQUM7UUFDbEIsSUFBSSxlQUFvQyxDQUFDO1FBQ3pDLElBQUksYUFBZ0MsQ0FBQztRQUVyQyxJQUFJLEtBQUssQ0FBQyxXQUFXLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDckMsNkNBQTZDO1lBQzdDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7Z0JBQ3hDLE1BQU0sRUFBRSxDQUFDO2dCQUNULFdBQVcsRUFBRSxDQUFDLEVBQUUsK0JBQStCO2dCQUMvQyxtQkFBbUIsRUFBRTtvQkFDbkI7d0JBQ0UsSUFBSSxFQUFFLFVBQVU7d0JBQ2hCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQjt3QkFDM0MsUUFBUSxFQUFFLEVBQUU7cUJBQ2I7aUJBQ0Y7YUFDRixDQUFDLENBQUM7WUFFSCxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUNmLGVBQWUsR0FBRyxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFFbEUsd0NBQXdDO1lBQ3hDLDhEQUE4RDtZQUM5RCxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRTtnQkFDM0MsT0FBTyxFQUFFLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxHQUFHO2FBQ2hE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LFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pELGtCQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLGdCQUFnQixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUVsRSxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3hDLGtCQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEQsa0JBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNGO0FBMU9ELHdDQTBPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFRhZ3MsIFN0YWNrLCBUb2tlbiB9IGZyb20gJ2F3cy1jZGstbGliJztcblxuZXhwb3J0IGludGVyZmFjZSBXb3JrZXJJbnN0YW5jZVByb3BzIHtcbiAgLyoqIERlcGxveW1lbnQgc3RhZ2UgKGRldi9wcm9kKSAqL1xuICBzdGFnZTogc3RyaW5nO1xuICAvKiogSW5mZXJlbmNlIHF1ZXVlIGZvciByZWFkaW5nIG1lc3NhZ2VzICovXG4gIGluZmVyZW5jZVF1ZXVlOiBzcXMuSVF1ZXVlO1xuICAvKiogTWVzc2FnaW5nIHF1ZXVlIGZvciBzZW5kaW5nIG1lc3NhZ2VzICovXG4gIG1lc3NhZ2luZ1F1ZXVlOiBzcXMuSVF1ZXVlO1xuICAvKiogRGVkdXAgdGFibGUgZm9yIGlkZW1wb3RlbmN5ICovXG4gIGRlZHVwVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgLyoqIE5ldHdvcmsgbW9kZTogJ3B1YmxpYycgdXNlcyBkZWZhdWx0IFZQQywgJ2lzb2xhdGVkJyBjcmVhdGVzIGRlZGljYXRlZCBWUEMgd2l0aCBlbmRwb2ludHMgKi9cbiAgbmV0d29ya01vZGU6ICdwdWJsaWMnIHwgJ2lzb2xhdGVkJztcbiAgLyoqIFJlbW92YWwgcG9saWN5IGZvciB0aGUgaW5zdGFuY2UgKi9cbiAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIEVDMiB3b3JrZXIgaW5zdGFuY2Ugd2l0aCBJQU0gcm9sZSBhbmQgcGxhY2Vob2xkZXIgc3lzdGVtZCBzZXJ2aWNlXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3JrZXJJbnN0YW5jZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBpbnN0YW5jZTogZWMyLkluc3RhbmNlO1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjPzogZWMyLlZwYztcbiAgcHVibGljIHJlYWRvbmx5IHNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXb3JrZXJJbnN0YW5jZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGxldCB2cGM6IGVjMi5JVnBjO1xuICAgIGxldCBzdWJuZXRTZWxlY3Rpb246IGVjMi5TdWJuZXRTZWxlY3Rpb247XG4gICAgbGV0IHNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gICAgaWYgKHByb3BzLm5ldHdvcmtNb2RlID09PSAnaXNvbGF0ZWQnKSB7XG4gICAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIFZQQyB3aXRoIGlzb2xhdGVkIHN1Ym5ldHNcbiAgICAgIHRoaXMudnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1dvcmtlclZwYycsIHtcbiAgICAgICAgbWF4QXpzOiAyLFxuICAgICAgICBuYXRHYXRld2F5czogMCwgLy8gTm8gTkFUIHRvIGtlZXAgY29zdHMgbWluaW1hbFxuICAgICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0lzb2xhdGVkJyxcbiAgICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICB2cGMgPSB0aGlzLnZwYztcbiAgICAgIHN1Ym5ldFNlbGVjdGlvbiA9IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCB9O1xuXG4gICAgICAvLyBDcmVhdGUgVlBDIGVuZHBvaW50cyBmb3IgQVdTIHNlcnZpY2VzXG4gICAgICAvLyBTU00sIFNTTSBNZXNzYWdlcywgYW5kIEVDMiBNZXNzYWdlcyBhcmUgaW50ZXJmYWNlIGVuZHBvaW50c1xuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NzbUVuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNTTSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU3NtTWVzc2FnZXNFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TU01fTUVTU0FHRVMsXG4gICAgICB9KTtcblxuICAgICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0VjMk1lc3NhZ2VzRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUMyX01FU1NBR0VTLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEludGVyZmFjZSBlbmRwb2ludHMgZm9yIFNRUyBhbmQgQ2xvdWRXYXRjaCBMb2dzXG4gICAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU3FzRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU1FTLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdDbG91ZFdhdGNoTG9nc0VuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkNMT1VEV0FUQ0hfTE9HUyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTZWN1cml0eSBncm91cDogZWdyZXNzIG9ubHkgdG8gVlBDIGVuZHBvaW50c1xuICAgICAgc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnV29ya2VyU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3Igd29ya2VyIGluc3RhbmNlJyxcbiAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsIC8vIEV4cGxpY2l0bHkgY29udHJvbCBlZ3Jlc3NcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBbGxvdyBIVFRQUyBlZ3Jlc3MgdG8gVlBDIGVuZHBvaW50cyAoZm9yIGludGVyZmFjZSBlbmRwb2ludHMpXG4gICAgICBzZWN1cml0eUdyb3VwLmFkZEVncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLmlwdjQodGhpcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAgICdBbGxvdyBIVFRQUyB0byBWUEMgZW5kcG9pbnRzJ1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUHVibGljIG1vZGU6IHVzZSBkZWZhdWx0IFZQQ1xuICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBhY2NvdW50L3JlZ2lvbiAocmVxdWlyZWQgZm9yIFZQQyBsb29rdXApXG4gICAgICBjb25zdCBzdGFjayA9IFN0YWNrLm9mKHRoaXMpO1xuICAgICAgaWYgKFRva2VuLmlzVW5yZXNvbHZlZChzdGFjay5hY2NvdW50KSB8fCBUb2tlbi5pc1VucmVzb2x2ZWQoc3RhY2sucmVnaW9uKSkge1xuICAgICAgICAvLyBEdXJpbmcgc3ludGggd2l0aG91dCBhY2NvdW50L3JlZ2lvbiwgY3JlYXRlIGEgbWluaW1hbCBWUENcbiAgICAgICAgLy8gVGhpcyB3aWxsIGJlIHJlcGxhY2VkIHdpdGggdGhlIGFjdHVhbCBkZWZhdWx0IFZQQyBsb29rdXAgZHVyaW5nIGRlcGxveW1lbnRcbiAgICAgICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnRGVmYXVsdFZwYycsIHtcbiAgICAgICAgICBtYXhBenM6IDIsXG4gICAgICAgICAgbmF0R2F0ZXdheXM6IDAsXG4gICAgICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgICB2cGMgPSB0aGlzLnZwYztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFdlIGhhdmUgYWNjb3VudC9yZWdpb24sIGNhbiBkbyB0aGUgbG9va3VwXG4gICAgICAgIHZwYyA9IGVjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnRGVmYXVsdFZwYycsIHtcbiAgICAgICAgICBpc0RlZmF1bHQ6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBzdWJuZXRTZWxlY3Rpb24gPSB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyB9O1xuXG4gICAgICAvLyBTZWN1cml0eSBncm91cDogbm8gaW5ib3VuZCwgb3V0Ym91bmQgSFRUUFMgb25seVxuICAgICAgc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnV29ya2VyU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgICAgdnBjOiB2cGMsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIHdvcmtlciBpbnN0YW5jZScsXG4gICAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgICAgfSk7XG5cbiAgICAgIHNlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICAgJ0FsbG93IEhUVFBTIG91dGJvdW5kJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLnNlY3VyaXR5R3JvdXAgPSBzZWN1cml0eUdyb3VwO1xuXG4gICAgLy8gQ3JlYXRlIElBTSByb2xlIGZvciB0aGUgd29ya2VyXG4gICAgY29uc3Qgd29ya2VyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlYzIuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBpbmxpbmUgcG9saWN5IGZvciBTUVMgYW5kIER5bmFtb0RCIGFjY2Vzc1xuICAgIHdvcmtlclJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzcXM6UmVjZWl2ZU1lc3NhZ2UnLFxuICAgICAgICAgICdzcXM6RGVsZXRlTWVzc2FnZScsXG4gICAgICAgICAgJ3NxczpDaGFuZ2VNZXNzYWdlVmlzaWJpbGl0eScsXG4gICAgICAgICAgJ3NxczpHZXRRdWV1ZUF0dHJpYnV0ZXMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5pbmZlcmVuY2VRdWV1ZS5xdWV1ZUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB3b3JrZXJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnc3FzOlNlbmRNZXNzYWdlJ10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLm1lc3NhZ2luZ1F1ZXVlLnF1ZXVlQXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHdvcmtlclJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpQdXRJdGVtJywgJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6VXBkYXRlSXRlbSddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5kZWR1cFRhYmxlLnRhYmxlQXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBpbnN0YW5jZSBwcm9maWxlXG4gICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5JbnN0YW5jZVByb2ZpbGUodGhpcywgJ1dvcmtlckluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgIHJvbGU6IHdvcmtlclJvbGUsXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIGRhdGEgc2NyaXB0XG4gICAgY29uc3QgdXNlckRhdGEgPSBlYzIuVXNlckRhdGEuZm9yTGludXgoKTtcbiAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICcjIS9iaW4vYmFzaCcsXG4gICAgICAnc2V0IC1lJyxcbiAgICAgICdleGVjID4gPih0ZWUgL3Zhci9sb2cvdXNlci1kYXRhLmxvZ3xsb2dnZXIgLXQgdXNlci1kYXRhIC1zIDI+L2Rldi9jb25zb2xlKSAyPiYxJyxcbiAgICAgICcnLFxuICAgICAgJyMgSW5zdGFsbCBqcScsXG4gICAgICAneXVtIHVwZGF0ZSAteScsXG4gICAgICAneXVtIGluc3RhbGwgLXkganEnLFxuICAgICAgJycsXG4gICAgICAnIyBDcmVhdGUgcGxhY2Vob2xkZXIgc3lzdGVtZCBzZXJ2aWNlJyxcbiAgICAgICdjYXQgPiAvZXRjL3N5c3RlbWQvc3lzdGVtL3N5cnVzLXdvcmtlci5zZXJ2aWNlIDw8IFxcJ0VPRlxcJycsXG4gICAgICAnW1VuaXRdJyxcbiAgICAgICdEZXNjcmlwdGlvbj1TeXJ1cyBXb3JrZXIgU2VydmljZScsXG4gICAgICAnQWZ0ZXI9bmV0d29yay50YXJnZXQnLFxuICAgICAgJycsXG4gICAgICAnW1NlcnZpY2VdJyxcbiAgICAgICdUeXBlPXNpbXBsZScsXG4gICAgICAnIyBUaGlzIGlzIGEgcGxhY2Vob2xkZXIgc2VydmljZSB0aGF0IHdpbGwgbGF0ZXIgY29uc3VtZSBTUVMgbWVzc2FnZXMnLFxuICAgICAgJyMgRGVkdXAga2V5cyB3aWxsIGJlIHdyaXR0ZW4gdG8gRHluYW1vREInLFxuICAgICAgJyMgTWVzc2FnZXMgd2lsbCBiZSBmb3J3YXJkZWQgdG8gYW5vdGhlciBxdWV1ZScsXG4gICAgICAnRXhlY1N0YXJ0PS9iaW4vdHJ1ZScsXG4gICAgICAnUmVzdGFydD1hbHdheXMnLFxuICAgICAgJ1Jlc3RhcnRTZWM9MTAnLFxuICAgICAgJycsXG4gICAgICAnW0luc3RhbGxdJyxcbiAgICAgICdXYW50ZWRCeT1tdWx0aS11c2VyLnRhcmdldCcsXG4gICAgICAnRU9GJyxcbiAgICAgICcnLFxuICAgICAgJyMgRW5hYmxlIGFuZCBzdGFydCB0aGUgc2VydmljZScsXG4gICAgICAnc3lzdGVtY3RsIGRhZW1vbi1yZWxvYWQnLFxuICAgICAgJ3N5c3RlbWN0bCBlbmFibGUgc3lydXMtd29ya2VyLnNlcnZpY2UnLFxuICAgICAgJ3N5c3RlbWN0bCBzdGFydCBzeXJ1cy13b3JrZXIuc2VydmljZScsXG4gICAgICAnJyxcbiAgICAgICdlY2hvIFwiVXNlciBkYXRhIHNjcmlwdCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5XCInXG4gICAgKTtcblxuICAgIC8vIEdldCBsYXRlc3QgQW1hem9uIExpbnV4IDIwMjMgQU1JXG4gICAgY29uc3QgYW1pID0gZWMyLk1hY2hpbmVJbWFnZS5sYXRlc3RBbWF6b25MaW51eDIwMjMoe1xuICAgICAgY3B1VHlwZTogZWMyLkFtYXpvbkxpbnV4Q3B1VHlwZS5YODZfNjQsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUMyIGluc3RhbmNlXG4gICAgdGhpcy5pbnN0YW5jZSA9IG5ldyBlYzIuSW5zdGFuY2UodGhpcywgJ1dvcmtlckluc3RhbmNlJywge1xuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKSxcbiAgICAgIG1hY2hpbmVJbWFnZTogYW1pLFxuICAgICAgdnBjOiB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiBzdWJuZXRTZWxlY3Rpb24sXG4gICAgICBzZWN1cml0eUdyb3VwOiBzZWN1cml0eUdyb3VwLFxuICAgICAgcm9sZTogd29ya2VyUm9sZSxcbiAgICAgIHVzZXJEYXRhOiB1c2VyRGF0YSxcbiAgICAgIGJsb2NrRGV2aWNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGV2aWNlTmFtZTogJy9kZXYveHZkYScsXG4gICAgICAgICAgdm9sdW1lOiBlYzIuQmxvY2tEZXZpY2VWb2x1bWUuZWJzKDE2LCB7XG4gICAgICAgICAgICB2b2x1bWVUeXBlOiBlYzIuRWJzRGV2aWNlVm9sdW1lVHlwZS5HUDMsXG4gICAgICAgICAgICBlbmNyeXB0ZWQ6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgLy8gTm8gU1NIIGtleXBhaXIgLSBhY2Nlc3MgdmlhIFNTTSBvbmx5XG4gICAgICByZXF1aXJlSW1kc3YyOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQXBwbHkgcmVtb3ZhbCBwb2xpY3lcbiAgICBpZiAocHJvcHMucmVtb3ZhbFBvbGljeSA9PT0gUmVtb3ZhbFBvbGljeS5ERVNUUk9ZKSB7XG4gICAgICB0aGlzLmluc3RhbmNlLmFwcGx5UmVtb3ZhbFBvbGljeShSZW1vdmFsUG9saWN5LkRFU1RST1kpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmluc3RhbmNlLmFwcGx5UmVtb3ZhbFBvbGljeShSZW1vdmFsUG9saWN5LlJFVEFJTik7XG4gICAgfVxuXG4gICAgLy8gQWRkIHRhZ3NcbiAgICBUYWdzLm9mKHRoaXMuaW5zdGFuY2UpLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih0aGlzLmluc3RhbmNlKS5hZGQoJ1NlcnZpY2UnLCAnV2hhdHNBcHBCb3QnKTtcbiAgICBUYWdzLm9mKHRoaXMuaW5zdGFuY2UpLmFkZCgnU3RhZ2UnLCBwcm9wcy5zdGFnZSk7XG4gICAgVGFncy5vZih0aGlzLmluc3RhbmNlKS5hZGQoJ05hbWUnLCBgc3lydXMtd29ya2VyLSR7cHJvcHMuc3RhZ2V9YCk7XG5cbiAgICBUYWdzLm9mKHdvcmtlclJvbGUpLmFkZCgnQXBwJywgJ1N5cnVzJyk7XG4gICAgVGFncy5vZih3b3JrZXJSb2xlKS5hZGQoJ1NlcnZpY2UnLCAnV2hhdHNBcHBCb3QnKTtcbiAgICBUYWdzLm9mKHdvcmtlclJvbGUpLmFkZCgnU3RhZ2UnLCBwcm9wcy5zdGFnZSk7XG4gIH1cbn1cbiJdfQ==