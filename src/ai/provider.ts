/**
 * AI Provider interface and implementations for pluggable AI capabilities
 */

// Import unified types from common
import type { ChatMessage } from '../types/common';
import { LLMRegistry } from '../llm/llm-registry';
import { InfrastructureError, ValidationError } from '../utils/errors';

/**
 * Options for AI provider operations
 */
export interface AIProviderOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  model?: string;
  [key: string]: unknown; // Allow additional provider-specific options
}

export interface AIProvider {
  /**
   * Chat completion interface
   */
  chat(messages: ChatMessage[], options?: AIProviderOptions): Promise<string>;

  /**
   * Image analysis interface
   */
  analyzeImage(imageUrl: string, prompt: string, options?: AIProviderOptions): Promise<string>;

  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Check if provider is available
   */
  isAvailable(): boolean;
}

/**
 * GLM Provider implementation
 */
export class GLMProvider implements AIProvider {
  private apiKey: string;
  private apiBase: string;
  private model: string;

  constructor(apiKey: string, apiBase: string = 'https://open.bigmodel.cn/api/paas/v4', model: string = 'glm-4') {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.model = model;
  }

  getName(): string {
    return 'GLM';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options: AIProviderOptions = {}): Promise<string> {
    const client = LLMRegistry.getInstance().createClient({
      apiKey: this.apiKey,
      apiBase: this.apiBase,
      model: this.model,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 4000,
      maxSteps: 10, // Required field
    });

    // Extract system prompt if present
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await client.chatCompletion(systemPrompt, chatMessages);

    return response.raw || response.thought || '';
  }

  async analyzeImage(imageUrl: string, prompt: string, options: AIProviderOptions = {}): Promise<string> {
    // For GLM, we need to use a different approach for image analysis
    // This is a placeholder implementation
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Please analyze this image: ${imageUrl}\n\n${prompt}`
      }
    ];

    return this.chat(messages, options);
  }
}

/**
 * OpenAI Provider implementation
 */
export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private apiBase: string;
  private model: string;

  constructor(apiKey: string, apiBase: string = 'https://api.openai.com/v1', model: string = 'gpt-4') {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.model = model;
  }

  getName(): string {
    return 'OpenAI';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options: AIProviderOptions = {}): Promise<string> {
    // Use native fetch (Node.js 18+) or https module
    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4000
      })
    });

    if (!response.ok) {
      throw InfrastructureError.apiFailure('OpenAI', response.status, response.statusText);
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
  }

  async analyzeImage(imageUrl: string, prompt: string, options: AIProviderOptions = {}): Promise<string> {
    // Use native fetch (Node.js 18+) or https module
    // Use GPT-4 Vision for image analysis
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ];

    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: options.visionModel || 'gpt-4-vision-preview',
        messages: messages,
        max_tokens: options.maxTokens || 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
  }
}

/**
 * Anthropic Provider implementation
 */
export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private apiBase: string;
  private model: string;

  constructor(apiKey: string, apiBase: string = 'https://api.anthropic.com/v1', model: string = 'claude-3-sonnet-20240229') {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.model = model;
  }

  getName(): string {
    return 'Anthropic';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options: AIProviderOptions = {}): Promise<string> {
    // Use native fetch (Node.js 18+)
    const response = await fetch(`${this.apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text || '';
  }

  async analyzeImage(imageUrl: string, prompt: string, options: AIProviderOptions = {}): Promise<string> {
    // Use native fetch (Node.js 18+)
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }
    ];

