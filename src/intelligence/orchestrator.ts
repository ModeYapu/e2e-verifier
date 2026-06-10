/**
 * Intelligent Orchestrator - Coordinates Planner/Executor/Evaluator layers
 *
 * The orchestrator is responsible for:
 * - Coordinating the three layers (Planner → Executor → Evaluator)
 * - Managing the repair loop when needed
 * - Emitting events for monitoring
 * - Providing a unified interface for intelligent testing
 *
 * This is the main entry point for the P2 intelligent testing system.
 */

import {
  TestTarget,
  TestPlan,
  ScenarioResult,
  EvaluationResult,
  RepairResult,
  IntelligenceRunResult,
  IntelligenceOptions,
  IntelligenceEvent,
  IntelligenceEventType,
  IntelligenceSummary,
  FailureCategory,
  PlannedScenario
} from './types';
import { ITestPlanner, PlannerFactory } from './planner';
import { ITestExecutor, ExecutorFactory } from './executor';
import { ITestEvaluator, EvaluatorFactory } from './evaluator';
import { RepairLoop, RepairLoopFactory } from './repair-loop';
import { EventEmitter } from 'events';

// =====================================================
// ORCHESTRATOR CONFIGURATION
// =====================================================

/**
 * Configuration for intelligent orchestrator
 */
export interface IntelligentOrchestratorConfig {
  /** Planner configuration */
  planner?: {
    useLLM?: boolean;
    llmConfig?: any;
    configConfig?: any;
  };
  /** Executor configuration */
  executor?: any;
  /** Evaluator configuration */
  evaluator?: {
    useLLM?: boolean;
    llmConfig?: any;
    ruleConfig?: any;
  };
  /** Repair loop configuration */
  repairLoop?: {
    enable?: boolean;
    maxRounds?: number;
    config?: any;
  };
  /** Default options */
  defaultOptions?: IntelligenceOptions;
}

// =====================================================
// INTELLIGENT ORCHESTRATOR
// =====================================================

/**
 * Main orchestrator for intelligent testing
 */
export class IntelligentOrchestrator extends EventEmitter {
  private planner: ITestPlanner;
  private executor: ITestExecutor;
  private evaluator: ITestEvaluator;
  private repairLoop?: RepairLoop;
  private config: IntelligentOrchestratorConfig;

  constructor(config: IntelligentOrchestratorConfig = {}) {
    super();
    this.config = config;

    // Create planner
    this.planner = PlannerFactory.create(
      config.planner?.useLLM || false,
      config.planner?.llmConfig,
      config.planner?.configConfig
    );

    // Create executor
    this.executor = ExecutorFactory.createPlaywright(config.executor);

    // Create evaluator
    this.evaluator = EvaluatorFactory.create(
      config.evaluator?.useLLM || false,
      config.evaluator?.llmConfig,
      config.evaluator?.ruleConfig
    );

    // Create repair loop if enabled
    if (config.repairLoop?.enable !== false) {
      this.repairLoop = RepairLoopFactory.create(
        this.executor,
        this.evaluator,
        config.repairLoop?.config
      );
    }
  }

