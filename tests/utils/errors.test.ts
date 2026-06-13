/**
 * AppError unit tests
 *
 * Tests the unified error classification system including:
 * - AppError construction with all options
 * - isAppError type guard
 * - fromUnknown error conversion
 * - ErrorCode to statusCode mappings
 */

import {
  AppError,
  ErrorCode,
  isAppError,
  fromUnknown,
  BaseError,
  InfrastructureError,
  PageError,
  AssertionError,
  TimeoutError,
  ValidationError,
  isInfrastructureError,
  isPageError,
  isAssertionError,
  isTimeoutError,
  isValidationError,
  getErrorCategory,
  serializeError,
} from '../../src/utils/errors';

describe('AppError', () => {
  describe('construction', () => {
    test('should create AppError with required parameters', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('AppError');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400); // Default for VALIDATION_ERROR
      expect(error.timestamp).toBeDefined();
      expect(typeof error.timestamp).toBe('string');
    });

    test('should accept custom statusCode', () => {
      const error = new AppError(ErrorCode.NOT_FOUND, 'Resource missing', {
        statusCode: 404,
      });

      expect(error.statusCode).toBe(404);
    });

    test('should accept details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Validation failed', {
        details,
      });

      expect(error.details).toEqual(details);
    });

    test('should accept cause', () => {
      const cause = new Error('Original error');
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Wrapped error', {
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    test('should accept all options together', () => {
      const details = { userId: 123 };
      const cause = new Error('Database connection failed');
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to save user', {
        statusCode: 500,
        details,
        cause,
      });

      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe('Failed to save user');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual(details);
      expect(error.cause).toBe(cause);
      expect(error.timestamp).toBeDefined();
    });

    test('should maintain proper stack trace', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('toJSON', () => {
    test('should serialize error to JSON without cause', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', {
        details: { field: 'email' },
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'AppError',
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
        statusCode: 400,
        details: { field: 'email' },
        timestamp: error.timestamp,
      });
    });

    test('should include cause when present', () => {
      const cause = new Error('Original error');
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Wrapped error', {
        cause,
      });

      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'AppError',
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Wrapped error',
        cause,
      });
      expect(json.timestamp).toBeDefined();
    });

    test('should handle undefined details', () => {
      const error = new AppError(ErrorCode.NOT_FOUND, 'Not found');

      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });
  });
});

describe('isAppError', () => {
  test('should return true for AppError instances', () => {
    const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Test error');

    expect(isAppError(error)).toBe(true);
  });

  test('should return false for plain Error', () => {
    const error = new Error('Plain error');

    expect(isAppError(error)).toBe(false);
  });

  test('should return false for non-Error objects', () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError('string')).toBe(false);
    expect(isAppError({})).toBe(false);
    expect(isAppError(123)).toBe(false);
  });

  test('should return false for other error types', () => {
    const baseError = new BaseError('Test', 'TEST_CODE');
    const infraError = new InfrastructureError('Test');

    expect(isAppError(baseError)).toBe(false);
    expect(isAppError(infraError)).toBe(false);
  });
});

describe('fromUnknown', () => {
  test('should return AppError as-is', () => {
    const original = new AppError(ErrorCode.VALIDATION_ERROR, 'Original error');
    const result = fromUnknown(original);

    expect(result).toBe(original);
    expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.message).toBe('Original error');
  });

  test('should wrap Error instance with INTERNAL_ERROR by default', () => {
    const original = new Error('Original error message');
    const result = fromUnknown(original);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('Original error message');
    expect(result.cause).toBe(original);
  });

  test('should wrap Error instance with custom ErrorCode', () => {
    const original = new Error('Network failed');
    const result = fromUnknown(original, ErrorCode.NETWORK_ERROR);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(result.message).toBe('Network failed');
    expect(result.cause).toBe(original);
  });

  test('should convert string to AppError', () => {
    const result = fromUnknown('String error');

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('String error');
  });

  test('should convert number to AppError', () => {
    const result = fromUnknown(404);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('404');
  });

  test('should convert empty string to default message', () => {
    const result = fromUnknown('');

    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Unknown error');
  });

  test('should handle null', () => {
    const result = fromUnknown(null);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('null');
  });

  test('should handle undefined', () => {
    const result = fromUnknown(undefined);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('undefined');
  });

  test('should convert object to string', () => {
    const obj = { error: 'details', code: 500 };
    const result = fromUnknown(obj);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).toBe('[object Object]');
  });
});

