/**
 * Verification Service
 * Handles verification business logic including Browser management, Verifier, AgentLoop, and Orchestrator creation
 */

import { Browser } from '@playwright/test';
import { TestResult } from '../../types';
import { ResultStore } from '../../storage/result-store';
import { BrowserPool } from '../../browser/browser-pool';
import { fastVerify, FastVerifyRequest } from './fast-verify';
import {
  deepVerify,
  orchestratedVerify,
  matrixVerify,
  DeepVerifyRequest,
  OrchestratedVerifyRequest,
  MatrixVerifyRequest
} from './deep-verify';
import {
  intelligentVerify,
  multiAgentVerify,
  IntelligentVerifyRequest,
  MultiAgentVerifyRequest
} from './intelligent-verify';
import { IntelligenceRunResult } from '../../intelligence/types';

// Re-export types for backward compatibility
export type {
  FastVerifyRequest,
  DeepVerifyRequest,
  OrchestratedVerifyRequest,
  MatrixVerifyRequest,
  IntelligentVerifyRequest,
  MultiAgentVerifyRequest
};

export class VerifyService {
  private resultStore: ResultStore;
  private browserPool: BrowserPool;

  constructor(headless: boolean = true) {
    this.resultStore = new ResultStore();
    this.browserPool = BrowserPool.getInstance({ headless });
  }

  async getBrowser(): Promise<Browser> {
    // BrowserPool now manages browser instances
    // This method is kept for backward compatibility
    const page = await this.browserPool.acquirePage();
    return page.context().browser();
  }

  async closeBrowser(): Promise<void> {
    // BrowserPool manages browser lifecycle
    // This method is kept for backward compatibility
    await this.browserPool.close();
  }

  /**
   * Get the browser pool instance
   */
  getBrowserPool(): BrowserPool {
    return this.browserPool;
  }

  /**
   * Perform fast verification (synchronous)
   */
  async fastVerify(request: FastVerifyRequest): Promise<TestResult> {
    return fastVerify(request, this.resultStore);
  }

  /**
   * Perform deep verification
   */
  async deepVerify(request: DeepVerifyRequest): Promise<any> {
    return deepVerify(request, this.resultStore);
  }

  /**
   * Perform orchestrated verification
   */
  async orchestratedVerify(request: OrchestratedVerifyRequest): Promise<any> {
    return orchestratedVerify(request, this.resultStore);
  }

  /**
   * Perform matrix verification (synchronous)
   */
  async matrixVerify(request: MatrixVerifyRequest): Promise<any> {
    return matrixVerify(request, this.resultStore);
  }

  /**
   * Perform intelligent verification
   */
  async intelligentVerify(request: IntelligentVerifyRequest): Promise<IntelligenceRunResult> {
    return intelligentVerify(request, this.resultStore);
  }

  /**
   * Perform multi-agent verification
   */
  async multiAgentVerify(request: MultiAgentVerifyRequest): Promise<any> {
    return multiAgentVerify(request);
  }

  /**
   * Get API key from environment
   */
  private getApiKey(): string {
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
    if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;

    throw new Error('API key not found. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GLM_API_KEY, or LLM_API_KEY environment variable.');
  }

  /**
   * Get API base URL from environment
   */
  private getApiBase(model: string): string {
    // LLM_BASE_URL overrides everything — user's explicit choice
    if (process.env.LLM_BASE_URL) {
      return process.env.LLM_BASE_URL;
    }
    if (model.startsWith('deepseek')) {
      return process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
    }
    if (model.startsWith('gpt-')) {
      return process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    }
    if (model.startsWith('claude-')) {
      return process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1';
    }
    if (model.startsWith('glm-')) {
      return process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
    }

    return process.env.LLM_API_BASE || 'https://api.openai.com/v1';
  }

  /**
   * Cleanup method for proper resource management
   */
  async cleanup(): Promise<void> {
    try {
      await this.browserPool.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}
