/**
 * AI Service
 * Handles AI-related operations including Provider, TestGenerator, and SelfHealing
 */

import { ProviderFactory, AIProvider } from '../../ai/provider';
import { getSelfHealingLocator } from '../../ai/self-healing';
import { getSmartTestGenerator } from '../../ai/test-generator';
import { Job } from '../../scheduler/types';

export interface GenerateTestsOptions {
  model?: string;
  maxTests?: number;
  saveToFile?: boolean;
  outputDir?: string;
}

export class AIService {
  /**
   * Generate tests from URL using AI
   */
  async generateTests(url: string, options?: GenerateTestsOptions): Promise<any> {
    if (!url) {
      throw new Error('url is required');
    }

    const generator = getSmartTestGenerator();
    const generatedConfig = await generator.generateFromUrl(url, options);

    // Optionally save to file
    if (options?.saveToFile) {
      const filePath = generator.saveToFile(generatedConfig);
      generatedConfig.metadata['savedToFile'] = filePath;
    }

    return generatedConfig;
  }

  /**
   * Get AI suggestions for failed job
   */
  async suggestFixes(job: Job): Promise<any> {
    if (job.status !== 'failed') {
      throw new Error('Job must be failed to get fix suggestions');
    }

    const error = job.error || 'Unknown error';
    const siteName = job.config?.name || 'unknown';
    const siteUrl = job.config?.url || 'unknown';

    // Use AI to analyze the failure and suggest fixes
    const provider = ProviderFactory.createFromEnv();
    const prompt = `
I need help fixing a failed test. Here are the details:

Site Name: ${siteName}
Site URL: ${siteUrl}
Job ID: ${job.id}
Error: ${error}
Job Type: ${job.type}
Configuration: ${JSON.stringify(job.config, null, 2)}

Please analyze this failure and suggest:
1. What might have caused this failure
2. How to fix it
3. Specific steps to implement the fix
4. How to prevent this in the future

Respond in JSON format:
{
  "rootCause": "analysis of what went wrong",
  "fixSuggestions": ["step 1", "step 2", "step 3"],
  "preventionMeasures": ["measure 1", "measure 2"],
  "confidence": 85
}
`;

    const response = await provider.chat([
      { role: 'user', content: prompt }
    ]);

    const suggestions = JSON.parse(response);

    return {
      jobId: job.id,
      error,
      suggestions,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * List configured AI providers
   */
  listAIProviders(): Array<{
    name: string;
    type: string;
    available: boolean;
    model?: string;
  }> {
    const providers: Array<{
      name: string;
      type: string;
      available: boolean;
      model?: string;
    }> = [];

    // Check OpenAI
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'OpenAI',
        type: 'openai',
        available: true,
        model: process.env.OPENAI_MODEL || 'gpt-4'
      });
    }

    // Check Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: 'Anthropic',
        type: 'anthropic',
        available: true,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
      });
    }

    // Check GLM
    if (process.env.GLM_API_KEY) {
      providers.push({
        name: 'GLM',
        type: 'glm',
        available: true,
        model: process.env.GLM_MODEL || 'glm-4'
      });
    }

    // Check LLM generic
    if (process.env.LLM_API_KEY) {
      providers.push({
        name: 'Generic LLM',
        type: 'generic',
        available: true,
        model: process.env.LLM_MODEL || 'unknown'
      });
    }

    return providers;
  }

  /**
   * Get self-healing locator statistics
   */
  getLocatorStats(): unknown {
    const locator = getSelfHealingLocator();
    return locator.getCacheStats();
  }

  /**
   * Clear self-healing locator cache
   */
  clearLocatorCache(): void {
    const locator = getSelfHealingLocator();
    locator.clearCache();
  }

  /**
   * Create AI provider from environment
   */
  createProviderFromEnv(): AIProvider {
    return ProviderFactory.createFromEnv();
  }
}