describe('ErrorCode default status codes', () => {
  const expectedStatusCodes: Record<ErrorCode, number> = {
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.TIMEOUT]: 408,
    [ErrorCode.BROWSER_ERROR]: 500,
    [ErrorCode.NETWORK_ERROR]: 502,
    [ErrorCode.STORAGE_ERROR]: 500,
    [ErrorCode.CONFIG_ERROR]: 500,
    [ErrorCode.EXECUTION_ERROR]: 500,
    [ErrorCode.RATE_LIMIT_ERROR]: 429,
    [ErrorCode.INTERNAL_ERROR]: 500,
  };

  test.each(Object.entries(expectedStatusCodes))(
    'ErrorCode.%s should map to status %d',
    (codeStr, expectedStatus) => {
      const code = codeStr as ErrorCode;
      const error = new AppError(code, 'Test message');

      expect(error.statusCode).toBe(expectedStatus);
    }
  );

  test('should allow overriding default status code', () => {
    const error = new AppError(ErrorCode.NOT_FOUND, 'Not found', {
      statusCode: 410, // Gone instead of 404
    });

    expect(error.statusCode).toBe(410);
  });
});

describe('Legacy BaseError class', () => {
  test('should create BaseError with code and context', () => {
    const context = { userId: 123 };
    const error = new BaseError('Test error', 'TEST_CODE', context);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BaseError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual(context);
  });

  test('should handle undefined context', () => {
    const error = new BaseError('Test error', 'TEST_CODE');

    expect(error.context).toBeUndefined();
  });

  test('should serialize to JSON', () => {
    const context = { field: 'email' };
    const error = new BaseError('Validation failed', 'VAL_ERROR', context);

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'BaseError',
      code: 'VAL_ERROR',
      message: 'Validation failed',
      context,
    });
  });
});

describe('InfrastructureError', () => {
  test('should create InfrastructureError', () => {
    const error = new InfrastructureError('Service unavailable', { service: 'api' });

    expect(error.code).toBe('INFRASTRUCTURE_ERROR');
    expect(error.message).toBe('Service unavailable');
    expect(error.context).toEqual({ service: 'api' });
  });

  test('should create apiFailure error', () => {
    const error = InfrastructureError.apiFailure('GitHub', 503, 'Service Unavailable');

    expect(error.code).toBe('INFRASTRUCTURE_ERROR');
    expect(error.message).toBe('GitHub API error: Service Unavailable');
    expect(error.context).toEqual({
      service: 'GitHub',
      status: 503,
      statusText: 'Service Unavailable',
    });
  });

  test('should create apiFailure without statusText', () => {
    const error = InfrastructureError.apiFailure('GitHub', 503);

    expect(error.message).toBe('GitHub API error');
  });

  test('should create providerUnavailable error', () => {
    const error = InfrastructureError.providerUnavailable('OpenAI');

    expect(error.message).toBe('Provider unavailable: OpenAI');
    expect(error.context?.provider).toBe('OpenAI');
  });

  test('should create configurationError error', () => {
    const error = InfrastructureError.configurationError('API_KEY', 'Check your .env file');

    expect(error.message).toBe('Configuration error: API_KEY (Check your .env file)');
    expect(error.context).toEqual({
      key: 'API_KEY',
      hint: 'Check your .env file',
    });
  });
});

