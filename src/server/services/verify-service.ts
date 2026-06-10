/**
 * Verification Service
 * Handles verification business logic including Browser management, Verifier, AgentLoop, and Orchestrator creation
 */

import { Browser, chromium } from '@playwright/test';
import { Verifier } from '../../verifier';
import { AgentLoop } from '../../agent/agent-loop';
import { VerifyOrchestrator } from '../../orchestrator/verify-orchestrator';
import { SiteConfig, TestResult } from '../../types';
import { AgentConfig, AgentResult } from '../../agent/types';
import { OrchestratedResult } from '../../orchestrator/verify-orchestrator';
import { IntelligentOrchestrator } from '../../intelligence/orchestrator';
import { TestTarget, IntelligenceRunResult } from '../../intelligence/types';
import { MatrixRunner } from '../../runner/matrix-runner';
import { MultiAgentOrchestrator, MultiAgentConfig, OrchestrationMode } from '../../intelligence/multi-test-orchestrator';
import { TestRoleType } from '../../intelligence/test-roles';
import crypto from 'crypto';
import { ResultStore } from '../../storage/result-store';

// Define DeviceMatrixConfig locally since it's not exported from MatrixRunner
interface DeviceMatrixConfig {
  browsers?: ('chromium' | 'webkit' | 'firefox')[];
  viewports?: Array<{ name: string; width: number; height: number }>;
  locales?: string[];
}

export interface FastVerifyRequest {
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

export interface DeepVerifyRequest {
  url: string;
  task: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

export interface OrchestratedVerifyRequest {
  sites: SiteConfig[];
  strict?: boolean;
  model?: string;
  skipDeep?: boolean;
}

export interface MatrixVerifyRequest {
  site: SiteConfig;
  matrix: {
    browsers?: ('chromium' | 'webkit' | 'firefox')[];
    viewports?: Array<{ name: string; width: number; height: number }>;
    locales?: string[];
  };
}

export interface IntelligentVerifyRequest {
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

export interface MultiAgentVerifyRequest {
  target: {
    url: string;
    name?: string;
    description?: string;
    tags?: string[];
    priority?: 'high' | 'normal' | 'low';
  };
  mode: OrchestrationMode;
  roles: TestRoleType[];
  maxParallelAgents?: number;
  debateRounds?: number;
  confidenceThreshold?: number;
  timeout?: number;
}

export interface VerificationJob {
  id: string;
  type: 'fast' | 'deep' | 'orchestrated';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: string;
  result?: TestResult | AgentResult | OrchestratedResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export class VerifyService {
  private browser: Browser | null = null;
  private headless: boolean;
  private resultStore: ResultStore;
  private jobs: Map<string, VerificationJob> = new Map();

  constructor(headless: boolean = true) {
    this.headless = headless;
    this.resultStore = new ResultStore();
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Perform fast verification (synchronous)
   */
  async fastVerify(request: FastVerifyRequest): Promise<TestResult> {
    const config: SiteConfig = {
      name: request.name,
      url: request.url,
      expectedStatusCode: request.expectedStatusCode ?? 200,
      viewport: request.viewport,
      timeout: request.timeout ?? 30000,
      checks: request.checks,
      screenshots: request.screenshots?.map(s => typeof s === 'string' ? { name: s } : s),
      customChecks: request.customChecks
    };

    const verifier = new Verifier(config);
    const result = await verifier.verify();

    // Save result automatically
    try {
      this.resultStore.save(result);
    } catch (saveError) {
      console.error(`[${new Date().toISOString()}] Error saving result:`, saveError);
    }

    return result;
  }

  /**
   * Create a deep verification job
   */
  createDeepVerificationJob(request: DeepVerifyRequest): VerificationJob {
    const jobId = crypto.randomUUID();
    const job: VerificationJob = {
      id: jobId,
      type: 'deep',
      status: 'pending',
      progress: 'Initializing deep verification...',
      createdAt: new Date()
    };
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Run deep verification in background
   */
  async runDeepVerification(jobId: string, request: DeepVerifyRequest): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.progress = 'Starting agent loop...';

      const config: AgentConfig = {
        model: request.model ?? 'deepseek-v4-flash',
        maxSteps: request.maxSteps ?? 15,
        apiKey: this.getApiKey(),
        apiBase: this.getApiBase(request.model ?? 'deepseek-v4-flash'),
        temperature: request.temperature ?? 0.7,
        maxTokens: 4000,
        requestTimeout: 300000
      };

      const agent = new AgentLoop(config);
      const result = await agent.run(request.task, request.url);

      job.status = 'completed';
      job.result = result;
      job.progress = 'Deep verification completed successfully.';
      job.completedAt = new Date();

      console.log(`[${new Date().toISOString()}] Deep verification job completed: ${jobId}`);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.progress = 'Deep verification failed.';
      job.completedAt = new Date();

      console.error(`[${new Date().toISOString()}] Deep verification job failed: ${jobId}`, error);
    }
  }

  /**
   * Create an orchestrated verification job
   */
  createOrchestratedVerificationJob(request: OrchestratedVerifyRequest): VerificationJob {
    const jobId = crypto.randomUUID();
    const job: VerificationJob = {
      id: jobId,
      type: 'orchestrated',
      status: 'pending',
      progress: 'Initializing orchestrated verification...',
      createdAt: new Date()
    };
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Run orchestrated verification in background
   */
  async runOrchestratedVerification(jobId: string, request: OrchestratedVerifyRequest): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.progress = 'Running fast verification for all sites...';

      const orchestrator = new VerifyOrchestrator({
        strict: request.strict ?? false,
        model: request.model ?? process.env.LLM_MODEL ?? 'deepseek-v4-flash',
        maxDeepSteps: 15
      });

      // Create a temporary config file for the orchestrator
      const tempConfigPath = `/tmp/verify-orchestrated-${jobId}.json`;
      require('fs').writeFileSync(tempConfigPath, JSON.stringify({ sites: request.sites }, null, 2));

      const result = await orchestrator.verifyAll(tempConfigPath);

      // Save individual test results from orchestrated verification
      try {
        if (result.sites && Array.isArray(result.sites)) {
          for (const siteResult of result.sites) {
            if (siteResult.fastResult) {
              this.resultStore.save(siteResult.fastResult);
            }
          }
        }
      } catch (saveError) {
        console.error(`[${new Date().toISOString()}] Error saving orchestrated results:`, saveError);
      }

      // Clean up temp file
      try {
        require('fs').unlinkSync(tempConfigPath);
      } catch {
        // Ignore cleanup errors
      }

      job.status = 'completed';
      job.result = result;
      job.progress = 'Orchestrated verification completed successfully.';
      job.completedAt = new Date();

      console.log(`[${new Date().toISOString()}] Orchestrated verification job completed: ${jobId}`);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.progress = 'Orchestrated verification failed.';
      job.completedAt = new Date();

      console.error(`[${new Date().toISOString()}] Orchestrated verification job failed: ${jobId}`, error);
    }
  }

