/**
 * LLM API Client for Agent Loop
 * Generic HTTP client for OpenAI-compatible APIs (GLM, OpenAI, Anthropic)
 */

import { AgentConfig, LLMResponse, ScriptActionType } from './types';
import type { ChatMessage } from '../types/common';
import { logger } from '../utils/logger';

/**
 * OpenAI-compatible API response structure
 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Request options for API calls
 */
interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * LLM Client for OpenAI-compatible APIs
 */
export class LLMClient {
  private config: AgentConfig;
  private defaultTimeout: number = 60000; // 60 seconds
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(config: AgentConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate that required configuration is present
   */
  private validateConfig(): void {
    if (!this.config.model) {
      throw new Error('Model name is required in AgentConfig');
    }
    if (!this.config.apiKey) {
      throw new Error('API key is required in AgentConfig');
    }
  }

  /**
   * Send chat completion request to LLM
   * @param systemPrompt System prompt for the LLM
   * @param messageHistory Conversation history
   * @param options Request options
   * @returns Parsed LLM response with thought and action
   */
  async chatCompletion(
    systemPrompt: string,
    messageHistory: ChatMessage[],
    options?: RequestOptions
  ): Promise<LLMResponse> {
    const retries = options?.retries ?? this.maxRetries;
    const retryDelay = options?.retryDelay ?? this.retryDelay;
    const timeout = options?.timeout ?? this.defaultTimeout;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.makeRequest(systemPrompt, messageHistory, timeout);
        const parsed = this.parseResponse(response);
        
        logger.info(`LLM request succeeded (attempt ${attempt + 1}/${retries})`);
        return parsed;
      } catch (error) {
        lastError = error as Error;
        logger.error(`LLM request failed (attempt ${attempt + 1}/${retries}): ${error}`);

        if (attempt < retries - 1) {
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`LLM request failed after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Make HTTP request to LLM API
   */
  private async makeRequest(
    systemPrompt: string,
    messageHistory: ChatMessage[],
    timeout: number
  ): Promise<OpenAIResponse> {
    const apiUrl = this.config.apiBase || 'https://api.openai.com/v1';
    const endpoint = `${apiUrl}/chat/completions`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messageHistory
    ];

    const requestBody = {
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2000,
      stream: false
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as OpenAIResponse;
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse LLM response into thought and action blocks
   */
  private parseResponse(response: OpenAIResponse): LLMResponse {
    if (!response.choices || response.choices.length === 0) {
      throw new Error('No choices returned from LLM API');
    }

    const content = response.choices[0].message.content;
    const tokens = response.usage?.total_tokens;

    // Parse thought and action blocks
    const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/i);
    const actionMatch = content.match(/<action>([\s\S]*?)<\/action>/i);

    if (!thoughtMatch || !actionMatch) {
      throw new Error('LLM response must contain <thought> and <action> blocks');
    }

    const thought = thoughtMatch[1].trim();
    const actionContent = actionMatch[1].trim();

    // Parse action type and content
    const actionTypeMatch = actionContent.match(/type:\s*(\w+)/i);
    const contentMatch = actionContent.match(/content:\s*([\s\S]*)/i);
    const doneMatch = actionContent.match(/done:\s*(true|false)/i);

    const actionType = actionTypeMatch ? actionTypeMatch[1].toLowerCase() : 'execute_script';
    const actionContentText = contentMatch ? contentMatch[1].trim() : '';
    const done = doneMatch ? doneMatch[1] === 'true' : false;

    return {
      thought,
      action: {
        type: this.validateActionType(actionType),
        content: actionContentText,
        done
      },
      raw: content,
      tokens
    };
  }

  /**
   * Validate action type
   */
  private validateActionType(type: string): ScriptActionType {
    const validTypes: ScriptActionType[] = ['write_script', 'execute_script', 'inspect_screenshot', 'reflect', 'done'];
    const normalizedType = type.toLowerCase().replace(/[^a-z_]/g, '_') as ScriptActionType;

    if (!validTypes.includes(normalizedType)) {
      logger.warn(`Unknown action type "${type}", defaulting to "execute_script"`);
      return 'execute_script';
    }

    return normalizedType;
  }

  /**
   * Estimate token count for a text string
   * Rough estimation: ~4 characters per token for English text
   */
  estimateTokens(text: string): number {
    // More accurate approximation for mixed content
    const words = text.split(/\s+/).length;
    const chars = text.length;
    return Math.ceil((words + chars / 4) / 2);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}
