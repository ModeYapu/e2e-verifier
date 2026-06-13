/**
 * Execution config unit tests
 *
 * Tests the execution configuration:
 * - validateConfig with valid configs
 * - validateConfig with invalid configs (port bounds, sites format, concurrency, etc.)
 * - Default configurations
 * - getExecutionConfig with overrides
 * - getTimeout helper
 * - isRetryableStatus helper
 * - calculateRetryDelay helper
 */

import {
  validateConfig,
  getExecutionConfig,
  getTimeout,
  isRetryableStatus,
  calculateRetryDelay,
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_RETRY_STRATEGY,
  DEFAULT_TIMEOUTS,
  DEFAULT_ARTIFACT_DIRECTORIES,
} from '../../src/config/execution-config';
import { ExecutionConfig, RetryStrategy, ExecutionStatus } from '../../src/types';
import { ErrorCode } from '../../src/utils/errors';

describe('validateConfig', () => {
  describe('valid configurations', () => {
    test('should accept empty config', () => {
      expect(() => validateConfig({})).not.toThrow();
    });

    test('should accept valid port', () => {
      expect(() => validateConfig({ port: 3000 })).not.toThrow();
      expect(() => validateConfig({ port: 8080 })).not.toThrow();
      expect(() => validateConfig({ port: 1 })).not.toThrow();
      expect(() => validateConfig({ port: 65535 })).not.toThrow();
    });

    test('should accept valid sites array', () => {
      expect(() =>
        validateConfig({
          sites: [
            { url: 'https://example.com' },
            { url: 'https://test.com', name: 'Test' },
          ],
        })
      ).not.toThrow();
    });

    test('should accept single site in array', () => {
      expect(() => validateConfig({ sites: [{ url: 'https://example.com' }] })).not.toThrow();
    });

    test('should accept valid concurrency', () => {
      expect(() => validateConfig({ concurrency: 1 })).not.toThrow();
      expect(() => validateConfig({ concurrency: 5 })).not.toThrow();
      expect(() => validateConfig({ concurrency: 100 })).not.toThrow();
    });

    test('should accept valid timeout', () => {
      expect(() => validateConfig({ timeout: 1000 })).not.toThrow();
      expect(() => validateConfig({ timeout: 30000 })).not.toThrow();
      expect(() => validateConfig({ timeout: 0.5 })).not.toThrow();
    });

    test('should accept combination of all valid options', () => {
      expect(() =>
        validateConfig({
          port: 8080,
          sites: [
            { url: 'https://example.com' },
            { url: 'https://test.com', name: 'Test Site' },
          ],
          concurrency: 3,
          timeout: 30000,
        })
      ).not.toThrow();
    });
  });

  describe('invalid port', () => {
    test('should reject port < 1', () => {
      expect(() => validateConfig({ port: 0 })).toThrow();
      expect(() => validateConfig({ port: -1 })).toThrow();
      expect(() => validateConfig({ port: -100 })).toThrow();
    });

    test('should reject port > 65535', () => {
      expect(() => validateConfig({ port: 65536 })).toThrow();
      expect(() => validateConfig({ port: 70000 })).toThrow();
    });

    test('should reject non-integer port', () => {
      expect(() => validateConfig({ port: 80.5 })).toThrow();
      expect(() => validateConfig({ port: 3000.1 })).toThrow();
    });

    test('should reject non-number port', () => {
      expect(() => validateConfig({ port: '3000' as any })).toThrow();
      expect(() => validateConfig({ port: null as any })).toThrow();
      expect(() => validateConfig({ port: undefined as any })).toThrow();
    });

    test('should include helpful error message for invalid port', () => {
      try {
        validateConfig({ port: 70000 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
        expect(error.message).toContain('Invalid port');
        expect(error.message).toContain('70000');
        expect(error.message).toContain('1 and 65535');
      }
    });
  });

  describe('invalid sites', () => {
    test('should reject non-array sites', () => {
      expect(() => validateConfig({ sites: 'not-array' as any })).toThrow();
      expect(() => validateConfig({ sites: 123 as any })).toThrow();
      expect(() => validateConfig({ sites: null as any })).toThrow();
      expect(() => validateConfig({ sites: undefined as any })).toThrow();
      expect(() => validateConfig({ sites: { url: 'test' } as any })).toThrow();
    });

    test('should reject site without url property', () => {
      expect(() => validateConfig({ sites: [{}] })).toThrow();
      expect(() => validateConfig({ sites: [{ name: 'Test' }] })).toThrow();
      expect(() => validateConfig({ sites: [{ id: 1 }] })).toThrow();
    });

    test('should reject null site entry', () => {
      expect(() => validateConfig({ sites: [null] })).toThrow();
    });

    test('should reject primitive value in sites array', () => {
      expect(() => validateConfig({ sites: ['https://example.com' as any] })).toThrow();
      expect(() => validateConfig({ sites: [123 as any] })).toThrow();
    });

    test('should include site index in error message', () => {
      try {
        validateConfig({
          sites: [
            { url: 'https://valid.com' },
            { name: 'invalid' }, // Missing url
            { url: 'https://also-valid.com' },
          ],
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
        expect(error.message).toContain('index 1');
        expect(error.message).toContain('url');
      }
    });

    test('should accept sites with additional properties', () => {
      expect(() =>
        validateConfig({
          sites: [
            {
              url: 'https://example.com',
              name: 'Example',
              credentials: { username: 'test' },
              retries: 3,
            },
          ],
        })
      ).not.toThrow();
    });
  });

  describe('invalid concurrency', () => {
    test('should reject concurrency < 1', () => {
      expect(() => validateConfig({ concurrency: 0 })).toThrow();
      expect(() => validateConfig({ concurrency: -1 })).toThrow();
      expect(() => validateConfig({ concurrency: -5 })).toThrow();
    });

    test('should reject non-integer concurrency', () => {
      expect(() => validateConfig({ concurrency: 2.5 })).toThrow();
      expect(() => validateConfig({ concurrency: 1.1 })).toThrow();
    });

    test('should reject non-number concurrency', () => {
      expect(() => validateConfig({ concurrency: '3' as any })).toThrow();
      expect(() => validateConfig({ concurrency: null as any })).toThrow();
      expect(() => validateConfig({ concurrency: undefined as any })).toThrow();
    });

    test('should include helpful error message for invalid concurrency', () => {
      try {
        validateConfig({ concurrency: -1 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
        expect(error.message).toContain('Invalid concurrency');
        expect(error.message).toContain('-1');
        expect(error.message).toContain('positive integer');
      }
    });
  });

  describe('invalid timeout', () => {
    test('should reject timeout <= 0', () => {
      expect(() => validateConfig({ timeout: 0 })).toThrow();
      expect(() => validateConfig({ timeout: -1 })).toThrow();
      expect(() => validateConfig({ timeout: -100 })).toThrow();
    });

    test('should reject non-number timeout', () => {
      expect(() => validateConfig({ timeout: '30000' as any })).toThrow();
      expect(() => validateConfig({ timeout: null as any })).toThrow();
      expect(() => validateConfig({ timeout: undefined as any })).toThrow();
    });

    test('should accept positive timeout including decimals', () => {
      expect(() => validateConfig({ timeout: 0.1 })).not.toThrow();
      expect(() => validateConfig({ timeout: 100.5 })).not.toThrow();
    });

    test('should include helpful error message for invalid timeout', () => {
      try {
        validateConfig({ timeout: 0 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
        expect(error.message).toContain('Invalid timeout');
        expect(error.message).toContain('0');
        expect(error.message).toContain('positive number');
      }
    });
  });
});

describe('DEFAULT_EXECUTION_CONFIG', () => {
  test('should have all required properties', () => {
    expect(DEFAULT_EXECUTION_CONFIG).toBeDefined();
    expect(DEFAULT_EXECUTION_CONFIG.retryStrategy).toBeDefined();
    expect(DEFAULT_EXECUTION_CONFIG.timeouts).toBeDefined();
    expect(DEFAULT_EXECUTION_CONFIG.artifactDirectories).toBeDefined();
    expect(DEFAULT_EXECUTION_CONFIG.maxConcurrentTasks).toBeDefined();
    expect(typeof DEFAULT_EXECUTION_CONFIG.enableTrace).toBe('boolean');
    expect(typeof DEFAULT_EXECUTION_CONFIG.enableVideo).toBe('boolean');
  });

  test('should have reasonable default values', () => {
    expect(DEFAULT_EXECUTION_CONFIG.maxConcurrentTasks).toBe(3);
    expect(DEFAULT_EXECUTION_CONFIG.enableTrace).toBe(true);
    expect(DEFAULT_EXECUTION_CONFIG.enableVideo).toBe(false);
  });
});

describe('DEFAULT_RETRY_STRATEGY', () => {
  test('should have all retry strategy properties', () => {
    expect(DEFAULT_RETRY_STRATEGY.maxRetries).toBeDefined();
    expect(DEFAULT_RETRY_STRATEGY.baseDelay).toBeDefined();
    expect(DEFAULT_RETRY_STRATEGY.maxDelay).toBeDefined();
    expect(DEFAULT_RETRY_STRATEGY.backoffMultiplier).toBeDefined();
    expect(DEFAULT_RETRY_STRATEGY.retryableStatuses).toBeInstanceOf(Array);
  });

  test('should have reasonable retry values', () => {
    expect(DEFAULT_RETRY_STRATEGY.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_STRATEGY.baseDelay).toBe(1000); // 1 second
    expect(DEFAULT_RETRY_STRATEGY.maxDelay).toBe(10000); // 10 seconds
    expect(DEFAULT_RETRY_STRATEGY.backoffMultiplier).toBe(2);
  });

  test('should have correct retryable statuses', () => {
    expect(DEFAULT_RETRY_STRATEGY.retryableStatuses).toContain('infra_failed');
    expect(DEFAULT_RETRY_STRATEGY.retryableStatuses).toContain('flaky');
    expect(DEFAULT_RETRY_STRATEGY.retryableStatuses).not.toContain('assertion_failed');
  });
});

describe('DEFAULT_TIMEOUTS', () => {
  test('should have all timeout properties', () => {
    expect(DEFAULT_TIMEOUTS.navigation).toBeDefined();
    expect(DEFAULT_TIMEOUTS.elementWait).toBeDefined();
    expect(DEFAULT_TIMEOUTS.assertion).toBeDefined();
    expect(DEFAULT_TIMEOUTS.screenshot).toBeDefined();
    expect(DEFAULT_TIMEOUTS.custom).toBeDefined();
    expect(DEFAULT_TIMEOUTS.pageLoad).toBeDefined();
  });

  test('should have reasonable timeout values', () => {
    expect(DEFAULT_TIMEOUTS.navigation).toBe(30000); // 30s
    expect(DEFAULT_TIMEOUTS.elementWait).toBe(10000); // 10s
    expect(DEFAULT_TIMEOUTS.assertion).toBe(5000); // 5s
    expect(DEFAULT_TIMEOUTS.screenshot).toBe(15000); // 15s
    expect(DEFAULT_TIMEOUTS.custom).toBe(10000); // 10s
    expect(DEFAULT_TIMEOUTS.pageLoad).toBe(60000); // 60s
  });
});

describe('DEFAULT_ARTIFACT_DIRECTORIES', () => {
  test('should have all directory properties', () => {
    expect(DEFAULT_ARTIFACT_DIRECTORIES.root).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.screenshots).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.traces).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.console).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.network).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.dom).toBeDefined();
    expect(DEFAULT_ARTIFACT_DIRECTORIES.videos).toBeDefined();
  });

  test('should have correct directory structure', () => {
    expect(DEFAULT_ARTIFACT_DIRECTORIES.root).toBe('artifacts');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.screenshots).toBe('artifacts/screenshots');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.traces).toBe('artifacts/traces');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.console).toBe('artifacts/console');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.network).toBe('artifacts/network');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.dom).toBe('artifacts/dom');
    expect(DEFAULT_ARTIFACT_DIRECTORIES.videos).toBe('artifacts/videos');
  });
});

