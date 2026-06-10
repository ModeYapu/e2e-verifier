/**
 * Repair Loop - Automatic test script repair
 *
 * The repair loop is responsible for:
 * - Analyzing failed test results
 * - Attempting to repair test scripts based on evaluator suggestions
 * - Re-executing repaired scenarios
 * - Tracking repair history
 *
 * This creates a self-healing testing system that can adapt to changes in the application.
 */

import {
  PlannedScenario,
  ScenarioResult,
  EvaluationResult,
  RepairResult,
  RepairAttempt,
  PlannedStep,
  PlannedAssertion,
  Suggestion,
  FailureCategory,
  StepResult
} from './types';
import { ITestExecutor } from './executor';
import { ITestEvaluator } from './evaluator';
import { LLMClient } from '../agent/llm-client';

// =====================================================
// REPAIR LOOP CONFIGURATION
// =====================================================

/**
 * Configuration for repair loop
 */
export interface RepairLoopConfig {
  /** Maximum number of repair rounds */
  maxRounds?: number;
  /** Whether to use LLM for repair generation */
  useLLMRepair?: boolean;
  /** LLM configuration for repair */
  llm?: {
    apiKey: string;
    apiBase: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  /** Types of failures to attempt repair on */
  repairableCategories?: FailureCategory[];
  /** Whether to track repair history */
  trackHistory?: boolean;
}

// =====================================================
// REPAIR LOOP
// =====================================================

/**
 * Repair loop for automatic test script repair
 */
export class RepairLoop {
  private config: Required<RepairLoopConfig>;
  private executor: ITestExecutor;
  private evaluator: ITestEvaluator;
  private llm?: LLMClient;
  private repairHistory: Map<string, RepairResult[]> = new Map();

  constructor(
    executor: ITestExecutor,
    evaluator: ITestEvaluator,
    config: RepairLoopConfig = {}
  ) {
    this.executor = executor;
    this.evaluator = evaluator;
    this.config = {
      maxRounds: config.maxRounds || 3,
      useLLMRepair: config.useLLMRepair || false,
      llm: config.llm,
      repairableCategories: config.repairableCategories || ['script_issue'],
      trackHistory: config.trackHistory !== false,
    };

    // Initialize LLM if needed
    if (this.config.useLLMRepair && this.config.llm) {
      this.llm = new LLMClient({
        model: this.config.llm.model,
        apiKey: this.config.llm.apiKey,
        apiBase: this.config.llm.apiBase,
        temperature: this.config.llm.temperature || 0.7,
        maxTokens: this.config.llm.maxTokens || 2000,
        maxSteps: 20, // Default max steps for LLM operations
      });
    }
  }

