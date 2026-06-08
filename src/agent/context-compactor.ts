/**
 * Context Compactor for Agent Loop
 * Manages context window to prevent exceeding token limits
 */

import { AgentStep, ContextCompactionConfig } from './types';

/**
 * Summary of compacted steps
 */
interface StepSummary {
  stepRange: string;
  totalSteps: number;
  actions: string[];
  errors: number;
  screenshots: number;
  summary: string;
}

/**
 * Context Compactor for managing token usage
 */
export class ContextCompactor {
  private config: ContextCompactionConfig;
  private totalTokensUsed: number = 0;
  private compactionCount: number = 0;

  constructor(config?: Partial<ContextCompactionConfig>) {
    this.config = {
      maxTokens: config?.maxTokens || 8000,
      compactEvery: config?.compactEvery || 10,
      preserveRecent: config?.preserveRecent || 5
    };
  }

  /**
   * Compact agent steps to reduce token usage
   * @param steps All agent steps
   * @returns Compacted context string
   */
  compactSteps(steps: AgentStep[]): string {
    if (steps.length <= this.config.preserveRecent) {
      return this.formatAllSteps(steps);
    }

    // Split into older steps (to compress) and recent steps (to preserve)
    const splitIndex = steps.length - this.config.preserveRecent;
    const olderSteps = steps.slice(0, splitIndex);
    const recentSteps = steps.slice(splitIndex);

    // Create summary of older steps
    const summary = this.createSummary(olderSteps);
    this.compactionCount++;

    // Combine summary with recent steps
    return [
      this.formatSummary(summary),
      this.formatRecentSteps(recentSteps)
    ].join('\n\n');
  }

  /**
   * Create summary from a group of steps
   */
  private createSummary(steps: AgentStep[]): StepSummary {
    const actions = steps.map(s => s.command);
    const errors = steps.filter(s => s.error).length;
    const screenshots = steps.filter(s => s.screenshot).length;

    // Generate a textual summary
    const summaryPoints: string[] = [];

    // Main actions performed
    const uniqueActions = [...new Set(actions)];
    if (uniqueActions.length > 0) {
      summaryPoints.push(`Actions: ${uniqueActions.slice(0, 3).join(', ')}`);
    }

    // Errors encountered
    if (errors > 0) {
      summaryPoints.push(`Errors encountered: ${errors}`);
    }

    // Screenshots captured
    if (screenshots > 0) {
      summaryPoints.push(`Screenshots captured: ${screenshots}`);
    }

    // Overall progress
    const successfulSteps = steps.filter(s => !s.error).length;
    summaryPoints.push(`Success rate: ${successfulSteps}/${steps.length} steps completed`);

    return {
      stepRange: `Steps ${steps[0].step}-${steps[steps.length - 1].step}`,
      totalSteps: steps.length,
      actions: uniqueActions,
      errors,
      screenshots,
      summary: summaryPoints.join('; ')
    };
  }

  /**
   * Format summary for inclusion in context
   */
  private formatSummary(summary: StepSummary): string {
    return [
      `[COMPACTED SUMMARY - ${summary.stepRange}]`,
      `Total steps: ${summary.totalSteps}`,
      `Actions performed: ${summary.actions.join(', ')}`,
      `Screenshots: ${summary.screenshots}, Errors: ${summary.errors}`,
      `Summary: ${summary.summary}`
    ].join('\n');
  }

  /**
   * Format recent steps verbatim
   */
  private formatRecentSteps(steps: AgentStep[]): string {
    const lines: string[] = ['[RECENT STEPS - DETAILED]'];
    
    for (const step of steps) {
      lines.push(this.formatSingleStep(step));
    }

    return lines.join('\n');
  }

  /**
   * Format all steps when no compaction needed
   */
  private formatAllSteps(steps: AgentStep[]): string {
    const lines: string[] = ['[ALL STEPS - DETAILED]'];
    
    for (const step of steps) {
      lines.push(this.formatSingleStep(step));
    }

    return lines.join('\n');
  }

  /**
   * Format a single step
   */
  private formatSingleStep(step: AgentStep): string {
    const lines: string[] = [
      `Step ${step.step} (${step.timestamp}):`,
      `  Thought: ${step.thought.substring(0, 100)}${step.thought.length > 100 ? '...' : ''}`,
      `  Command: ${step.command}`,
      `  Output: ${step.output.substring(0, 100)}${step.output.length > 100 ? '...' : ''}`
    ];

    if (step.error) {
      lines.push(`  Error: ${step.error}`);
    }

    if (step.screenshot) {
      lines.push(`  Screenshot: ${step.screenshot}`);
    }

    return lines.join('\n');
  }

  /**
   * Check if compaction is needed based on token count
   * @param currentTokens Current token usage
   * @returns Whether compaction should occur
   */
  shouldCompact(currentTokens: number): boolean {
    return currentTokens > (this.config.maxTokens * 0.8); // Compact at 80% of limit
  }

  /**
   * Check if compaction is needed based on step count
   * @param stepCount Current number of steps
   * @returns Whether compaction should occur
   */
  shouldCompactBySteps(stepCount: number): boolean {
    return stepCount >= this.config.compactEvery;
  }

  /**
   * Add to token usage counter
   * @param tokens Number of tokens to add
   */
  addTokenUsage(tokens: number): void {
    this.totalTokensUsed += tokens;
  }

  /**
   * Get total tokens used so far
   */
  getTotalTokens(): number {
    return this.totalTokensUsed;
  }

  /**
   * Reset token counter
   */
  resetTokenCounter(): void {
    this.totalTokensUsed = 0;
  }

  /**
   * Estimate tokens in a string
   * @param text Text to estimate
   * @returns Estimated token count
   */
  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    const words = text.split(/\s+/).length;
    const chars = text.length;
    return Math.ceil((words + chars / 4) / 2);
  }

  /**
   * Estimate tokens in steps
   * @param steps Steps to estimate
   * @returns Estimated token count
   */
  estimateStepTokens(steps: AgentStep[]): number {
    let total = 0;
    
    for (const step of steps) {
      total += this.estimateTokens(step.thought);
      total += this.estimateTokens(step.command);
      total += this.estimateTokens(step.output);
      if (step.error) {
        total += this.estimateTokens(step.error);
      }
    }

    return total;
  }

  /**
   * Get compaction statistics
   */
  getStats(): {
    totalTokensUsed: number;
    compactionCount: number;
    config: ContextCompactionConfig;
  } {
    return {
      totalTokensUsed: this.totalTokensUsed,
      compactionCount: this.compactionCount,
      config: { ...this.config }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ContextCompactionConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Reset all counters
   */
  reset(): void {
    this.totalTokensUsed = 0;
    this.compactionCount = 0;
  }

  /**
   * Create a system prompt section for context management
   */
  createSystemPromptSection(): string {
    return [
      'CONTEXT MANAGEMENT:',
      `- Maximum tokens: ${this.config.maxTokens}`,
      `- Compact every ${this.config.compactEvery} steps`,
      `- Preserve ${this.config.preserveRecent} recent steps verbatim`,
      `- Token usage will be monitored and context compressed when necessary`
    ].join('\n');
  }
}

/**
 * Default configuration for context compaction
 */
export const DEFAULT_COMPACTOR_CONFIG: ContextCompactionConfig = {
  maxTokens: 8000,
  compactEvery: 10,
  preserveRecent: 5
};