describe('getExecutionConfig', () => {
  test('should return default config when no overrides', () => {
    const config = getExecutionConfig();

    expect(config).toEqual(DEFAULT_EXECUTION_CONFIG);
  });

  test('should merge simple overrides', () => {
    const config = getExecutionConfig({
      maxConcurrentTasks: 5,
      enableTrace: false,
    });

    expect(config.maxConcurrentTasks).toBe(5);
    expect(config.enableTrace).toBe(false);
    expect(config.retryStrategy).toEqual(DEFAULT_RETRY_STRATEGY);
    expect(config.timeouts).toEqual(DEFAULT_TIMEOUTS);
  });

  test('should deep merge retryStrategy', () => {
    const config = getExecutionConfig({
      retryStrategy: {
        maxRetries: 5,
        baseDelay: 2000,
      } as any,
    });

    expect(config.retryStrategy.maxRetries).toBe(5);
    expect(config.retryStrategy.baseDelay).toBe(2000);
    // Should retain other default values
    expect(config.retryStrategy.maxDelay).toBe(DEFAULT_RETRY_STRATEGY.maxDelay);
    expect(config.retryStrategy.backoffMultiplier).toBe(DEFAULT_RETRY_STRATEGY.backoffMultiplier);
    expect(config.retryStrategy.retryableStatuses).toEqual(DEFAULT_RETRY_STRATEGY.retryableStatuses);
  });

  test('should deep merge timeouts', () => {
    const config = getExecutionConfig({
      timeouts: {
        navigation: 60000,
        assertion: 10000,
      } as any,
    });

    expect(config.timeouts.navigation).toBe(60000);
    expect(config.timeouts.assertion).toBe(10000);
    // Should retain other default values
    expect(config.timeouts.elementWait).toBe(DEFAULT_TIMEOUTS.elementWait);
    expect(config.timeouts.pageLoad).toBe(DEFAULT_TIMEOUTS.pageLoad);
  });

  test('should deep merge artifactDirectories', () => {
    const config = getExecutionConfig({
      artifactDirectories: {
        root: 'custom-artifacts',
        screenshots: 'custom-artifacts/screenshots',
      } as any,
    });

    expect(config.artifactDirectories.root).toBe('custom-artifacts');
    expect(config.artifactDirectories.screenshots).toBe('custom-artifacts/screenshots');
    // Should retain other default values
    expect(config.artifactDirectories.traces).toBe(DEFAULT_ARTIFACT_DIRECTORIES.traces);
    expect(config.artifactDirectories.videos).toBe(DEFAULT_ARTIFACT_DIRECTORIES.videos);
  });

  test('should handle multiple nested overrides', () => {
    const config = getExecutionConfig({
      maxConcurrentTasks: 10,
      enableVideo: true,
      retryStrategy: {
        maxRetries: 5,
      } as any,
      timeouts: {
        navigation: 45000,
      } as any,
      artifactDirectories: {
        root: 'output',
      } as any,
    });

    expect(config.maxConcurrentTasks).toBe(10);
    expect(config.enableVideo).toBe(true);
    expect(config.retryStrategy.maxRetries).toBe(5);
    expect(config.retryStrategy.baseDelay).toBe(DEFAULT_RETRY_STRATEGY.baseDelay);
    expect(config.timeouts.navigation).toBe(45000);
    expect(config.timeouts.elementWait).toBe(DEFAULT_TIMEOUTS.elementWait);
    expect(config.artifactDirectories.root).toBe('output');
    expect(config.artifactDirectories.screenshots).toBe(DEFAULT_ARTIFACT_DIRECTORIES.screenshots);
  });

  test('should not mutate default config', () => {
    const originalRetryStrategy = { ...DEFAULT_RETRY_STRATEGY };
    const originalTimeouts = { ...DEFAULT_TIMEOUTS };

    getExecutionConfig({
      retryStrategy: { maxRetries: 10 } as any,
      timeouts: { navigation: 90000 } as any,
    });

    // Defaults should remain unchanged
    expect(DEFAULT_RETRY_STRATEGY).toEqual(originalRetryStrategy);
    expect(DEFAULT_TIMEOUTS).toEqual(originalTimeouts);
  });
});