  /**
   * Attempt to repair a failed scenario
   * @param originalScenario - The scenario that failed
   * @param originalResult - The execution result
   * @param originalEvaluation - The evaluation result
   * @returns Promise<RepairResult> - Repair attempt result
   */
  async repair(
    originalScenario: PlannedScenario,
    originalResult: ScenarioResult,
    originalEvaluation: EvaluationResult
  ): Promise<RepairResult> {
    const startTime = Date.now();
    const repairs: RepairAttempt[] = [];

    // Check if repair is needed
    if (!originalEvaluation.needsRepair) {
      return {
        originalResult,
        originalEvaluation,
        attemptNumber: 0,
        success: false,
        repairs: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check if failure category is repairable
    if (!this.isRepairable(originalEvaluation.failureCategory)) {
      return {
        originalResult,
        originalEvaluation,
        attemptNumber: 0,
        success: false,
        repairs: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    let currentScenario = originalScenario;
    let lastResult = originalResult;
    let lastEvaluation = originalEvaluation;
    let repaired = false;

    // Attempt repair rounds
    for (let round = 1; round <= this.config.maxRounds; round++) {
      // Generate repairs
      const repairAttempts = this.generateRepairs(
        currentScenario,
        lastResult,
        lastEvaluation
      );

      if (repairAttempts.length === 0) {
        break; // No repairs to apply
      }

      // Apply repairs to create new scenario
      const repairedScenario = this.applyRepairs(currentScenario, repairAttempts);
      repairs.push(...repairAttempts);

      try {
        // Re-execute with repaired scenario
        const repairedResult = await this.executor.execute(repairedScenario);

        // Re-evaluate
        const repairedEvaluation = await this.evaluator.evaluate(repairedResult);

        // Check if repair was successful
        if (repairedEvaluation.verdict === 'pass') {
          repaired = true;
          lastResult = repairedResult;
          lastEvaluation = repairedEvaluation;

          const repairResult: RepairResult = {
            originalResult,
            originalEvaluation,
            attemptNumber: round,
            success: true,
            repairedScenario: repairedScenario,
            repairedResult: lastResult,
            repairedEvaluation: lastEvaluation,
            repairs,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };

          // Track history if enabled
          if (this.config.trackHistory) {
            this.trackRepair(originalScenario.id, repairResult);
          }

          return repairResult;
        } else {
          // Repair didn't work, prepare for next round
          currentScenario = repairedScenario;
          lastResult = repairedResult;
          lastEvaluation = repairedEvaluation;
        }
      } catch (error) {
        // Execution failed, stop repair attempts
        break;
      }
    }

    // All repair rounds failed
    const repairResult: RepairResult = {
      originalResult,
      originalEvaluation,
      attemptNumber: repairs.length > 0 ? repairs.length : 1,
      success: false,
      repairedScenario: currentScenario,
      repairedResult: lastResult,
      repairedEvaluation: lastEvaluation,
      repairs,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    // Track history if enabled
    if (this.config.trackHistory) {
      this.trackRepair(originalScenario.id, repairResult);
    }

    return repairResult;
  }

  /**
   * Check if a failure category is repairable
   */
  private isRepairable(category?: FailureCategory): boolean {
    if (!category) return false;
    return this.config.repairableCategories.includes(category);
  }

  /**
   * Generate repair attempts based on evaluation
   */
  private generateRepairs(
    scenario: PlannedScenario,
    result: ScenarioResult,
    evaluation: EvaluationResult
  ): RepairAttempt[] {
    const repairs: RepairAttempt[] = [];

    // Generate repairs from suggestions
    evaluation.suggestions.forEach(suggestion => {
      const repair = this.generateRepairFromSuggestion(suggestion, scenario, result);
      if (repair) {
        repairs.push(repair);
      }
    });

    return repairs;
  }

  /**
   * Generate a repair attempt from a suggestion
   */
  private generateRepairFromSuggestion(
    suggestion: Suggestion,
    scenario: PlannedScenario,
    result: ScenarioResult
  ): RepairAttempt | null {
    switch (suggestion.type) {
      case 'repair_selector':
        return this.generateSelectorRepair(suggestion, scenario, result);

      case 'adjust_timing':
        return this.generateTimingRepair(suggestion, scenario);

      case 'modify_assertion':
        return this.generateAssertionRepair(suggestion, scenario);

      default:
        return null;
    }
  }

  /**
   * Generate selector repair
   */
  private generateSelectorRepair(
    suggestion: Suggestion,
    scenario: PlannedScenario,
    result: ScenarioResult
  ): RepairAttempt | null {
    // Find the failed step
    const failedStep = result.stepResults.find(sr => !sr.passed && sr.step.id === suggestion.target?.stepId);
    if (!failedStep) return null;

    const currentSelector = failedStep.step.selector;
    if (!currentSelector) return null;

    // Generate alternative selectors
    const alternatives = this.generateAlternativeSelectors(currentSelector, failedStep);
    if (alternatives.length === 0) return null;

    return {
      type: 'selector',
      target: suggestion.target?.stepId || failedStep.step.id,
      description: `Update selector from "${currentSelector}" to "${alternatives[0]}"`,
      originalValue: currentSelector,
      newValue: alternatives[0],
      worked: undefined, // Will be determined after testing
    };
  }

  /**
   * Generate alternative selectors
   */
  private generateAlternativeSelectors(currentSelector: string, stepResult: StepResult): string[] {
    const alternatives: string[] = [];

    // Common CSS selector alternatives
    const patterns = [
      // ID alternatives
      { regex: /^#([a-zA-Z0-9_-]+)$/, replacement: '[id="$1"]' },
      // Class alternatives
      { regex: /^\.([a-zA-Z0-9_-]+)$/, replacement: '[class*="$1"]' },
      // Tag + class
      { regex: /^([a-z]+)\.([a-zA-Z0-9_-]+)$/, replacement: '$1[class*="$2"]' },
      // Attribute alternatives
      { regex: /^\[([a-zA-Z-]+)="([a-zA-Z0-9_-]+)"\]$/, replacement: '[$1*="$2"]' },
      // Descendant combinations
      { regex: /^([a-z]+) > ([a-z]+)$/, replacement: '$1 $2' },
      { regex: /^([a-z]+) ([a-z]+)$/, replacement: '$1 > $2' },
    ];

    for (const pattern of patterns) {
      const match = currentSelector.match(pattern.regex);
      if (match) {
        const alternative = currentSelector.replace(pattern.regex, pattern.replacement);
        if (alternative !== currentSelector) {
          alternatives.push(alternative);
        }
      }
    }

    // Generate generic alternatives
    if (currentSelector.startsWith('#')) {
      const id = currentSelector.substring(1);
      alternatives.push(`[id="${id}"]`);
      alternatives.push(`[id*="${id}"]`);
    } else if (currentSelector.startsWith('.')) {
      const className = currentSelector.substring(1);
      alternatives.push(`[class*="${className}"]`);
    }

    return alternatives;
  }

  /**
   * Generate timing repair
   */
  private generateTimingRepair(
    suggestion: Suggestion,
    scenario: PlannedScenario
  ): RepairAttempt | null {
    const step = scenario.steps.find(s => s.id === suggestion.target?.stepId);
    if (!step) return null;

    const currentWait = step.waitAfter || 0;
    const newWait = currentWait + 2000; // Add 2 seconds

    return {
      type: 'timing',
      target: step.id,
      description: `Increase wait time from ${currentWait}ms to ${newWait}ms`,
      originalValue: currentWait,
      newValue: newWait,
      worked: undefined,
    };
  }

  /**
   * Generate assertion repair
   */
  private generateAssertionRepair(
    suggestion: Suggestion,
    scenario: PlannedScenario
  ): RepairAttempt | null {
    const assertion = scenario.assertions.find(a => a.description === suggestion.description);
    if (!assertion) return null;

    // For now, just mark as non-critical
    const originalCritical = assertion.critical !== false;
    const newCritical = false;

    return {
      type: 'assertion',
      target: assertion.description,
      description: `Mark assertion as non-critical`,
      originalValue: originalCritical,
      newValue: newCritical,
      worked: undefined,
    };
  }

  /**
   * Apply repairs to a scenario
   */
  private applyRepairs(
    scenario: PlannedScenario,
    repairs: RepairAttempt[]
  ): PlannedScenario {
    // Create a deep copy of the scenario
    const repairedScenario: PlannedScenario = JSON.parse(JSON.stringify(scenario));

    // Apply each repair
    repairs.forEach(repair => {
      switch (repair.type) {
        case 'selector':
          this.applySelectorRepair(repairedScenario, repair);
          break;
        case 'timing':
          this.applyTimingRepair(repairedScenario, repair);
          break;
        case 'assertion':
          this.applyAssertionRepair(repairedScenario, repair);
          break;
      }
    });

    return repairedScenario;
  }

  /**
   * Apply selector repair
   */
  private applySelectorRepair(scenario: PlannedScenario, repair: RepairAttempt): void {
    const step = scenario.steps.find(s => s.id === repair.target);
    if (step && repair.newValue) {
      step.selector = repair.newValue as string;
    }
  }

  /**
   * Apply timing repair
   */
  private applyTimingRepair(scenario: PlannedScenario, repair: RepairAttempt): void {
    const step = scenario.steps.find(s => s.id === repair.target);
    if (step && typeof repair.newValue === 'number') {
      step.waitAfter = repair.newValue;
    }
  }

  /**
   * Apply assertion repair
   */
  private applyAssertionRepair(scenario: PlannedScenario, repair: RepairAttempt): void {
    const assertion = scenario.assertions.find(a => a.description === repair.target);
    if (assertion && typeof repair.newValue === 'boolean') {
      assertion.critical = repair.newValue;
    }
  }

  /**
   * Track repair in history
   */
  private trackRepair(scenarioId: string, repairResult: RepairResult): void {
    if (!this.repairHistory.has(scenarioId)) {
      this.repairHistory.set(scenarioId, []);
    }
    this.repairHistory.get(scenarioId)!.push(repairResult);
  }

  /**
   * Get repair history for a scenario
   */
  getRepairHistory(scenarioId: string): RepairResult[] {
    return this.repairHistory.get(scenarioId) || [];
  }

  /**
   * Get all repair history
   */
  getAllRepairHistory(): Map<string, RepairResult[]> {
    return this.repairHistory;
  }

  /**
   * Clear repair history
   */
  clearRepairHistory(): void {
    this.repairHistory.clear();
  }

  /**
   * Get repair statistics
   */
  getRepairStatistics(): {
    totalRepairs: number;
    successfulRepairs: number;
    failedRepairs: number;
    successRate: number;
  } {
    let totalRepairs = 0;
    let successfulRepairs = 0;

    for (const repairs of this.repairHistory.values()) {
      for (const repair of repairs) {
        totalRepairs++;
        if (repair.success) {
          successfulRepairs++;
        }
      }
    }

    const failedRepairs = totalRepairs - successfulRepairs;
    const successRate = totalRepairs > 0 ? successfulRepairs / totalRepairs : 0;

    return {
      totalRepairs,
      successfulRepairs,
      failedRepairs,
      successRate,
    };
  }
}

// =====================================================
// REPAIR LOOP FACTORY
// =====================================================

/**
 * Factory for creating repair loops
 */
export class RepairLoopFactory {
  /**
   * Create a repair loop
   * @param executor - Test executor to use for re-execution
   * @param evaluator - Test evaluator to use for re-evaluation
   * @param config - Repair loop configuration
   */
  static create(
    executor: ITestExecutor,
    evaluator: ITestEvaluator,
    config?: RepairLoopConfig
  ): RepairLoop {
    return new RepairLoop(executor, evaluator, config);
  }

  /**
   * Create a repair loop from environment variables
   * @param executor - Test executor to use for re-execution
   * @param evaluator - Test evaluator to use for re-evaluation
   */
  static fromEnv(executor: ITestExecutor, evaluator: ITestEvaluator): RepairLoop {
    return new RepairLoop(executor, evaluator, {
      maxRounds: parseInt(process.env.MAX_REPAIR_ROUNDS || '3'),
      useLLMRepair: process.env.USE_LLM_REPAIR === 'true',
      llm: process.env.USE_LLM_REPAIR === 'true' ? {
        apiKey: process.env.LLM_API_KEY || '',
        apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
        model: process.env.LLM_MODEL || 'gpt-4',
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000'),
      } : undefined,
      repairableCategories: (process.env.REPAIRABLE_CATEGORIES || 'script_issue').split(',') as FailureCategory[],
      trackHistory: process.env.TRACK_REPAIR_HISTORY !== 'false',
    });
  }
}
