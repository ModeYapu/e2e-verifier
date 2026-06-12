/**
 * Multi-Strategy Evaluator — Comprehensive Verification Engine
 *
 * Aggregates multiple verification strategies for comprehensive test analysis:
 * - LogicCheckStrategy: Logic consistency checks
 * - VisualConsistencyStrategy: Visual verification
 * - CrossReferenceStrategy: Cross-validation
 * - EdgeCaseStrategy: Edge case analysis
 * - EvidenceScoringStrategy: Aggregated evidence analysis
 */

import { ITestEvaluator } from './evaluator';
import {
  ScenarioResult,
  EvaluationResult,
  Issue,
  Suggestion,
  FailureCategory
} from './types';
import {
  VerificationContext,
  VerificationReport,
  StrategyVerdict,
  Recommendation
} from './verification-types';
import { LogicCheckStrategy } from './strategies/logic-check';
import { VisualConsistencyStrategy } from './strategies/visual-consistency';
import { CrossReferenceStrategy } from './strategies/cross-reference';
import { EdgeCaseStrategy } from './strategies/edge-case';
import { EvidenceScoringStrategy } from './strategies/evidence-scoring';
import { logger } from '../utils/logger';

// =====================================================
// MULTI-STRATEGY EVALUATOR CONFIG
// =====================================================

export interface MultiStrategyEvaluatorConfig {
  /** Which strategies to enable */
  enabledStrategies?: string[];

  /** Strategy weights for confidence calculation */
  strategyWeights?: Map<string, number>;

  /** Confidence threshold for passing */
  confidenceThreshold?: number;

  /** Evidence aggregation method */
  evidenceAggregationMethod?: 'weighted' | 'average' | 'minimum';

  /** Output directory for artifacts */
  outputDir?: string;

  /** Verbose logging */
  verbose?: boolean;
}

// =====================================================
// MULTI-STRATEGY EVALUATOR
// =====================================================

export class MultiStrategyEvaluator implements ITestEvaluator {
  private config: Required<MultiStrategyEvaluatorConfig>;

  // Strategy instances
  private strategies: Map<string, any>;

  constructor(config: MultiStrategyEvaluatorConfig = {}) {
    this.config = {
      enabledStrategies: config.enabledStrategies || [
        'logic-check',
        'visual-consistency',
        'cross-reference',
        'edge-case',
        'evidence-scoring',
      ],
      strategyWeights: config.strategyWeights || this.getDefaultWeights(),
      confidenceThreshold: config.confidenceThreshold || 0.7,
      evidenceAggregationMethod: config.evidenceAggregationMethod || 'weighted',
      outputDir: config.outputDir || './output',
      verbose: config.verbose || false,
    };

    // Initialize strategies
    this.strategies = new Map();
    this.initializeStrategies();
  }

  /**
   * Evaluate a scenario result using all strategies
   */
  async evaluate(result: ScenarioResult): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      // Create verification context
      const context = await this.createContext(result);

      // Run all enabled strategies in parallel
      const strategyVerdicts = await this.runStrategies(result, context);

      // Generate verification report
      const evidenceScoring = new EvidenceScoringStrategy({
        weights: this.config.strategyWeights,
        confidenceThreshold: this.config.confidenceThreshold,
        evidenceAggregationMethod: this.config.evidenceAggregationMethod,
      });

      // Update context with strategy verdicts for evidence scoring
      if (!context.options) {
        context.options = {};
      }
      if (!context.options.strategyOptions) {
        context.options.strategyOptions = new Map();
      }
      context.options.strategyOptions.set('strategyVerdicts', strategyVerdicts);

      const verificationReport = evidenceScoring.generateVerificationReport(
        result,
        context,
        strategyVerdicts
      );

      // Convert verification report to evaluation result
      const evaluationResult = this.convertToEvaluationResult(
        result,
        verificationReport,
        Date.now() - startTime
      );

      if (this.config.verbose) {
        this.logEvaluationSummary(evaluationResult, verificationReport);
      }

