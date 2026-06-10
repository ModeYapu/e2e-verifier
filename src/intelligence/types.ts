/**
 * Intelligence Module Types — Planner / Executor / Evaluator Architecture
 *
 * This file defines the core types for the 3-layer intelligent testing architecture:
 * - Planner: Generates test plans from targets
 * - Executor: Executes test scenarios
 * - Evaluator: Evaluates test results
 * - Repair Loop: Fixes and retries failed tests
 */

// Import unified types from common
import type {
  FailureCategory,
  Evidence,
  Artifact,
  ArtifactType,
  AssertionType
} from '../types/common';

// Re-export these types for backward compatibility
export type {
  FailureCategory,
  Evidence,
  Artifact,
  ArtifactType,
  AssertionType
};

// =====================================================
// TEST TARGET - What to test
// =====================================================

/**
 * Test target - describes what needs to be tested
 */
export interface TestTarget {
  /** URL to test */
  url: string;
  /** Site name for identification */
  name?: string;
  /** Natural language description of what to test */
  description?: string;
  /** Optional site configuration if available */
  siteConfig?: any; // SiteConfig from types/index.ts
  /** Test priority (affects planning depth) */
  priority?: 'high' | 'normal' | 'low';
  /** Tags for categorization */
  tags?: string[];
}

// =====================================================
// TEST PLAN - What the planner generates
// =====================================================

/**
 * Complete test plan with multiple scenarios
 */
export interface TestPlan {
  /** Target this plan was generated for */
  target: TestTarget;
  /** Scenarios to test */
  scenarios: PlannedScenario[];
  /** Planner metadata */
  metadata: {
    plannerType: 'llm' | 'config';
    generatedAt: string;
    confidence?: number; // 0-1, how confident the planner is
    experienceGuided?: boolean; // Whether experience-guided planning was used
    signature?: string; // Problem signature for the plan
    similarExperiences?: number; // Number of similar experiences found
    originalExperienceId?: string; // ID of original experience if adapted
    adaptations?: string[]; // List of adaptations made to the plan
  };
}

/**
 * Single planned test scenario
 */
export interface PlannedScenario {
  /** Unique identifier */
  id: string;
  /** Scenario name */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** URL for this scenario (can differ from target url) */
  url: string;
  /** Ordered steps to execute */
  steps: PlannedStep[];
  /** Assertions to verify after steps */
  assertions: PlannedAssertion[];
  /** Viewport configuration */
  viewport?: { width: number; height: number };
  /** Authentication if needed */
  auth?: {
    loginUrl: string;
    username: string;
    password: string;
    verifySelector?: string;
  };
  /** Timeout for this scenario */
  timeout?: number;
  /** Estimated execution time (for scheduling) */
  estimatedDuration?: number;
}

/**
 * Single step in a test scenario
 */
export interface PlannedStep {
  /** Step number (1-indexed) */
  id: string;
  /** Action to perform */
  action: StepAction;
  /** CSS selector for element actions (click, type, etc.) */
  selector?: string;
  /** Value to type or input */
  value?: string;
  /** Description of what this step does */
  description: string;
  /** Wait time after this step (ms) */
  waitAfter?: number;
  /** Expected result of this step */
  expected?: string;
  /** Whether this step is critical (failure stops scenario) */
  critical?: boolean;
  /** Screenshot after this step */
  screenshot?: boolean;
}

/**
 * Action types for test steps
 */
export type StepAction =
  | 'navigate'      // Navigate to URL
  | 'click'         // Click element
  | 'type'          // Type text into input
  | 'wait'          // Wait for time or selector
  | 'scroll'        // Scroll page
  | 'hover'         // Hover over element
  | 'select'        // Select dropdown option
  | 'submit'        // Submit form
  | 'screenshot'    // Take screenshot
  | 'assert'        // Make assertion
  | 'javascript'    // Execute JavaScript
  | 'goto';         // Alias for navigate

