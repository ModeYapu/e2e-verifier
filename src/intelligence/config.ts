/**
 * Intelligence Module Configuration
 *
 * Extracts configuration from environment variables for intelligent testing components.
 */

import { IntelligentOrchestratorConfig } from './orchestrator';

/**
 * Parse intelligent orchestrator configuration from environment variables
 *
 * @returns IntelligentOrchestratorConfig configuration object
 */
export function parseIntelligenceConfigFromEnv(): IntelligentOrchestratorConfig {
  return {
    planner: {
      useLLM: process.env.USE_LLM_PLANNER === 'true',
      llmConfig: process.env.USE_LLM_PLANNER === 'true' ? {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
        },
      } : undefined,
    },
    executor: {
      outputDir: process.env.ARTIFACTS_DIR || './artifacts',
      enableScreenshots: process.env.ENABLE_SCREENSHOTS !== 'false',
      enableConsoleLogs: process.env.ENABLE_CONSOLE_LOGS !== 'false',
      defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    },
    evaluator: {
      evaluatorType: (process.env.EVALUATOR_TYPE as 'llm' | 'rule' | 'multi-strategy') || 'rule',
      useLLM: process.env.USE_LLM_EVALUATOR === 'true',
      llmConfig: process.env.USE_LLM_EVALUATOR === 'true' ? {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
        },
      } : undefined,
      multiStrategyConfig: (process.env.EVALUATOR_TYPE as 'llm' | 'rule' | 'multi-strategy') === 'multi-strategy' ? {
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
      } : undefined,
    },
    repairLoop: {
      enable: process.env.ENABLE_REPAIR !== 'false',
      maxRounds: parseInt(process.env.MAX_REPAIR_ROUNDS || '3'),
      config: {
        useLLMRepair: process.env.USE_LLM_REPAIR === 'true',
        llm: process.env.USE_LLM_REPAIR === 'true' ? {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
        } : undefined,
      },
    },
    defaultOptions: {
      useLLMPlanner: process.env.USE_LLM_PLANNER === 'true',
      useLLMEvaluator: process.env.USE_LLM_EVALUATOR === 'true',
      enableRepair: process.env.ENABLE_REPAIR !== 'false',
      maxRepairRounds: parseInt(process.env.MAX_REPAIR_ROUNDS || '3'),
      outputDir: process.env.ARTIFACTS_DIR || './artifacts',
      verbose: process.env.VERBOSE === 'true',
    },
    experienceStore: {
      enable: process.env.ENABLE_EXPERIENCE_STORE !== 'false',
      storageDir: process.env.EXPERIENCE_STORAGE_DIR || './data',
      experienceFile: process.env.EXPERIENCE_FILE || './data/experiences.json',
      maxExperiences: parseInt(process.env.MAX_EXPERIENCES || '10000'),
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
      persistEnabled: process.env.EXPERIENCE_PERSIST !== 'false',
    },
    experienceGuidedPlanning: {
      enable: process.env.ENABLE_EXPERIENCE_GUIDED_PLANNING !== 'false',
      minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.7'),
      maxSimilarExperiences: parseInt(process.env.MAX_SIMILAR_EXPERIENCES || '5'),
      enableAdaptation: process.env.ENABLE_ADAPTATION !== 'false',
      strategy: process.env.EXPERIENCE_STRATEGY || 'experience-guided',
    },
    selfEval: {
      enable: process.env.ENABLE_SELF_EVAL !== 'false',
      minSamplesForEvaluation: parseInt(process.env.MIN_SAMPLES_FOR_EVAL || '5'),
      confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
      enableWeightUpdates: process.env.ENABLE_WEIGHT_UPDATES !== 'false',
    },
  };
}