import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
interface SyrusMvpStackProps extends StackProps {
    stage: string;
}
export declare class SyrusMvpStack extends Stack {
    constructor(scope: Construct, id: string, props: SyrusMvpStackProps);
}
export {};