/**
 * Assertion to verify after steps
 */
export interface PlannedAssertion {
  /** Assertion type */
  type: AssertionType;
  /** Expected value */
  expected: any;
  /** CSS selector for element-based assertions */
  selector?: string;
  /** Attribute name for attribute assertions */
  attribute?: string;
  /** Description of what this assertion checks */
  description: string;
  /** Whether assertion is critical */
  critical?: boolean;
}

// =====================================================
// EXECUTION RESULTS - What the executor produces
// =====================================================

/**
 * Result from executing a single scenario
 */
export interface ScenarioResult {
  /** Scenario that was executed */
  scenarioId: string;
  /** Scenario name */
  scenarioName: string;
  /** URL that was tested */
  url: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Individual step results */
  stepResults: StepResult[];
  /** Assertion results */
  assertionResults: AssertionResult[];
  /** Artifacts collected (screenshots, logs, etc.) */
  artifacts: Artifact[];
  /** Execution duration (ms) */
  duration: number;
  /** Timestamp of execution */
  timestamp: string;
  /** Error if scenario failed completely */
  error?: string;
  /** Retry count if retries occurred */
  retryCount?: number;
}

/**
 * Result from executing a single step
 */
export interface StepResult {
  /** Step that was executed */
  step: PlannedStep;
  /** Whether step passed */
  passed: boolean;
  /** Actual result (if different from expected) */
  actual?: any;
  /** Error message if step failed */
  error?: string;
  /** Screenshot taken at this step */
  screenshot?: string;
  /** Console logs at this step */
  consoleLogs?: ConsoleLog[];
  /** Duration of step execution (ms) */
  duration: number;
  /** Timestamp of step execution */
  timestamp: string;
}

/**
 * Result from evaluating an assertion
 */
export interface AssertionResult {
  /** Assertion that was evaluated */
  assertion: PlannedAssertion;
  /** Whether assertion passed */
  passed: boolean;
  /** Actual value */
  actual?: any;
  /** Error message if failed */
  error?: string;
  /** Screenshot showing assertion state */
  screenshot?: string;
}

/**
 * Console log entry
 */
export interface ConsoleLog {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  url?: string;
}

// =====================================================
// EVALUATION RESULTS - What the evaluator produces
// =====================================================

/**
 * Result from evaluating a scenario result
 */
export interface EvaluationResult {
  /** Scenario being evaluated */
  scenarioId: string;
  /** Overall verdict */
  verdict: 'pass' | 'fail' | 'flaky' | 'inconclusive';
  /** Confidence in verdict (0-1) */
  confidence: number;
  /** Reasoning for the verdict */
  reasoning: string;
  /** Category of failure (if failed) */
  failureCategory?: FailureCategory;
  /** Specific issues found */
  issues: Issue[];
  /** Suggestions for fixing issues */
  suggestions: Suggestion[];
  /** Whether this needs repair */
  needsRepair: boolean;
  /** Evaluator metadata */
  metadata: {
    evaluatorType: 'llm' | 'rule';
    evaluatedAt: string;
    modelUsed?: string;
  };
}

/**
 * Issue found during evaluation
 */
export interface Issue {
  /** Issue severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Issue category */
  category: FailureCategory;
  /** Description of the issue */
  description: string;
  /** Which step/assertion this issue relates to */
  stepId?: string;
  /** Evidence supporting this issue */
  evidence?: Evidence;
}

/**
 * Suggestion for fixing issues
 */
export interface Suggestion {
  /** Suggestion type */
  type: 'repair_selector' | 'adjust_timing' | 'modify_assertion' | 'add_retry' | 'environment_fix' | 'unknown';
  /** Description of the suggestion */
  description: string;
  /** What to apply the suggestion to */
  target?: {
    stepId?: string;
    assertionId?: string;
    selector?: string;
  };
  /** Suggested fix (if applicable) */
  fix?: any;
  /** Confidence in this suggestion (0-1) */
  confidence?: number;
}