describe('getTimeout', () => {
  test('should return timeout from config', () => {
    const config: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      timeouts: {
        ...DEFAULT_TIMEOUTS,
        navigation: 45000,
        assertion: 8000,
      },
    };

    expect(getTimeout(config, 'navigation')).toBe(45000);
    expect(getTimeout(config, 'assertion')).toBe(8000);
  });

  test('should fallback to default timeout for missing operation', () => {
    const config: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      timeouts: {
        navigation: 45000,
        elementWait: DEFAULT_TIMEOUTS.elementWait,
        assertion: DEFAULT_TIMEOUTS.assertion,
        screenshot: DEFAULT_TIMEOUTS.screenshot,
        custom: DEFAULT_TIMEOUTS.custom,
        pageLoad: DEFAULT_TIMEOUTS.pageLoad,
      },
    };

    expect(getTimeout(config, 'elementWait')).toBe(DEFAULT_TIMEOUTS.elementWait);
    expect(getTimeout(config, 'screenshot')).toBe(DEFAULT_TIMEOUTS.screenshot);
  });
});

describe('isRetryableStatus', () => {
  test('should return true for retryable statuses', () => {
    const strategy: RetryStrategy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableStatuses: ['infra_failed', 'flaky', 'blocked'],
    };

    expect(isRetryableStatus('infra_failed', strategy)).toBe(true);
    expect(isRetryableStatus('flaky', strategy)).toBe(true);
    expect(isRetryableStatus('blocked', strategy)).toBe(true);
  });

  test('should return false for non-retryable statuses', () => {
    const strategy: RetryStrategy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableStatuses: ['infra_failed', 'flaky'],
    };

    expect(isRetryableStatus('assertion_failed', strategy)).toBe(false);
    expect(isRetryableStatus('passed' as ExecutionStatus, strategy)).toBe(false);
    expect(isRetryableStatus('skipped' as ExecutionStatus, strategy)).toBe(false);
  });

  test('should use default retry strategy for common statuses', () => {
    expect(isRetryableStatus('infra_failed', DEFAULT_RETRY_STRATEGY)).toBe(true);
    expect(isRetryableStatus('flaky', DEFAULT_RETRY_STRATEGY)).toBe(true);
    expect(isRetryableStatus('assertion_failed', DEFAULT_RETRY_STRATEGY)).toBe(false);
  });
});