    const response = await fetch(`${this.apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        max_tokens: options.maxTokens || 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text || '';
  }
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: 'glm' | 'openai' | 'anthropic';
  apiKey: string;
  apiBase?: string;
  model?: string;
}

/**
 * Fallback Provider that tries primary first, then secondary
 */
export class FallbackProvider implements AIProvider {
  private primary: AIProvider;
  private secondary: AIProvider;

  constructor(primary: AIProvider, secondary: AIProvider) {
    this.primary = primary;
    this.secondary = secondary;
  }

  getName(): string {
    return `Fallback(${this.primary.getName()} -> ${this.secondary.getName()})`;
  }

  isAvailable(): boolean {
    return this.primary.isAvailable() || this.secondary.isAvailable();
  }

  async chat(messages: ChatMessage[], options?: any): Promise<string> {
    try {
      if (this.primary.isAvailable()) {
        return await this.primary.chat(messages, options);
      }
    } catch (error) {
      console.warn(`Primary provider ${this.primary.getName()} failed, trying secondary:`, error);
    }

    if (!this.secondary.isAvailable()) {
      throw InfrastructureError.providerUnavailable('Both primary and secondary providers');
    }

    return await this.secondary.chat(messages, options);
  }

  async analyzeImage(imageUrl: string, prompt: string, options?: any): Promise<string> {
    try {
      if (this.primary.isAvailable()) {
        return await this.primary.analyzeImage(imageUrl, prompt, options);
      }
    } catch (error) {
      console.warn(`Primary provider ${this.primary.getName()} failed for image analysis, trying secondary:`, error);
    }

    if (!this.secondary.isAvailable()) {
      throw InfrastructureError.providerUnavailable('Both primary and secondary providers');
    }

    return await this.secondary.analyzeImage(imageUrl, prompt, options);
  }
}

/**
 * Provider Factory
 */
export class ProviderFactory {
  private static providers: Map<string, AIProvider> = new Map();

  /**
   * Create a provider from configuration
   */
  static create(config: ProviderConfig): AIProvider {
    switch (config.type) {
      case 'glm':
        return new GLMProvider(config.apiKey, config.apiBase, config.model);
      case 'openai':
        return new OpenAIProvider(config.apiKey, config.apiBase, config.model);
      case 'anthropic':
        return new AnthropicProvider(config.apiKey, config.apiBase, config.model);
      default:
        throw ValidationError.invalidValue('config.type', config.type, 'glm, openai, or anthropic');
    }
  }

  /**
   * Create provider from environment variables
   */
  static createFromEnv(): AIProvider {
    // Try to create primary provider
    let primary: AIProvider | null = null;
    let secondary: AIProvider | null = null;

    // Try OpenAI first
    if (process.env.OPENAI_API_KEY) {
      primary = new OpenAIProvider(
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_API_BASE,
        process.env.OPENAI_MODEL || 'gpt-4'
      );
    }

    // Try Anthropic second
    if (process.env.ANTHROPIC_API_KEY) {
      if (!primary) {
        primary = new AnthropicProvider(
          process.env.ANTHROPIC_API_KEY,
          process.env.ANTHROPIC_API_BASE,
          process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
        );
      } else {
        secondary = new AnthropicProvider(
          process.env.ANTHROPIC_API_KEY,
          process.env.ANTHROPIC_API_BASE,
          process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
        );
      }
    }

    // Try GLM third
    if (process.env.GLM_API_KEY) {
      if (!primary) {
        primary = new GLMProvider(
          process.env.GLM_API_KEY,
          process.env.GLM_API_BASE,
          process.env.GLM_MODEL || 'glm-4'
        );
      } else if (!secondary) {
        secondary = new GLMProvider(
          process.env.GLM_API_KEY,
          process.env.GLM_API_BASE,
          process.env.GLM_MODEL || 'glm-4'
        );
      }
    }

    // Return fallback provider if we have both, or single if only one
    if (primary && secondary) {
      return new FallbackProvider(primary, secondary);
    }

    if (primary) {
      return primary;
    }

    throw InfrastructureError.configurationError(
      'AI provider',
      'Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GLM_API_KEY environment variable'
    );
  }

  /**
   * Register a named provider
   */
  static register(name: string, provider: AIProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Get a registered provider
   */
  static get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   */
  static getAll(): Map<string, AIProvider> {
    return new Map(this.providers);
  }
}
