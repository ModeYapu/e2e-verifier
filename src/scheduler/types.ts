/**
 * Scheduler Types for Job Queue System
 */

/**
 * Job types supported by the scheduler
 */
export type JobType = 'fast' | 'deep' | 'orchestrated' | 'matrix' | 'intelligent';

/**
 * Job status throughout lifecycle
 */
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Job priority levels (higher priority = executed first)
 */
export type JobPriority = 'high' | 'normal' | 'low';

/**
 * Configuration for different job types
 */
export interface JobConfig {
  // Common fields
  url?: string;
  name?: string;

  // Fast verify config
  fastVerify?: {
    url: string;
    name: string;
    checks?: string[];
    viewport?: { width: number; height: number };
    timeout?: number;
    expectedStatusCode?: number;
    screenshots?: string[];
    customChecks?: Array<{
      name: string;
      type: 'element' | 'text' | 'attribute' | 'javascript';
      selector?: string;
      expected?: string | boolean;
      script?: string;
    }>;
  };

  // Deep verify config
  deepVerify?: {
    url: string;
    task: string;
    model?: string;
    maxSteps?: number;
    temperature?: number;
  };

  // Orchestrated verify config
  orchestratedVerify?: {
    sites: Array<{
      name: string;
      url: string;
      expectedStatusCode?: number;
      viewport?: { width: number; height: number };
      timeout?: number;
      checks?: string[];
      auth?: {
        loginUrl?: string;
        username: string;
        password: string;
        verifySelector?: string;
        verifyText?: string;
        verifyAttribute?: {
          selector: string;
          attribute: string;
          value?: string;
        };
      };
    }>;
    strict?: boolean;
    model?: string;
    skipDeep?: boolean;
  };

  // Matrix verify config (future)
  matrixVerify?: {
    sites: Array<any>;
    browsers?: string[];
    viewports?: Array<{ name?: string; width: number; height: number }>;
    locales?: string[];
  };

  // Intelligent verify config (P2)
  intelligentVerify?: {
    target: {
      url: string;
      name?: string;
      description?: string;
      tags?: string[];
      priority?: 'high' | 'normal' | 'low';
    };
    options?: {
      useLLMPlanner?: boolean;
      useLLMEvaluator?: boolean;
      enableRepair?: boolean;
      maxRepairRounds?: number;
      outputDir?: string;
      verbose?: boolean;
      model?: string;
      maxScenarios?: number;
      maxSteps?: number;
    };
  };
}

/**
 * Main Job interface
 */
export interface Job {
  id: string; // UUID
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  config: JobConfig;
  result?: any; // TestResult | AgentResult | OrchestratedResult
  error?: string;
  progress?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  timeout?: number; // milliseconds
}

/**
 * Job filter for listing operations
 */
export interface JobFilter {
  status?: JobStatus;
  type?: JobType;
  priority?: JobPriority;
  limit?: number;
  offset?: number;
}

/**
 * Job statistics
 */
export interface JobStats {
  total: number;
  pending: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}