describe('calculateRetryDelay', () => {
  test('should calculate exponential backoff', () => {
    const strategy: RetryStrategy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableStatuses: ['infra_failed', 'flaky'],
    };

    expect(calculateRetryDelay(0, strategy)).toBe(1000); // 1000 * 2^0 = 1000
    expect(calculateRetryDelay(1, strategy)).toBe(2000); // 1000 * 2^1 = 2000
    expect(calculateRetryDelay(2, strategy)).toBe(4000); // 1000 * 2^2 = 4000
    expect(calculateRetryDelay(3, strategy)).toBe(8000); // 1000 * 2^3 = 8000
  });

  test('should cap delay at maxDelay', () => {
    const strategy: RetryStrategy = {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 3,
      retryableStatuses: ['infra_failed', 'flaky'],
    };

    // Without cap: 1000 * 3^2 = 9000
    // With cap: 5000
    expect(calculateRetryDelay(2, strategy)).toBe(5000);
    expect(calculateRetryDelay(3, strategy)).toBe(5000);
    expect(calculateRetryDelay(10, strategy)).toBe(5000);
  });

  test('should handle zero multiplier', () => {
    const strategy: RetryStrategy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 1, // No exponential growth
      retryableStatuses: ['infra_failed', 'flaky'],
    };

    expect(calculateRetryDelay(0, strategy)).toBe(1000);
    expect(calculateRetryDelay(1, strategy)).toBe(1000);
    expect(calculateRetryDelay(10, strategy)).toBe(1000);
  });

  test('should return integer delay', () => {
    const strategy: RetryStrategy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableStatuses: ['infra_failed', 'flaky'],
    };

    const delay = calculateRetryDelay(0, strategy);
    expect(Number.isInteger(delay)).toBe(true);
  });

  test('should use default strategy for typical delays', () => {
    expect(calculateRetryDelay(0, DEFAULT_RETRY_STRATEGY)).toBe(1000);
    expect(calculateRetryDelay(1, DEFAULT_RETRY_STRATEGY)).toBe(2000);
    expect(calculateRetryDelay(2, DEFAULT_RETRY_STRATEGY)).toBe(4000);
    expect(calculateRetryDelay(3, DEFAULT_RETRY_STRATEGY)).toBe(8000);
    expect(calculateRetryDelay(4, DEFAULT_RETRY_STRATEGY)).toBe(10000); // Capped at maxDelay
  });
});
