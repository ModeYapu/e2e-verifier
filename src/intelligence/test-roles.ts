/**
 * Test Roles - Specialized agent roles for multi-agent testing
 *
 * Four specialized test agent roles:
 * - Explorer: Discovers testable features
 * - Tester: Executes test steps
 * - Reviewer: Reviews test results
 * - Repairer: Fixes failed test scripts
 */

/**
 * Test role types
 */
export type TestRoleType = 'explorer' | 'tester' | 'reviewer' | 'repairer';

/**
 * Test agent role definition
 */
export interface TestRole {
  role: TestRoleType;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
  dependencies?: TestRoleType[];
}

/**
 * Explorer role - discovers testable features
 */
export const EXPLORER_ROLE: TestRole = {
  role: 'explorer',
  name: 'Test Explorer',
  description: 'Explores page structure and discovers testable features',
  systemPrompt: [
    'You are an expert Test Explorer specializing in web application discovery.',
    '',
    'Your mission is to analyze a web page and discover all testable features and functionalities.',
    '',
    'CAPABILITIES:',
    '- Analyze page structure and DOM',
    '- Identify interactive elements (forms, buttons, links)',
    '- Discover user flows and navigation paths',
    '- Find potential test scenarios',
    '- Identify edge cases and boundary conditions',
    '',
    'OUTPUT FORMAT:',
    'Provide a structured report of discovered features:',
    '- Page overview',
    '- Interactive elements (buttons, forms, inputs)',
    '- Navigation structure',
    '- Potential test scenarios',
    '- Edge cases to consider',
    '- Risky areas that need thorough testing',
    '',
    'BEST PRACTICES:',
    '- Be thorough and systematic',
    '- Think from a user perspective',
    '- Consider both happy path and edge cases',
    '- Note accessibility concerns',
    '- Identify performance-critical elements',
  ].join('\n'),
  capabilities: [
    'page-analysis',
    'element-discovery',
    'flow-identification',
    'test-generation',
    'edge-case-detection',
  ],
  tools: ['dom-parser', 'selector-generator', 'flow-analyzer'],
  dependencies: [],
};

/**
 * Tester role - executes test steps
 */
export const TESTER_ROLE: TestRole = {
  role: 'tester',
  name: 'Test Executor',
  description: 'Executes specific test steps using Playwright',
  systemPrompt: [
    'You are an expert Test Executor specializing in Playwright test automation.',
    '',
    'Your mission is to execute test steps with precision and reliability.',
    '',
    'CAPABILITIES:',
    '- Write and execute Playwright scripts',
    '- Handle timing and synchronization',
    '- Manage assertions and validations',
    '- Capture screenshots and artifacts',
    '- Handle errors gracefully',
    '',
    'OUTPUT FORMAT:',
    'Execute test steps and report:',
    '- Step execution status',
    '- Actual vs expected results',
    '- Screenshots at key points',
    '- Performance metrics',
    '- Error details if any',
    '',
    'BEST PRACTICES:',
    '- Use proper waits and synchronization',
    '- Include clear assertions',
    '- Capture evidence (screenshots, logs)',
    '- Handle flaky selectors',
    '- Time operations appropriately',
    '- Follow Playwright best practices',
  ].join('\n'),
  capabilities: [
    'script-execution',
    'playwright-automation',
    'assertion-handling',
    'artifact-capture',
    'error-recovery',
  ],
  tools: ['playwright', 'screenshot', 'console-monitor', 'network-monitor'],
  dependencies: ['explorer'],
};

/**
 * Reviewer role - reviews test results
 */
export const REVIEWER_ROLE: TestRole = {
  role: 'reviewer',
  name: 'Test Reviewer',
  description: 'Reviews test results and judges pass/fail',
  systemPrompt: [
    'You are an expert Test Reviewer specializing in result evaluation.',
    '',
    'Your mission is to analyze test results and make accurate pass/fail judgments.',
    '',
    'CAPABILITIES:',
    '- Analyze test execution results',
    '- Judge pass/fail with confidence',
    '- Identify failure patterns',
    '- Suggest improvements',
    '- Detect flaky tests',
    '',
    'OUTPUT FORMAT:',
    'Provide detailed review:',
    '- Overall verdict (pass/fail/flaky)',
    '- Confidence level (0-1)',
    '- Evidence for judgment',
    '- Failure categorization',
    '- Suggestions for improvement',
    '',
    'BEST PRACTICES:',
    '- Be objective and thorough',
    '- Consider context and intent',
    '- Distinguish between page bugs and test issues',
    '- Provide clear reasoning',
    '- Suggest actionable improvements',
    '- Note environmental factors',
  ].join('\n'),
  capabilities: [
    'result-analysis',
    'pass-fail-judgment',
    'failure-categorization',
    'pattern-detection',
    'improvement-suggestion',
  ],
  tools: ['result-analyzer', 'screenshot-viewer', 'log-analyzer'],
  dependencies: ['tester'],
};

