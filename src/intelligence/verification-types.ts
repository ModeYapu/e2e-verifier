/**
 * Verification Types — Multi-Strategy Verification Engine
 *
 * Defines the core types for the multi-strategy verification system
 * that provides comprehensive test result analysis using multiple
 * verification strategies.
 */

import { ScenarioResult, TestPlan, TestTarget } from './types';

// =====================================================
// VERIFICATION STRATEGY INTERFACE
// =====================================================

/**
 * Interface for verification strategies
 * Each strategy analyzes test results from a different perspective
 */
export interface VerificationStrategy {
  /** Unique strategy name */
  name: string;

  /** Verify the result and produce a verdict */
  verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict>;
}

// =====================================================
// STRATEGY VERDICT
// =====================================================

/**
 * Result from a single verification strategy
 */
export interface StrategyVerdict {
  /** Whether the verification passed */
  passed: boolean;

  /** Confidence in the verdict (0-1) */
  confidence: number;

  /** Evidence supporting the verdict */
  evidence: string[];

  /** Issues found during verification */
  issues: StrategyIssue[];

  /** Additional metadata from the strategy */
  metadata?: Record<string, unknown>;
}

/**
 * Issue found by a verification strategy
 */
export interface StrategyIssue {
  /** Issue severity */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /** Issue category */
  category: string;

  /** Description of the issue */
  description: string;

  /** Which step/assertion this relates to */
  stepId?: string;

  /** Additional evidence */
  evidence?: string[];

  /** Additional metadata */
  metadata?: Record<string, any>;
}

// =====================================================
// VERIFICATION CONTEXT
// =====================================================

/**
 * Context for verification strategies
 */
export interface VerificationContext {
  /** Test target */
  target: TestTarget;

  /** Test plan */
  plan: TestPlan;

  /** Previous results for comparison (optional) */
  previousResults?: ScenarioResult[];

  /** Verification options */
  options?: VerificationOptions;
}

/**
 * Options for verification strategies
 */
export interface VerificationOptions {
  /** Whether to enable detailed logging */
  verbose?: boolean;

  /** Output directory for artifacts */
  outputDir?: string;

  /** Strategy-specific options */
  strategyOptions?: Map<string, Record<string, any>>;
}

// =====================================================
// VERIFICATION REPORT
// =====================================================

/**
 * Comprehensive verification report from all strategies
 */
export interface VerificationReport {
  /** Overall verdict */
  overallPassed: boolean;

  /** Overall confidence (0-1) */
  overallConfidence: number;

  /** Individual strategy verdicts */
  verdicts: Map<string, StrategyVerdict>;

  /** Summary of findings */
  summary: string;

  /** Recommendations */
  recommendations: Recommendation[];

  /** Metadata */
  metadata: {
    evaluatedAt: string;
    strategiesUsed: string[];
    totalDuration: number;
  };
}

/**
 * Recommendation from verification
 */
export interface Recommendation {
  /** Recommendation type */
  type: 'repair' | 'retry' | 'investigate' | 'accept' | 'modify';

  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Description of the recommendation */
  description: string;

  /** What this applies to */
  appliesTo?: {
    stepId?: string;
    assertionId?: string;
    scenarioId?: string;
  };

  /** Suggested action */
  action?: string;

  /** Confidence in this recommendation */
  confidence?: number;
}

// =====================================================
// CLAIM TYPES
// =====================================================

/**
 * Atomic claim from claim decomposition
 */
export interface Claim {
  /** Unique claim ID */
  id: string;

  /** Claim description */
  description: string;

  /** Related assertion */
  relatedAssertion?: string;

  /** Dependencies on other claims */
  dependencies: string[];

  /** Whether this claim is critical */
  critical: boolean;

  /** How to verify this claim */
  verificationMethod: 'direct' | 'inference' | 'comparison';
}

/**
 * Result from claim decomposition
 */
export interface ClaimDecomposition {
  /** Decomposed claims */
  claims: Claim[];

  /** Claim dependencies */
  dependencies: Map<string, string[]>;

  /** Metadata */
  metadata: {
    originalAssertion: string;
    decompositionMethod: string;
  };
}