  /**
   * Perform matrix verification (synchronous)
   */
  async matrixVerify(request: MatrixVerifyRequest): Promise<any> {
    // Validate matrix configuration
    const matrixConfig: DeviceMatrixConfig = {
      browsers: request.matrix.browsers,
      viewports: request.matrix.viewports,
      locales: request.matrix.locales
    };

    const validation = MatrixRunner.validateMatrixConfig(matrixConfig);
    if (!validation.valid) {
      throw new Error(`Invalid matrix configuration: ${validation.errors.join(', ')}`);
    }

    // Create matrix runner and execute
    const runner = new MatrixRunner();
    const result = await runner.run(request.site, matrixConfig);

    // Save individual test results from matrix
    try {
      for (const combo of result.combinations) {
        this.resultStore.save(combo.result);
      }
    } catch (saveError) {
      console.error(`[${new Date().toISOString()}] Error saving matrix results:`, saveError);
    }

    return result;
  }

  /**
   * Perform intelligent verification
   */
  async intelligentVerify(request: IntelligentVerifyRequest): Promise<IntelligenceRunResult> {
    const target: TestTarget = {
      url: request.target.url,
      name: request.target.name,
      description: request.target.description,
      tags: request.target.tags,
      priority: request.target.priority || 'normal',
    };

    // Create intelligent orchestrator
    const orchestrator = new IntelligentOrchestrator({
      planner: {
        useLLM: request.options?.useLLMPlanner || false,
        llmConfig: request.options?.useLLMPlanner ? {
          llm: {
            apiKey: process.env.LLM_API_KEY || '',
            apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
            model: request.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
            temperature: 0.7,
            maxTokens: 4000,
          },
        } : undefined,
      },
      executor: {
        outputDir: request.options?.outputDir || './artifacts',
        enableScreenshots: true,
        enableConsoleLogs: true,
        defaultTimeout: 30000,
        maxRetries: 3,
      },
      evaluator: {
        evaluatorType: request.options?.evaluatorType || (request.options?.useLLMEvaluator ? 'llm' : 'rule'),
        useLLM: request.options?.useLLMEvaluator || false,
        llmConfig: request.options?.useLLMEvaluator ? {
          llm: {
            apiKey: process.env.LLM_API_KEY || '',
            apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
            model: request.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
            temperature: 0.3,
            maxTokens: 3000,
          },
        } : undefined,
        multiStrategyConfig: request.options?.evaluatorType === 'multi-strategy' ? {
          enabledStrategies: request.options?.enabledStrategies || [
            'logic-check',
            'visual-consistency',
            'cross-reference',
            'edge-case',
            'evidence-scoring',
          ],
          confidenceThreshold: request.options?.confidenceThreshold || 0.7,
          outputDir: request.options?.outputDir || './output',
          verbose: request.options?.verbose || false,
        } : undefined,
      },
      repairLoop: {
        enable: request.options?.enableRepair !== false,
        maxRounds: request.options?.maxRepairRounds || 3,
      },
    });

    // Initialize orchestrator
    await orchestrator.init();

    // Run intelligent verification
    const result: IntelligenceRunResult = await orchestrator.run(target, {
      useLLMPlanner: request.options?.useLLMPlanner || false,
      useLLMEvaluator: request.options?.useLLMEvaluator || false,
      enableRepair: request.options?.enableRepair !== false,
      maxRepairRounds: request.options?.maxRepairRounds || 3,
      outputDir: request.options?.outputDir || './artifacts',
      verbose: request.options?.verbose || false,
    });

    // Save scenario results from intelligent verification
    try {
      if (result.scenarioResults && Array.isArray(result.scenarioResults)) {
        for (const scenarioResult of result.scenarioResults) {
          // Create a TestResult from ScenarioResult for storage
          const testResult: TestResult = {
            siteName: request.target.name || request.target.url,
            url: scenarioResult.url,
            timestamp: scenarioResult.timestamp,
            passed: scenarioResult.passed,
            duration: scenarioResult.duration,
            checks: [
              {
                name: 'Intelligent Verification',
                type: 'intelligent',
                passed: scenarioResult.passed,
                message: scenarioResult.passed ? 'Scenario passed' : `Scenario failed: ${scenarioResult.error || 'Unknown error'}`,
                details: {
                  scenarioName: scenarioResult.scenarioName,
                  stepResults: scenarioResult.stepResults,
                  assertionResults: scenarioResult.assertionResults
                }
              }
            ],
            screenshots: [],
            errors: scenarioResult.error ? [scenarioResult.error] : []
          };
          this.resultStore.save(testResult);
        }
      }
    } catch (saveError) {
      console.error(`[${new Date().toISOString()}] Error saving intelligent verification results:`, saveError);
    }

    // Clean up orchestrator
    await orchestrator.close();

    return result;
  }

