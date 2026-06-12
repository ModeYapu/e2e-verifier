/**
 * Test Evaluator - Evaluates test execution results
 *
 * The evaluator is responsible for analyzing test results and determining:
 * - Whether the test truly passed or failed
 * - Confidence in the verdict
 * - Root cause analysis if failed
 * - Suggestions for fixing issues
 *
 * Three implementations:
 * - LLMEvaluator: Uses LLM with multi-modal analysis of screenshots + logs
 * - RuleEvaluator: Uses rules and heuristics (no LLM needed)
 * - MultiStrategyEvaluator: Uses multiple verification strategies for comprehensive analysis
 *
 * This file has been split into two modules:
 * - evaluator-core.ts: Core interfaces and evaluation classes (LLMEvaluator, RuleEvaluator)
 * - evaluator-factory.ts: Factory for creating evaluators
 *
 * All exports are re-exported here for backward compatibility.
 */

// Re-export core types and evaluators
export {
  ITestEvaluator,
  LLMEvaluator,
  LLMEvaluatorConfig,
  RuleEvaluator,
  RuleEvaluatorConfig
} from './evaluator-core';

// Re-export factory
export { EvaluatorFactory } from './evaluator-factory';

// Re-export MultiStrategyEvaluator from its own file
export { MultiStrategyEvaluator, MultiStrategyEvaluatorConfig } from './multi-strategy-evaluator';
