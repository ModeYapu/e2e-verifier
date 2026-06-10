/**
 * Experience-Guided Planner - RAISE-inspired experience-driven planning
 *
 * This file implements the experience-guided planner which:
 * - Queries experience store for similar pages
 * - Reuses successful test plans when possible
 * - Falls back to LLM planner when no experience exists
 * - Records new experiences after execution
 */

import {
  TestTarget,
  TestPlan,
  PlannedScenario,
} from './types';
import {
  TestExperience,
  SimilarExperience,
  PlanAdaptation,
  RewardSignal,
} from './experience-types';
import { ExperienceStore } from './experience-store';
import { ITestPlanner } from './planner';

// =====================================================
// EXPERIENCE-GUIDED PLANNER CONFIGURATION
// =====================================================

/**
 * Configuration for experience-guided planner
 */
export interface ExperienceGuidedPlannerConfig {
  /** Experience store */
  experienceStore: ExperienceStore;
  /** Base LLM planner */
  basePlanner: ITestPlanner;
  /** Minimum similarity threshold for reuse (0-1) */
  minSimilarity?: number;
  /** Maximum similar experiences to consider */
  maxSimilarExperiences?: number;
  /** Whether to enable plan adaptation */
  enableAdaptation?: boolean;
  /** Strategy to use for experience-guided planning */
  strategy?: string;
}

// =====================================================
// EXPERIENCE-GUIDED PLANNER
// =====================================================

/**
 * Experience-guided planner implementation
 */
export class ExperienceGuidedPlanner implements ITestPlanner {
  private experienceStore: ExperienceStore;
  private basePlanner: ITestPlanner;
  private config: Required<ExperienceGuidedPlannerConfig>;

  constructor(config: ExperienceGuidedPlannerConfig) {
    this.experienceStore = config.experienceStore;
    this.basePlanner = config.basePlanner;
    this.config = {
      experienceStore: config.experienceStore,
      basePlanner: config.basePlanner,
      minSimilarity: config.minSimilarity || 0.7,
      maxSimilarExperiences: config.maxSimilarExperiences || 5,
      enableAdaptation: config.enableAdaptation !== false,
      strategy: config.strategy || 'experience-guided',
    };
  }

  // =====================================================
  // MAIN PLAN METHOD
  // =====================================================

  /**
   * Generate a test plan for a target
   * @param target - Test target
   * @returns Generated test plan
   */
  async plan(target: TestTarget): Promise<TestPlan> {
    console.log(`\n🧠 Experience-Guided Planning for: ${target.name || target.url}`);

    // Generate problem signature
    const signature = this.experienceStore.generateSignature(target);
    console.log(`  Signature: ${signature}`);

    // Query for similar experiences
    const similarExperiences = this.experienceStore.querySimilar(
      signature,
      this.config.maxSimilarExperiences
    );

    console.log(`  Found ${similarExperiences.length} similar experiences`);

    // Check if we have high-confidence successful experiences
    const successfulExperiences = similarExperiences.filter(
      se => se.experience.outcome === 'success' && se.similarity >= this.config.minSimilarity
    );

    if (successfulExperiences.length > 0 && this.config.enableAdaptation) {
      console.log(`  ✓ Reusing successful experience (similarity: ${successfulExperiences[0].similarity.toFixed(2)})`);
      return this.adaptPlan(target, successfulExperiences[0]);
    }

    // Fall back to base planner
    console.log(`  Using LLM planner (no suitable experience found)`);
    const plan = await this.basePlanner.plan(target);

    // Add experience-guided metadata
    plan.metadata = {
      ...plan.metadata,
      experienceGuided: false,
      signature,
      similarExperiences: similarExperiences.length,
    };

    return plan;
  }

  // =====================================================
  // PLAN ADAPTATION
  // =====================================================

