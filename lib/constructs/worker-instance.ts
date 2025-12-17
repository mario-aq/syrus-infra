import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy, Tags, Stack, Token } from 'aws-cdk-lib';

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
export class WorkerInstance extends Construct {
  public readonly instance: ec2.Instance;
  public readonly vpc?: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: WorkerInstanceProps) {
    super(scope, id);

    let vpc: ec2.IVpc;
    let subnetSelection: ec2.SubnetSelection;
    let securityGroup: ec2.SecurityGroup;

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
      securityGroup.addEgressRule(
        ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
        ec2.Port.tcp(443),
        'Allow HTTPS to VPC endpoints'
      );
    } else {
      // Public mode: use default VPC
      // Check if we have account/region (required for VPC lookup)
      const stack = Stack.of(this);
      if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
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
      } else {
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

      securityGroup.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        'Allow HTTPS outbound'
      );
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
    workerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:ChangeMessageVisibility',
          'sqs:GetQueueAttributes',
        ],
        resources: [props.inferenceQueue.queueArn],
      })
    );

    workerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:SendMessage'],
        resources: [props.messagingQueue.queueArn],
      })
    );

    workerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:UpdateItem'],
        resources: [props.dedupTable.tableArn],
      })
    );

    // Create instance profile
    const instanceProfile = new iam.InstanceProfile(this, 'WorkerInstanceProfile', {
      role: workerRole,
    });

    // User data script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1',
      '',
      '# Install jq',
      'yum update -y',
      'yum install -y jq',
      '',
      '# Create placeholder systemd service',
      'cat > /etc/systemd/system/syrus-worker.service << \'EOF\'',
      '[Unit]',
      'Description=Syrus Worker Service',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      '# This is a placeholder service that will later consume SQS messages',
      '# Dedup keys will be written to DynamoDB',
      '# Messages will be forwarded to another queue',
      'ExecStart=/bin/true',
      'Restart=always',
      'RestartSec=10',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      '# Enable and start the service',
      'systemctl daemon-reload',
      'systemctl enable syrus-worker.service',
      'systemctl start syrus-worker.service',
      '',
      'echo "User data script completed successfully"'
    );

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
    if (props.removalPolicy === RemovalPolicy.DESTROY) {
      this.instance.applyRemovalPolicy(RemovalPolicy.DESTROY);
    } else {
      this.instance.applyRemovalPolicy(RemovalPolicy.RETAIN);
    }

    // Add tags
    Tags.of(this.instance).add('App', 'Syrus');
    Tags.of(this.instance).add('Service', 'DiscordBot');
    Tags.of(this.instance).add('Stage', props.stage);
    Tags.of(this.instance).add('Name', `syrus-worker-${props.stage}`);

    Tags.of(workerRole).add('App', 'Syrus');
    Tags.of(workerRole).add('Service', 'DiscordBot');
    Tags.of(workerRole).add('Stage', props.stage);
  }
}
