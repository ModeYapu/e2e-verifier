/**
 * Intelligent Verify Service
 * Handles intelligent verification and multi-agent verification logic
 */

import { TestResult } from '../../types';
import { TestTarget, IntelligenceRunResult } from '../../intelligence/types';
import { IntelligentOrchestrator } from '../../intelligence/orchestrator';
import { MultiAgentOrchestrator, MultiAgentConfig, OrchestrationMode } from '../../intelligence/multi-test-orchestrator';
import { TestRoleType } from '../../intelligence/test-roles';
import { ResultStore } from '../../storage/result-store';
import { logger } from '../../utils/logger';

export interface IntelligentVerifyRequest {
  target: {
    url: string;
    name?: string;
    description?: string;
    tags?: string[];
    priority?: 'high' | 'normal' | 'low';
  };
  options?: {
    useLLMPlanner?: boolean;
    useLLMEvaluator?: boolean;
    evaluatorType?: 'llm' | 'rule' | 'multi-strategy';
    enableRepair?: boolean;
    maxRepairRounds?: number;
    outputDir?: string;
    verbose?: boolean;
    model?: string;
    maxScenarios?: number;
    maxSteps?: number;
    enabledStrategies?: string[];
    confidenceThreshold?: number;
  };
  async?: boolean;
}

export interface MultiAgentVerifyRequest {
  target: {
    url: string;
    name?: string;
    description?: string;
    tags?: string[];
    priority?: 'high' | 'normal' | 'low';
  };
  mode: OrchestrationMode;
  roles: TestRoleType[];
  maxParallelAgents?: number;
  debateRounds?: number;
  confidenceThreshold?: number;
  timeout?: number;
}

/**
 * Perform intelligent verification
 */
export async function intelligentVerify(
  request: IntelligentVerifyRequest,
  resultStore: ResultStore
): Promise<IntelligenceRunResult> {
  const target: TestTarget = {
    url: request.target.url,
    name: request.target.name,
    description: request.target.description,
    tags: request.target.tags,
    priority: request.target.priority || 'normal',
  };

  // Create intelligent orchestrator
  const orchestrator = new IntelligentOrchestrator({
    planner: {
      useLLM: request.options?.useLLMPlanner || false,
      llmConfig: request.options?.useLLMPlanner ? {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: request.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
          temperature: 0.7,
          maxTokens: 4000,
        },
      } : undefined,
    },
    executor: {
      outputDir: request.options?.outputDir || './artifacts',
      enableScreenshots: true,
      enableConsoleLogs: true,
      defaultTimeout: 30000,
      maxRetries: 3,
    },
    evaluator: {
      evaluatorType: request.options?.evaluatorType || (request.options?.useLLMEvaluator ? 'llm' : 'rule'),
      useLLM: request.options?.useLLMEvaluator || false,
      llmConfig: request.options?.useLLMEvaluator ? {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: request.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
          temperature: 0.3,
          maxTokens: 3000,
        },
      } : undefined,
      multiStrategyConfig: request.options?.evaluatorType === 'multi-strategy' ? {
        enabledStrategies: request.options?.enabledStrategies || [
          'logic-check',
          'visual-consistency',
          'cross-reference',
          'edge-case',
          'evidence-scoring',
        ],
        confidenceThreshold: request.options?.confidenceThreshold || 0.7,
        outputDir: request.options?.outputDir || './output',
        verbose: request.options?.verbose || false,
      } : undefined,
    },
    repairLoop: {
      enable: request.options?.enableRepair !== false,
      maxRounds: request.options?.maxRepairRounds || 3,
    },
  });

  // Initialize orchestrator
  await orchestrator.init();

  // Run intelligent verification
  const result: IntelligenceRunResult = await orchestrator.run(target, {
    useLLMPlanner: request.options?.useLLMPlanner || false,
    useLLMEvaluator: request.options?.useLLMEvaluator || false,
    enableRepair: request.options?.enableRepair !== false,
    maxRepairRounds: request.options?.maxRepairRounds || 3,
    outputDir: request.options?.outputDir || './artifacts',
    verbose: request.options?.verbose || false,
  });

  // Save scenario results from intelligent verification
  try {
    if (result.scenarioResults && Array.isArray(result.scenarioResults)) {
      for (const scenarioResult of result.scenarioResults) {
        // Create a TestResult from ScenarioResult for storage
        const testResult: TestResult = {
          siteName: request.target.name || request.target.url,
          url: scenarioResult.url,
          timestamp: scenarioResult.timestamp,
          passed: scenarioResult.passed,
          duration: scenarioResult.duration,
          checks: [
            {
              name: 'Intelligent Verification',
              type: 'intelligent',
              passed: scenarioResult.passed,
              message: scenarioResult.passed ? 'Scenario passed' : `Scenario failed: ${scenarioResult.error || 'Unknown error'}`,
              details: {
                scenarioName: scenarioResult.scenarioName,
                stepResults: scenarioResult.stepResults,
                assertionResults: scenarioResult.assertionResults
              }
            }
          ],
          screenshots: [],
          errors: scenarioResult.error ? [scenarioResult.error] : []
        };
        resultStore.save(testResult);
      }
    }
  } catch (saveError) {
    logger.error(`Error saving intelligent verification results: ${saveError}`);
  }

  // Clean up orchestrator
  await orchestrator.close();

  return result;
}

/**
 * Perform multi-agent verification
 */
export async function multiAgentVerify(
  request: MultiAgentVerifyRequest
): Promise<any> {
  // Validate orchestration mode
  const validModes: OrchestrationMode[] = ['sequential', 'parallel', 'hierarchical', 'debate'];
  if (!validModes.includes(request.mode)) {
    throw new Error(`Invalid mode: ${request.mode}. Must be one of: ${validModes.join(', ')}`);
  }

  // Validate roles
  const validRoles: TestRoleType[] = ['explorer', 'tester', 'reviewer', 'repairer'];
  const invalidRoles = request.roles.filter((role: string) => !validRoles.includes(role as TestRoleType));
  if (invalidRoles.length > 0) {
    throw new Error(`Invalid roles: ${invalidRoles.join(', ')}. Must be one of: ${validRoles.join(', ')}`);
  }

  // Create multi-agent configuration
  const config: MultiAgentConfig = {
    mode: request.mode,
    roles: request.roles,
    maxParallelAgents: request.maxParallelAgents || 3,
    debateRounds: request.debateRounds || 2,
    confidenceThreshold: request.confidenceThreshold || 0.7,
    timeout: request.timeout || 120000,
  };

  // Create multi-agent orchestrator
  const orchestrator = new MultiAgentOrchestrator(config);

  // Create test target
  const target = {
    url: request.target.url,
    name: request.target.name || 'Multi-Agent Test',
    description: request.target.description || 'Multi-agent verification test',
    tags: request.target.tags || [],
    priority: request.target.priority || 'normal',
  };

  // Run multi-agent verification
  const result = await orchestrator.run(target);

  return result;
}
