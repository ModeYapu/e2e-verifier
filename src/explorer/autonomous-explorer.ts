/**
 * Autonomous Explorer - Main exploration engine
 * Orchestrates 4-phase exploration: Discovery, Planning, Testing, Reporting
 *
 * This file has been split into three modules:
 * - explorer-core.ts: Main class and orchestration
 * - explorer-strategy.ts: Phase orchestration methods
 * - explorer-tools.ts: Utility functions
 *
 * The AutonomousExplorer class is re-exported for backward compatibility.
 */

// Re-export the main class
export { AutonomousExplorer } from './explorer-core';

// Re-export utilities for external use if needed
export {
  mergeScriptsFallback,
  extractMainLogic,
  generateAuthBlock,
  generateHeuristicPlan,
  generateLoginPreamble,
  generateHeuristicScript,
  buildSiteMap,
  performLogin
} from './explorer-tools';

// Re-export strategy functions for advanced use cases
export {
  runDiscoveryPhase,
  runPlanningPhase,
  runTestingPhase,
  runReportingPhase
} from './explorer-strategy';
