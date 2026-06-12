/**
 * Multi-Agent Test Orchestrator - Orchestrates multiple test agent roles
 *
 * Four orchestration modes:
 * - sequential: Explorer -> Tester -> Reviewer (one after another)
 * - parallel: Multiple Testers run different scenarios simultaneously
 * - hierarchical: Explorer plans, distributes to Testers, Reviewer aggregates
 * - debate: Multiple Reviewers debate on uncertain results
 */

import { TestRoleType, getRole, getRoleDependencies, getAllRoles } from './test-roles';
import { AgentMessage, MessageBroker, MessageFactory, AgentWorkspace } from './agent-message';
import { TestTarget, TestPlan, ScenarioResult, PlannedScenario } from './types';
import { ITestExecutor, ExecutorFactory } from './executor';
import { LLMClient } from '../agent/llm-client';
import { LLMRegistry } from '../llm/llm-registry';
import { LLMPlanner } from './planner';

/**
 * Orchestration modes
 */
export type OrchestrationMode =
  | 'sequential'
  | 'parallel'
  | 'hierarchical'
  | 'debate';

/**
 * Multi-agent configuration
 */
export interface MultiAgentConfig {
  mode: OrchestrationMode;
  roles: TestRoleType[];
  maxParallelAgents?: number;
  debateRounds?: number;
  confidenceThreshold?: number;
  timeout?: number;
}

/**
 * Multi-agent execution result
 */
export interface MultiAgentResult {
  mode: OrchestrationMode;
  target: TestTarget;
  results: AgentExecutionResult[];
  finalVerdict: 'pass' | 'fail' | 'inconclusive';
  confidence: number;
  messages: AgentMessage[];
  workspace: any[];
  duration: number;
  timestamp: string;
}

/**
 * Single agent execution result
 */
export interface AgentExecutionResult {
  role: TestRoleType;
  agentId: string;
  status: 'success' | 'failure' | 'partial';
  result: any;
  duration: number;
  timestamp: string;
}

/**
 * Multi-Agent Orchestrator class
 */
export class MultiAgentOrchestrator {
  private config: MultiAgentConfig;
  private messageBroker: MessageBroker;
  private workspace: AgentWorkspace;
  private llmClient: LLMClient;
  private executor: ITestExecutor;
  private planner: LLMPlanner;

  constructor(config: MultiAgentConfig) {
    this.config = config;
    this.workspace = new AgentWorkspace();
    this.messageBroker = new MessageBroker(this.workspace);
    this.llmClient = LLMRegistry.getInstance().createClient({
      model: process.env.LLM_MODEL || 'gpt-4',
      apiKey: process.env.LLM_API_KEY || '',
      apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
      maxSteps: 20, // Add required maxSteps property
    });
    this.executor = ExecutorFactory.createPlaywright();
    this.planner = new LLMPlanner({
      llm: {
        apiKey: process.env.LLM_API_KEY || '',
        apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
        model: process.env.LLM_MODEL || 'gpt-4',
      },
    });

    // Subscribe agents to message types
    this.setupAgentSubscriptions();
  }

