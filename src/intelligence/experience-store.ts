/**
 * Experience Store - RAISE-inspired experience accumulation
 *
 * This file implements the experience store which:
 * - Records test experiences with implicit rewards
 * - Queries similar experiences for planning
 * - Calculates reward signals from results
 * - Tracks strategy effectiveness
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  TestExperience,
  ExperienceQuery,
  RewardSignal,
  StrategyEffectiveness,
  ExperienceStatistics,
  SimilarExperience,
  RepairAttempt,
} from './experience-types';
import { ScenarioResult } from './types';

// =====================================================
// EXPERIENCE STORE CONFIGURATION
// =====================================================

/**
 * Configuration for experience store
 */
export interface ExperienceStoreConfig {
  /** Storage directory */
  storageDir?: string;
  /** Experience file path */
  experienceFile?: string;
  /** Maximum experiences to keep */
  maxExperiences?: number;
  /** Similarity threshold (0-1) */
  similarityThreshold?: number;
  /** Whether to enable persistence */
  persistEnabled?: boolean;
}

// =====================================================
// EXPERIENCE STORE
// =====================================================

/**
 * Main experience store class
 */
export class ExperienceStore {
  private experiences: Map<string, TestExperience> = new Map();
  private config: Required<ExperienceStoreConfig>;
  private strategyStats: Map<string, StrategyEffectiveness> = new Map();

  constructor(config: ExperienceStoreConfig = {}) {
    this.config = {
      storageDir: config.storageDir || './data',
      experienceFile: config.experienceFile || './data/experiences.json',
      maxExperiences: config.maxExperiences || 10000,
      similarityThreshold: config.similarityThreshold || 0.7,
      persistEnabled: config.persistEnabled !== false,
    };

    // Initialize storage
    this.initializeStorage();

    // Load existing experiences
    if (this.config.persistEnabled) {
      this.load();
    }
  }

  // =====================================================
  // CORE OPERATIONS
  // =====================================================

  /**
   * Record a new experience
   * @param experience - Experience to record
   */
  async record(experience: TestExperience): Promise<void> {
    // Store experience
    this.experiences.set(experience.id, experience);

    // Update strategy statistics
    this.updateStrategyStats(experience);

    // Persist if enabled
    if (this.config.persistEnabled) {
      await this.save();
    }

    // Prune if too many experiences
    if (this.experiences.size > this.config.maxExperiences) {
      this.pruneExperiences();
    }
  }

