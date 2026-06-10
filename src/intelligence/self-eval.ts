/**
 * Self-Evaluation Engine - RAISE-inspired strategy assessment
 *
 * This file implements the self-evaluation engine which:
 * - Evaluates strategy effectiveness after each test
 * - Assesses test plan quality
 * - Generates improvement suggestions
 * - Adjusts strategy weights based on performance
 */

import {
  TestExperience,
  StrategyEvaluation,
  PlanEvaluation,
  ImprovementSuggestions,
  StrategyWeight,
  StrategyEffectiveness,
} from './experience-types';
import { ExperienceStore } from './experience-store';
import { ScenarioResult, TestPlan } from './types';

// =====================================================
// SELF-EVALUATION ENGINE CONFIGURATION
// =====================================================

/**
 * Configuration for self-evaluation engine
 */
export interface SelfEvalEngineConfig {
  /** Experience store */
  experienceStore: ExperienceStore;
  /** Minimum samples for strategy evaluation */
  minSamplesForEvaluation?: number;
  /** Confidence threshold for high-confidence evaluations */
  confidenceThreshold?: number;
  /** Whether to enable strategy weight updates */
  enableWeightUpdates?: boolean;
}

// =====================================================
// SELF-EVALUATION ENGINE
// =====================================================

/**
 * Self-evaluation engine implementation
 */
export class SelfEvalEngine {
  private experienceStore: ExperienceStore;
  private config: Required<SelfEvalEngineConfig>;
  private strategyWeights: Map<string, StrategyWeight> = new Map();

  constructor(config: SelfEvalEngineConfig) {
    this.experienceStore = config.experienceStore;
    this.config = {
      experienceStore: config.experienceStore,
      minSamplesForEvaluation: config.minSamplesForEvaluation || 5,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      enableWeightUpdates: config.enableWeightUpdates !== false,
    };

    // Initialize default strategy weights
    this.initializeStrategyWeights();
  }

  // =====================================================
  // STRATEGY EVALUATION
  // =====================================================

  /**
   * Evaluate strategy effectiveness
   * @param experience - Experience to evaluate
   * @param result - Test result
   * @returns Strategy evaluation
   */
  async evaluateStrategy(experience: TestExperience, result: ScenarioResult): Promise<StrategyEvaluation> {
    // Get strategy statistics
    const strategyStats = this.experienceStore.getStrategyStats(experience.strategy);
    const confidence = this.calculateEvaluationConfidence(strategyStats);

    // Determine effectiveness
    const effective = this.isStrategyEffective(experience, result, strategyStats);

    // Generate reasoning
    const reasoning = this.generateStrategyReasoning(experience, result, strategyStats, effective);

    // Generate suggestions
    const suggestions = this.generateStrategySuggestions(experience, result, strategyStats);

    const evaluation: StrategyEvaluation = {
      strategy: experience.strategy,
      experience,
      effective,
      confidence,
      reasoning,
      suggestions,
      timestamp: Date.now(),
    };

    // Update strategy weights if enabled
    if (this.config.enableWeightUpdates) {
      this.updateStrategyWeights(experience.strategy, effective, confidence);
    }

    return evaluation;
  }

  /**
   * Evaluate plan quality
   * @param plan - Test plan
   * @param result - Test result
   * @returns Plan evaluation
   */
  async evaluatePlan(plan: TestPlan, result: ScenarioResult): Promise<PlanEvaluation> {
    // Assess comprehensiveness
    const comprehensive = this.isPlanComprehensive(plan, result);

    // Assess appropriateness
    const appropriate = this.areStepsAppropriate(plan, result);

    // Identify missing coverage
    const missingCoverage = this.identifyMissingCoverage(plan, result);

    // Identify over-engineered areas
    const overEngineered = this.identifyOverEngineered(plan, result);

    // Calculate quality score
    const qualityScore = this.calculatePlanQualityScore(comprehensive, appropriate, missingCoverage, overEngineered);

    const evaluation: PlanEvaluation = {
      plan,
      result,
      comprehensive,
      appropriate,
      missingCoverage,
      overEngineered,
      qualityScore,
      timestamp: Date.now(),
    };

    return evaluation;
  }