  /**
   * Run intelligent testing on a target
   * @param target - Test target
   * @param options - Execution options
   * @returns Promise<IntelligenceRunResult> - Complete run result
   */
  async run(target: TestTarget, options: IntelligenceOptions = {}): Promise<IntelligenceRunResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.config.defaultOptions, ...options };

    // Initialize result structures
    const scenarioResults: ScenarioResult[] = [];
    const evaluations: EvaluationResult[] = [];
    const repairs: RepairResult[] = [];

    try {
      this.emitEvent('plan_start', { target, options: mergedOptions });

      // Phase 1: Planning
      const plan = await this.planner.plan(target);

      this.emitEvent('plan_complete', { plan, target });
      console.log(`✓ Plan generated: ${plan.scenarios.length} scenarios`);

      // Phase 2: Execute and evaluate each scenario
      for (let i = 0; i < plan.scenarios.length; i++) {
        const scenario = plan.scenarios[i];

        this.emitEvent('execute_start', { scenario, index: i });
        console.log(`\nExecuting scenario ${i + 1}/${plan.scenarios.length}: ${scenario.name}`);

        // Execute scenario
        const result = await this.executor.execute(scenario);
        scenarioResults.push(result);

        this.emitEvent('execute_complete', { result, scenario });
        console.log(`  Execution: ${result.passed ? '✓ PASSED' : '✗ FAILED'} (${result.duration}ms)`);

        // Evaluate result
        this.emitEvent('evaluate_start', { result });
        const evaluation = await this.evaluator.evaluate(result);
        evaluations.push(evaluation);

        this.emitEvent('evaluate_complete', { evaluation, result });
        console.log(`  Evaluation: ${evaluation.verdict} (confidence: ${evaluation.confidence.toFixed(2)})`);

        // Phase 3: Repair if needed
        if (mergedOptions.enableRepair && this.repairLoop && evaluation.needsRepair) {
          this.emitEvent('repair_start', { result, evaluation });
          console.log(`  Attempting repair...`);

          const repairResult = await this.repairLoop.repair(scenario, result, evaluation);
          repairs.push(repairResult);

          this.emitEvent('repair_complete', { repairResult });

          if (repairResult.success) {
            console.log(`  ✓ Repair successful!`);
            // Update result and evaluation with repaired versions
            if (repairResult.repairedResult) {
              const repairedIndex = scenarioResults.length - 1;
              scenarioResults[repairedIndex] = repairResult.repairedResult;
            }
            if (repairResult.repairedEvaluation) {
              const repairedIndex = evaluations.length - 1;
              evaluations[repairedIndex] = repairResult.repairedEvaluation;
            }
          } else {
            console.log(`  ✗ Repair failed after ${repairResult.attemptNumber} attempts`);
          }
        }
      }

      // Phase 4: Generate summary
      const summary = this.generateSummary(scenarioResults, evaluations, repairs);
      const totalDuration = Date.now() - startTime;

      const finalResult: IntelligenceRunResult = {
        target,
        plan,
        scenarioResults,
        evaluations,
        repairs,
        summary,
        metadata: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          totalDuration,
          options: mergedOptions,
        },
      };

      console.log(`\n${this.formatSummary(finalResult)}`);

      return finalResult;
    } catch (error) {
      this.emitEvent('error', { error, target, options: mergedOptions });
      throw error;
    }
  }

  /**
   * Generate summary from results
   */
  private generateSummary(
    scenarioResults: ScenarioResult[],
    evaluations: EvaluationResult[],
    repairs: RepairResult[]
  ): IntelligenceSummary {
    const totalScenarios = scenarioResults.length;
    const passedScenarios = scenarioResults.filter(r => r.passed).length;
    const failedScenarios = totalScenarios - passedScenarios;
    const flakyScenarios = evaluations.filter(e => e.verdict === 'flaky').length;
    const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;

    // Count repairs
    const totalRepairs = repairs.length;
    const successfulRepairs = repairs.filter(r => r.success).length;

    // Analyze failure categories
    const failureBreakdown: Record<FailureCategory, number> = {
      environment: 0,
      page_bug: 0,
      script_issue: 0,
      data_issue: 0,
      flaky: 0,
      infrastructure: 0,
      unknown: 0,
    };

    evaluations.forEach(evaluation => {
      if (evaluation.failureCategory && evaluation.verdict === 'fail') {
        failureBreakdown[evaluation.failureCategory]++;
      }
    });

    return {
      totalScenarios,
      passedScenarios,
      failedScenarios,
      flakyScenarios,
      passRate,
      totalRepairs,
      successfulRepairs,
      failureBreakdown,
    };
  }

  /**
   * Format summary for display
   */
  private formatSummary(result: IntelligenceRunResult): string {
    const summary = result.summary;
    const lines = [
      '═══════════════════════════════════════════════════════════════',
      '                    INTELLIGENT TEST SUMMARY',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Target: ${result.target.name || result.target.url}`,
      `Duration: ${result.metadata.totalDuration}ms`,
      '',
      `Scenarios: ${summary.totalScenarios} total`,
      `  ✓ Passed: ${summary.passedScenarios} (${(summary.passedScenarios / summary.totalScenarios * 100).toFixed(1)}%)`,
      `  ✗ Failed: ${summary.failedScenarios} (${(summary.failedScenarios / summary.totalScenarios * 100).toFixed(1)}%)`,
      `  ~ Flaky: ${summary.flakyScenarios}`,
      '',
    ];

    // Add repair information if any
    if (summary.totalRepairs > 0) {
      lines.push(`Repairs: ${summary.totalRepairs} attempted, ${summary.successfulRepairs} successful`);
      lines.push(`  Repair success rate: ${(summary.successfulRepairs / summary.totalRepairs * 100).toFixed(1)}%`);
      lines.push('');
    }

    // Add failure breakdown if any failures
    if (summary.failedScenarios > 0) {
      lines.push('Failure Breakdown:');
      for (const [category, count] of Object.entries(summary.failureBreakdown)) {
        if (count > 0) {
          lines.push(`  ${category}: ${count}`);
        }
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Emit an event
   */
  private emitEvent(type: IntelligenceEventType, data: any): void {
    const event: IntelligenceEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit(type, event);
  }

  /**
   * Run testing on multiple targets
   * @param targets - Array of test targets
   * @param options - Execution options (shared across all targets)
   * @returns Promise<IntelligenceRunResult[]> - Results for all targets
   */
  async runMultiple(
    targets: TestTarget[],
    options: IntelligenceOptions = {}
  ): Promise<IntelligenceRunResult[]> {
    const results: IntelligenceRunResult[] = [];

    for (let i = 0; i < targets.length; i++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing target ${i + 1}/${targets.length}: ${targets[i].name || targets[i].url}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        const result = await this.run(targets[i], options);
        results.push(result);
      } catch (error) {
        console.error(`Failed to test target ${targets[i].url}:`, error.message);
        // Continue with other targets even if one fails
      }
    }

    return results;
  }

  /**
   * Close the orchestrator and release resources
   */
  async close(): Promise<void> {
    // Close executor if it has a close method
    if ((this.executor as any).close) {
      await (this.executor as any).close();
    }
  }

  /**
   * Get repair statistics if repair loop is enabled
   */
  getRepairStatistics(): any | null {
    if (this.repairLoop) {
      return this.repairLoop.getRepairStatistics();
    }
    return null;
  }

  /**
   * Get repair history for a specific scenario
   */
  getRepairHistory(scenarioId: string): any[] {
    if (this.repairLoop) {
      return this.repairLoop.getRepairHistory(scenarioId);
    }
    return [];
  }
}

// =====================================================
// ORCHESTRATOR FACTORY
// =====================================================

/**
 * Factory for creating intelligent orchestrators
 */
export class OrchestratorFactory {
  /**
   * Create an intelligent orchestrator
   * @param config - Orchestrator configuration
   */
  static create(config?: IntelligentOrchestratorConfig): IntelligentOrchestrator {
    return new IntelligentOrchestrator(config);
  }

  /**
   * Create an orchestrator from environment variables
   */
  static fromEnv(): IntelligentOrchestrator {
    return new IntelligentOrchestrator({
      planner: {
        useLLM: process.env.USE_LLM_PLANNER === 'true',
        llmConfig: process.env.USE_LLM_PLANNER === 'true' ? {
          llm: {
            apiKey: process.env.LLM_API_KEY || '',
            apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
            model: process.env.LLM_MODEL || 'gpt-4',
          },
        } : undefined,
      },
      executor: {
        outputDir: process.env.ARTIFACTS_DIR || './artifacts',
        enableScreenshots: process.env.ENABLE_SCREENSHOTS !== 'false',
        enableConsoleLogs: process.env.ENABLE_CONSOLE_LOGS !== 'false',
        defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000'),
        maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      },
      evaluator: {
        useLLM: process.env.USE_LLM_EVALUATOR === 'true',
        llmConfig: process.env.USE_LLM_EVALUATOR === 'true' ? {
          llm: {
            apiKey: process.env.LLM_API_KEY || '',
            apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
            model: process.env.LLM_MODEL || 'gpt-4',
          },
        } : undefined,
      },
      repairLoop: {
        enable: process.env.ENABLE_REPAIR !== 'false',
        maxRounds: parseInt(process.env.MAX_REPAIR_ROUNDS || '3'),
        config: {
          useLLMRepair: process.env.USE_LLM_REPAIR === 'true',
          llm: process.env.USE_LLM_REPAIR === 'true' ? {
            apiKey: process.env.LLM_API_KEY || '',
            apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
            model: process.env.LLM_MODEL || 'gpt-4',
          } : undefined,
        },
      },
      defaultOptions: {
        useLLMPlanner: process.env.USE_LLM_PLANNER === 'true',
        useLLMEvaluator: process.env.USE_LLM_EVALUATOR === 'true',
        enableRepair: process.env.ENABLE_REPAIR !== 'false',
        maxRepairRounds: parseInt(process.env.MAX_REPAIR_ROUNDS || '3'),
        outputDir: process.env.ARTIFACTS_DIR || './artifacts',
        verbose: process.env.VERBOSE === 'true',
      },
    });
  }

  /**
   * Create a simple orchestrator with default settings
   */
  static createSimple(): IntelligentOrchestrator {
    return new IntelligentOrchestrator({
      planner: {
        useLLM: false, // Use config-based planner by default
      },
      executor: {
        enableScreenshots: true,
        enableConsoleLogs: true,
      },
      evaluator: {
        useLLM: false, // Use rule-based evaluator by default
      },
      repairLoop: {
        enable: true,
        maxRounds: 3,
      },
    });
  }
}
