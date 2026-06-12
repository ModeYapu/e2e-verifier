/**
 * Test Evaluator - Evaluates test execution results
 *
 * The evaluator is responsible for analyzing test results and determining:
 * - Whether the test truly passed or failed
 * - Confidence in the verdict
 * - Root cause analysis if failed
 * - Suggestions for fixing issues
 *
 * Three implementations:
 * - LLMEvaluator: Uses LLM with multi-modal analysis of screenshots + logs
 * - RuleEvaluator: Uses rules and heuristics (no LLM needed)
 * - MultiStrategyEvaluator: Uses multiple verification strategies for comprehensive analysis
 */

import {
  ScenarioResult,
  EvaluationResult,
  FailureCategory,
  Issue,
  Suggestion,
  Evidence,
  StepResult,
  AssertionResult
} from './types';
import { LLMClient } from '../agent/llm-client';
import { LLMRegistry } from '../llm/llm-registry';
import { MultiStrategyEvaluator, MultiStrategyEvaluatorConfig } from './multi-strategy-evaluator';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// LLM EVALUATOR TYPES
// =====================================================

/**
 * Types for LLM response parsing
 */
interface LLMEvalResponseIssue {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  description?: string;
  stepId?: string;
}

interface LLMEvalResponseSuggestion {
  type?: string;
  description?: string;
  target?: Record<string, unknown>;
  fix?: string | number | boolean | Record<string, unknown>;
  confidence?: number;
}

interface LLMEvalResponse {
  verdict: 'pass' | 'fail' | 'flaky' | 'inconclusive';
  confidence: number;
  reasoning?: string;
  failureCategory?: FailureCategory;
  issues?: LLMEvalResponseIssue[];
  suggestions?: LLMEvalResponseSuggestion[];
  needsRepair?: boolean;
}

// =====================================================
// EVALUATOR INTERFACE
// =====================================================

/**
 * Interface for test evaluators
 */
export interface ITestEvaluator {
  /**
   * Evaluate a scenario result
   * @param result - Result from executing a scenario
   * @returns Promise<EvaluationResult> - Evaluation result
   */
  evaluate(result: ScenarioResult): Promise<EvaluationResult>;
}

// =====================================================
// LLM EVALUATOR
// =====================================================

/**
 * Configuration for LLM-based evaluator
 */
export interface LLMEvaluatorConfig {
  /** LLM client configuration */
  llm: {
    apiKey: string;
    apiBase: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  /** Whether to analyze screenshots (requires vision capability) */
  analyzeScreenshots?: boolean;
  /** Maximum number of issues to identify */
  maxIssues?: number;
  /** Maximum number of suggestions to generate */
  maxSuggestions?: number;
}

/**
 * LLM-based test evaluator
 * Uses LLM to analyze test results with multi-modal capabilities
 */
export class LLMEvaluator implements ITestEvaluator {
  private llm: LLMClient;
  private config: Required<LLMEvaluatorConfig>;

  constructor(config: LLMEvaluatorConfig) {
    this.llm = LLMRegistry.getInstance().createClient({
      model: config.llm.model,
      apiKey: config.llm.apiKey,
      apiBase: config.llm.apiBase,
      temperature: config.llm.temperature || 0.3, // Lower temperature for more consistent evaluation
      maxTokens: config.llm.maxTokens || 3000,
      maxSteps: 20, // Default max steps for LLM operations
    });
    this.config = {
      llm: config.llm,
      analyzeScreenshots: config.analyzeScreenshots !== false,
      maxIssues: config.maxIssues || 10,
      maxSuggestions: config.maxSuggestions || 5,
    };
  }