  // =====================================================
  // IMPROVEMENT SUGGESTIONS
  // =====================================================

  /**
   * Get improvement suggestions for a site
   * @param siteName - Site name
   * @returns Improvement suggestions
   */
  async getSuggestions(siteName?: string): Promise<ImprovementSuggestions> {
    const stats = this.experienceStore.getStats(siteName);

    // Generate suggestions based on statistics
    const suggestions = this.generateImprovementSuggestions(stats);

    // Generate strategy adjustments
    const strategyAdjustments = this.generateStrategyAdjustments(stats);

    const result: ImprovementSuggestions = {
      siteName,
      suggestions,
      strategyAdjustments,
      timestamp: Date.now(),
    };

    return result;
  }

  /**
   * Update strategy weights based on performance
   * @param strategy - Strategy name
   * @param effective - Whether strategy was effective
   * @param confidence - Confidence in evaluation
   */
  updateStrategyWeights(strategy: string, effective: boolean, confidence: number): void {
    let weight = this.strategyWeights.get(strategy);

    if (!weight) {
      weight = {
        strategy,
        weight: 1.0,
        confidence: 0.5,
      };
    }

    // Update weight based on effectiveness
    const adjustment = effective ? 0.1 : -0.1;
    const confidenceAdjustment = (confidence - weight.confidence) * 0.1;

    weight.weight = Math.max(0.1, Math.min(2.0, weight.weight + adjustment));
    weight.confidence = Math.max(0.1, Math.min(1.0, weight.confidence + confidenceAdjustment));

    this.strategyWeights.set(strategy, weight);
  }

  // =====================================================
  // STRATEGY WEIGHT MANAGEMENT
  // =====================================================

  /**
   * Get strategy weights
   * @returns Current strategy weights
   */
  getStrategyWeights(): Map<string, StrategyWeight> {
    return new Map(this.strategyWeights);
  }

  /**
   * Get strategy weight
   * @param strategy - Strategy name
   * @returns Strategy weight
   */
  getStrategyWeight(strategy: string): StrategyWeight | null {
    return this.strategyWeights.get(strategy) || null;
  }

  /**
   * Set strategy weight
   * @param strategy - Strategy name
   * @param weight - Weight value
   * @param confidence - Confidence in weight
   */
  setStrategyWeight(strategy: string, weight: number, confidence: number): void {
    this.strategyWeights.set(strategy, {
      strategy,
      weight: Math.max(0.1, Math.min(2.0, weight)),
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
    });
  }