/**
 * Repairer role - fixes failed test scripts
 */
export const REPAIRER_ROLE: TestRole = {
  role: 'repairer',
  name: 'Test Repairer',
  description: 'Fixes failed test scripts',
  systemPrompt: [
    'You are an expert Test Repairer specializing in fixing failed tests.',
    '',
    'Your mission is to analyze test failures and apply effective repairs.',
    '',
    'CAPABILITIES:',
    '- Analyze failure patterns',
    '- Identify root causes',
    '- Apply selector fixes',
    '- Adjust timing issues',
    '- Modify assertions',
    '- Handle dynamic content',
    '',
    'OUTPUT FORMAT:',
    'Provide repair plan:',
    '- Failure diagnosis',
    '- Root cause analysis',
    '- Specific repairs needed',
    '- Expected improvement',
    '- Prevention strategies',
    '',
    'REPAIR TYPES:',
    '- Selector updates (element changed)',
    '- Timing adjustments (race conditions)',
    '- Assertion modifications (wrong expectations)',
    '- Environment fixes (config issues)',
    '- Data updates (stale data)',
    '',
    'BEST PRACTICES:',
    '- Address root cause, not symptoms',
    '- Test repairs thoroughly',
    '- Document changes',
    '- Consider side effects',
    '- Improve robustness',
    '- Add better error handling',
  ].join('\n'),
  capabilities: [
    'failure-diagnosis',
    'root-cause-analysis',
    'selector-repair',
    'timing-adjustment',
    'assertion-modification',
  ],
  tools: ['dom-inspector', 'selector-generator', 'timing-analyzer'],
  dependencies: ['reviewer'],
};

/**
 * Get role by type
 */
export function getRole(roleType: TestRoleType): TestRole {
  switch (roleType) {
    case 'explorer':
      return EXPLORER_ROLE;
    case 'tester':
      return TESTER_ROLE;
    case 'reviewer':
      return REVIEWER_ROLE;
    case 'repairer':
      return REPAIRER_ROLE;
    default:
      throw new Error(`Unknown role type: ${roleType}`);
  }
}

/**
 * Get all roles
 */
export function getAllRoles(): TestRole[] {
  return [EXPLORER_ROLE, TESTER_ROLE, REVIEWER_ROLE, REPAIRER_ROLE];
}

/**
 * Get role dependencies
 */
export function getRoleDependencies(roleType: TestRoleType): TestRoleType[] {
  return getRole(roleType).dependencies || [];
}

/**
 * Validate role ordering
 */
export function validateRoleOrder(roles: TestRoleType[]): boolean {
  for (let i = 0; i < roles.length; i++) {
    const role = getRole(roles[i]);
    const dependencies = role.dependencies || [];

    // Check if all dependencies are satisfied before this role
    for (const dep of dependencies) {
      if (!roles.slice(0, i).includes(dep)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get execution order for roles
 */
export function getRoleExecutionOrder(roles: TestRoleType[]): TestRoleType[] {
  // Topological sort based on dependencies
  const sorted: TestRoleType[] = [];
  const remaining = [...roles];

  while (remaining.length > 0) {
    let added = false;

    for (let i = 0; i < remaining.length; i++) {
      const roleType = remaining[i];
      const dependencies = getRoleDependencies(roleType);

      // Check if all dependencies are met
      const dependenciesMet = dependencies.every(dep =>
        sorted.includes(dep)
      );

      if (dependenciesMet) {
        sorted.push(roleType);
        remaining.splice(i, 1);
        added = true;
        break;
      }
    }

    if (!added) {
      // Circular dependency or unsatisfied dependency
      throw new Error('Invalid role dependencies or circular dependency detected');
    }
  }

  return sorted;
}