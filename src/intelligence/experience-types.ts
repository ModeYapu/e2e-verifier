/**
 * Experience Types - RAISE-inspired test experience system
 *
 * This file defines types for the test experience store which:
 * - Records test experiences with implicit rewards
 * - Enables experience-guided planning
 * - Supports strategy effectiveness tracking
 */

// =====================================================
// TEST EXPERIENCE - Core experience type
// =====================================================

/**
 * Test experience - records what happened during testing
 */
export interface TestExperience {
  /** Unique experience ID */
  id: string;
  /** Problem signature (URL + page characteristics hash) */
  problemSignature: string;
  /** Page/context description */
  context: string;
  /** Test strategy that was used */
  strategy: string;
  /** Test outcome */
  outcome: 'success' | 'failure' | 'partial';
  /** Implicit reward (-1 to 1) */
  reward: number;
  /** Test plan that was used */
  testPlan: Record<string, unknown>; // TestPlan from types.ts
  /** Repair history if any */
  repairHistory?: RepairAttempt[];
  /** Timestamp of experience */
  timestamp: number;
  /** Metadata */
  meta: {
    browser?: string;
    viewport?: { width: number; height: number };
    siteName?: string;
  };
}

/**
 * Reward signal - explicit feedback on experience
 */
export interface RewardSignal {
  /** Related experience */
  experience: TestExperience;
  /** Calculated reward */
  reward: number;
  /** Reason for reward */
  reason: string;
}

/**
 * Experience query - filter experiences
 */
export interface ExperienceQuery {
  /** Problem signature to match */
  signature?: string;
  /** Site name to filter */
  siteName?: string;
  /** Outcome to filter */
  outcome?: 'success' | 'failure' | 'partial';
  /** Minimum reward */
  minReward?: number;
  /** Limit results */
  limit?: number;
  /** Strategy filter */
  strategy?: string;
}

// =====================================================
// REPAIR ATTEMPT - Track repair actions
// =====================================================

/**
 * Repair attempt - records what was tried
 */
export interface RepairAttempt {
  /** Repair type */
  type: 'selector' | 'timing' | 'assertion' | 'general';
  /** Target of repair (step ID, assertion ID, etc.) */
  target: string;
  /** Description of what was tried */
  description: string;
  /** Original value */
  originalValue?: string | number | boolean | Record<string, unknown>;
  /** New value */
  newValue?: string | number | boolean | Record<string, unknown>;
  /** Whether this specific repair worked */
  worked?: boolean;
  /** Timestamp */
  timestamp?: number;
}

// =====================================================
// STRATEGY EFFECTIVENESS - Track what works
// =====================================================

/**
 * Strategy effectiveness metrics
 */
export interface StrategyEffectiveness {
  /** Strategy name */
  strategy: string;
  /** Total times used */
  totalUses: number;
  /** Success count */
  successCount: number;
  /** Failure count */
  failureCount: number;
  /** Partial count */
  partialCount: number;
  /** Average reward */
  avgReward: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Last updated */
  lastUpdated: number;
}

/**
 * Strategy weight - for selection preference
 */
export interface StrategyWeight {
  /** Strategy name */
  strategy: string;
  /** Weight (higher = preferred) */
  weight: number;
  /** Confidence in weight (0-1) */
  confidence: number;
}

// =====================================================
// EXPERIENCE STATISTICS - Aggregate stats
// =====================================================

/**
 * Experience statistics - aggregate metrics
 */
export interface ExperienceStatistics {
  /** Total experiences */
  totalExperiences: number;
  /** Experiences by outcome */
  byOutcome: {
    success: number;
    failure: number;
    partial: number;
  };
  /** Average reward */
  avgReward: number;
  /** Strategy effectiveness */
  byStrategy: Record<string, StrategyEffectiveness>;
  /** Most common signatures */
  topSignatures: Array<{
    signature: string;
    count: number;
    avgReward: number;
  }>;
  /** Recent success rate trend */
  successTrend: Array<{
    timestamp: number;
    successRate: number;
  }>;
}

// =====================================================
// EXPERIENCE-GUIDED PLANNING TYPES
// =====================================================

/**
 * Similar experience - for planning
 */
export interface SimilarExperience {
  /** Experience */
  experience: TestExperience;
  /** Similarity score (0-1) */
  similarity: number;
  /** Why it's similar */
  reason: string;
}

/**
 * Plan adaptation result
 */
export interface PlanAdaptation {
  /** Adapted plan */
  plan: Record<string, unknown>; // TestPlan from types.ts
  /** What was adapted */
  adaptations: string[];
  /** Confidence in adaptation (0-1) */
  confidence: number;
}

// =====================================================
// SELF-EVALUATION TYPES
// =====================================================

/**
 * Strategy evaluation result
 */
export interface StrategyEvaluation {
  /** Strategy being evaluated */
  strategy: string;
  /** Experience being evaluated */
  experience: TestExperience;
  /** Was strategy effective? */
  effective: boolean;
  /** Confidence in evaluation (0-1) */
  confidence: number;
  /** Reasoning */
  reasoning: string;
  /** Suggestions for improvement */
  suggestions: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Plan evaluation result
 */
export interface PlanEvaluation {
  /** Plan being evaluated */
  plan: Record<string, unknown>; // TestPlan from types.ts
  /** Result from execution */
  result: Record<string, unknown>; // ScenarioResult from types.ts
  /** Was plan comprehensive? */
  comprehensive: boolean;
  /** Were steps appropriate? */
  appropriate: boolean;
  /** Missing coverage areas */
  missingCoverage: string[];
  /** Over-engineered areas */
  overEngineered: string[];
  /** Overall quality score (0-1) */
  qualityScore: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Improvement suggestions
 */
export interface ImprovementSuggestions {
  /** Site name */
  siteName?: string;
  /** What could be improved */
  suggestions: Array<{
    area: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
    expectedImpact: number; // 0-1
  }>;
  /** Strategy adjustments */
  strategyAdjustments: Array<{
    strategy: string;
    adjustment: 'increase' | 'decrease' | 'maintain';
    reason: string;
  }>;
  /** Timestamp */
  timestamp: number;
}