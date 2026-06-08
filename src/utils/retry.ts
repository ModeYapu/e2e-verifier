import { RetryStrategy, ExecutionStatus, FailureClassification, FailureCategory } from '../types';
import { isRetryableStatus, calculateRetryDelay } from '../config/execution-config';

/**
 * Classify an error to determine if it's retryable
 * Environment/infrastructure errors are retryable
 * Business logic failures are not retryable
 */
export function classifyError(error: Error | { code?: string; status?: number; message?: string }): FailureClassification {
  const errorMessage = (error instanceof Error ? error.message : error.message || String(error))?.toLowerCase() || '';
  const errorCode = (error as any).code?.toLowerCase() || '';
  const statusCode = (error as any).status;

  // Infrastructure/Network errors - retryable
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('network') ||
    errorCode === 'etimedout' ||
    errorCode === 'econnrefused' ||
    errorCode === 'econnreset' ||
    errorCode === 'enotfound' ||
    statusCode === 408 || // Request Timeout
    statusCode === 502 || // Bad Gateway
    statusCode === 503 || // Service Unavailable
    statusCode === 504 || // Gateway Timeout
    statusCode === 429 // Too Many Requests
  ) {
    return {
      isRetryable: true,
      category: 'infrastructure',
      reason: `Network/infrastructure error: ${error.message || errorCode}`
    };
  }

  // Environment errors - retryable
  if (
    errorMessage.includes('browser') ||
    errorMessage.includes('chrome') ||
    errorMessage.includes('playwright') ||
    errorMessage.includes('context') ||
    errorMessage.includes('target closed')
  ) {
    return {
      isRetryable: true,
      category: 'environment',
      reason: `Browser environment error: ${error.message}`
    };
  }

  // Business/Assertion failures - not retryable
  if (
    errorMessage.includes('assertion') ||
    errorMessage.includes('expected') ||
    (errorMessage.includes('not found') === false && errorMessage.includes('element'))
  ) {
    return {
      isRetryable: false,
      category: 'business',
      reason: `Business logic failure: ${error.message}`
    };
  }

  // Test errors - not retryable
  if (
    errorMessage.includes('test') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('configuration')
  ) {
    return {
      isRetryable: false,
      category: 'test',
      reason: `Test configuration error: ${error.message}`
    };
  }

  // Unknown - default to not retryable for safety
  return {
    isRetryable: false,
    category: 'unknown',
    reason: `Unknown error: ${error.message || 'No message'}`
  };
}

/**
 * Determine if a result status should trigger a retry
 */
export function shouldRetry(
  status: ExecutionStatus,
  attempt: number,
  strategy: RetryStrategy
): boolean {
  if (attempt >= strategy.maxRetries) {
    return false;
  }
  return isRetryableStatus(status, strategy);
}

/**
 * Retry wrapper with exponential backoff
 * Retries only on infrastructure/environment errors, not on business failures
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  strategy: RetryStrategy = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, backoffMultiplier: 2, retryableStatuses: ['infra_failed', 'flaky'] }
): Promise<T> {
  let lastError: Error | undefined;
  let lastClassification: FailureClassification | undefined;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      lastClassification = classifyError(lastError);

      if (attempt === strategy.maxRetries || !lastClassification.isRetryable) {
        // Not retryable or max retries reached
        throw error;
      }

      const delay = calculateRetryDelay(attempt, strategy);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Retry with custom predicate for retry control
 */
export async function retryWithPredicate<T>(
  fn: () => Promise<T>,
  shouldRetryFunc: (error: Error, attempt: number) => boolean,
  strategy: RetryStrategy = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, backoffMultiplier: 2, retryableStatuses: ['infra_failed', 'flaky'] }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === strategy.maxRetries || !shouldRetryFunc(lastError, attempt)) {
        throw lastError;
      }

      const delay = calculateRetryDelay(attempt, strategy);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Get execution status from error classification
 */
export function statusFromError(error: Error): ExecutionStatus {
  const classification = classifyError(error);

  switch (classification.category) {
    case 'infrastructure':
    case 'environment':
      return 'infra_failed';
    case 'business':
      return 'assertion_failed';
    case 'test':
      return 'failed';
    default:
      return 'failed';
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry result class for tracking retry attempts
 */
export class RetryResult<T> {
  constructor(
    public value: T | null,
    public success: boolean,
    public attempts: number,
    public error?: Error,
    public classification?: FailureClassification
  ) {}
}

/**
 * Retry with detailed result tracking
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  strategy: RetryStrategy
): Promise<RetryResult<T>> {
  let lastError: Error | undefined;
  let lastClassification: FailureClassification | undefined;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    try {
      const value = await fn();
      return new RetryResult(value, true, attempt + 1);
    } catch (error) {
      lastError = error as Error;
      lastClassification = classifyError(lastError);

      if (attempt === strategy.maxRetries || !lastClassification.isRetryable) {
        return new RetryResult(null, false, attempt + 1, lastError, lastClassification);
      }

      const delay = calculateRetryDelay(attempt, strategy);
      await sleep(delay);
    }
  }

  return new RetryResult(null, false, strategy.maxRetries + 1, lastError, lastClassification);
}
