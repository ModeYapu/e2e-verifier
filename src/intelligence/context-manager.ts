/**
 * Context Manager - Inspired by @agent-toolkit/context-engineer
 *
 * Five capabilities for intelligent context management:
 * 1. selectContext - Filter DOM to test-relevant nodes
 * 2. compressContext - Compress conversation history
 * 3. isolateContext - Isolate context per test scenario
 * 4. allocateBudget - Distribute token budget across tasks
 * 5. writeBack - Persist key findings to scratchpad
 */

import { DOMFilter } from './dom-filter';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Context selection result
 */
export interface ContextSelectionResult {
  filteredDOM: string;
  originalSize: number;
  filteredSize: number;
  reductionPercent: number;
  keyElements: string[];
}

/**
 * Context compression result
 */
export interface ContextCompressionResult {
  compressed: string;
  originalLength: number;
  compressedLength: number;
  compressionRatio: number;
  preservedPoints: string[];
}

/**
 * Token budget allocation
 */
export interface TokenAllocation {
  taskId: string;
  taskName: string;
  budget: number;
  estimated: number;
  priority: 'high' | 'normal' | 'low';
}

/**
 * Context manager configuration
 */
export interface ContextManagerConfig {
  maxTokens: number;
  compressionRatio: number;
  scratchpadDir: string;
  enableFiltering: boolean;
}

/**
 * Context message structure
 */
interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokens: 4000,
  compressionRatio: 0.4,
  scratchpadDir: './data/scratchpad',
  enableFiltering: true,
};

/**
 * Context Manager class
 */
export class ContextManager {
  private config: ContextManagerConfig;
  private domFilter: DOMFilter;
  private isolatedContexts: Map<string, ContextMessage[]> = new Map();
  private sharedContext: ContextMessage[] = [];

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.domFilter = new DOMFilter();

