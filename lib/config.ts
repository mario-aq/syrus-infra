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
export const STAGE_CONFIGS: Record<string, StageConfig> = {
  dev: {
    stage: 'dev',
    removalPolicy: RemovalPolicy.DESTROY,
    tableCapacity: {
      readCapacity: 1,
      writeCapacity: 1,
    },
    gsiCapacity: {
      readCapacity: 1,
      writeCapacity: 1,
    },
  },
  prod: {
    stage: 'prod',
    removalPolicy: RemovalPolicy.RETAIN,
    tableCapacity: {
      readCapacity: 1,
      writeCapacity: 1,
    },
    gsiCapacity: {
      readCapacity: 1,
      writeCapacity: 1,
    },
  },
};

/**
 * Get stage config by stage name, defaults to dev if not found
 */
export function getStageConfig(stage: string): StageConfig {
  return STAGE_CONFIGS[stage] || STAGE_CONFIGS.dev;
}