  /**
   * Perform multi-agent verification
   */
  async multiAgentVerify(request: MultiAgentVerifyRequest): Promise<any> {
    // Validate orchestration mode
    const validModes: OrchestrationMode[] = ['sequential', 'parallel', 'hierarchical', 'debate'];
    if (!validModes.includes(request.mode)) {
      throw new Error(`Invalid mode: ${request.mode}. Must be one of: ${validModes.join(', ')}`);
    }

    // Validate roles
    const validRoles: TestRoleType[] = ['explorer', 'tester', 'reviewer', 'repairer'];
    const invalidRoles = request.roles.filter((role: string) => !validRoles.includes(role as TestRoleType));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}. Must be one of: ${validRoles.join(', ')}`);
    }

    // Create multi-agent configuration
    const config: MultiAgentConfig = {
      mode: request.mode,
      roles: request.roles,
      maxParallelAgents: request.maxParallelAgents || 3,
      debateRounds: request.debateRounds || 2,
      confidenceThreshold: request.confidenceThreshold || 0.7,
      timeout: request.timeout || 120000,
    };

    // Create multi-agent orchestrator
    const orchestrator = new MultiAgentOrchestrator(config);

    // Create test target
    const target = {
      url: request.target.url,
      name: request.target.name || 'Multi-Agent Test',
      description: request.target.description || 'Multi-agent verification test',
      tags: request.target.tags || [],
      priority: request.target.priority || 'normal',
    };

    // Run multi-agent verification
    const result = await orchestrator.run(target);

    return result;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): VerificationJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Delete job by ID
   */
  deleteJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running') {
      // Mark as cancelled (note: actual process cancellation is not implemented in MVP)
      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.completedAt = new Date();
    }

    return this.jobs.delete(jobId);
  }

  /**
   * List all jobs
   */
  listJobs(): VerificationJob[] {
    return Array.from(this.jobs.values()).map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    }));
  }

  /**
   * Get API key from environment
   */
  private getApiKey(): string {
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
    if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;

    throw new Error('API key not found. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GLM_API_KEY, or LLM_API_KEY environment variable.');
  }

  /**
   * Get API base URL from environment
   */
  private getApiBase(model: string): string {
    // LLM_BASE_URL overrides everything — user's explicit choice
    if (process.env.LLM_BASE_URL) {
      return process.env.LLM_BASE_URL;
    }
    if (model.startsWith('deepseek')) {
      return process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
    }
    if (model.startsWith('gpt-')) {
      return process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    }
    if (model.startsWith('claude-')) {
      return process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1';
    }
    if (model.startsWith('glm-')) {
      return process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
    }

    return process.env.LLM_API_BASE || 'https://api.openai.com/v1';
  }
}
