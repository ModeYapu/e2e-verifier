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

/**
 * Validate server configuration
 * Throws AppError if configuration is invalid
 */
export function validateConfig(config: Record<string, unknown>): void {
  // Import AppError and ErrorCode here to avoid circular dependency
  const { AppError: ImportAppError, ErrorCode: ImportErrorCode } = require('../utils/errors');
  const AppError = ImportAppError;
  const ErrorCode = ImportErrorCode;

  // Validate port: must be integer 1-65535
  if ('port' in config) {
    const port = config.port;
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        `Invalid port: ${port}. Port must be an integer between 1 and 65535.`
      );
    }
  }

  // Validate sites: if present, must be array with each element having url
  if ('sites' in config) {
    const sites = config.sites;
    if (!Array.isArray(sites)) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        `Invalid sites: must be an array. Got: ${typeof sites}`
      );
    }
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      if (typeof site !== 'object' || site === null || !('url' in site)) {
        throw new AppError(
          ErrorCode.CONFIG_ERROR,
          `Invalid site at index ${i}: each site must have a 'url' property.`
        );
      }
    }
  }

  // Validate concurrency: if present, must be positive integer
  if ('concurrency' in config) {
    const concurrency = config.concurrency;
    if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        `Invalid concurrency: ${concurrency}. Concurrency must be a positive integer.`
      );
    }
  }

  // Validate timeout: if present, must be positive number
  if ('timeout' in config) {
    const timeout = config.timeout;
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        `Invalid timeout: ${timeout}. Timeout must be a positive number.`
      );
    }
  }
}
