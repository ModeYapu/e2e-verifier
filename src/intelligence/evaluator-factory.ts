/**
 * Evaluator Factory - Factory for creating test evaluators
 *
 * Provides factory methods for creating evaluator instances:
 * - LLMEvaluator: LLM-based evaluation
 * - RuleEvaluator: Rule-based evaluation
 * - MultiStrategyEvaluator: Multi-strategy evaluation
 *
 * @deprecated Using the factory is optional. You can directly instantiate:
 * - `new LLMEvaluator(config)`
 * - `new RuleEvaluator(config)`
 * - `new MultiStrategyEvaluator(config)`
 */

import {
  ITestEvaluator,
  LLMEvaluatorConfig,
  RuleEvaluatorConfig
} from './evaluator-core';
import { LLMEvaluator, RuleEvaluator } from './evaluator-core';
import { MultiStrategyEvaluator, MultiStrategyEvaluatorConfig } from './multi-strategy-evaluator';

/**
 * Factory for creating test evaluators
 */
export class EvaluatorFactory {
  /**
   * Create an evaluator based on configuration
   * @param evaluatorType - 'llm', 'rule', or 'multi-strategy'
   * @param llmConfig - Configuration for LLM evaluator (if evaluatorType is 'llm')
   * @param ruleConfig - Configuration for rule evaluator (if evaluatorType is 'rule')
   * @param multiStrategyConfig - Configuration for multi-strategy evaluator (if evaluatorType is 'multi-strategy')
   * @deprecated Use `new LLMEvaluator(config)`, `new RuleEvaluator(config)`, or `new MultiStrategyEvaluator(config)` directly.
   */
  static create(
    evaluatorType: 'llm' | 'rule' | 'multi-strategy' = 'rule',
    llmConfig?: LLMEvaluatorConfig,
    ruleConfig?: RuleEvaluatorConfig,
    multiStrategyConfig?: MultiStrategyEvaluatorConfig
  ): ITestEvaluator {
    switch (evaluatorType) {
      case 'llm':
        if (!llmConfig) {
          throw new Error('LLM config is required when evaluatorType is "llm"');
        }
        return new LLMEvaluator(llmConfig);

      case 'multi-strategy':
        return new MultiStrategyEvaluator(multiStrategyConfig);

      case 'rule':
      default:
        return new RuleEvaluator(ruleConfig);
    }
  }

  /**
   * Create an evaluator from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to evaluator constructors directly.
   */
  static fromEnv(): ITestEvaluator {
    const evaluatorType = process.env.EVALUATOR_TYPE as 'llm' | 'rule' | 'multi-strategy' || 'rule';

    if (evaluatorType === 'llm') {
      const llmConfig: LLMEvaluatorConfig = {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '3000'),
        },
        analyzeScreenshots: process.env.ANALYZE_SCREENSHOTS !== 'false',
        maxIssues: parseInt(process.env.MAX_ISSUES || '10'),
        maxSuggestions: parseInt(process.env.MAX_SUGGESTIONS || '5'),
      };
      return new LLMEvaluator(llmConfig);
    } else if (evaluatorType === 'multi-strategy') {
      return new MultiStrategyEvaluator({
        enabledStrategies: process.env.ENABLED_STRATEGIES?.split(',') || [
          'logic-check',
          'visual-consistency',
          'cross-reference',
          'edge-case',
          'evidence-scoring',
        ],
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        outputDir: process.env.ARTIFACTS_DIR || './output',
        verbose: process.env.VERBOSE === 'true',
      });
    } else {
      return new RuleEvaluator({
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        maxConsoleErrors: parseInt(process.env.MAX_CONSOLE_ERRORS || '5'),
        treatRetriesAsFlaky: process.env.TREAT_RETRIES_AS_FLAKY !== 'false',
        selectorIssuesRepairable: process.env.SELECTOR_ISSUES_REPAIRABLE !== 'false',
      });
    }
  }
}