  /**
   * Adapt a plan from similar experience
   * @param target - New test target
   * @param similarExp - Similar experience with plan
   * @returns Adapted plan
   */
  private adaptPlan(target: TestTarget, similarExp: SimilarExperience): TestPlan {
    const originalPlan = similarExp.experience.testPlan;
    const adaptations: string[] = [];

    // Create new plan based on original
    const adaptedPlan: TestPlan = {
      target,
      scenarios: originalPlan.scenarios.map(scenario => this.adaptScenario(scenario, target, adaptations)),
      metadata: {
        plannerType: 'llm',
        generatedAt: new Date().toISOString(),
        confidence: similarExp.similarity,
        experienceGuided: true,
        originalExperienceId: similarExp.experience.id,
        adaptations,
      },
    };

    console.log(`  Adaptations: ${adaptations.join(', ')}`);
    return adaptedPlan;
  }

  /**
   * Adapt a single scenario
   * @param scenario - Original scenario
   * @param target - New target
   * @param adaptations - Adaptations list (mutated)
   * @returns Adapted scenario
   */
  private adaptScenario(scenario: PlannedScenario, target: TestTarget, adaptations: string[]): PlannedScenario {
    const adapted: PlannedScenario = {
      ...scenario,
      id: this.generateId(),
      url: target.url, // Update URL to new target
    };

    // Adapt steps
    adapted.steps = scenario.steps.map(step => this.adaptStep(step, adaptations));

    // Adapt assertions
    adapted.assertions = scenario.assertions.map(assertion => this.adaptAssertion(assertion, adaptations));

    return adapted;
  }

  /**
   * Adapt a single step
   * @param step - Original step
   * @param adaptations - Adaptations list (mutated)
   * @returns Adapted step
   */
  private adaptStep(step: any, adaptations: string[]): any {
    const adapted = { ...step };

    // Update selectors if they contain URLs or dynamic parts
    if (adapted.selector && this.needsSelectorAdaptation(adapted.selector)) {
      adapted.selector = this.adaptSelector(adapted.selector);
      adaptations.push('selector-adjustment');
    }

    // Update expected values if they contain URLs
    if (adapted.expected && this.needsSelectorAdaptation(adapted.expected)) {
      adapted.expected = this.adaptSelector(adapted.expected);
      adaptations.push('expectation-adjustment');
    }

    return adapted;
  }

  /**
   * Adapt a single assertion
   * @param assertion - Original assertion
   * @param adaptations - Adaptations list (mutated)
   * @returns Adapted assertion
   */
  private adaptAssertion(assertion: any, adaptations: string[]): any {
    const adapted = { ...assertion };

    // Update expected values
    if (adapted.expected && this.needsSelectorAdaptation(adapted.expected)) {
      adapted.expected = this.adaptSelector(adapted.expected);
      adaptations.push('assertion-adjustment');
    }

    // Update selectors
    if (adapted.selector && this.needsSelectorAdaptation(adapted.selector)) {
      adapted.selector = this.adaptSelector(adapted.selector);
      adaptations.push('assertion-selector-adjustment');
    }

    return adapted;
  }

  /**
   * Check if selector needs adaptation
   * @param selector - Selector to check
   * @returns True if needs adaptation
   */
  private needsSelectorAdaptation(selector: string): boolean {
    // Check if selector contains URL-like patterns
    const urlPatterns = [
      /https?:\/\//,
      /\/path\//,
      /\/\d+\//, // IDs in URLs
      /\[href.*=.*\]/,
      /\[src.*=.*\]/,
    ];

    return urlPatterns.some(pattern => pattern.test(selector));
  }