describe('PageError', () => {
  test('should create PageError', () => {
    const error = new PageError('Element not found', { selector: '#missing' });

    expect(error.code).toBe('PAGE_ERROR');
    expect(error.message).toBe('Element not found');
  });

  test('should create pageNotInitialized error', () => {
    const error = PageError.pageNotInitialized();

    expect(error.message).toBe('Page not initialized. Call verify() or initialize browser first.');
  });

  test('should create elementNotFound error', () => {
    const error = PageError.elementNotFound('.missing-class');

    expect(error.message).toBe('Element not found: .missing-class');
    expect(error.context?.selector).toBe('.missing-class');
  });

  test('should create navigationFailed error', () => {
    const error = PageError.navigationFailed('https://example.com', 'timeout');

    expect(error.message).toBe('Navigation failed: https://example.com (timeout)');
    expect(error.context).toEqual({
      url: 'https://example.com',
      reason: 'timeout',
    });
  });
});

describe('AssertionError', () => {
  test('should create AssertionError', () => {
    const error = new AssertionError('Test failed', { check: 'text-content' });

    expect(error.code).toBe('ASSERTION_ERROR');
    expect(error.message).toBe('Test failed');
  });

  test('should create textMismatch error', () => {
    const error = AssertionError.textMismatch('#title', 'Expected', 'Actual');

    expect(error.message).toBe('Text mismatch at #title: expected "Expected", got "Actual"');
    expect(error.context).toEqual({
      selector: '#title',
      expected: 'Expected',
      actual: 'Actual',
    });
  });

  test('should create textMismatch error without actual', () => {
    const error = AssertionError.textMismatch('#missing', 'Expected');

    expect(error.message).toBe('Text mismatch at #missing: expected "Expected", got "not found"');
    expect(error.context?.actual).toBeUndefined();
  });

  test('should create attributeMismatch error', () => {
    const error = AssertionError.attributeMismatch('#input', 'value', 'test', 'prod');

    expect(error.message).toBe('Attribute mismatch at #input: value="test", got "prod"');
    expect(error.context).toEqual({
      selector: '#input',
      attribute: 'value',
      expected: 'test',
      actual: 'prod',
    });
  });

  test('should create valueMismatch error', () => {
    const error = AssertionError.valueMismatch('response.code', '200', '500');

    expect(error.message).toBe('Value mismatch: response.code expected "200", got "500"');
    expect(error.context).toEqual({
      field: 'response.code',
      expected: '200',
      actual: '500',
    });
  });

  test('should create loginFailed error', () => {
    const context = { username: 'test@example.com' };
    const error = AssertionError.loginFailed('Invalid credentials', context);

    expect(error.message).toBe('Login verification failed: Invalid credentials');
    expect(error.context).toEqual(context);
  });
});

describe('TimeoutError', () => {
  test('should create TimeoutError', () => {
    const error = new TimeoutError('Operation timed out', 5000);

    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.message).toBe('Operation timed out');
    expect(error.timeout).toBe(5000);
    expect(error.context?.timeout).toBe(5000);
  });

  test('should create requestTimeout error', () => {
    const error = TimeoutError.requestTimeout('fetchData', 10000);

    expect(error.message).toBe('Request timeout: fetchData exceeded 10000ms');
    expect(error.timeout).toBe(10000);
    expect(error.context?.operation).toBe('fetchData');
  });

  test('should create pageLoadTimeout error', () => {
    const error = TimeoutError.pageLoadTimeout('https://example.com', 30000);

    expect(error.message).toBe('Page load timeout: https://example.com exceeded 30000ms');
    expect(error.timeout).toBe(30000);
    expect(error.context?.url).toBe('https://example.com');
  });

  test('should create scriptExecutionTimeout error', () => {
    const longScript = 'a'.repeat(200);
    const error = TimeoutError.scriptExecutionTimeout(longScript, 5000);

    expect(error.message).toContain('Script execution timeout:');
    expect(error.message).toContain('exceeded 5000ms');
    expect(error.timeout).toBe(5000);
    expect((error.context?.script as string).length).toBeLessThan(105);
  });
});

