/**
 * Unified Error Classification
 *
 * Standardized error types for better error handling and reporting
 */

/**
 * Error code enumeration for categorizing all application errors
 */
export enum ErrorCode {
  /** Input validation failures */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Operation timeout */
  TIMEOUT = 'TIMEOUT',
  /** Browser-related errors */
  BROWSER_ERROR = 'BROWSER_ERROR',
  /** Network request failures */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Storage operation failures */
  STORAGE_ERROR = 'STORAGE_ERROR',
  /** Configuration errors */
  CONFIG_ERROR = 'CONFIG_ERROR',
  /** Execution failures */
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  /** Internal/unexpected errors */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Default status codes for each error code
 */
const DEFAULT_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.TIMEOUT]: 408,
  [ErrorCode.BROWSER_ERROR]: 500,
  [ErrorCode.NETWORK_ERROR]: 502,
  [ErrorCode.STORAGE_ERROR]: 500,
  [ErrorCode.CONFIG_ERROR]: 500,
  [ErrorCode.EXECUTION_ERROR]: 500,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

/**
 * Unified application error class with code, status code, and structured details
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly timestamp: string;
  readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = options?.statusCode ?? DEFAULT_STATUS_CODES[code];
    this.details = options?.details;
    this.timestamp = new Date().toISOString();
    this.cause = options?.cause;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      ...(this.cause && { cause: this.cause }),
    };
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert an unknown error to AppError
 * If already an AppError, returns as-is
 * If an Error, wraps in INTERNAL_ERROR with original message
 * Otherwise, converts to string and wraps in INTERNAL_ERROR
 */
export function fromUnknown(error: unknown, code: ErrorCode = ErrorCode.INTERNAL_ERROR): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(code, error.message, { cause: error });
  }

  const message = String(error);
  return new AppError(code, message || 'Unknown error');
}

/**
 * Legacy Base error class with code and context support
 * @deprecated Use AppError instead
 */
export class BaseError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
  }
}

/**
 * Infrastructure errors - system-level failures
 * Examples: API failures, provider errors, network issues
 */
export class InfrastructureError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INFRASTRUCTURE_ERROR', context);
  }

  static apiFailure(service: string, status?: number, statusText?: string): InfrastructureError {
    return new InfrastructureError(
      `${service} API error${statusText ? `: ${statusText}` : ''}`,
      { service, status, statusText }
    );
  }

  static providerUnavailable(provider: string): InfrastructureError {
    return new InfrastructureError(`Provider unavailable: ${provider}`, { provider });
  }

  static configurationError(key: string, hint?: string): InfrastructureError {
    return new InfrastructureError(
      `Configuration error: ${key}${hint ? ` (${hint})` : ''}`,
      { key, hint }
    );
  }
}

/**
 * Page errors - browser/page interaction failures
 * Examples: page not initialized, element not found, navigation failures
 */
export class PageError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PAGE_ERROR', context);
  }

  static pageNotInitialized(): PageError {
    return new PageError('Page not initialized. Call verify() or initialize browser first.');
  }

  static elementNotFound(selector: string): PageError {
    return new PageError(`Element not found: ${selector}`, { selector });
  }

  static navigationFailed(url: string, reason?: string): PageError {
    return new PageError(`Navigation failed: ${url}${reason ? ` (${reason})` : ''}`, { url, reason });
  }
}

/**
 * Assertion errors - verification failures
 * Examples: text mismatch, attribute check failures, value mismatches
 */
export class AssertionError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ASSERTION_ERROR', context);
  }

  static textMismatch(selector: string, expected: string, actual?: string): AssertionError {
    return new AssertionError(
      `Text mismatch at ${selector}: expected "${expected}", got "${actual || 'not found'}"`,
      { selector, expected, actual }
    );
  }

  static attributeMismatch(selector: string, attribute: string, expected: string, actual?: string): AssertionError {
    return new AssertionError(
      `Attribute mismatch at ${selector}: ${attribute}="${expected}", got "${actual || 'not found'}"`,
      { selector, attribute, expected, actual }
    );
  }

  static valueMismatch(field: string, expected: string, actual: string): AssertionError {
    return new AssertionError(
      `Value mismatch: ${field} expected "${expected}", got "${actual}"`,
      { field, expected, actual }
    );
  }

  static loginFailed(reason: string, context?: Record<string, unknown>): AssertionError {
    return new AssertionError(`Login verification failed: ${reason}`, context);
  }
}

/**
 * Timeout errors - operation timeouts
 * Examples: request timeouts, page load timeouts, script execution timeouts
 */
export class TimeoutError extends BaseError {
  public readonly timeout: number;

  constructor(message: string, timeout: number, context?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', { ...context, timeout });
    this.timeout = timeout;
  }

  static requestTimeout(operation: string, timeout: number): TimeoutError {
    return new TimeoutError(`Request timeout: ${operation} exceeded ${timeout}ms`, timeout, { operation });
  }

  static pageLoadTimeout(url: string, timeout: number): TimeoutError {
    return new TimeoutError(`Page load timeout: ${url} exceeded ${timeout}ms`, timeout, { url });
  }

  static scriptExecutionTimeout(script: string, timeout: number): TimeoutError {
    return new TimeoutError(
      `Script execution timeout: ${script.substring(0, 50)}... exceeded ${timeout}ms`,
      timeout,
      { script: script.substring(0, 100) }
    );
  }
}

/**
 * Validation errors - input validation failures
 * Examples: missing required fields, invalid values
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
  }

  static missingField(field: string | string[]): ValidationError {
    const fields = Array.isArray(field) ? field.join(', ') : field;
    return new ValidationError(`Missing required field(s): ${fields}`, { field });
  }

  static invalidValue(field: string, value: unknown, expected?: string): ValidationError {
    return new ValidationError(
      `Invalid value for ${field}: ${JSON.stringify(value)}${expected ? `. Expected: ${expected}` : ''}`,
      { field, value, expected }
    );
  }
}

/**
 * Type guard to check if an error is a specific error type
 */
export function isInfrastructureError(error: unknown): error is InfrastructureError {
  return error instanceof InfrastructureError;
}

export function isPageError(error: unknown): error is PageError {
  return error instanceof PageError;
}

export function isAssertionError(error: unknown): error is AssertionError {
  return error instanceof AssertionError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Get error category from unknown error
 */
export function getErrorCategory(error: unknown): string {
  if (isInfrastructureError(error)) return 'infrastructure';
  if (isPageError(error)) return 'page';
  if (isAssertionError(error)) return 'assertion';
  if (isTimeoutError(error)) return 'timeout';
  if (isValidationError(error)) return 'validation';
  return 'unknown';
}

/**
 * Convert error to serializable format
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof BaseError) {
    return error.toJSON();
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    message: String(error)
  };
}
