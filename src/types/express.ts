/**
 * Express Request Type Definitions
 * Provides typed request body interfaces for API endpoints
 */

import { Request } from 'express';

// =====================================================
// TYPED REQUEST INTERFACES
// =====================================================

/**
 * Base typed request interface
 */
export interface TypedRequestBody<T> extends Request {
  body: T;
}

// =====================================================
// VERIFY REQUEST TYPES
// =====================================================

/**
 * Fast verify request body
 */
export interface FastVerifyBody {
  url: string;
  name: string;
  checks?: string[];
  viewport?: { width: number; height: number };
  timeout?: number;
  expectedStatusCode?: number;
  screenshots?: string[];
  customChecks?: Array<{
    name: string;
    type: 'element' | 'text' | 'attribute' | 'javascript';
    selector?: string;
    expected?: string | boolean;
    script?: string;
  }>;
}

/**
 * Deep verify request body
 */
export interface DeepVerifyBody {
  url: string;
  task: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

/**
 * Orchestrated verify request body
 */
export interface OrchestratedVerifyBody {
  sites: Array<{
    name: string;
    url: string;
    expectedStatusCode?: number;
    viewport?: { width: number; height: number };
    timeout?: number;
    checks?: string[];
    auth?: {
      loginUrl?: string;
      username: string;
      password: string;
      verifySelector?: string;
      verifyText?: string;
      verifyAttribute?: {
        selector: string;
        attribute: string;
        value?: string;
      };
    };
  }>;
  strict?: boolean;
  model?: string;
  skipDeep?: boolean;
}

/**
 * Matrix verify request body
 */
export interface MatrixVerifyBody {
  site: {
    name: string;
    url: string;
    expectedStatusCode?: number;
    viewport?: { width: number; height: number };
    timeout?: number;
    checks?: string[];
  };
  matrix: {
    browsers?: ('chromium' | 'webkit' | 'firefox')[];
    viewports?: Array<{ name?: string; width: number; height: number }>;
    locales?: string[];
  };
}

/**
 * Intelligent verify request body
 */
export interface IntelligentVerifyBody {
  target: {
    url: string;
    name?: string;
    description?: string;
    tags?: string[];
    priority?: 'high' | 'normal' | 'low';
  };
  options?: {
    useLLMPlanner?: boolean;
    useLLMEvaluator?: boolean;
    evaluatorType?: 'llm' | 'rule' | 'multi-strategy';
    enableRepair?: boolean;
    maxRepairRounds?: number;
    outputDir?: string;
    verbose?: boolean;
    model?: string;
    maxScenarios?: number;
    maxSteps?: number;
    enabledStrategies?: string[];
    confidenceThreshold?: number;
  };
  async?: boolean;
}

// =====================================================
// JOB REQUEST TYPES
// =====================================================

/**
 * Create job request body
 */
export interface CreateJobBody {
  type: 'fast' | 'deep' | 'orchestrated' | 'matrix' | 'intelligent';
  priority?: 'high' | 'normal' | 'low';
  maxRetries?: number;
  timeout?: number;
  config?: {
    fastVerify?: {
      url: string;
      name: string;
      checks?: string[];
      viewport?: { width: number; height: number };
      timeout?: number;
      expectedStatusCode?: number;
      screenshots?: string[];
      customChecks?: Array<{
        name: string;
        type: 'element' | 'text' | 'attribute' | 'javascript';
        selector?: string;
        expected?: string | boolean;
        script?: string;
      }>;
    };
    deepVerify?: {
      url: string;
      task: string;
      model?: string;
      maxSteps?: number;
      temperature?: number;
    };
    orchestratedVerify?: {
      sites: Array<{
        name: string;
        url: string;
        expectedStatusCode?: number;
        viewport?: { width: number; height: number };
        timeout?: number;
        checks?: string[];
      }>;
      strict?: boolean;
      model?: string;
      skipDeep?: boolean;
    };
    intelligentVerify?: {
      target: {
        url: string;
        name?: string;
        description?: string;
        tags?: string[];
        priority?: 'high' | 'normal' | 'low';
      };
      options?: {
        useLLMPlanner?: boolean;
        useLLMEvaluator?: boolean;
        evaluatorType?: 'llm' | 'rule' | 'multi-strategy';
        enableRepair?: boolean;
        maxRepairRounds?: number;
        outputDir?: string;
        verbose?: boolean;
        model?: string;
        maxScenarios?: number;
        maxSteps?: number;
        enabledStrategies?: string[];
        confidenceThreshold?: number;
      };
    };
  };
}

// =====================================================
// PROJECT REQUEST TYPES
// =====================================================

/**
 * Create project request body
 */
export interface CreateProjectBody {
  name: string;
  url: string;
  description?: string;
  config?: {
    viewport?: { width: number; height: number };
    timeout?: number;
    expectedStatusCode?: number;
    checks?: string[];
  };
}

// =====================================================
// KEY REQUEST TYPES
// =====================================================

/**
 * Create key request body
 */
export interface CreateKeyBody {
  name: string;
  description?: string;
  permissions?: string[];
}

// =====================================================
// TYPED REQUEST EXPORTS
// =====================================================

export type FastVerifyRequest = TypedRequestBody<FastVerifyBody>;
export type DeepVerifyRequest = TypedRequestBody<DeepVerifyBody>;
export type OrchestratedVerifyRequest = TypedRequestBody<OrchestratedVerifyBody>;
export type MatrixVerifyRequest = TypedRequestBody<MatrixVerifyBody>;
export type IntelligentVerifyRequest = TypedRequestBody<IntelligentVerifyBody>;
export type CreateJobRequest = TypedRequestBody<CreateJobBody>;
export type CreateProjectRequest = TypedRequestBody<CreateProjectBody>;
export type CreateKeyRequest = TypedRequestBody<CreateKeyBody>;

// Re-export createError for convenience
export { createError } from '../middleware/error-handler';
