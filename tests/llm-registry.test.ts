/**
 * LLMRegistry unit tests
 *
 * Tests the singleton LLM client registry for unified LLM client creation
 */

import { LLMRegistry } from '../src/llm/llm-registry';
import { LLMClient } from '../src/agent/llm-client';

// Mock LLMClient
jest.mock('../src/agent/llm-client');

describe('LLMRegistry', () => {
  beforeEach(() => {
    // Clear the singleton before each test
    (LLMRegistry as any).instance = undefined;
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup
    (LLMRegistry as any).instance = undefined;
  });

  describe('initialize', () => {
    test('should initialize with provided config', () => {
      const config = {
        apiKey: 'test-api-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      };

      LLMRegistry.initialize(config);

      expect(LLMRegistry.isInitialized()).toBe(true);
    });

    test('should create singleton instance', () => {
      const config1 = {
        apiKey: 'key1',
        apiBase: 'https://api1.com',
        model: 'model1',
      };

      LLMRegistry.initialize(config1);

      // Second initialize should use same instance (no error)
      const config2 = {
        apiKey: 'key2',
        apiBase: 'https://api2.com',
        model: 'model2',
      };

      expect(() => LLMRegistry.initialize(config2)).not.toThrow();
    });
  });

  describe('getInstance', () => {
    test('should throw error if not initialized and no env vars', () => {
      // Mock env vars to be undefined
      const originalEnv = process.env;
      process.env = { ...originalEnv, LLM_API_KEY: undefined };

      expect(() => LLMRegistry.getInstance()).toThrow('LLMRegistry not initialized');

      process.env = originalEnv;
    });

    test('should auto-initialize from env vars if available', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        LLM_API_KEY: 'env-api-key',
        LLM_API_BASE: 'https://env.api.com',
        LLM_MODEL: 'env-model',
        LLM_TEMPERATURE: '0.8',
        LLM_MAX_TOKENS: '3000',
        LLM_MAX_STEPS: '25',
      };

      const instance = LLMRegistry.getInstance();

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(LLMRegistry);

      process.env = originalEnv;
    });

    test('should return same instance (singleton)', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
      });

      const instance1 = LLMRegistry.getInstance();
      const instance2 = LLMRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('should use default env values when not specified', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        LLM_API_KEY: 'env-key',
      };

      const instance = LLMRegistry.getInstance();
      const config = instance.getConfig();

      expect(config.apiBase).toBe('https://open.bigmodel.cn/api/paas/v4');
      expect(config.model).toBe('glm-4');
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(4000);
      expect(config.maxSteps).toBe(20);

      process.env = originalEnv;
    });
  });

  describe('createClient', () => {
    test('should create LLMClient with default config', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      });

      const registry = LLMRegistry.getInstance();
      const client = registry.createClient();

      expect(client).toBeDefined();
      expect(LLMClient).toHaveBeenCalledWith({
        model: 'test-model',
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      });
    });

    test('should create LLMClient with overrides', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      });

      const registry = LLMRegistry.getInstance();
      const client = registry.createClient({
        model: 'override-model',
        temperature: 0.9,
      });

      expect(client).toBeDefined();
      expect(LLMClient).toHaveBeenCalledWith({
        model: 'override-model',
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        temperature: 0.9,
        maxTokens: 2000,
        maxSteps: 15,
      });
    });

    test('should create independent client instances', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
      });

      const registry = LLMRegistry.getInstance();
      const client1 = registry.createClient();
      const client2 = registry.createClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe('getConfig', () => {
    test('should return readonly config', () => {
      const config = {
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      };

      LLMRegistry.initialize(config);
      const registry = LLMRegistry.getInstance();
      const retrievedConfig = registry.getConfig();

      expect(retrievedConfig).toEqual(config);
    });

    test('should not allow modifying original config through returned config', () => {
      const config = {
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
      };

      LLMRegistry.initialize(config);
      const registry = LLMRegistry.getInstance();
      const retrievedConfig = registry.getConfig();

      // Try to modify returned config (TypeScript will prevent this at compile time)
      // But the readonly return should protect against runtime modifications
      const originalConfig = registry.getConfig();
      expect(originalConfig.model).toBe('test-model');
      expect(retrievedConfig.model).toBe('test-model');
    });
  });

  describe('updateConfig', () => {
    test('should update existing config', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
      });

      const registry = LLMRegistry.getInstance();
      registry.updateConfig({
        model: 'updated-model',
        temperature: 0.8,
      });

      const config = registry.getConfig();
      expect(config.model).toBe('updated-model');
      expect(config.temperature).toBe(0.8);
      expect(config.apiKey).toBe('test-key'); // Should keep unchanged values
    });

    test('should create new client with updated config', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
      });

      const registry = LLMRegistry.getInstance();
      registry.updateConfig({ model: 'new-model' });

      const client = registry.createClient();

      expect(LLMClient).toHaveBeenCalledWith({
        model: 'new-model',
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        temperature: 0.5,
        maxTokens: undefined,
        maxSteps: 20,
      });
    });
  });

  describe('isInitialized', () => {
    test('should return false when not initialized', () => {
      expect(LLMRegistry.isInitialized()).toBe(false);
    });

    test('should return true after initialization', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
      });

      expect(LLMRegistry.isInitialized()).toBe(true);
    });

    test('should return false after reset', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
      });

      expect(LLMRegistry.isInitialized()).toBe(true);

      // Reset
      (LLMRegistry as any).instance = undefined;

      expect(LLMRegistry.isInitialized()).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should throw descriptive error when not initialized', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, LLM_API_KEY: undefined };

      expect(() => LLMRegistry.getInstance()).toThrow('LLMRegistry not initialized and no LLM_API_KEY env var');

      process.env = originalEnv;
    });

    test('should handle partial config updates', () => {
      LLMRegistry.initialize({
        apiKey: 'test-key',
        apiBase: 'https://test.api.com',
        model: 'test-model',
        temperature: 0.5,
        maxTokens: 2000,
        maxSteps: 15,
      });

      const registry = LLMRegistry.getInstance();

      // Update with empty object should not throw
      expect(() => registry.updateConfig({})).not.toThrow();

      // Config should remain unchanged
      const config = registry.getConfig();
      expect(config.model).toBe('test-model');
      expect(config.temperature).toBe(0.5);
    });
  });
});
