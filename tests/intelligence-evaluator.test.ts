/**
 * Tests for Test Evaluator
 * Tests the evaluation engine for test results
 */

import { LLMEvaluator, LLMEvaluatorConfig, ITestEvaluator } from '../src/intelligence/evaluator';
import { ScenarioResult, EvaluationResult, FailureCategory } from '../src/intelligence/types';
import { LLMClient } from '../src/agent/llm-client';

// Mock LLMClient
jest.mock('../src/agent/llm-client');
jest.mock('../src/llm/llm-registry');
jest.mock('fs');
jest.mock('path');

describe('LLMEvaluator', () => {
  let evaluator: ITestEvaluator;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock LLM client
    mockLLMClient = {
      chatCompletion: jest.fn().mockResolvedValue({ raw: 'mock response' }),
    } as any;

    // Mock LLMRegistry to return our mock client
    const { LLMRegistry } = require('../src/llm/llm-registry');
    LLMRegistry.getInstance = jest.fn().mockReturnValue({
      createClient: jest.fn().mockReturnValue(mockLLMClient),
    });

    const config: LLMEvaluatorConfig = {
      llm: {
        apiKey: 'test-key',
        apiBase: 'https://api.example.com',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 2000,
      },
      analyzeScreenshots: false,
      maxIssues: 10,
      maxSuggestions: 5,
    };

    evaluator = new LLMEvaluator(config);
  });

  describe('evaluateScenario', () => {
    it('should evaluate a passing scenario', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: true,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: true,
            actual: 'Click successful',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [
          {
            assertion: { type: 'element-exists', selector: '#result', expected: true, description: 'Result exists' },
            passed: true,
            actual: true,
          },
        ],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response for passing scenario
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'pass',
        confidence: 0.95,
        reasoning: 'All steps and assertions passed successfully',
        failureCategory: undefined,
        issues: [],
        suggestions: [],
        needsRepair: false,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('pass');
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toContain('All steps and assertions passed successfully');
      expect(result.issues).toHaveLength(0);
    });

    it('should evaluate a failing scenario', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: false,
            error: 'Element not found',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response for failing scenario
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.9,
        reasoning: 'Critical step failed: element not found',
        failureCategory: 'script_issue' as FailureCategory,
        issues: [
          {
            severity: 'critical',
            category: 'script_issue',
            description: 'Element #button not found on page',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'selector',
            description: 'Update selector to match current page structure',
            target: { selector: '#button' },
            fix: '#new-button',
            confidence: 0.8,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('fail');
      expect(result.confidence).toBe(0.9);
      expect(result.failureCategory).toBe('script_issue');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].description).toContain('Element #button not found');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('selector');
    });

    it('should evaluate a flaky scenario', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: false,
            error: 'Timeout waiting for element',
            duration: 5000,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 5500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response for flaky scenario
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'flaky',
        confidence: 0.7,
        reasoning: 'Step timeout suggests timing issue, possible flakiness',
        failureCategory: 'flaky' as FailureCategory,
        issues: [
          {
            severity: 'medium',
            category: 'flaky',
            description: 'Inconsistent timing behavior',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'timing',
            description: 'Increase wait timeout or add explicit wait',
            target: { stepId: 'step1' },
            fix: 5000,
            confidence: 0.6,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('flaky');
      expect(result.confidence).toBe(0.7);
      expect(result.failureCategory).toBe('flaky');
      expect(result.issues[0].severity).toBe('medium');
    });

    it('should evaluate a partial pass scenario', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: true,
            actual: 'Click successful',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
          {
            step: { id: 'step2', action: 'click', selector: '#submit', description: 'Submit form' },
            passed: false,
            error: 'Submit button not found',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [
          {
            assertion: { type: 'element-exists', selector: '#result', expected: true, description: 'Result exists' },
            passed: true,
            actual: true,
          },
        ],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response for partial pass
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.8,
        reasoning: 'Some steps passed but critical step failed',
        failureCategory: 'script_issue' as FailureCategory,
        issues: [
          {
            severity: 'high',
            category: 'script_issue',
            description: 'Submit button selector may be incorrect',
            stepId: 'step2',
          },
        ],
        suggestions: [
          {
            type: 'selector',
            description: 'Verify and update submit button selector',
            target: { selector: '#submit' },
            fix: '#form-submit',
            confidence: 0.7,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('fail');
      expect(result.confidence).toBe(0.8);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].stepId).toBe('step2');
    });
  });

  describe('evidence collection', () => {
    it('should collect evidence from console logs', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: false,
            error: 'JavaScript error',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
            consoleLogs: [
              { level: 'error', message: 'Uncaught TypeError: Cannot read property', timestamp: 1000 },
            ],
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response that references console evidence
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.95,
        reasoning: 'JavaScript error detected in console logs',
        failureCategory: 'page_bug' as FailureCategory,
        issues: [
          {
            severity: 'critical',
            category: 'page_bug',
            description: 'Application JavaScript error: Cannot read property',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'timing',
            description: 'Application may need more time to initialize',
            target: { stepId: 'step1' },
            fix: 2000,
            confidence: 0.8,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('fail');
      expect(result.reasoning).toContain('JavaScript error');
    });

    it('should collect evidence from screenshots', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: { id: 'step1', action: 'click', selector: '#button', description: 'Click button' },
            passed: false,
            error: 'Element not visible',
            screenshot: '/artifacts/screenshot.png',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [
          {
            type: 'screenshot',
            path: '/artifacts/screenshot.png',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response that uses screenshot evidence
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.9,
        reasoning: 'Screenshot confirms element is not visible',
        failureCategory: 'script_issue' as FailureCategory,
        issues: [
          {
            severity: 'high',
            category: 'script_issue',
            description: 'Element exists but is not visible on page',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'action',
            description: 'Add scroll to element before clicking',
            target: { stepId: 'step1' },
            fix: 'scroll',
            confidence: 0.85,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      })});

      const result: EvaluationResult = await evaluator.evaluate(scenarioResult);

      expect(result.verdict).toBe('fail');
      expect(result.reasoning).toContain('Screenshot confirms');
    });
  });

  describe('error handling', () => {
    it('should handle LLM parsing errors', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: true,
        stepResults: [],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM to return invalid JSON
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: 'invalid json response' });

      await expect(evaluator.evaluate(scenarioResult)).rejects.toThrow('LLM evaluation failed');
    });

    it('should handle LLM API errors', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: true,
        stepResults: [],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM to throw error
      (mockLLMClient as any).chatCompletion = jest.fn().mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(evaluator.evaluate(scenarioResult)).rejects.toThrow('LLM evaluation failed');
    });

    it('should handle malformed evaluation response', async () => {
      const scenarioResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: true,
        stepResults: [],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock LLM response with missing required fields
      (mockLLMClient as any).chatCompletion = jest.fn().mockResolvedValue({ raw: JSON.stringify({
        reasoning: 'Some reasoning',
        // Missing verdict and confidence
      })});

      await expect(evaluator.evaluate(scenarioResult)).rejects.toThrow('LLM evaluation failed');
    });
  });
});