      return evaluationResult;
    } catch (error) {
      throw new Error(`Multi-strategy evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create verification context
   */
  private async createContext(result: ScenarioResult): Promise<VerificationContext> {
    // Create a minimal context - this would be enhanced with actual plan/target
    const context: VerificationContext = {
      target: {
        url: result.url,
        name: result.scenarioName,
      },
      plan: {
        target: {
          url: result.url,
          name: result.scenarioName,
        },
        scenarios: [],
        metadata: {
          plannerType: 'llm' as any, // Temporary workaround for type system
          generatedAt: new Date().toISOString(),
        },
      },
      options: {
        verbose: this.config.verbose,
        outputDir: this.config.outputDir,
        strategyOptions: new Map(),
      },
    };

    return context;
  }

  /**
   * Run all enabled strategies in parallel
   */
  private async runStrategies(
    result: ScenarioResult,
    context: VerificationContext
  ): Promise<Map<string, StrategyVerdict>> {
    const verdicts = new Map<string, StrategyVerdict>();

    // Filter enabled strategies
    const enabledStrategies = this.config.enabledStrategies.filter(name =>
      this.strategies.has(name)
    );

    if (this.config.verbose) {
      logger.info(`Running ${enabledStrategies.length} strategies in parallel: ${enabledStrategies.join(', ')}`);
    }

    // Create strategy promises
    const strategyPromises = enabledStrategies.map(async (strategyName) => {
      try {
        const strategy = this.strategies.get(strategyName);
        const verdict = await strategy.verify(result, context);
        return { name: strategyName, verdict, error: null };
      } catch (error) {
        logger.error(`Strategy ${strategyName} failed: ${error}`);
        return {
          name: strategyName,
          verdict: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Wait for all strategies to complete
    const results = await Promise.all(strategyPromises);

    // Collect results
    results.forEach(({ name, verdict, error }) => {
      if (error) {
        // Create error verdict
        verdicts.set(name, {
          passed: false,
          confidence: 0.0,
          evidence: [`Strategy failed with error: ${error}`],
          issues: [{
            severity: 'critical',
            category: 'strategy-error',
            description: `Strategy execution failed: ${error}`,
          }],
          metadata: { error },
        });
      } else if (verdict) {
        verdicts.set(name, verdict);
      }
    });

    return verdicts;
  }

  /**
   * Convert verification report to evaluation result
   */
  private convertToEvaluationResult(
    result: ScenarioResult,
    report: VerificationReport,
    duration: number
  ): EvaluationResult {
    // Determine verdict
    let verdict: 'pass' | 'fail' | 'flaky' | 'inconclusive';
    if (report.overallPassed && report.overallConfidence >= this.config.confidenceThreshold) {
      verdict = 'pass';
    } else if (!report.overallPassed && report.overallConfidence >= 0.5) {
      verdict = 'fail';
    } else if (report.overallConfidence < 0.5) {
      verdict = 'inconclusive';
    } else {
      verdict = 'fail';
    }

    // Check for flaky indicators
    const hasFlakyIndicators = report.recommendations.some(r =>
      r.type === 'retry' && r.description.toLowerCase().includes('flaky')
    );
    if (hasFlakyIndicators && verdict === 'pass') {
      verdict = 'flaky';
    }

    // Convert strategy issues to evaluation issues
    const issues: Issue[] = [];
    report.verdicts.forEach((strategyVerdict, strategyName) => {
      strategyVerdict.issues.forEach(strategyIssue => {
        issues.push({
          severity: strategyIssue.severity,
          category: this.mapStrategyCategoryToFailureCategory(strategyIssue.category),
          description: `[${strategyName}] ${strategyIssue.description}`,
          stepId: strategyIssue.stepId,
          evidence: strategyIssue.evidence ? {
            additional: { strategy: strategyName },
          } : undefined,
        });
      });
    });

    // Convert recommendations to suggestions
    const suggestions: Suggestion[] = report.recommendations.map(rec => ({
      type: this.mapRecommendationTypeToSuggestionType(rec.type),
      description: rec.description,
      target: rec.appliesTo ? {
        stepId: rec.appliesTo.stepId,
        assertionId: rec.appliesTo.assertionId,
      } : undefined,
      fix: rec.action,
      confidence: rec.confidence,
    }));

    // Determine failure category if failed
    let failureCategory: FailureCategory | undefined;
    if (verdict === 'fail' || verdict === 'inconclusive') {
      failureCategory = this.determineFailureCategory(issues, report);
    }

    // Determine if repair is needed
    const needsRepair = this.determineRepairNeeds(report);

    return {
      scenarioId: result.scenarioId,
      verdict,
      confidence: report.overallConfidence,
      reasoning: report.summary,
      failureCategory,
      issues,
      suggestions,
      needsRepair,
      metadata: {
        evaluatorType: 'llm' as any, // Temporary workaround for type system
        evaluatedAt: new Date().toISOString(),
        strategiesUsed: report.metadata.strategiesUsed,
        totalDuration: duration,
      } as any, // Type assertion for extended metadata
    };
  }

  /**
   * Map strategy category to failure category
   */
  private mapStrategyCategoryToFailureCategory(category: string): FailureCategory {
    const categoryMapping: Record<string, FailureCategory> = {
      'contradiction': 'script_issue',
      'logical-inconsistency': 'script_issue',
      'ordering': 'script_issue',
      'selector': 'script_issue',
      'timing': 'environment',
      'visual-blank': 'page_bug',
      'visual-layout': 'page_bug',
      'visual-format': 'infrastructure',
      'console-error-mismatch': 'page_bug',
      'console-critical-no-failure': 'script_issue',
      'performance-functional-mismatch': 'page_bug',
      'network-assertion-mismatch': 'infrastructure',
      'flaky-pattern': 'flaky',
      'consistent-failure': 'script_issue',
      'edge-case-security': 'script_issue',
      'strategy-error': 'infrastructure',
    };

    return categoryMapping[category] || 'unknown';
  }

  /**
   * Map recommendation type to suggestion type
   */
  private mapRecommendationTypeToSuggestionType(recType: string): Suggestion['type'] {
    const typeMapping: Record<string, Suggestion['type']> = {
      'repair': 'repair_selector',
      'retry': 'add_retry',
      'investigate': 'unknown',
      'accept': 'unknown',
      'modify': 'modify_assertion',
    };

    return typeMapping[recType] || 'unknown';
  }

  /**
   * Determine failure category from report
   */
  private determineFailureCategory(issues: Issue[], report: VerificationReport): FailureCategory {
    // Count issues by category
    const categoryCounts = new Map<FailureCategory, number>();
    issues.forEach(issue => {
      const count = categoryCounts.get(issue.category) || 0;
      categoryCounts.set(issue.category, count + 1);
    });

    // Find the most common category
    let maxCount = 0;
    let dominantCategory: FailureCategory = 'unknown';

    categoryCounts.forEach((count, category) => {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = category;
      }
    });

    return dominantCategory;
  }

  /**
   * Determine if repair is needed
   */
  private determineRepairNeeds(report: VerificationReport): boolean {
    // Check if any recommendations suggest repair
    const repairRecommendations = report.recommendations.filter(r => r.type === 'repair');

    // Check if there are repairable issues
    const hasRepairableIssues = Array.from(report.verdicts.values()).some(verdict =>
      verdict.issues.some(issue =>
        issue.category === 'selector' ||
        issue.category === 'timing' ||
        issue.category === 'ordering'
      )
    );

    return repairRecommendations.length > 0 || hasRepairableIssues;
  }

  /**
   * Log evaluation summary
   */
  private logEvaluationSummary(evaluation: EvaluationResult, report: VerificationReport): void {
    logger.info('\n=== Multi-Strategy Evaluation Summary ===');
    logger.info(`Verdict: ${evaluation.verdict}`);
    logger.info(`Confidence: ${(evaluation.confidence * 100).toFixed(1)}%`);
    logger.info(`Strategies Used: ${report.metadata.strategiesUsed.join(', ')}`);
    logger.info(`Total Issues: ${evaluation.issues.length}`);
    logger.info(`Recommendations: ${report.recommendations.length}`);
    logger.info('========================================\n');
  }

  /**
   * Initialize all strategies
   */
  private initializeStrategies(): void {
    // Logic Check Strategy
    if (this.config.enabledStrategies.includes('logic-check')) {
      this.strategies.set('logic-check', new LogicCheckStrategy());
    }

    // Visual Consistency Strategy
    if (this.config.enabledStrategies.includes('visual-consistency')) {
      this.strategies.set('visual-consistency', new VisualConsistencyStrategy());
    }

    // Cross Reference Strategy
    if (this.config.enabledStrategies.includes('cross-reference')) {
      this.strategies.set('cross-reference', new CrossReferenceStrategy());
    }

    // Edge Case Strategy
    if (this.config.enabledStrategies.includes('edge-case')) {
      this.strategies.set('edge-case', new EdgeCaseStrategy());
    }

    // Evidence Scoring Strategy
    if (this.config.enabledStrategies.includes('evidence-scoring')) {
      this.strategies.set('evidence-scoring', new EvidenceScoringStrategy({
        weights: this.config.strategyWeights,
        confidenceThreshold: this.config.confidenceThreshold,
        evidenceAggregationMethod: this.config.evidenceAggregationMethod,
      }));
    }
  }

  /**
   * Get default strategy weights
   */
  private getDefaultWeights(): Map<string, number> {
    return new Map([
      ['logic-check', 0.3],
      ['visual-consistency', 0.2],
      ['cross-reference', 0.25],
      ['edge-case', 0.15],
      ['evidence-scoring', 0.1],
    ]);
  }
}