  /**
   * Get recommended strategy based on weights
   * @param availableStrategies - Available strategies
   * @returns Recommended strategy
   */
  getRecommendedStrategy(availableStrategies: string[]): string {
    let bestStrategy = availableStrategies[0];
    let bestScore = -Infinity;

    for (const strategy of availableStrategies) {
      const weight = this.strategyWeights.get(strategy);
      if (weight) {
        // Score = weight * confidence (penalize low confidence)
        const score = weight.weight * weight.confidence;
        if (score > bestScore) {
          bestScore = score;
          bestStrategy = strategy;
        }
      }
    }

    return bestStrategy;
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Initialize default strategy weights
   */
  private initializeStrategyWeights(): void {
    const defaultStrategies = [
      'experience-guided',
      'llm',
      'rule-based',
      'multi-strategy',
    ];

    defaultStrategies.forEach(strategy => {
      this.strategyWeights.set(strategy, {
        strategy,
        weight: 1.0,
        confidence: 0.5,
      });
    });
  }

  /**
   * Calculate evaluation confidence
   * @param stats - Strategy statistics
   * @returns Confidence (0-1)
   */
  private calculateEvaluationConfidence(stats: StrategyEffectiveness): number {
    if (stats.totalUses < this.config.minSamplesForEvaluation) {
      return 0.3; // Low confidence for insufficient data
    }

    // Confidence increases with sample count
    const sampleConfidence = Math.min(1.0, stats.totalUses / this.config.minSamplesForEvaluation / 2);

    // Confidence increases with success rate
    const rateConfidence = stats.successRate;

    return (sampleConfidence + rateConfidence) / 2;
  }

  /**
   * Determine if strategy was effective
   * @param experience - Test experience
   * @param result - Test result
   * @param stats - Strategy statistics
   * @returns True if effective
   */
  private isStrategyEffective(experience: TestExperience, result: ScenarioResult, stats: StrategyEffectiveness): boolean {
    // Strategy is effective if:
    // 1. Experience outcome was success/partial with positive reward
    // 2. Strategy has above-average success rate
    // 3. Recent trend is positive

    const positiveReward = experience.reward > 0;
    const aboveAverageRate = stats.successRate >= 0.5;
    const recentTrend = this.isRecentTrendPositive(experience.strategy);

    return positiveReward && aboveAverageRate && recentTrend;
  }

  /**
   * Check if recent trend is positive
   * @param strategy - Strategy name
   * @returns True if positive trend
   */
  private isRecentTrendPositive(strategy: string): boolean {
    const stats = this.experienceStore.getStats();
    const trend = stats.successTrend;

    if (trend.length < 2) {
      return true; // Not enough data, assume positive
    }

    // Check if recent trend is improving
    const recent = trend.slice(0, 3);
    const avgRecentRate = recent.reduce((sum, t) => sum + t.successRate, 0) / recent.length;

    return avgRecentRate > 0.5;
  }

  /**
   * Generate strategy reasoning
   * @param experience - Test experience
   * @param result - Test result
   * @param stats - Strategy statistics
   * @param effective - Whether strategy was effective
   * @returns Reasoning text
   */
  private generateStrategyReasoning(
    experience: TestExperience,
    result: ScenarioResult,
    stats: StrategyEffectiveness,
    effective: boolean
  ): string {
    const parts: string[] = [];

    // Outcome analysis
    if (experience.outcome === 'success') {
      parts.push('Strategy achieved successful outcome');
    } else if (experience.outcome === 'partial') {
      parts.push('Strategy achieved partial success');
    } else {
      parts.push('Strategy failed to achieve desired outcome');
    }

    // Reward analysis
    parts.push(`Reward: ${experience.reward.toFixed(2)}`);

    // Statistics analysis
    parts.push(`Strategy success rate: ${(stats.successRate * 100).toFixed(1)}%`);
    parts.push(`Total uses: ${stats.totalUses}`);

    // Effectiveness conclusion
    if (effective) {
      parts.push('Strategy is effective for this type of problem');
    } else {
      parts.push('Strategy may not be optimal for this type of problem');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Generate strategy suggestions
   * @param experience - Test experience
   * @param result - Test result
   * @param stats - Strategy statistics
   * @returns Suggestions
   */
  private generateStrategySuggestions(experience: TestExperience, result: ScenarioResult, stats: StrategyEffectiveness): string[] {
    const suggestions: string[] = [];

    // Analyze failures
    if (experience.outcome === 'failure') {
      suggestions.push('Consider using a different strategy for similar pages');
      suggestions.push('Review test plan complexity - may be over or under-engineered');
    }

    // Analyze partial success
    if (experience.outcome === 'partial') {
      suggestions.push('Plan was mostly correct - consider minor adjustments');
      suggestions.push('Review assertions that failed - may need refinement');
    }

    // Analyze low success rate
    if (stats.successRate < 0.5) {
      suggestions.push('Strategy has low overall success rate - consider alternatives');
    }

    // Analyze high success rate
    if (stats.successRate > 0.8) {
      suggestions.push('Strategy is highly effective - prefer for similar problems');
    }

    // Analyze repair needs
    if (experience.repairHistory && experience.repairHistory.length > 0) {
      suggestions.push('Multiple repair attempts needed - review initial plan quality');
    }

    return suggestions;
  }

  /**
   * Check if plan is comprehensive
   * @param plan - Test plan
   * @param result - Test result
   * @returns True if comprehensive
   */
  private isPlanComprehensive(plan: TestPlan, result: ScenarioResult): boolean {
    // Plan is comprehensive if it has:
    // 1. Multiple scenarios (or one good scenario)
    // 2. Good step coverage
    // 3. Appropriate assertions

    const hasScenarios = plan.scenarios.length > 0;
    const hasSteps = plan.scenarios.some(s => s.steps.length > 0);
    const hasAssertions = plan.scenarios.some(s => s.assertions.length > 0);

    return hasScenarios && hasSteps && hasAssertions;
  }

  /**
   * Check if steps are appropriate
   * @param plan - Test plan
   * @param result - Test result
   * @returns True if appropriate
   */
  private areStepsAppropriate(plan: TestPlan, result: ScenarioResult): boolean {
    // Steps are appropriate if:
    // 1. They executed successfully
    // 2. No critical failures
    // 3. Reasonable execution time

    const successfulSteps = result.stepResults.filter(sr => sr.passed).length;
    const totalSteps = result.stepResults.length;
    const successRate = totalSteps > 0 ? successfulSteps / totalSteps : 0;

    const criticalFailures = result.stepResults.filter(sr => !sr.passed && sr.step.critical).length;

    return successRate >= 0.7 && criticalFailures === 0;
  }

  /**
   * Identify missing coverage
   * @param plan - Test plan
   * @param result - Test result
   * @returns Missing coverage areas
   */
  private identifyMissingCoverage(plan: TestPlan, result: ScenarioResult): string[] {
    const missing: string[] = [];

    // Check for common missing elements
    const hasNavigation = plan.scenarios.some(s => s.steps.some(st => st.action === 'navigate' || st.action === 'goto'));
    if (!hasNavigation) {
      missing.push('No navigation step - may not test page loading');
    }

    const hasAssertions = plan.scenarios.some(s => s.assertions.length > 0);
    if (!hasAssertions) {
      missing.push('No assertions - cannot verify test success');
    }

    const hasInteraction = plan.scenarios.some(s =>
      s.steps.some(st => ['click', 'type', 'submit'].includes(st.action))
    );
    if (!hasInteraction) {
      missing.push('No user interaction steps - may not test functionality');
    }

    return missing;
  }

  /**
   * Identify over-engineered areas
   * @param plan - Test plan
   * @param result - Test result
   * @returns Over-engineered areas
   */
  private identifyOverEngineered(plan: TestPlan, result: ScenarioResult): string[] {
    const overEngineered: string[] = [];

    // Check for potential over-engineering
    plan.scenarios.forEach(scenario => {
      // Too many steps for simple test
      if (scenario.steps.length > 20 && !result.passed) {
        overEngineered.push(`Scenario ${scenario.name} has ${scenario.steps.length} steps but failed - consider simplifying`);
      }

      // Too many assertions
      if (scenario.assertions.length > 15) {
        overEngineered.push(`Scenario ${scenario.name} has ${scenario.assertions.length} assertions - may be over-testing`);
      }

      // Long execution time but simple test
      if (result.duration > 30000 && scenario.steps.length < 10) {
        overEngineered.push(`Scenario ${scenario.name} took ${(result.duration / 1000).toFixed(1)}s for ${scenario.steps.length} steps - check for inefficiencies`);
      }
    });

    return overEngineered;
  }

  /**
   * Calculate plan quality score
   * @param comprehensive - Plan comprehensiveness
   * @param appropriate - Step appropriateness
   * @param missingCoverage - Missing coverage areas
   * @param overEngineered - Over-engineered areas
   * @returns Quality score (0-1)
   */
  private calculatePlanQualityScore(
    comprehensive: boolean,
    appropriate: boolean,
    missingCoverage: string[],
    overEngineered: string[]
  ): number {
    let score = 0.5; // Base score

    // Reward comprehensiveness
    if (comprehensive) {
      score += 0.2;
    }

    // Reward appropriateness
    if (appropriate) {
      score += 0.2;
    }

    // Penalize missing coverage
    score -= missingCoverage.length * 0.05;

    // Penalize over-engineering
    score -= overEngineered.length * 0.03;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate improvement suggestions
   * @param stats - Experience statistics
   * @returns Improvement suggestions
   */
  private generateImprovementSuggestions(stats: any): Array<{
    area: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
    expectedImpact: number;
  }> {
    const suggestions: any[] = [];

    // Low success rate
    if (stats.avgReward < 0) {
      suggestions.push({
        area: 'Overall Success Rate',
        suggestion: 'Review test strategies - average reward is negative',
        priority: 'high',
        expectedImpact: 0.8,
      });
    }

    // High failure rate
    if (stats.byOutcome.failure / stats.totalExperiences > 0.5) {
      suggestions.push({
        area: 'Failure Rate',
        suggestion: 'More than 50% of tests fail - improve plan quality',
        priority: 'high',
        expectedImpact: 0.7,
      });
    }

    // Low partial success conversion
    if (stats.byOutcome.partial > stats.byOutcome.success) {
      suggestions.push({
        area: 'Partial Success',
        suggestion: 'Many partial successes - refine assertions and selectors',
        priority: 'medium',
        expectedImpact: 0.6,
      });
    }

    // Strategy-specific suggestions
    for (const [strategy, effectiveness] of Object.entries(stats.byStrategy)) {
      if ((effectiveness as any).successRate < 0.5) {
        suggestions.push({
          area: `Strategy: ${strategy}`,
          suggestion: `${strategy} has low success rate - consider alternatives`,
          priority: 'medium',
          expectedImpact: 0.5,
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate strategy adjustments
   * @param stats - Experience statistics
   * @returns Strategy adjustments
   */
  private generateStrategyAdjustments(stats: any): Array<{
    strategy: string;
    adjustment: 'increase' | 'decrease' | 'maintain';
    reason: string;
  }> {
    const adjustments: any[] = [];

    for (const [strategy, effectiveness] of Object.entries(stats.byStrategy)) {
      const eff = effectiveness as any;

      if (eff.successRate > 0.8) {
        adjustments.push({
          strategy,
          adjustment: 'increase',
          reason: `High success rate (${(eff.successRate * 100).toFixed(1)}%)`,
        });
      } else if (eff.successRate < 0.5) {
        adjustments.push({
          strategy,
          adjustment: 'decrease',
          reason: `Low success rate (${(eff.successRate * 100).toFixed(1)}%)`,
        });
      } else {
        adjustments.push({
          strategy,
          adjustment: 'maintain',
          reason: `Moderate success rate (${(eff.successRate * 100).toFixed(1)}%)`,
        });
      }
    }

    return adjustments;
  }
}

// =====================================================
// SELF-EVAL ENGINE FACTORY
// =====================================================

/**
 * Factory for creating self-evaluation engines
 * @deprecated Use `new SelfEvalEngine(config)` directly.
 */
export class SelfEvalEngineFactory {
  /**
   * Create a self-evaluation engine
   * @param config - Engine configuration
   * @deprecated Use `new SelfEvalEngine(config)` directly.
   */
  static create(config: SelfEvalEngineConfig): SelfEvalEngine {
    return new SelfEvalEngine(config);
  }

  /**
   * Create from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to `new SelfEvalEngine(config)` directly.
   */
  static fromEnv(experienceStore: ExperienceStore): SelfEvalEngine {
    return new SelfEvalEngine({
      experienceStore,
      minSamplesForEvaluation: parseInt(process.env.MIN_SAMPLES_FOR_EVAL || '5'),
      confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
      enableWeightUpdates: process.env.ENABLE_WEIGHT_UPDATES !== 'false',
    });
  }
}