    // Ensure scratchpad directory exists
    if (!fs.existsSync(this.config.scratchpadDir)) {
      fs.mkdirSync(this.config.scratchpadDir, { recursive: true });
    }
  }

  /**
   * 1. selectContext - Filter DOM to only test-relevant nodes
   */
  selectContext(rawDOM: string, task: string, budget: number): ContextSelectionResult {
    const originalSize = this.estimateTokens(rawDOM);

    // Use DOM filter to extract relevant content
    const filtered = this.domFilter.filterDOM(rawDOM, task);
    const filteredSize = this.estimateTokens(filtered);

    // Further truncate if over budget
    let finalDOM = filtered;
    if (filteredSize > budget) {
      finalDOM = this.truncateToBudget(filtered, budget);
    }

    const reductionPercent = ((1 - this.estimateTokens(finalDOM) / originalSize) * 100);

    return {
      filteredDOM: finalDOM,
      originalSize,
      filteredSize: this.estimateTokens(finalDOM),
      reductionPercent: Math.round(reductionPercent),
      keyElements: this.domFilter.getKeyElements(),
    };
  }

  /**
   * 2. compressContext - Compress conversation history
   */
  compressContext(messages: ContextMessage[], ratio?: number): ContextCompressionResult {
    const compressionRatio = ratio ?? this.config.compressionRatio;
    const originalLength = JSON.stringify(messages).length;

    // Extract key points from messages
    const preservedPoints = this.extractKeyPoints(messages);

    // Compress by grouping related messages
    const compressed = this.createCompressedSummary(messages, preservedPoints);

    const compressedLength = JSON.stringify(compressed).length;
    const actualRatio = compressedLength / originalLength;

    return {
      compressed: JSON.stringify(compressed),
      originalLength,
      compressedLength,
      compressionRatio: Math.round(actualRatio * 100) / 100,
      preservedPoints,
    };
  }

  /**
   * 3. isolateContext - Isolate context for each test scenario
   */
  isolateContext(taskId: string): string {
    // Create isolated context for task
    if (!this.isolatedContexts.has(taskId)) {
      this.isolatedContexts.set(taskId, []);
    }

    return JSON.stringify({
      taskId,
      shared: this.sharedContext,
      isolated: this.isolatedContexts.get(taskId),
    });
  }

  /**
   * Add to isolated context
   */
  addToIsolatedContext(taskId: string, data: ContextMessage): void {
    if (!this.isolatedContexts.has(taskId)) {
      this.isolatedContexts.set(taskId, []);
    }
    this.isolatedContexts.get(taskId)!.push(data);
  }

  /**
   * Add to shared context
   */
  addToSharedContext(data: ContextMessage): void {
    this.sharedContext.push(data);
  }

  /**
   * 4. allocateBudget - Distribute token budget across tasks
   */
  allocateBudget(totalTokens: number, tasks: Array<{
    id: string;
    name: string;
    estimatedTokens: number;
    priority?: 'high' | 'normal' | 'low';
  }>): TokenAllocation[] {
    // Sort by priority and estimate
    const sortedTasks = [...tasks].sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority || 'normal'] - priorityOrder[a.priority || 'normal'];
      if (priorityDiff !== 0) return priorityDiff;
      return (b.estimatedTokens || 0) - (a.estimatedTokens || 0);
    });

    const allocations: TokenAllocation[] = [];
    let remainingTokens = totalTokens;

    // First pass: allocate to high priority
    for (const task of sortedTasks.filter(t => t.priority === 'high')) {
      const needed = task.estimatedTokens || 1000;
      const allocated = Math.min(needed, remainingTokens);
      remainingTokens -= allocated;

      allocations.push({
        taskId: task.id,
        taskName: task.name,
        budget: allocated,
        estimated: needed,
        priority: 'high',
      });

      if (remainingTokens <= 0) break;
    }

    // Second pass: allocate to normal priority
    if (remainingTokens > 0) {
      for (const task of sortedTasks.filter(t => t.priority === 'normal')) {
        const needed = task.estimatedTokens || 800;
        const allocated = Math.min(needed, remainingTokens);
        remainingTokens -= allocated;

        allocations.push({
          taskId: task.id,
          taskName: task.name,
          budget: allocated,
          estimated: needed,
          priority: 'normal',
        });

        if (remainingTokens <= 0) break;
      }
    }

    // Third pass: allocate to low priority
    if (remainingTokens > 0) {
      for (const task of sortedTasks.filter(t => t.priority === 'low')) {
        const needed = task.estimatedTokens || 500;
        const allocated = Math.min(needed, remainingTokens);
        remainingTokens -= allocated;

        allocations.push({
          taskId: task.id,
          taskName: task.name,
          budget: allocated,
          estimated: needed,
          priority: 'low',
        });

        if (remainingTokens <= 0) break;
      }
    }

    // Check if we need to warn about budget
    this.warnBudgetLimit(allocations, totalTokens);

    return allocations;
  }

  /**
   * 5. writeBack - Persist key findings to scratchpad
   */
  writeBack(key: string, value: unknown): void {
    const scratchpadPath = path.join(this.config.scratchpadDir, `${key}.json`);

    try {
      // Read existing data
      let existingData: unknown[] = [];
      if (fs.existsSync(scratchpadPath)) {
        const content = fs.readFileSync(scratchpadPath, 'utf-8');
        existingData = JSON.parse(content);
      }

      // Add new entry
      const entry = {
        value,
        timestamp: new Date().toISOString(),
      };
      existingData.push(entry);

      // Write back
      fs.writeFileSync(scratchpadPath, JSON.stringify(existingData, null, 2));
    } catch (error) {
      logger.error(`Failed to write back to scratchpad: ${error}`);
    }
  }

  /**
   * Read from scratchpad
   */
  readFromScratchpad(key: string): unknown[] {
    const scratchpadPath = path.join(this.config.scratchpadDir, `${key}.json`);

    try {
      if (fs.existsSync(scratchpadPath)) {
        const content = fs.readFileSync(scratchpadPath, 'utf-8');
        return JSON.parse(content);
      }
      return [];
    } catch (error) {
      logger.error(`Failed to read from scratchpad: ${error}`);
      return [];
    }
  }

  /**
   * Get context statistics
   */
  getStats(): {
    isolatedContexts: number;
    sharedContextSize: number;
    scratchpadFiles: number;
  } {
    return {
      isolatedContexts: this.isolatedContexts.size,
      sharedContextSize: this.sharedContext.length,
      scratchpadFiles: fs.readdirSync(this.config.scratchpadDir).length,
    };
  }

  /**
   * Estimate tokens in text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate content to fit budget
   */
  private truncateToBudget(content: string, budget: number): string {
    const targetChars = budget * 4;
    if (content.length <= targetChars) return content;

    return content.substring(0, targetChars) + '... [TRUNCATED]';
  }

  /**
   * Extract key points from messages
   */
  private extractKeyPoints(messages: ContextMessage[]): string[] {
    const points: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        // Look for action items
        if (msg.content.includes('ACTION:') || msg.content.includes('action')) {
          points.push(`Action taken: ${msg.content.substring(0, 100)}`);
        }
        // Look for findings
        if (msg.content.includes('found') || msg.content.includes('discovered')) {
          points.push(`Finding: ${msg.content.substring(0, 100)}`);
        }
      } else if (msg.role === 'user' && msg.content.includes('error')) {
        points.push(`Error: ${msg.content.substring(0, 100)}`);
      }
    }

    return points;
  }

  /**
   * Create compressed summary
   */
  private createCompressedSummary(messages: ContextMessage[], keyPoints: string[]): ContextMessage[] {
    const compressed = [];

    // Add key points as summary
    if (keyPoints.length > 0) {
      compressed.push({
        role: 'system',
        content: `SUMMARY: ${keyPoints.join('; ')}`,
      });
    }

    // Keep last few messages verbatim
    const recentMessages = messages.slice(-3);
    compressed.push(...recentMessages);

    return compressed;
  }

  /**
   * Warn about budget limits
   */
  private warnBudgetLimit(allocations: TokenAllocation[], totalTokens: number): void {
    const totalNeeded = allocations.reduce((sum, a) => sum + a.estimated, 0);
    const totalAllocated = allocations.reduce((sum, a) => sum + a.budget, 0);

    if (totalAllocated < totalNeeded) {
      logger.warn(`⚠️ Budget warning: allocated ${totalAllocated} but needed ${totalNeeded} tokens`);
    }
  }
}

/**
 * Default context manager instance
 */
export const defaultContextManager = new ContextManager();