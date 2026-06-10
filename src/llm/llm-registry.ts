// LLMRegistry - Unified LLM Client Entry Point
// All modules should use this to create LLMClient instances

import { LLMClient } from '../agent/llm-client';

export interface LLMConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  maxSteps?: number;
}

export class LLMRegistry {
  private static instance: LLMRegistry;
  private defaultConfig: LLMConfig;

  private constructor(config: LLMConfig) {
    this.defaultConfig = config;
  }

  static initialize(config: LLMConfig): void {
    LLMRegistry.instance = new LLMRegistry(config);
  }

  static getInstance(): LLMRegistry {
    if (!LLMRegistry.instance) {
      // Auto-initialize from env if possible
      if (process.env.LLM_API_KEY) {
        LLMRegistry.initialize({
          apiKey: process.env.LLM_API_KEY,
          apiBase: process.env.LLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4',
          model: process.env.LLM_MODEL || 'glm-4',
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
          maxSteps: parseInt(process.env.LLM_MAX_STEPS || '20'),
        });
      } else {
        throw new Error('LLMRegistry not initialized and no LLM_API_KEY env var');
      }
    }
    return LLMRegistry.instance;
  }

  static isInitialized(): boolean {
    return !!LLMRegistry.instance;
  }

  createClient(overrides?: Partial<LLMConfig>): LLMClient {
    const config = { ...this.defaultConfig, ...overrides };
    return new LLMClient({
      model: config.model,
      apiKey: config.apiKey,
      apiBase: config.apiBase,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      maxSteps: config.maxSteps || 20,
    });
  }

  getConfig(): Readonly<LLMConfig> {
    return { ...this.defaultConfig };
  }

  updateConfig(updates: Partial<LLMConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...updates };
  }
}