// =====================================================
// REPAIR RESULTS - What the repair loop produces
// =====================================================

/**
 * Result from a repair attempt
 */
export interface RepairResult {
  /** Original scenario result */
  originalResult: ScenarioResult;
  /** Original evaluation */
  originalEvaluation: EvaluationResult;
  /** Repair attempt number */
  attemptNumber: number;
  /** Whether repair was successful */
  success: boolean;
  /** Repaired scenario (with fixes applied) */
  repairedScenario?: PlannedScenario;
  /** Result after repair */
  repairedResult?: ScenarioResult;
  /** Evaluation after repair */
  repairedEvaluation?: EvaluationResult;
  /** Repairs that were attempted */
  repairs: RepairAttempt[];
  /** Duration of repair process (ms) */
  duration: number;
  /** Timestamp of repair */
  timestamp: string;
}

/**
 * Single repair attempt
 */
export interface RepairAttempt {
  /** Repair type */
  type: 'selector' | 'timing' | 'assertion' | 'general';
  /** Target of repair (step ID, assertion ID, etc.) */
  target: string;
  /** Description of what was tried */
  description: string;
  /** Original value */
  originalValue?: any;
  /** New value */
  newValue?: any;
  /** Whether this specific repair worked */
  worked?: boolean;
}

// =====================================================
// ORCHESTRATION RESULTS - Final results
// =====================================================

/**
 * Result from intelligent orchestrator run
 */
export interface IntelligenceRunResult {
  /** Target that was tested */
  target: TestTarget;
  /** Test plan that was generated */
  plan: TestPlan;
  /** Scenario results */
  scenarioResults: ScenarioResult[];
  /** Evaluation results */
  evaluations: EvaluationResult[];
  /** Repair results (if repair was enabled) */
  repairs: RepairResult[];
  /** Overall summary */
  summary: IntelligenceSummary;
  /** Orchestrator metadata */
  metadata: {
    startedAt: string;
    completedAt: string;
    totalDuration: number;
    options: IntelligenceOptions;
  };
}

/**
 * Summary of intelligent run
 */
export interface IntelligenceSummary {
  /** Total scenarios */
  totalScenarios: number;
  /** Passed scenarios */
  passedScenarios: number;
  /** Failed scenarios */
  failedScenarios: number;
  /** Flaky scenarios */
  flakyScenarios: number;
  /** Overall pass rate */
  passRate: number;
  /** Total repairs attempted */
  totalRepairs: number;
  /** Successful repairs */
  successfulRepairs: number;
  /** Failure breakdown by category */
  failureBreakdown: Record<FailureCategory, number>;
}

/**
 * Options for intelligent orchestration
 */
export interface IntelligenceOptions {
  /** Whether to use LLM for planning */
  useLLMPlanner?: boolean;
  /** Whether to use LLM for evaluation */
  useLLMEvaluator?: boolean;
  /** Whether to enable repair loop */
  enableRepair?: boolean;
  /** Maximum repair rounds */
  maxRepairRounds?: number;
  /** Model to use for LLM operations */
  model?: string;
  /** Output directory for artifacts */
  outputDir?: string;
  /** Whether to emit detailed events */
  verbose?: boolean;
}

// =====================================================
// EVENT TYPES - For orchestration events
// =====================================================

/**
 * Event types emitted during orchestration
 */
export type IntelligenceEventType =
  | 'plan_start'
  | 'plan_complete'
  | 'execute_start'
  | 'execute_step'
  | 'execute_complete'
  | 'evaluate_start'
  | 'evaluate_complete'
  | 'repair_start'
  | 'repair_attempt'
  | 'repair_complete'
  | 'error';

/**
 * Event emitted during orchestration
 */
export interface IntelligenceEvent {
  /** Event type */
  type: IntelligenceEventType;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data: any;
  /** Progress (0-1) */
  progress?: number;
}