  /**
   * Adapt selector for new context
   * @param selector - Original selector
   * @returns Adapted selector
   */
  private adaptSelector(selector: string): string {
    // Remove URL-specific parts and make more generic
    let adapted = selector;

    // Replace specific URLs with more generic patterns
    adapted = adapted.replace(/https?:\/\/[^\s"']+/g, '[url-placeholder]');
    adapted = adapted.replace(/\/\d+\//g, '/[id]/');
    adapted = adapted.replace(/\[href.*=.*\]/g, '[href]');
    adapted = adapted.replace(/\[src.*=.*\]/g, '[src]');

    return adapted;
  }

  // =====================================================
  // EXPERIENCE RECORDING
  // =====================================================

  /**
   * Record experience after execution
   * @param target - Test target
   * @param plan - Test plan that was used
   * @param result - Execution result
   * @param reward - Calculated reward
   */
  async recordExperience(
    target: TestTarget,
    plan: TestPlan,
    result: any,
    reward: RewardSignal
  ): Promise<void> {
    const signature = this.experienceStore.generateSignature(target);

    // Determine outcome
    let outcome: 'success' | 'failure' | 'partial';
    if (result.passed) {
      outcome = 'success';
    } else if (this.isPartialPass(result)) {
      outcome = 'partial';
    } else {
      outcome = 'failure';
    }

    // Create experience
    const experience: TestExperience = {
      id: this.generateId(),
      problemSignature: signature,
      context: target.description || target.url,
      strategy: this.config.strategy,
      outcome,
      reward: reward.reward,
      testPlan: plan,
      repairHistory: this.extractRepairHistory(result),
      timestamp: Date.now(),
      meta: {
        browser: result.meta?.browser,
        viewport: result.meta?.viewport,
        siteName: target.name,
      },
    };

    // Record experience
    await this.experienceStore.record(experience);

    console.log(`✓ Experience recorded: ${outcome} (reward: ${reward.reward.toFixed(2)})`);
  }

  /**
   * Extract repair history from result
   * @param result - Test result
   * @returns Repair attempts
   */
  private extractRepairHistory(result: any): any[] {
    if (!result.repairAttempts) {
      return [];
    }

    return result.repairAttempts.map((attempt: any) => ({
      type: attempt.type || 'general',
      target: attempt.target || 'unknown',
      description: attempt.description || 'Repair attempt',
      originalValue: attempt.originalValue,
      newValue: attempt.newValue,
      worked: attempt.worked || false,
      timestamp: attempt.timestamp || Date.now(),
    }));
  }

  /**
   * Check if result is partial pass
   * @param result - Test result
   * @returns True if partial pass
   */
  private isPartialPass(result: any): boolean {
    if (!result.assertionResults) {
      return false;
    }

    const passedAssertions = result.assertionResults.filter((ar: any) => ar.passed).length;
    const totalAssertions = result.assertionResults.length;

    return totalAssertions > 0 && passedAssertions > 0 && passedAssertions < totalAssertions;
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  /**
   * Generate unique ID
   * @returns Unique ID
   */
  private generateId(): string {
    return `exp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get strategy effectiveness
   * @param strategy - Strategy name
   * @returns Strategy effectiveness
   */
  getStrategyEffectiveness(strategy: string): any {
    return this.experienceStore.getStrategyStats(strategy);
  }

  /**
   * Get experience store
   * @returns Experience store
   */
  getExperienceStore(): ExperienceStore {
    return this.experienceStore;
  }
}

// =====================================================
// EXPERIENCE-GUIDED PLANNER FACTORY
// =====================================================

/**
 * Factory for creating experience-guided planners
 * @deprecated Use `new ExperienceGuidedPlanner(config)` directly.
 */
export class ExperienceGuidedPlannerFactory {
  /**
   * Create an experience-guided planner
   * @param config - Planner configuration
   * @deprecated Use `new ExperienceGuidedPlanner(config)` directly.
   */
  static create(config: ExperienceGuidedPlannerConfig): ExperienceGuidedPlanner {
    return new ExperienceGuidedPlanner(config);
  }

  /**
   * Create from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to `new ExperienceGuidedPlanner(config)` directly.
   */
  static fromEnv(basePlanner: ITestPlanner): ExperienceGuidedPlanner {
    const experienceStore = new ExperienceStore();

    return new ExperienceGuidedPlanner({
      experienceStore,
      basePlanner,
      minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.7'),
      maxSimilarExperiences: parseInt(process.env.MAX_SIMILAR_EXPERIENCES || '5'),
      enableAdaptation: process.env.ENABLE_ADAPTATION !== 'false',
      strategy: process.env.EXPERIENCE_STRATEGY || 'experience-guided',
    });
  }
}