describe('ValidationError', () => {
  test('should create ValidationError', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
  });

  test('should create missingField error with single field', () => {
    const error = ValidationError.missingField('email');

    expect(error.message).toBe('Missing required field(s): email');
    expect(error.context?.field).toBe('email');
  });

  test('should create missingField error with multiple fields', () => {
    const error = ValidationError.missingField(['email', 'password', 'name']);

    expect(error.message).toBe('Missing required field(s): email, password, name');
    expect(error.context?.field).toEqual(['email', 'password', 'name']);
  });

  test('should create invalidValue error', () => {
    const error = ValidationError.invalidValue('port', -1, 'positive integer');

    expect(error.message).toBe('Invalid value for port: -1. Expected: positive integer');
    expect(error.context).toEqual({
      field: 'port',
      value: -1,
      expected: 'positive integer',
    });
  });

  test('should create invalidValue error without expected', () => {
    const error = ValidationError.invalidValue('count', NaN);

    expect(error.message).toBe('Invalid value for count: null');
  });
});

describe('Type guards for legacy error classes', () => {
  test('isInfrastructureError should identify InfrastructureError', () => {
    const error = new InfrastructureError('Test');

    expect(isInfrastructureError(error)).toBe(true);
    expect(isPageError(error)).toBe(false);
    expect(isAssertionError(error)).toBe(false);
  });

  test('isPageError should identify PageError', () => {
    const error = new PageError('Test');

    expect(isPageError(error)).toBe(true);
    expect(isInfrastructureError(error)).toBe(false);
  });

  test('isAssertionError should identify AssertionError', () => {
    const error = new AssertionError('Test');

    expect(isAssertionError(error)).toBe(true);
    expect(isPageError(error)).toBe(false);
  });

  test('isTimeoutError should identify TimeoutError', () => {
    const error = new TimeoutError('Test', 5000);

    expect(isTimeoutError(error)).toBe(true);
    expect(isValidationError(error)).toBe(false);
  });

  test('isValidationError should identify ValidationError', () => {
    const error = new ValidationError('Test');

    expect(isValidationError(error)).toBe(true);
    expect(isTimeoutError(error)).toBe(false);
  });

  test('all type guards should return false for plain Error', () => {
    const error = new Error('Plain error');

    expect(isInfrastructureError(error)).toBe(false);
    expect(isPageError(error)).toBe(false);
    expect(isAssertionError(error)).toBe(false);
    expect(isTimeoutError(error)).toBe(false);
    expect(isValidationError(error)).toBe(false);
  });
});

describe('getErrorCategory', () => {
  test('should return infrastructure for InfrastructureError', () => {
    const error = new InfrastructureError('Test');

    expect(getErrorCategory(error)).toBe('infrastructure');
  });

  test('should return page for PageError', () => {
    const error = new PageError('Test');

    expect(getErrorCategory(error)).toBe('page');
  });

  test('should return assertion for AssertionError', () => {
    const error = new AssertionError('Test');

    expect(getErrorCategory(error)).toBe('assertion');
  });

  test('should return timeout for TimeoutError', () => {
    const error = new TimeoutError('Test', 5000);

    expect(getErrorCategory(error)).toBe('timeout');
  });

  test('should return validation for ValidationError', () => {
    const error = new ValidationError('Test');

    expect(getErrorCategory(error)).toBe('validation');
  });

  test('should return unknown for plain Error', () => {
    const error = new Error('Test');

    expect(getErrorCategory(error)).toBe('unknown');
  });

  test('should return unknown for non-Error objects', () => {
    expect(getErrorCategory(null)).toBe('unknown');
    expect(getErrorCategory('string')).toBe('unknown');
  });
});

describe('serializeError', () => {
  test('should serialize BaseError to JSON', () => {
    const error = new BaseError('Test error', 'TEST_CODE', { key: 'value' });
    const serialized = serializeError(error);

    expect(serialized).toEqual({
      name: 'BaseError',
      code: 'TEST_CODE',
      message: 'Test error',
      context: { key: 'value' },
    });
  });

  test('should serialize plain Error', () => {
    const error = new Error('Plain error');
    const serialized = serializeError(error);

    expect(serialized).toEqual({
      name: 'Error',
      message: 'Plain error',
      stack: error.stack,
    });
  });

  test('should serialize non-Error as message string', () => {
    const serialized = serializeError('String error');

    expect(serialized).toEqual({
      message: 'String error',
    });
  });

  test('should serialize null as message string', () => {
    const serialized = serializeError(null);

    expect(serialized).toEqual({
      message: 'null',
    });
  });
});