  /**
   * Query experiences
   * @param query - Query parameters
   * @returns Matching experiences
   */
  query(query: ExperienceQuery): TestExperience[] {
    let results = Array.from(this.experiences.values());

    // Filter by signature
    if (query.signature) {
      results = results.filter(exp =>
        exp.problemSignature === query.signature ||
        this.calculateSignatureSimilarity(exp.problemSignature, query.signature) >= this.config.similarityThreshold
      );
    }

    // Filter by site name
    if (query.siteName) {
      results = results.filter(exp => exp.meta.siteName === query.siteName);
    }

    // Filter by outcome
    if (query.outcome) {
      results = results.filter(exp => exp.outcome === query.outcome);
    }

    // Filter by minimum reward
    if (query.minReward !== undefined) {
      results = results.filter(exp => exp.reward >= query.minReward!);
    }

    // Filter by strategy
    if (query.strategy) {
      results = results.filter(exp => exp.strategy === query.strategy);
    }

    // Sort by reward (highest first) and timestamp (most recent)
    results.sort((a, b) => {
      if (b.reward !== a.reward) {
        return b.reward - a.reward;
      }
      return b.timestamp - a.timestamp;
    });

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Query similar experiences
   * @param signature - Problem signature
   * @param topK - Number of results
   * @returns Similar experiences with similarity scores
   */
  querySimilar(signature: string, topK: number = 5): SimilarExperience[] {
    const allExperiences = Array.from(this.experiences.values());

    // Calculate similarities
    const similarities = allExperiences.map(exp => ({
      experience: exp,
      similarity: this.calculateSignatureSimilarity(exp.problemSignature, signature),
      reason: this.explainSimilarity(exp.problemSignature, signature),
    }));

    // Filter by threshold and sort
    const filtered = similarities
      .filter(s => s.similarity >= this.config.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return filtered;
  }

  /**
   * Get successful test plans for a signature
   * @param signature - Problem signature
   * @returns Successful test plans
   */
  getSuccessfulPlans(signature: string): Array<{ plan: any; experience: TestExperience }> {
    const similarExperiences = this.querySimilar(signature, 10);

    return similarExperiences
      .filter(s => s.experience.outcome === 'success' && s.experience.reward > 0.5)
      .map(s => ({
        plan: s.experience.testPlan,
        experience: s.experience,
      }));
  }

  // =====================================================
  // REWARD CALCULATION
  // =====================================================

  /**
   * Calculate reward from test result
   * @param result - Test scenario result
   * @param repairAttempts - Number of repair attempts
   * @returns Calculated reward
   */
  calculateReward(result: ScenarioResult, repairAttempts: number = 0): RewardSignal {
    let reward: number;
    let reason: string;

    // All passed
    if (result.passed) {
      reward = 1.0;
      reason = 'All assertions passed';
    }
    // Partial pass
    else if (this.isPartialPass(result)) {
      reward = 0.5;
      reason = 'Partial pass - some assertions passed';
    }
    // Failed but repaired successfully
    else if (repairAttempts > 0 && this.wasRepaired(result)) {
      reward = 0.3;
      reason = 'Failed but repaired successfully';
    }
    // Failed, no repair
    else {
      reward = -0.5;
      reason = 'Failed and could not be repaired';
    }

    // Check for flakiness
    if (this.isFlaky(result)) {
      reward = -0.2;
      reason = 'Flaky test - inconsistent results';
    }

    return {
      experience: null as any, // Will be set when recording
      reward,
      reason,
    };
  }

  // =====================================================
  // STATISTICS
  // =====================================================

  /**
   * Get experience statistics
   * @param siteName - Optional site filter
   * @returns Experience statistics
   */
  getStats(siteName?: string): ExperienceStatistics {
    let experiences = Array.from(this.experiences.values());

    // Filter by site if specified
    if (siteName) {
      experiences = experiences.filter(exp => exp.meta.siteName === siteName);
    }

    // Calculate basic stats
    const totalExperiences = experiences.length;
    const byOutcome = {
      success: experiences.filter(e => e.outcome === 'success').length,
      failure: experiences.filter(e => e.outcome === 'failure').length,
      partial: experiences.filter(e => e.outcome === 'partial').length,
    };

    const avgReward = experiences.length > 0
      ? experiences.reduce((sum, e) => sum + e.reward, 0) / experiences.length
      : 0;

    // Strategy effectiveness
    const byStrategy: Record<string, StrategyEffectiveness> = {};
    experiences.forEach(exp => {
      if (!byStrategy[exp.strategy]) {
        byStrategy[exp.strategy] = this.getStrategyStats(exp.strategy);
      }
    });

    // Top signatures
    const signatureCounts = new Map<string, { count: number; totalReward: number }>();
    experiences.forEach(exp => {
      const current = signatureCounts.get(exp.problemSignature) || { count: 0, totalReward: 0 };
      signatureCounts.set(exp.problemSignature, {
        count: current.count + 1,
        totalReward: current.totalReward + exp.reward,
      });
    });

    const topSignatures = Array.from(signatureCounts.entries())
      .map(([signature, data]) => ({
        signature,
        count: data.count,
        avgReward: data.totalReward / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Success trend (last 100 experiences)
    const recentExperiences = experiences
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);

    const successTrend = this.calculateSuccessTrend(recentExperiences);

    return {
      totalExperiences,
      byOutcome,
      avgReward,
      byStrategy,
      topSignatures,
      successTrend,
    };
  }

  /**
   * Get strategy statistics
   * @param strategy - Strategy name
   * @returns Strategy effectiveness
   */
  getStrategyStats(strategy: string): StrategyEffectiveness {
    const stats = this.strategyStats.get(strategy);

    if (!stats) {
      return {
        strategy,
        totalUses: 0,
        successCount: 0,
        failureCount: 0,
        partialCount: 0,
        avgReward: 0,
        successRate: 0,
        lastUpdated: Date.now(),
      };
    }

    return { ...stats };
  }

  // =====================================================
  // SIGNATURE GENERATION
  // =====================================================

  /**
   * Generate problem signature from target
   * @param target - Test target
   * @param additionalContext - Additional context for signature
   * @returns Problem signature
   */
  generateSignature(target: any, additionalContext?: string): string {
    // Create signature from URL and context
    const url = target.url || '';
    const name = target.name || '';
    const description = target.description || '';

    // Create hash
    const data = `${url}|${name}|${description}|${additionalContext || ''}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    // Return prefix (first 16 chars) for practical matching
    return hash.substring(0, 16);
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Initialize storage directory
   */
  private initializeStorage(): void {
    const dir = path.dirname(this.config.experienceFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load experiences from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.config.experienceFile)) {
        const data = fs.readFileSync(this.config.experienceFile, 'utf-8');
        const experiences = JSON.parse(data) as TestExperience[];

        this.experiences.clear();
        experiences.forEach(exp => {
          this.experiences.set(exp.id, exp);
          this.updateStrategyStats(exp);
        });

        console.log(`✓ Loaded ${this.experiences.size} experiences from ${this.config.experienceFile}`);
      }
    } catch (error) {
      console.error('Failed to load experiences:', error);
    }
  }

  /**
   * Save experiences to disk
   */
  private async save(): Promise<void> {
    try {
      const experiences = Array.from(this.experiences.values());
      const data = JSON.stringify(experiences, null, 2);

      fs.writeFileSync(this.config.experienceFile, data, 'utf-8');
    } catch (error) {
      console.error('Failed to save experiences:', error);
    }
  }

  /**
   * Calculate signature similarity
   * @param sig1 - First signature
   * @param sig2 - Second signature
   * @returns Similarity (0-1)
   */
  private calculateSignatureSimilarity(sig1: string, sig2: string): number {
    // Exact match
    if (sig1 === sig2) {
      return 1.0;
    }

    // Hash prefix similarity (check how many characters match)
    let matchingChars = 0;
    const minLen = Math.min(sig1.length, sig2.length);

    for (let i = 0; i < minLen; i++) {
      if (sig1[i] === sig2[i]) {
        matchingChars++;
      } else {
        break;
      }
    }

    return matchingChars / sig1.length;
  }

  /**
   * Explain why two signatures are similar
   * @param sig1 - First signature
   * @param sig2 - Second signature
   * @returns Explanation
   */
  private explainSimilarity(sig1: string, sig2: string): string {
    if (sig1 === sig2) {
      return 'Exact match';
    }

    const similarity = this.calculateSignatureSimilarity(sig1, sig2);
    const matchingChars = Math.floor(similarity * sig1.length);

    return `${matchingChars} characters match (${(similarity * 100).toFixed(1)}% similarity)`;
  }

  /**
   * Update strategy statistics
   * @param experience - Experience to update stats with
   */
  private updateStrategyStats(experience: TestExperience): void {
    let stats = this.strategyStats.get(experience.strategy);

    if (!stats) {
      stats = {
        strategy: experience.strategy,
        totalUses: 0,
        successCount: 0,
        failureCount: 0,
        partialCount: 0,
        avgReward: 0,
        successRate: 0,
        lastUpdated: Date.now(),
      };
    }

    stats.totalUses++;

    if (experience.outcome === 'success') {
      stats.successCount++;
    } else if (experience.outcome === 'failure') {
      stats.failureCount++;
    } else if (experience.outcome === 'partial') {
      stats.partialCount++;
    }

    // Update average reward
    const totalReward = stats.avgReward * (stats.totalUses - 1) + experience.reward;
    stats.avgReward = totalReward / stats.totalUses;

    // Update success rate
    stats.successRate = stats.successCount / stats.totalUses;
    stats.lastUpdated = Date.now();

    this.strategyStats.set(experience.strategy, stats);
  }

  /**
   * Prune old experiences if too many
   */
  private pruneExperiences(): void {
    const experiences = Array.from(this.experiences.values());

    // Sort by timestamp (oldest first) and reward (lowest first)
    experiences.sort((a, b) => {
      // Remove very old experiences first
      if (a.timestamp < b.timestamp) {
        return -1;
      }
      if (a.timestamp > b.timestamp) {
        return 1;
      }
      // Then by reward (keep high reward)
      return a.reward - b.reward;
    });

    // Remove oldest experiences
    const toRemove = experiences.slice(0, experiences.length - this.config.maxExperiences);
    toRemove.forEach(exp => {
      this.experiences.delete(exp.id);
    });

    console.log(`Pruned ${toRemove.length} old experiences`);
  }

  /**
   * Check if result is partial pass
   * @param result - Test result
   * @returns True if partial pass
   */
  private isPartialPass(result: ScenarioResult): boolean {
    const passedAssertions = result.assertionResults.filter(ar => ar.passed).length;
    const totalAssertions = result.assertionResults.length;

    return totalAssertions > 0 && passedAssertions > 0 && passedAssertions < totalAssertions;
  }

  /**
   * Check if result was repaired
   * @param result - Test result
   * @returns True if repaired
   */
  private wasRepaired(result: ScenarioResult): boolean {
    return result.retryCount !== undefined && result.retryCount > 0;
  }

  /**
   * Check if result is flaky
   * @param result - Test result
   * @returns True if flaky
   */
  private isFlaky(result: ScenarioResult): boolean {
    return result.retryCount !== undefined && result.retryCount > 1;
  }

  /**
   * Calculate success trend
   * @param experiences - Experiences to analyze
   * @returns Success trend data
   */
  private calculateSuccessTrend(experiences: TestExperience[]): Array<{ timestamp: number; successRate: number }> {
    if (experiences.length === 0) {
      return [];
    }

    // Group by time windows (last 50 experiences)
    const windowSize = 50;
    const trend: Array<{ timestamp: number; successRate: number }> = [];

    for (let i = 0; i < experiences.length; i += windowSize) {
      const window = experiences.slice(i, i + windowSize);
      const successCount = window.filter(e => e.outcome === 'success').length;
      const successRate = successCount / window.length;

      trend.push({
        timestamp: window[0].timestamp,
        successRate,
      });
    }

    return trend.reverse(); // Most recent first
  }

  /**
   * Clear all experiences (useful for testing)
   */
  async clear(): Promise<void> {
    this.experiences.clear();
    this.strategyStats.clear();

    if (this.config.persistEnabled) {
      await this.save();
    }
  }

  /**
   * Get total experience count
   * @returns Total count
   */
  getCount(): number {
    return this.experiences.size;
  }
}

// =====================================================
// EXPERIENCE STORE FACTORY
// =====================================================

/**
 * Factory for creating experience stores
 * @deprecated Use `new ExperienceStore(config)` directly.
 */
export class ExperienceStoreFactory {
  /**
   * Create an experience store
   * @param config - Store configuration
   * @deprecated Use `new ExperienceStore(config)` directly.
   */
  static create(config?: ExperienceStoreConfig): ExperienceStore {
    return new ExperienceStore(config);
  }

  /**
   * Create from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to `new ExperienceStore(config)` directly.
   */
  static fromEnv(): ExperienceStore {
    return new ExperienceStore({
      storageDir: process.env.EXPERIENCE_STORAGE_DIR || './data',
      experienceFile: process.env.EXPERIENCE_FILE || './data/experiences.json',
      maxExperiences: parseInt(process.env.MAX_EXPERIENCES || '10000'),
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
      persistEnabled: process.env.EXPERIENCE_PERSIST !== 'false',
    });
  }
}