/**
 * Tests for Repair Loop
 * Tests automatic test script repair functionality
 */

import { RepairLoop, RepairLoopConfig } from '../src/intelligence/repair-loop';
import { ITestExecutor } from '../src/intelligence/executor';
import { ITestEvaluator } from '../src/intelligence/evaluator';
import { PlannedScenario, ScenarioResult, RepairResult, EvaluationResult } from '../src/intelligence/types';
import { LLMClient } from '../src/agent/llm-client';

// Mock dependencies
jest.mock('../src/agent/llm-client');
jest.mock('../src/llm/llm-registry');

describe('RepairLoop', () => {
  let repairLoop: RepairLoop;
  let mockExecutor: jest.Mocked<ITestExecutor>;
  let mockEvaluator: jest.Mocked<ITestEvaluator>;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock executor
    mockExecutor = {
      execute: jest.fn(),
    } as any;

    // Create mock evaluator
    mockEvaluator = {
      evaluate: jest.fn(),
    } as any;

    // Create mock LLM client
    mockLLMClient = {
      generateText: jest.fn(),
    } as any;

    // Mock LLMRegistry
    const { LLMRegistry } = require('../src/llm/llm-registry');
    LLMRegistry.getInstance = jest.fn().mockReturnValue({
      createClient: jest.fn().mockReturnValue(mockLLMClient),
    });

    const config: RepairLoopConfig = {
      maxRounds: 3,
      useLLMRepair: true,
      llm: {
        apiKey: 'test-key',
        apiBase: 'https://api.example.com',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 2000,
      },
      repairableCategories: ['script_issue'],
      trackHistory: true,
    };

    repairLoop = new RepairLoop(mockExecutor, mockEvaluator, config);
  });

  describe('repair iteration', () => {
    it('should attempt repair on failed scenario', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for repair',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#old-button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      // Mock initial execution failure
      const failedResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: originalScenario.steps[0],
            passed: false,
            error: 'Element #old-button not found',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock evaluation suggesting repair
      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.9,
        reasoning: 'Selector issue detected',
        failureCategory: 'script_issue',
        issues: [
          {
            severity: 'critical',
            category: 'script_issue',
            description: 'Button selector is outdated',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'repair_selector',
            description: 'Update button selector',
            target: { stepId: 'step1' },
            fix: '#new-button',
            confidence: 0.95,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      // Mock successful re-execution
      const successResult: ScenarioResult = {
        ...failedResult,
        passed: true,
        stepResults: [
          {
            step: { ...originalScenario.steps[0], selector: '#new-button' },
            passed: true,
            actual: 'Click successful',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      // Mock successful re-evaluation
      const successEvaluation: EvaluationResult = {
        ...evaluationResult,
        verdict: 'pass',
        needsRepair: false,
        reasoning: 'Test passed successfully',
      };

      mockExecutor.execute.mockResolvedValueOnce(successResult);
      mockEvaluator.evaluate.mockResolvedValueOnce(successEvaluation);

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, failedResult, evaluationResult);

      expect(repairResult.success).toBe(true);
      expect(repairResult.repairs).toHaveLength(1);
      // The repair loop generates alternative selectors automatically
      expect(repairResult.repairedScenario?.steps[0].selector).toBeTruthy();
      expect(repairResult.repairedScenario?.steps[0].selector).not.toBe('#old-button');
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should enforce max retries limit', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for max retries',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      // Mock consistent failure
      const failedResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: originalScenario.steps[0],
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

      // Mock evaluation suggesting repair
      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.7,
        reasoning: 'Selector issue',
        failureCategory: 'script_issue',
        issues: [
          {
            severity: 'high',
            category: 'script_issue',
            description: 'Button selector still incorrect',
            stepId: 'step1',
          },
        ],
        suggestions: [
          {
            type: 'repair_selector',
            description: 'Try alternative selector',
            target: { stepId: 'step1' },
            fix: '.button-primary',
            confidence: 0.5,
          },
        ],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockExecutor.execute.mockResolvedValue(failedResult);
      mockEvaluator.evaluate.mockResolvedValue(evaluationResult);

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, failedResult, evaluationResult);

      expect(repairResult.success).toBe(false);
      expect(repairResult.attemptNumber).toBeLessThanOrEqual(3); // maxRounds
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should stop on successful repair', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for successful repair',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'type',
            selector: '#input',
            value: 'test',
            description: 'Type in input',
          },
        ],
        assertions: [],
      };

      // First attempt fails
      const failedResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: originalScenario.steps[0],
            passed: false,
            error: 'Input field not ready',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Second attempt succeeds
      const successResult: ScenarioResult = {
        ...failedResult,
        passed: true,
        stepResults: [
          {
            step: originalScenario.steps[0],
            passed: true,
            actual: 'Type successful',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const failEvaluation: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.9,
        reasoning: 'Input field not ready',
        failureCategory: 'script_issue',
        issues: [],
        suggestions: [
          {
            type: 'adjust_timing',
            description: 'Add wait time',
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
      };

      const successEvaluation: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'pass',
        confidence: 0.95,
        reasoning: 'Test passed successfully',
        needsRepair: false,
        issues: [],
        suggestions: [],
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockExecutor.execute.mockResolvedValueOnce(successResult);
      mockEvaluator.evaluate.mockResolvedValueOnce(successEvaluation);

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, failedResult, failEvaluation);

      expect(repairResult.success).toBe(true);
      expect(repairResult.attemptNumber).toBe(1);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('no repair needed', () => {
    it('should return original scenario when no repair needed', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario that needs no repair',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      // Mock successful execution
      const successResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: true,
        stepResults: [
          {
            step: originalScenario.steps[0],
            passed: true,
            actual: 'Click successful',
            duration: 100,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock evaluation saying no repair needed
      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'pass',
        confidence: 0.95,
        reasoning: 'All steps passed successfully',
        needsRepair: false,
        issues: [],
        suggestions: [],
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, successResult, evaluationResult);

      expect(repairResult.success).toBe(false);
      expect(repairResult.attemptNumber).toBe(0);
      expect(repairResult.repairs).toHaveLength(0);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect((mockLLMClient as any).generateText).not.toHaveBeenCalled(); // Should not call LLM
    });

    it('should handle non-repairable failures', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario with non-repairable failure',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'navigate',
            value: 'http://invalid-url',
            description: 'Navigate to invalid URL',
          },
        ],
        assertions: [],
      };

      // Mock execution failure due to network error
      const failedResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: originalScenario.steps[0],
            passed: false,
            error: 'Network error: connection refused',
            duration: 5000,
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        assertionResults: [],
        artifacts: [],
        duration: 5500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock evaluation indicating non-repairable failure
      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.95,
        reasoning: 'Network connectivity issue',
        failureCategory: 'infrastructure', // Not in repairableCategories
        issues: [
          {
            severity: 'critical',
            category: 'infrastructure',
            description: 'Cannot connect to target server',
          },
        ],
        suggestions: [],
        needsRepair: false, // Not repairable
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockExecutor.execute.mockResolvedValue(failedResult);
      mockEvaluator.evaluate.mockResolvedValue(evaluationResult);

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, failedResult, evaluationResult);

      expect(repairResult.success).toBe(false);
      expect(repairResult.attemptNumber).toBe(0);
      expect(repairResult.repairs).toHaveLength(0);
      expect((mockLLMClient as any).generateText).not.toHaveBeenCalled(); // Should not attempt repair
    });
  });

  describe('error handling', () => {
    it('should handle LLM repair errors gracefully', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for LLM error handling',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      // Mock execution failure
      const failedResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [
          {
            step: originalScenario.steps[0],
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

      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.8,
        reasoning: 'Selector issue',
        failureCategory: 'script_issue',
        issues: [],
        suggestions: [],
        needsRepair: true,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      // Mock LLM error
      (mockLLMClient as any).generateText = jest.fn().mockRejectedValue(new Error('LLM API error'));

      mockExecutor.execute.mockResolvedValue(failedResult);
      mockEvaluator.evaluate.mockResolvedValue(evaluationResult);

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, failedResult, evaluationResult);

      // Should handle LLM error gracefully
      expect(repairResult).toBeDefined();
      expect(repairResult.success).toBe(false);
    });

    it('should handle executor errors during repair', async () => {
      const originalScenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor error handling',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      const initialResult: ScenarioResult = {
        scenarioId: 'test-scenario',
        scenarioName: 'Test Scenario',
        url: 'http://example.com',
        passed: false,
        stepResults: [],
        assertionResults: [],
        artifacts: [],
        duration: 0,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const evaluationResult: EvaluationResult = {
        scenarioId: 'test-scenario',
        verdict: 'fail',
        confidence: 0.8,
        reasoning: 'Executor error',
        failureCategory: 'script_issue',
        issues: [],
        suggestions: [],
        needsRepair: false,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      // Mock executor error
      mockExecutor.execute.mockRejectedValue(new Error('Browser crashed'));

      const repairResult: RepairResult = await repairLoop.repair(originalScenario, initialResult, evaluationResult);

      // Should handle executor error gracefully
      expect(repairResult).toBeDefined();
      expect(repairResult.success).toBe(false);
    });
  });
});