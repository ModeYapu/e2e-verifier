/**
 * VerifyService unit tests
 *
 * Tests the verification service implementation with mocked dependencies
 */

import { VerifyService } from '../src/server/services/verify-service';
import { BrowserPool } from '../src/browser/browser-pool';
import { ResultStore } from '../src/storage/result-store';

// Mock dependencies
jest.mock('../src/browser/browser-pool');
jest.mock('../src/storage/result-store');
jest.mock('../src/verifier');
jest.mock('../src/orchestrator/verify-orchestrator');
jest.mock('../src/intelligence/orchestrator');
jest.mock('../src/runner/matrix-runner');
jest.mock('../src/intelligence/multi-test-orchestrator');

describe('VerifyService', () => {
  let verifyService: VerifyService;
  let mockBrowserPool: jest.Mocked<BrowserPool>;
  let mockResultStore: jest.Mocked<ResultStore>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockBrowserPool = {
      getInstance: jest.fn().mockReturnThis(),
      acquirePage: jest.fn(),
      releasePage: jest.fn(),
      close: jest.fn(),
      getStats: jest.fn(),
    } as any;

    mockResultStore = {
      save: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
      getStats: jest.fn(),
    } as any;

    // Mock BrowserPool.getInstance to return our mock
    (BrowserPool.getInstance as jest.Mock).mockReturnValue(mockBrowserPool);

    // Create verify service instance
    verifyService = new VerifyService(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with browser pool', () => {
      expect(BrowserPool.getInstance).toHaveBeenCalledWith({ headless: true });
      expect(verifyService).toBeDefined();
    });

    test('should initialize with headless false', () => {
      const service = new VerifyService(false);
      expect(BrowserPool.getInstance).toHaveBeenCalledWith({ headless: false });
    });
  });

  describe('getBrowser', () => {
    test('should acquire page from browser pool', async () => {
      const mockPage = {
        context: jest.fn().mockReturnValue({
          browser: jest.fn().mockReturnValue({}),
        }),
      };

      mockBrowserPool.acquirePage = jest.fn().mockResolvedValue(mockPage);

      const browser = await verifyService.getBrowser();

      expect(mockBrowserPool.acquirePage).toHaveBeenCalled();
      expect(browser).toBeDefined();
    });
  });

  describe('closeBrowser', () => {
    test('should close browser pool', async () => {
      mockBrowserPool.close = jest.fn().mockResolvedValue(undefined);

      await verifyService.closeBrowser();

      expect(mockBrowserPool.close).toHaveBeenCalled();
    });
  });

  describe('getBrowserPool', () => {
    test('should return browser pool instance', () => {
      const pool = verifyService.getBrowserPool();
      expect(pool).toBeDefined();
      expect(pool).toBe(mockBrowserPool);
    });
  });

  describe('fastVerify', () => {
    test('should perform fast verification', async () => {
      const request = {
        url: 'https://example.com',
        name: 'Test Site',
        checks: ['console'],
        viewport: { width: 1920, height: 1080 },
        timeout: 30000,
      };

      // Mock result
      const mockResult = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date(),
        passed: true,
        duration: 1000,
        checks: [
          {
            name: 'Console Check',
            type: 'console',
            passed: true,
            message: 'No console errors',
          },
        ],
        screenshots: [],
        errors: [],
      };

      // Mock Verifier
      const { Verifier } = require('../src/verifier');
      Verifier.mockImplementation(() => ({
        verify: jest.fn().mockResolvedValue(mockResult),
      }));

      const result = await verifyService.fastVerify(request);

      expect(result).toBeDefined();
      expect(Verifier).toHaveBeenCalled();
      expect(mockResultStore.save).toHaveBeenCalledWith(mockResult);
    });

    test('should handle result save errors gracefully', async () => {
      const request = {
        url: 'https://example.com',
        name: 'Test Site',
      };

      const mockResult = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date(),
        passed: true,
        duration: 1000,
        checks: [],
        screenshots: [],
        errors: [],
      };

      // Mock Verifier
      const { Verifier } = require('../src/verifier');
      Verifier.mockImplementation(() => ({
        verify: jest.fn().mockResolvedValue(mockResult),
      }));

      // Mock save error
      mockResultStore.save = jest.fn().mockImplementation(() => {
        throw new Error('Save failed');
      });

      // Should not throw, should log error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await verifyService.fastVerify(request);

      expect(result).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('intelligentVerify', () => {
    test('should perform intelligent verification', async () => {
      const request = {
        target: {
          url: 'https://example.com',
          name: 'Test Target',
          description: 'Test description',
        },
        options: {
          useLLMPlanner: false,
          useLLMEvaluator: false,
          enableRepair: true,
          maxRepairRounds: 3,
        },
      };

      const mockResult = {
        scenarioResults: [
          {
            url: 'https://example.com',
            timestamp: new Date(),
            passed: true,
            duration: 2000,
            scenarioName: 'Test Scenario',
            stepResults: [],
            assertionResults: [],
            error: undefined,
          },
        ],
      };

      // Mock IntelligentOrchestrator
      const { IntelligentOrchestrator } = require('../src/intelligence/orchestrator');
      const mockOrchestrator = {
        init: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockResolvedValue(mockResult),
        close: jest.fn().mockResolvedValue(undefined),
      };

      IntelligentOrchestrator.mockImplementation(() => mockOrchestrator);

      const result = await verifyService.intelligentVerify(request);

      expect(result).toBeDefined();
      expect(mockOrchestrator.init).toHaveBeenCalled();
      expect(mockOrchestrator.run).toHaveBeenCalled();
      expect(mockOrchestrator.close).toHaveBeenCalled();
    });

    test('should handle orchestrator errors', async () => {
      const request = {
        target: {
          url: 'https://example.com',
          name: 'Test Target',
        },
      };

      // Mock IntelligentOrchestrator with error
      const { IntelligentOrchestrator } = require('../src/intelligence/orchestrator');
      const mockOrchestrator = {
        init: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockRejectedValue(new Error('Orchestrator failed')),
        close: jest.fn().mockResolvedValue(undefined),
      };

      IntelligentOrchestrator.mockImplementation(() => mockOrchestrator);

      await expect(verifyService.intelligentVerify(request)).rejects.toThrow('Orchestrator failed');
    });
  });

  describe('cleanup', () => {
    test('should have cleanup method', async () => {
      // This is a placeholder for cleanup functionality tests
      expect(verifyService).toBeDefined();
    });
  });

  describe('error handling', () => {
    test('should handle missing required fields', async () => {
      const invalidRequest = {
        url: '',
        name: '',
      };

      // Mock Verifier to throw error for invalid request
      const { Verifier } = require('../src/verifier');
      Verifier.mockImplementation(() => ({
        verify: jest.fn().mockRejectedValue(new Error('Invalid request')),
      }));

      await expect(verifyService.fastVerify(invalidRequest as any)).rejects.toThrow('Invalid request');
    });
  });
});
