/**
 * Repair Advisor Tests
 */

import { RepairAdvisor, RepairSuggestion } from '../src/services/repair-advisor';
import { TestResult } from '../src/types';
import { ResultStore } from '../src/storage/result-store';

jest.mock('../src/storage/result-store');

describe('RepairAdvisor', () => {
  let repairAdvisor: RepairAdvisor;
  let mockResultStore: jest.Mocked<ResultStore>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockResultStore = {
      save: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
      getStats: jest.fn(),
      getAllSiteNames: jest.fn(),
      getBySite: jest.fn(),
      getLatest: jest.fn(),
    } as any;

    repairAdvisor = new RepairAdvisor(mockResultStore);
  });

  describe('analyzeFailure', () => {
    const createMockResult = (checks: any[]): TestResult => ({
      siteName: 'Test Site',
      url: 'https://example.com',
      timestamp: new Date().toISOString(),
      passed: false,
      duration: 5000,
      checks,
      screenshots: [],
      errors: [],
    });

    test('should categorize timeout failures', () => {
      const result = createMockResult([
        {
          name: 'Page Load',
          type: 'timeout',
          passed: false,
          message: 'Timeout exceeded: waiting for element',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('timeout');
      expect(analysis.suggestions[0].confidence).toBeGreaterThan(0.8);
      expect(analysis.summary).toContain('timeout');
    });

    test('should categorize element-not-found failures', () => {
      const result = createMockResult([
        {
          name: 'Button Check',
          type: 'element',
          passed: false,
          message: 'Element not found: selector .submit-button did not match',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('element-not-found');
      expect(analysis.suggestions[0].suggestedFix).toContain('selector');
    });

    test('should categorize visual-diff failures', () => {
      const result = createMockResult([
        {
          name: 'Screenshot Comparison',
          type: 'visual-regression',
          passed: false,
          message: 'Visual diff detected: 5.2% pixel difference from baseline',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('visual-diff');
      expect(analysis.suggestions[0].suggestedFix).toContain('baseline');
    });

    test('should categorize assertion failures', () => {
      const result = createMockResult([
        {
          name: 'Title Check',
          type: 'assertion',
          passed: false,
          message: 'Assertion failed: expected "Home" but got "Login"',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('assertion');
    });

    test('should categorize network failures', () => {
      const result = createMockResult([
        {
          name: 'API Call',
          type: 'network',
          passed: false,
          message: 'Network error: request failed with status 500',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('network');
    });

    test('should categorize auth failures', () => {
      const result = createMockResult([
        {
          name: 'Login Check',
          type: 'auth',
          passed: false,
          message: 'Unauthorized: 401 authentication failed',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('auth');
      expect(analysis.suggestions[0].severity).toBe('critical');
    });

    test('should handle multiple failures and sort by severity', () => {
      const result = createMockResult([
        {
          name: 'Auth Check',
          type: 'auth',
          passed: false,
          message: '401 unauthorized',
          severity: 'critical',
        },
        {
          name: 'Timeout Check',
          type: 'timeout',
          passed: false,
          message: 'Timeout waiting for element',
        },
        {
          name: 'Element Check',
          type: 'element',
          passed: false,
          message: 'Element not found',
          severity: 'warning',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(3);
      expect(analysis.suggestions[0].severity).toBe('critical');
      expect(analysis.suggestions[2].severity).toBe('low');
    });

    test('should generate empty analysis for passed results', () => {
      const result: TestResult = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: true,
        duration: 2000,
        checks: [
          { name: 'Status Check', type: 'status', passed: true, message: 'OK' },
          { name: 'Title Check', type: 'title', passed: true, message: 'OK' },
        ],
        screenshots: [],
        errors: [],
      };

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(0);
      expect(analysis.summary).toContain('No failures detected');
    });

    test('should include global errors in suggestions', () => {
      const result: TestResult = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 1000,
        checks: [],
        screenshots: [],
        errors: ['Browser crashed unexpectedly', 'Config validation failed'],
      };

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(2);
      expect(analysis.suggestions[0].category).toBe('general');
      expect(analysis.suggestions[0].suggestedFix).toContain('Browser crashed');
    });

    test('should categorize unknown error patterns as general', () => {
      const result = createMockResult([
        {
          name: 'Weird Error',
          type: 'unknown-type',
          passed: false,
          message: 'Something strange happened that we do not recognize',
        },
      ]);

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions).toHaveLength(1);
      expect(analysis.suggestions[0].category).toBe('general');
    });
  });

  describe('analyzeJob', () => {
    test('should return null when job result not found', () => {
      mockResultStore.get.mockReturnValue(undefined);

      const analysis = repairAdvisor.analyzeJob('nonexistent-job');

      expect(analysis).toBeNull();
      expect(mockResultStore.get).toHaveBeenCalledWith('nonexistent-job');
    });

    test('should return analysis when job result exists', () => {
      const mockResult: TestResult = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 3000,
        checks: [
          {
            name: 'Failed Check',
            type: 'timeout',
            passed: false,
            message: 'Timeout exceeded',
          },
        ],
        screenshots: [],
        errors: [],
      };

      mockResultStore.get.mockReturnValue(mockResult);

      const analysis = repairAdvisor.analyzeJob('job-123');

      expect(analysis).not.toBeNull();
      expect(mockResultStore.get).toHaveBeenCalledWith('job-123');
      expect(analysis?.suggestions).toHaveLength(1);
    });
  });

  describe('suggestion generation', () => {
    test('should provide specific fixes for timeout issues', () => {
      const result = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 5000,
        checks: [
          {
            name: 'Element Wait',
            type: 'timeout',
            passed: false,
            message: 'Timeout exceeded: waiting for .button to be visible',
          },
        ],
        screenshots: [],
        errors: [],
      };

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions[0].suggestedFix).toMatch(/wait|visible/i);
    });

    test('should provide specific fixes for element-not-found issues', () => {
      const result = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 3000,
        checks: [
          {
            name: 'Selector Check',
            type: 'element',
            passed: false,
            message: 'Selector .wrong-class did not match any elements',
          },
        ],
        screenshots: [],
        errors: [],
      };

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions[0].suggestedFix).toMatch(/selector|CSS/i);
    });

    test('should provide specific fixes for network issues', () => {
      const result = {
        siteName: 'Test Site',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 2000,
        checks: [
          {
            name: 'API Status',
            type: 'network',
            passed: false,
            message: 'Request failed with status 404',
          },
        ],
        screenshots: [],
        errors: [],
      };

      const analysis = repairAdvisor.analyzeFailure('job-1', result);

      expect(analysis.suggestions[0].suggestedFix).toMatch(/404|not found/i);
    });
  });
});