  /**
   * Run multi-agent verification
   */
  async run(target: TestTarget): Promise<MultiAgentResult> {
    const startTime = Date.now();
    const results: AgentExecutionResult[] = [];

    try {
      switch (this.config.mode) {
        case 'sequential':
          await this.runSequential(target, results);
          break;
        case 'parallel':
          await this.runParallel(target, results);
          break;
        case 'hierarchical':
          await this.runHierarchical(target, results);
          break;
        case 'debate':
          await this.runDebate(target, results);
          break;
      }

      // Determine final verdict
      const finalVerdict = this.determineFinalVerdict(results);
      const confidence = this.calculateConfidence(results, finalVerdict);

      return {
        mode: this.config.mode,
        target,
        results,
        finalVerdict,
        confidence,
        messages: this.messageBroker.getMessageHistory(),
        workspace: this.workspace.getAllEntries(),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Multi-agent execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Run sequential mode - agents run one after another
   */
  private async runSequential(target: TestTarget, results: AgentExecutionResult[]): Promise<void> {
    const sortedRoles = this.getSortedRoles();

    for (const roleType of sortedRoles) {
      const agentResult = await this.runAgent(roleType, target);
      results.push(agentResult);

      // If agent failed, stop the chain
      if (agentResult.status === 'failure') {
        console.warn(`Agent ${roleType} failed, stopping sequential execution`);
        break;
      }
    }
  }

  /**
   * Run parallel mode - multiple agents run simultaneously
   */
  private async runParallel(target: TestTarget, results: AgentExecutionResult[]): Promise<void> {
    // For parallel mode, we run multiple testers with different scenarios
    const testers = this.config.roles.filter(r => r === 'tester');

    // First, run explorer to get scenarios
    const explorerResult = await this.runAgent('explorer', target);
    results.push(explorerResult);

    if (explorerResult.status === 'failure') {
      throw new Error('Explorer failed, cannot proceed with parallel testing');
    }

    // Extract scenarios from explorer result
    const scenarios = this.extractScenarios(explorerResult.result);

    // Run testers in parallel
    const maxParallel = this.config.maxParallelAgents || 3;
    const chunks = this.chunkArray(scenarios, maxParallel);

    for (const chunk of chunks) {
      const promises = chunk.map((scenario, index) =>
        this.runTesterAgent(target, scenario, `tester-${index}`)
      );

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    // Finally, run reviewer to aggregate results
    const reviewerResult = await this.runAgent('reviewer', target, results);
    results.push(reviewerResult);
  }

  /**
   * Run hierarchical mode - explorer delegates to testers, reviewer aggregates
   */
  private async runHierarchical(target: TestTarget, results: AgentExecutionResult[]): Promise<void> {
    // Phase 1: Explorer discovers and plans
    const explorerResult = await this.runAgent('explorer', target);
    results.push(explorerResult);

    if ( explorerResult.status === 'failure') {
      throw new Error('Explorer failed, cannot proceed with hierarchical execution');
    }

    // Phase 2: Distribute work to testers
    const scenarios = this.extractScenarios(explorerResult.result);
    const categorizedScenarios = this.categorizeScenarios(scenarios);

    // Create specialized testers for different categories
    const testerPromises: Promise<AgentExecutionResult>[] = [];

    for (const [category, categoryScenarios] of Object.entries(categorizedScenarios)) {
      for (const scenario of categoryScenarios) {
        const testerId = `tester-${category}-${scenario.id}`;
        testerPromises.push(this.runTesterAgent(target, scenario, testerId));
      }
    }

    const testerResults = await Promise.all(testerPromises);
    results.push(...testerResults);

    // Phase 3: Reviewer aggregates and evaluates
    const reviewerResult = await this.runAgent('reviewer', target, results);
    results.push(reviewerResult);

    // Phase 4: Repairer fixes issues if needed
    const hasFailures = testerResults.some(r => r.status === 'failure');
    if (hasFailures && this.config.roles.includes('repairer')) {
      const repairerResult = await this.runAgent('repairer', target, results);
      results.push(repairerResult);
    }
  }

  /**
   * Run debate mode - multiple reviewers debate uncertain results
   */
  private async runDebate(target: TestTarget, results: AgentExecutionResult[]): Promise<void> {
    // First, run normal sequential to get baseline results
    await this.runSequential(target, results);

    // Then, run multiple reviewers to debate
    const debateRounds = this.config.debateRounds || 2;
    const previousResults = results.filter(r => r.role === 'reviewer');

    for (let round = 0; round < debateRounds; round++) {
      const debaters = this.config.roles.filter(r => r === 'reviewer').slice(0, 3);
      const debatePromises = debaters.map((_, index) =>
        this.runAgent('reviewer', target, [...results, ...previousResults], `reviewer-debate-${round}-${index}`)
      );

      const debateResults = await Promise.all(debatePromises);
      results.push(...debateResults);

      // Check if consensus reached
      if (this.checkConsensus(debateResults)) {
        console.log(`Consensus reached after ${round + 1} debate rounds`);
        break;
      }

      previousResults.push(...debateResults);
    }
  }

  /**
   * Run a single agent
   */
  private async runAgent(
    roleType: TestRoleType,
    target: TestTarget,
    previousResults?: AgentExecutionResult[],
    agentId?: string
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const id = agentId || `${roleType}-${Date.now()}`;
    const role = getRole(roleType);

    try {
      // Send agent ready message
      this.messageBroker.sendMessage({
        type: 'AGENT_READY',
        fromRole: id,
        payload: { role: roleType },
      });

      // Execute agent based on role
      const result = await this.executeAgent(roleType, target, previousResults);

      // Send agent done message
      this.messageBroker.sendMessage({
        type: 'AGENT_DONE',
        fromRole: id,
        payload: { result },
      });

      return {
        role: roleType,
        agentId: id,
        status: 'success',
        result,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Send agent error message
      this.messageBroker.sendMessage({
        type: 'AGENT_ERROR',
        fromRole: id,
        payload: { error: error instanceof Error ? error.message : String(error) },
      });

      return {
        role: roleType,
        agentId: id,
        status: 'failure',
        result: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run a tester agent with specific scenario
   */
  private async runTesterAgent(
    target: TestTarget,
    scenario: PlannedScenario,
    agentId: string
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      // Execute the scenario
      const result = await this.executor.execute(scenario);

      return {
        role: 'tester',
        agentId,
        status: result.passed ? 'success' : 'failure',
        result,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        role: 'tester',
        agentId,
        status: 'failure',
        result: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute agent based on role type
   */
  private async executeAgent(
    roleType: TestRoleType,
    target: TestTarget,
    previousResults?: AgentExecutionResult[]
  ): Promise<MultiAgentResult> {
    let agentResult: AgentExecutionResult;

    switch (roleType) {
      case 'explorer':
        agentResult = await this.executeExplorer(target);
        break;
      case 'tester':
        agentResult = await this.executeTester(target, previousResults);
        break;
      case 'reviewer':
        agentResult = await this.executeReviewer(target, previousResults);
        break;
      case 'repairer':
        agentResult = await this.executeRepairer(target, previousResults);
        break;
      default:
        throw new Error(`Unknown role type: ${roleType}`);
    }

    // Construct MultiAgentResult from AgentExecutionResult
    return {
      mode: 'sequential',
      target,
      results: [agentResult],
      finalVerdict: agentResult.status === 'success' ? 'pass' : agentResult.status === 'failure' ? 'fail' : 'inconclusive',
      confidence: 0.8,
      messages: [],
      workspace: [],
      duration: agentResult.duration,
      timestamp: agentResult.timestamp,
    };
  }

  /**
   * Execute explorer agent
   */
  private async executeExplorer(target: TestTarget): Promise<AgentExecutionResult> {
    // Generate test plan
    const plan = await this.planner.plan(target);

    // Add discovered features to workspace
    const features = plan.scenarios.map(s => ({
      name: s.name,
      description: s.description,
      steps: s.steps.length,
    }));

    this.messageBroker.sendMessage(
      MessageFactory.featureDiscovered('explorer', features, 'orchestrator')
    );

    return {
      role: 'explorer',
      agentId: 'explorer-1',
      status: 'success',
      result: { plan, features },
      duration: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute tester agent
   */
  private async executeTester(target: TestTarget, previousResults?: AgentExecutionResult[]): Promise<AgentExecutionResult> {
    // Get scenarios from previous explorer results
    const explorerResult = previousResults?.find(r => r.role === 'explorer');
    if (!explorerResult) {
      throw new Error('No explorer result found for tester');
    }

    const plan = this.extractPlan(explorerResult.result);
    const results: ScenarioResult[] = [];

    // Execute each scenario
    for (const scenario of plan.scenarios) {
      const result = await this.executor.execute(scenario);
      results.push(result);

      // Report test completion
      this.messageBroker.sendMessage(
        MessageFactory.testCompleted('tester', result, 'reviewer')
      );
    }

    return {
      role: 'tester',
      agentId: 'tester-1',
      status: 'success',
      result: { results },
      duration: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute reviewer agent
   */
  private async executeReviewer(target: TestTarget, previousResults?: AgentExecutionResult[]): Promise<AgentExecutionResult> {
    // Collect all test results
    const testResults = previousResults?.filter(r => r.role === 'tester') || [];
    const scenarioResults = testResults.flatMap(r =>
      Array.isArray(r.result.results) ? r.result.results : [r.result]
    );

    // Analyze results
    const analysis = this.analyzeResults(scenarioResults);

    // Report issues found
    for (const issue of analysis.issues) {
      this.messageBroker.sendMessage(
        MessageFactory.issueFound('reviewer', issue, 'repairer')
      );
    }

    return {
      role: 'reviewer',
      agentId: 'reviewer-1',
      status: 'success',
      result: { analysis },
      duration: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute repairer agent
   */
  private async executeRepairer(target: TestTarget, previousResults?: AgentExecutionResult[]): Promise<AgentExecutionResult> {
    // Get issues from reviewer results
    const reviewerResult = previousResults?.find(r => r.role === 'reviewer');
    if (!reviewerResult) {
      throw new Error('No reviewer result found for repairer');
    }

    const issues = reviewerResult.result.analysis.issues || [];
    const repairs = [];

    for (const issue of issues) {
      // Analyze issue and suggest repair
      const repair = this.suggestRepair(issue);
      repairs.push(repair);

      // Report repair suggestion
      this.messageBroker.sendMessage(
        MessageFactory.repairSuggested('repairer', repair, 'tester')
      );
    }

    return {
      role: 'repairer',
      agentId: 'repairer-1',
      status: 'success',
      result: { repairs },
      duration: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Setup agent subscriptions
   */
  private setupAgentSubscriptions(): void {
    // Subscribe roles to relevant message types
    this.workspace.subscribe('explorer', 'FEATURE_DISCOVERED');
    this.workspace.subscribe('tester', 'TEST_COMPLETED');
    this.workspace.subscribe('reviewer', 'ISSUE_FOUND');
    this.workspace.subscribe('repairer', 'REPAIR_SUGGESTED');
  }

  /**
   * Get sorted roles based on dependencies
   */
  private getSortedRoles(): TestRoleType[] {
    const roles = [...this.config.roles];

    // Sort based on dependencies
    return roles.sort((a, b) => {
      const aDeps = getRoleDependencies(a);
      const bDeps = getRoleDependencies(b);

      if (aDeps.includes(b)) return 1;
      if (bDeps.includes(a)) return -1;
      return 0;
    });
  }

  /**
   * Determine final verdict
   */
  private determineFinalVerdict(results: AgentExecutionResult[]): 'pass' | 'fail' | 'inconclusive' {
    const failures = results.filter(r => r.status === 'failure').length;
    const successes = results.filter(r => r.status === 'success').length;

    if (failures === 0) return 'pass';
    if (successes === 0) return 'fail';
    if (failures > successes) return 'fail';
    return 'inconclusive';
  }

  /**
   * Calculate confidence in final verdict
   */
  private calculateConfidence(results: AgentExecutionResult[], verdict: string): number {
    if (verdict === 'pass') {
      const passRate = results.filter(r => r.status === 'success').length / results.length;
      return Math.round(passRate * 100) / 100;
    } else if (verdict === 'fail') {
      const failRate = results.filter(r => r.status === 'failure').length / results.length;
      return Math.round(failRate * 100) / 100;
    }
    return 0.5; // Inconclusive
  }

  /**
   * Extract scenarios from explorer result
   */
  private extractScenarios(explorerResult: AgentExecutionResult): PlannedScenario[] {
    const resultData = explorerResult.result as { plan?: { scenarios?: PlannedScenario[] }; features?: PlannedScenario[] };
    if (resultData.plan?.scenarios) {
      return resultData.plan.scenarios;
    }
    if (resultData.features) {
      return resultData.features;
    }
    return [];
  }

  /**
   * Extract plan from result
   */
  private extractPlan(result: AgentExecutionResult): TestPlan {
    const resultData = result.result as { plan?: TestPlan };
    if (resultData.plan) return resultData.plan;
    throw new Error('No plan found in result');
  }

  /**
   * Categorize scenarios for parallel execution
   */
  private categorizeScenarios(scenarios: PlannedScenario[]): Record<string, PlannedScenario[]> {
    // Since PlannedScenario doesn't have priority property, return all as normal
    return {
      high: [],
      normal: scenarios,
      low: [],
    };
  }

  /**
   * Check if reviewers reached consensus
   */
  private checkConsensus(debateResults: AgentExecutionResult[]): boolean {
    const verdicts = debateResults.map(r => {
      if (r.result.analysis?.verdict) return r.result.analysis.verdict;
      if (r.result.result?.analysis?.verdict) return r.result.result.analysis.verdict;
      return 'unknown';
    });

    // All agree
    const firstVerdict = verdicts[0];
    return verdicts.every(v => v === firstVerdict);
  }

  /**
   * Analyze test results
   */
  private analyzeResults(results: ScenarioResult[]): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    issues: Array<{ scenarioId: string; error?: string; failedSteps: number }>;
  } {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    const issues = results
      .filter(r => !r.passed)
      .map(r => ({
        scenarioId: r.scenarioId,
        error: r.error,
        failedSteps: r.stepResults.filter(s => !s.passed).length,
      }));

    return {
      total: results.length,
      passed,
      failed,
      passRate: passed / results.length,
      issues,
    };
  }

  /**
   * Suggest repair for issue
   */
  private suggestRepair(issue: { description: string; severity: string }): { suggestion: string; priority: string } | null {
    return {
      suggestion: 'Update selector or add wait condition',
      priority: issue.severity === 'high' ? 'high' : 'normal',
    };
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get message broker stats
   */
  getStats(): { messages: unknown; workspace: unknown } {
    return {
      messages: this.messageBroker.getStats(),
      workspace: this.workspace.getStats(),
    };
  }
}