  async evaluate(result: ScenarioResult): Promise<EvaluationResult> {
    const prompt = this.buildEvaluationPrompt(result);

    try {
      const response = await this.llm.chatCompletion(
        this.getSystemPrompt(),
        [{ role: 'user', content: prompt }]
      );

      const evaluation = this.parseLLMResponse(response.raw, result);
      return evaluation;
    } catch (error) {
      throw new Error(`LLM evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getSystemPrompt(): string {
    return [
      'You are an expert QA engineer specializing in test result analysis.',
      'Your task is to evaluate test execution results and determine:',
      '1. Whether the test truly passed or failed',
      '2. Root cause of any failures',
      '3. Confidence in your verdict (0-1)',
      '4. Suggestions for fixing issues',
      '',
      'You must respond with a JSON object containing:',
      '- verdict: "pass" | "fail" | "flaky" | "inconclusive"',
      '- confidence: number (0-1)',
      '- reasoning: string (explain your verdict)',
      '- failureCategory: "environment" | "page_bug" | "script_issue" | "data_issue" | "flaky" | "infrastructure" | "unknown"',
      '- issues: array of issue objects',
      '- suggestions: array of suggestion objects',
      '- needsRepair: boolean',
      '',
      'Each issue must have:',
      '- severity: "critical" | "high" | "medium" | "low"',
      '- category: (same as failureCategory)',
      '- description: string',
      '- stepId: string (optional)',
      '',
      'Each suggestion must have:',
      '- type: "repair_selector" | "adjust_timing" | "modify_assertion" | "add_retry" | "environment_fix" | "unknown"',
      '- description: string',
      '- target: { stepId?: string, selector?: string } (optional)',
      '- fix: any (optional)',
      '- confidence: number (0-1, optional)',
      '',
      'Failure Categories:',
      '- environment: Browser, network, or environment issues',
      '- page_bug: Actual bug in the page being tested',
      '- script_issue: Test script problem (selector, timing, etc.)',
      '- data_issue: Test data problem',
      '- flaky: Intermittent failure (retry might work)',
      '- infrastructure: Service or infrastructure issues',
      '- unknown: Cannot determine',
      '',
      'Return ONLY valid JSON, no other text.',
    ].join('\n');
  }

  private buildEvaluationPrompt(result: ScenarioResult): string {
    const parts = [
      `Evaluate the following test result for scenario: ${result.scenarioName}`,
      `URL: ${result.url}`,
      `Overall passed: ${result.passed}`,
      '',
      'Step Results:',
    ];

    // Add step results
    result.stepResults.forEach((stepResult, index) => {
      parts.push(`${index + 1}. Step: ${stepResult.step.action} - ${stepResult.step.description}`);
      parts.push(`   Passed: ${stepResult.passed}`);
      if (!stepResult.passed) {
        parts.push(`   Error: ${stepResult.error}`);
      }
      if (stepResult.actual) {
        parts.push(`   Actual: ${stepResult.actual}`);
      }
    });

    // Add assertion results
    if (result.assertionResults.length > 0) {
      parts.push('');
      parts.push('Assertion Results:');
      result.assertionResults.forEach((assertionResult, index) => {
        parts.push(`${index + 1}. Assertion: ${assertionResult.assertion.type} - ${assertionResult.assertion.description}`);
        parts.push(`   Passed: ${assertionResult.passed}`);
        if (!assertionResult.passed) {
          parts.push(`   Error: ${assertionResult.error}`);
          parts.push(`   Expected: ${assertionResult.assertion.expected}`);
          parts.push(`   Actual: ${assertionResult.actual}`);
        }
      });
    }

    // Add artifact information
    if (result.artifacts.length > 0) {
      parts.push('');
      parts.push('Artifacts collected:');
      result.artifacts.forEach(artifact => {
        parts.push(`- ${artifact.type}: ${artifact.path}`);
      });
    }

    // Add console errors if any
    const consoleErrors = this.extractConsoleErrors(result);
    if (consoleErrors.length > 0) {
      parts.push('');
      parts.push('Console Errors:');
      consoleErrors.forEach(error => {
        parts.push(`- ${error}`);
      });
    }

    // Add retry information
    if (result.retryCount && result.retryCount > 0) {
      parts.push('');
      parts.push(`This test was retried ${result.retryCount} time(s).`);
    }

    parts.push('');
    parts.push('Analyze this result and provide your evaluation.');

    return parts.join('\n');
  }

  private extractConsoleErrors(result: ScenarioResult): string[] {
    const errors: string[] = [];

    result.stepResults.forEach(stepResult => {
      if (stepResult.consoleLogs) {
        stepResult.consoleLogs.forEach(log => {
          if (log.level === 'error') {
            errors.push(log.message);
          }
        });
      }
    });

    return errors;
  }

  private parseLLMResponse(response: string, result: ScenarioResult): EvaluationResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as LLMEvalResponse;

      const validVerdicts = ['pass', 'fail', 'flaky', 'inconclusive'];
      const validCategories = ['environment', 'page_bug', 'script_issue', 'data_issue', 'flaky', 'infrastructure', 'unknown'];

      if (!parsed.verdict || !validVerdicts.includes(parsed.verdict)) {
        throw new Error(`Invalid verdict: ${parsed.verdict}`);
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error(`Invalid confidence: ${parsed.confidence}`);
      }

      const issues: Issue[] = (parsed.issues || []).map((issue: LLMEvalResponseIssue) => ({
        severity: issue.severity || 'medium',
        category: validCategories.includes(parsed.failureCategory!) ? parsed.failureCategory! : 'unknown',
        description: issue.description || 'Unknown issue',
        stepId: issue.stepId,
      }));

      const suggestions: Suggestion[] = (parsed.suggestions || []).map((suggestion: LLMEvalResponseSuggestion) => ({
        type: (suggestion.type || 'unknown') as Suggestion['type'],
        description: suggestion.description || 'Fix the issue',
        target: suggestion.target ? {
          stepId: suggestion.target.stepId as string | undefined,
          assertionId: suggestion.target.assertionId as string | undefined,
          selector: suggestion.target.selector as string | undefined,
        } : undefined,
        fix: suggestion.fix,
        confidence: suggestion.confidence,
      }));

      return {
        scenarioId: result.scenarioId,
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || 'No reasoning provided',
        failureCategory: parsed.failureCategory,
        issues,
        suggestions,
        needsRepair: parsed.needsRepair || false,
        metadata: {
          evaluatorType: 'llm',
          evaluatedAt: new Date().toISOString(),
          modelUsed: this.config.llm.model,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }
}

// =====================================================
// RULE EVALUATOR
// =====================================================

/**
 * Configuration for rule-based evaluator
 */
export interface RuleEvaluatorConfig {
  /** Confidence threshold for considering a result conclusive */
  confidenceThreshold?: number;
  /** Maximum number of console errors before considering test failed */
  maxConsoleErrors?: number;
  /** Whether to consider retries as flaky */
  treatRetriesAsFlaky?: boolean;
  /** Whether to consider selector issues as repairable */
  selectorIssuesRepairable?: boolean;
}

/**
 * Analysis types for rule-based evaluation
 */
interface StepAnalysis {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  selectorFailures: number;
  timeoutFailures: number;
  criticalFailures: number;
}

interface AssertionAnalysis {
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
}

interface ConsoleAnalysis {
  totalErrors: number;
  criticalErrors: number;
  errorPatterns: Map<string, number>;
}

/**
 * Configuration for rule-based evaluator
 */
export interface RuleEvaluatorConfig {
  /** Confidence threshold for considering a result conclusive */
  confidenceThreshold?: number;
  /** Maximum number of console errors before considering test failed */
  maxConsoleErrors?: number;
  /** Whether to consider retries as flaky */
  treatRetriesAsFlaky?: boolean;
  /** Whether to consider selector issues as repairable */
  selectorIssuesRepairable?: boolean;
}

/**
 * Rule-based test evaluator
 * Uses rules and heuristics to evaluate test results without LLM
 */
export class RuleEvaluator implements ITestEvaluator {
  private config: Required<RuleEvaluatorConfig>;

  constructor(config: RuleEvaluatorConfig = {}) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold || 0.7,
      maxConsoleErrors: config.maxConsoleErrors || 5,
      treatRetriesAsFlaky: config.treatRetriesAsFlaky !== false,
      selectorIssuesRepairable: config.selectorIssuesRepairable !== false,
    };
  }

  async evaluate(result: ScenarioResult): Promise<EvaluationResult> {
    // Analyze step results
    const stepAnalysis = this.analyzeStepResults(result.stepResults);

    // Analyze assertion results
    const assertionAnalysis = this.analyzeAssertionResults(result.assertionResults);

    // Analyze console errors
    const consoleAnalysis = this.analyzeConsoleErrors(result);

    // Determine verdict
    const verdict = this.determineVerdict(result, stepAnalysis, assertionAnalysis, consoleAnalysis);

    // Determine failure category
    const failureCategory = this.determineFailureCategory(result, stepAnalysis, consoleAnalysis);

    // Generate issues
    const issues = this.generateIssues(result, stepAnalysis, assertionAnalysis, consoleAnalysis);

    // Generate suggestions
    const suggestions = this.generateSuggestions(result, issues, failureCategory);

    // Calculate confidence
    const confidence = this.calculateConfidence(result, verdict, issues);

    // Determine if repair is needed
    const needsRepair = this.determineRepairNeeds(result, issues, failureCategory);

    return {
      scenarioId: result.scenarioId,
      verdict,
      confidence,
      reasoning: this.generateReasoning(result, verdict, failureCategory, issues),
      failureCategory: verdict === 'fail' ? failureCategory : undefined,
      issues,
      suggestions,
      needsRepair,
      metadata: {
        evaluatorType: 'rule',
        evaluatedAt: new Date().toISOString(),
      },
    };
  }

  private analyzeStepResults(stepResults: StepResult[]): {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    selectorFailures: number;
    timeoutFailures: number;
    criticalFailures: number;
  } {
    const analysis = {
      totalSteps: stepResults.length,
      passedSteps: 0,
      failedSteps: 0,
      selectorFailures: 0,
      timeoutFailures: 0,
      criticalFailures: 0,
    };

    stepResults.forEach(stepResult => {
      if (stepResult.passed) {
        analysis.passedSteps++;
      } else {
        analysis.failedSteps++;

        if (stepResult.step.critical !== false) {
          analysis.criticalFailures++;
        }

        // Analyze error type
        if (stepResult.error) {
          const error = stepResult.error.toLowerCase();
          if (error.includes('timeout') || error.includes('timed out')) {
            analysis.timeoutFailures++;
          }
          if (error.includes('selector') || error.includes('element') || error.includes('not found')) {
            analysis.selectorFailures++;
          }
        }
      }
    });

    return analysis;
  }

  private analyzeAssertionResults(assertionResults: AssertionResult[]): {
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
  } {
    const analysis = {
      totalAssertions: assertionResults.length,
      passedAssertions: 0,
      failedAssertions: 0,
    };

    assertionResults.forEach(assertionResult => {
      if (assertionResult.passed) {
        analysis.passedAssertions++;
      } else {
        analysis.failedAssertions++;
      }
    });

    return analysis;
  }

  private analyzeConsoleErrors(result: ScenarioResult): {
    totalErrors: number;
    criticalErrors: number;
    errorPatterns: Map<string, number>;
  } {
    const analysis = {
      totalErrors: 0,
      criticalErrors: 0,
      errorPatterns: new Map<string, number>(),
    };

    result.stepResults.forEach(stepResult => {
      if (stepResult.consoleLogs) {
        stepResult.consoleLogs.forEach(log => {
          if (log.level === 'error') {
            analysis.totalErrors++;

            // Count error patterns
            const pattern = this.extractErrorPattern(log.message);
            const count = analysis.errorPatterns.get(pattern) || 0;
            analysis.errorPatterns.set(pattern, count + 1);

            // Critical error patterns
            if (this.isCriticalError(log.message)) {
              analysis.criticalErrors++;
            }
          }
        });
      }
    });

    return analysis;
  }

  private extractErrorPattern(errorMessage: string): string {
    // Extract common error patterns
    const patterns = [
      /uncaught typeerror/i,
      /uncaught referenceerror/i,
      /failed to load/i,
      /network error/i,
      /404 not found/i,
      /500 internal server error/i,
      /connection refused/i,
      /timeout/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return pattern.source;
      }
    }

    return 'other_error';
  }

  private isCriticalError(errorMessage: string): boolean {
    const criticalPatterns = [
      /uncaught typeerror/i,
      /uncaught referenceerror/i,
      /500 internal server error/i,
    ];

    return criticalPatterns.some(pattern => pattern.test(errorMessage));
  }

  private determineVerdict(
    result: ScenarioResult,
    stepAnalysis: StepAnalysis,
    assertionAnalysis: AssertionAnalysis,
    consoleAnalysis: ConsoleAnalysis
  ): 'pass' | 'fail' | 'flaky' | 'inconclusive' {
    // Check if result passed
    if (result.passed) {
      // Check if it was retried (potential flakiness)
      if (result.retryCount && result.retryCount > 0) {
        return 'flaky';
      }
      return 'pass';
    }

    // Check for flaky patterns
    if (result.retryCount && result.retryCount > 0 && this.config.treatRetriesAsFlaky) {
      return 'flaky';
    }

    // Check for inconclusive cases
    if (stepAnalysis.criticalFailures === 0 && consoleAnalysis.totalErrors < this.config.maxConsoleErrors) {
      return 'inconclusive';
    }

    return 'fail';
  }

  private determineFailureCategory(
    result: ScenarioResult,
    stepAnalysis: StepAnalysis,
    consoleAnalysis: ConsoleAnalysis
  ): FailureCategory {
    // Check for environment issues
    if (stepAnalysis.timeoutFailures > 0 || consoleAnalysis.criticalErrors > 0) {
      return 'environment';
    }

    // Check for script issues
    if (stepAnalysis.selectorFailures > 0) {
      return 'script_issue';
    }

    // Check for page bugs
    if (consoleAnalysis.totalErrors > this.config.maxConsoleErrors) {
      return 'page_bug';
    }

    // Check for infrastructure issues
    if (this.hasNetworkErrors(result)) {
      return 'infrastructure';
    }

    return 'unknown';
  }

  private hasNetworkErrors(result: ScenarioResult): boolean {
    // Check if there are network-related errors
    for (const stepResult of result.stepResults) {
      if (stepResult.error && stepResult.error.toLowerCase().includes('network')) {
        return true;
      }
      if (stepResult.consoleLogs) {
        for (const log of stepResult.consoleLogs) {
          if (log.message.toLowerCase().includes('network error')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private generateIssues(
    result: ScenarioResult,
    stepAnalysis: StepAnalysis,
    assertionAnalysis: AssertionAnalysis,
    consoleAnalysis: ConsoleAnalysis
  ): Issue[] {
    const issues: Issue[] = [];

    // Add step failure issues
    result.stepResults.forEach((stepResult, index) => {
      if (!stepResult.passed) {
        let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
        if (stepResult.step.critical !== false) {
          severity = 'critical';
        } else if (stepResult.error && stepResult.error.toLowerCase().includes('timeout')) {
          severity = 'low';
        }

        issues.push({
          severity,
          category: stepAnalysis.selectorFailures > 0 ? 'script_issue' : 'environment',
          description: stepResult.error || 'Step failed',
          stepId: stepResult.step.id,
        });
      }
    });

    // Add assertion failure issues
    result.assertionResults.forEach(assertionResult => {
      if (!assertionResult.passed) {
        issues.push({
          severity: assertionResult.assertion.critical !== false ? 'critical' : 'medium',
          category: 'page_bug',
          description: assertionResult.error || 'Assertion failed',
        });
      }
    });

    // Add console error issues
    if (consoleAnalysis.totalErrors > 0) {
      consoleAnalysis.errorPatterns.forEach((count, pattern) => {
        if (count >= 3) { // Only report patterns that appear 3+ times
          issues.push({
            severity: count > 5 ? 'high' : 'medium',
            category: 'page_bug',
            description: `Console error pattern "${pattern}" appeared ${count} times`,
          });
        }
      });
    }

    return issues;
  }

  private generateSuggestions(
    result: ScenarioResult,
    issues: Issue[],
    failureCategory: FailureCategory
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];

    issues.forEach(issue => {
      switch (issue.category) {
        case 'script_issue':
          if (issue.description.toLowerCase().includes('selector')) {
            suggestions.push({
              type: 'repair_selector',
              description: 'Fix or update the element selector',
              target: issue.stepId ? { stepId: issue.stepId } : undefined,
              confidence: 0.8,
            });
          } else if (issue.description.toLowerCase().includes('timeout')) {
            suggestions.push({
              type: 'adjust_timing',
              description: 'Increase wait time or add explicit wait',
              target: issue.stepId ? { stepId: issue.stepId } : undefined,
              confidence: 0.7,
            });
          }
          break;

        case 'environment':
          suggestions.push({
            type: 'add_retry',
            description: 'Add retry logic for transient failures',
            confidence: 0.6,
          });
          break;

        case 'page_bug':
          suggestions.push({
            type: 'environment_fix',
            description: 'Fix the bug in the application',
            confidence: 0.5,
          });
          break;

        default:
          suggestions.push({
            type: 'unknown',
            description: 'Investigate and fix the issue',
            confidence: 0.3,
          });
      }
    });

    return suggestions;
  }

  private calculateConfidence(
    result: ScenarioResult,
    verdict: string,
    issues: Issue[]
  ): number {
    let confidence = 1.0;

    // Reduce confidence based on various factors
    if (result.retryCount && result.retryCount > 0) {
      confidence -= 0.2 * result.retryCount;
    }

    if (verdict === 'inconclusive') {
      confidence -= 0.3;
    }

    // Reduce confidence based on number of issues
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    if (criticalIssues > 0) {
      confidence -= 0.1 * criticalIssues;
    }

    // Ensure confidence stays between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private determineRepairNeeds(
    result: ScenarioResult,
    issues: Issue[],
    failureCategory: FailureCategory
  ): boolean {
    // Repair is needed if there are script issues with selector problems
    if (failureCategory === 'script_issue' && this.config.selectorIssuesRepairable) {
      return true;
    }

    // Check if there are repairable issues
    const repairableIssues = issues.filter(issue =>
      issue.category === 'script_issue' &&
      issue.description.toLowerCase().includes('selector')
    );

    return repairableIssues.length > 0;
  }

  private generateReasoning(
    result: ScenarioResult,
    verdict: string,
    failureCategory: FailureCategory,
    issues: Issue[]
  ): string {
    const parts: string[] = [];

    parts.push(`Test execution ${result.passed ? 'passed' : 'failed'}.`);

    if (verdict === 'flaky') {
      parts.push(`Test was retried ${result.retryCount} time(s), indicating potential flakiness.`);
    } else if (verdict === 'inconclusive') {
      parts.push('Result is inconclusive due to non-critical failures and low error count.');
    } else if (verdict === 'fail') {
      parts.push(`Test failed due to ${failureCategory} issues.`);
      parts.push(`Found ${issues.length} issue(s):`);
      issues.forEach((issue, index) => {
        parts.push(`${index + 1}. [${issue.severity}] ${issue.description}`);
      });
    }

    return parts.join('\n');
  }
}

// =====================================================
// EVALUATOR FACTORY
// =====================================================

/**
 * Factory for creating test evaluators
 * @deprecated Use `new LLMEvaluator(config)`, `new RuleEvaluator(config)`, or `new MultiStrategyEvaluator(config)` directly.
 */
export class EvaluatorFactory {
  /**
   * Create an evaluator based on configuration
   * @param evaluatorType - 'llm', 'rule', or 'multi-strategy'
   * @param llmConfig - Configuration for LLM evaluator (if evaluatorType is 'llm')
   * @param ruleConfig - Configuration for rule evaluator (if evaluatorType is 'rule')
   * @param multiStrategyConfig - Configuration for multi-strategy evaluator (if evaluatorType is 'multi-strategy')
   * @deprecated Use `new LLMEvaluator(config)`, `new RuleEvaluator(config)`, or `new MultiStrategyEvaluator(config)` directly.
   */
  static create(
    evaluatorType: 'llm' | 'rule' | 'multi-strategy' = 'rule',
    llmConfig?: LLMEvaluatorConfig,
    ruleConfig?: RuleEvaluatorConfig,
    multiStrategyConfig?: MultiStrategyEvaluatorConfig
  ): ITestEvaluator {
    switch (evaluatorType) {
      case 'llm':
        if (!llmConfig) {
          throw new Error('LLM config is required when evaluatorType is "llm"');
        }
        return new LLMEvaluator(llmConfig);

      case 'multi-strategy':
        return new MultiStrategyEvaluator(multiStrategyConfig);

      case 'rule':
      default:
        return new RuleEvaluator(ruleConfig);
    }
  }

  /**
   * Create an evaluator from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to evaluator constructors directly.
   */
  static fromEnv(): ITestEvaluator {
    const evaluatorType = process.env.EVALUATOR_TYPE as 'llm' | 'rule' | 'multi-strategy' || 'rule';

    if (evaluatorType === 'llm') {
      const llmConfig: LLMEvaluatorConfig = {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '3000'),
        },
        analyzeScreenshots: process.env.ANALYZE_SCREENSHOTS !== 'false',
        maxIssues: parseInt(process.env.MAX_ISSUES || '10'),
        maxSuggestions: parseInt(process.env.MAX_SUGGESTIONS || '5'),
      };
      return new LLMEvaluator(llmConfig);
    } else if (evaluatorType === 'multi-strategy') {
      return new MultiStrategyEvaluator({
        enabledStrategies: process.env.ENABLED_STRATEGIES?.split(',') || [
          'logic-check',
          'visual-consistency',
          'cross-reference',
          'edge-case',
          'evidence-scoring',
        ],
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        outputDir: process.env.ARTIFACTS_DIR || './output',
        verbose: process.env.VERBOSE === 'true',
      });
    } else {
      return new RuleEvaluator({
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        maxConsoleErrors: parseInt(process.env.MAX_CONSOLE_ERRORS || '5'),
        treatRetriesAsFlaky: process.env.TREAT_RETRIES_AS_FLAKY !== 'false',
        selectorIssuesRepairable: process.env.SELECTOR_ISSUES_REPAIRABLE !== 'false',
      });
    }
  }
}
