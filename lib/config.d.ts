import { RemovalPolicy } from 'aws-cdk-lib';
/**
 * Configuration for different deployment stages
 */
export interface StageConfig {
    /** Stage name (dev or prod) */
    stage: string;
    /** Removal policy for resources */
    removalPolicy: RemovalPolicy;
    /** Table capacity units (RCU/WCU) */
    tableCapacity: {
        readCapacity: number;
        writeCapacity: number;
    };
    /** GSI capacity units (RCU/WCU) */
    gsiCapacity: {
        readCapacity: number;
        writeCapacity: number;
    };
}
/**
 * Stage configurations for dev and prod environments
 */
export declare const STAGE_CONFIGS: Record<string, StageConfig>;
/**
 * Get stage config by stage name, defaults to dev if not found
 */
export declare function getStageConfig(stage: string): StageConfig;
