import { ExecutionConfig, RetryStrategy, TimeoutConfig, ArtifactDirectoryStructure, ExecutionStatus } from '../types';

/**
 * Default retry strategy for E2E execution
 * - Environment errors (infra_failed) are retryable
 * - Business failures (assertion_failed) are not retryable
 */
export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: ['infra_failed', 'flaky']
};

/**
 * Default timeout configuration for different operation types
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  navigation: 30000, // 30 seconds for page navigation
  elementWait: 10000, // 10 seconds for element to appear
  assertion: 5000, // 5 seconds for assertion checks
  screenshot: 15000, // 15 seconds for screenshot capture
  custom: 10000, // 10 seconds for custom actions
  pageLoad: 60000 // 60 seconds for full page load
};

/**
 * Standard artifact directory structure
 * Artifacts are organized under a root directory with subdirectories by type
 */
export const DEFAULT_ARTIFACT_DIRECTORIES: ArtifactDirectoryStructure = {
  root: 'artifacts',
  screenshots: 'artifacts/screenshots',
  traces: 'artifacts/traces',
  console: 'artifacts/console',
  network: 'artifacts/network',
  dom: 'artifacts/dom',
  videos: 'artifacts/videos'
};

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  retryStrategy: DEFAULT_RETRY_STRATEGY,
  timeouts: DEFAULT_TIMEOUTS,
  artifactDirectories: DEFAULT_ARTIFACT_DIRECTORIES,
  maxConcurrentTasks: 3,
  enableTrace: true,
  enableVideo: false
};

/**
 * Get execution config with overrides
 */
export function getExecutionConfig(overrides?: Partial<ExecutionConfig>): ExecutionConfig {
  return {
    ...DEFAULT_EXECUTION_CONFIG,
    ...overrides,
    retryStrategy: {
      ...DEFAULT_EXECUTION_CONFIG.retryStrategy,
      ...(overrides?.retryStrategy || {})
    },
    timeouts: {
      ...DEFAULT_EXECUTION_CONFIG.timeouts,
      ...(overrides?.timeouts || {})
    },
    artifactDirectories: {
      ...DEFAULT_EXECUTION_CONFIG.artifactDirectories,
      ...(overrides?.artifactDirectories || {})
    }
  };
}

/**
 * Get timeout for a specific operation type
 */
export function getTimeout(config: ExecutionConfig, operation: keyof TimeoutConfig): number {
  return config.timeouts[operation] || DEFAULT_TIMEOUTS[operation];
}

/**
 * Check if a status is retryable based on the retry strategy
 */
export function isRetryableStatus(status: ExecutionStatus, strategy: RetryStrategy): boolean {
  return strategy.retryableStatuses.includes(status);
}

/**
 * Calculate delay for a specific retry attempt with exponential backoff
 */
export function calculateRetryDelay(attempt: number, strategy: RetryStrategy): number {
  const delay = Math.min(
    strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt),
    strategy.maxDelay
  );
  return Math.floor(delay);
}
