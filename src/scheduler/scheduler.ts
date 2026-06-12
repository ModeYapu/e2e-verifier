/**
 * Scheduler with worker pool and concurrency control
 */

import { EventEmitter } from 'events';
import { Browser } from '@playwright/test';
import { JobQueue } from './job-queue';
import { JobStore } from './job-store';
import { Job, JobStatus } from './types';
import { Verifier } from '../verifier';
import { AgentLoop } from '../agent/agent-loop';
import { VerifyOrchestrator } from '../orchestrator/verify-orchestrator';
import { SiteConfig } from '../types';
import { AgentConfig } from '../agent/types';
import { MatrixRunner } from '../runner/matrix-runner';
import { DeviceMatrixConfig } from '../types';
import { IntelligentOrchestrator, OrchestratorFactory } from '../intelligence/orchestrator';
import { TestTarget } from '../intelligence/types';
import { ResultStore } from '../storage/result-store';
import { TestResult } from '../types';
import { BrowserPool } from '../browser/browser-pool';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  maxConcurrency: number;
  headless: boolean;
}

/**
 * Worker state
 */
interface WorkerState {
  id: string;
  busy: boolean;
  currentJob?: Job;
  browser?: Browser;
}

/**
 * Scheduler class for managing job execution
 */
export class Scheduler extends EventEmitter {
  private jobQueue: JobQueue;
  private jobStore: JobStore;
  private resultStore: ResultStore;
  private config: SchedulerConfig;
  private workers: WorkerState[] = new Array();
  private isRunning: boolean = false;
  private browserPool: BrowserPool;
  private schedulingInterval: NodeJS.Timeout | null = null;

  constructor(jobQueue: JobQueue, jobStore: JobStore, config?: Partial<SchedulerConfig>) {
    super();
    this.jobQueue = jobQueue;
    this.jobStore = jobStore;
    this.resultStore = new ResultStore();
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 2,
      headless: config?.headless ?? true
    };

    // Initialize browser pool
    this.browserPool = BrowserPool.getInstance({ headless: this.config.headless });

    // Listen to job queue events
    this.jobQueue.on('job.completed', this.handleJobCompleted.bind(this));
    this.jobQueue.on('job.failed', this.handleJobFailed.bind(this));
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting...');
    this.isRunning = true;

    // BrowserPool is now managing browser instances
    console.log('[Scheduler] Using shared browser pool');

    // Initialize worker pool
    console.log(`[Scheduler] Initializing worker pool (max concurrency: ${this.config.maxConcurrency})`);
    for (let i = 0; i < this.config.maxConcurrency; i++) {
      this.workers.push({
        id: `worker-${i}`,
        busy: false,
        browser: undefined // Will use BrowserPool when needed
      });
    }

    // Start scheduling loop
    this.scheduleJobs();

    console.log('[Scheduler] Started successfully');
    this.emit('started');
  }

  /**
   * Stop the scheduler gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[Scheduler] Not running');
      return;
    }

    console.log('[Scheduler] Stopping...');
    this.isRunning = false;

    // Stop scheduling loop
    if (this.schedulingInterval) {
      clearInterval(this.schedulingInterval);
      this.schedulingInterval = null;
    }

    // Wait for current jobs to complete (max 30 seconds)
    const maxWaitTime = 30000;
    const startTime = Date.now();

    while (this.workers.some(w => w.busy)) {
      if (Date.now() - startTime > maxWaitTime) {
        console.log('[Scheduler] Timeout waiting for workers to finish');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // BrowserPool manages browser cleanup
    // We don't close the pool here as it may be used by other components
    console.log('[Scheduler] Workers cleaned up');

    console.log('[Scheduler] Stopped successfully');
    this.emit('stopped');
  }

  /**
   * Main scheduling loop
   */
  private scheduleJobs(): void {
    const scheduleInterval = 1000; // Check every second

    this.schedulingInterval = setInterval(() => {
      if (!this.isRunning) return;

      // Find available workers
      const availableWorkers = this.workers.filter(w => !w.busy);
      if (availableWorkers.length === 0) return;

      // Try to assign jobs to available workers
      for (const worker of availableWorkers) {
        const job = this.jobQueue.dequeue();
        if (!job) break; // No more jobs

        this.assignJobToWorker(job, worker);
      }
    }, scheduleInterval);
  }

  /**
   * Assign a job to a worker
   */
  private assignJobToWorker(job: Job, worker: WorkerState): void {
    console.log(`[Scheduler] Assigning job ${job.id} to ${worker.id}`);

    worker.busy = true;
    worker.currentJob = job;

    // Update job status
    this.jobStore.update(job.id, {
      status: 'running' as JobStatus,
      startedAt: new Date(),
      progress: 'Job started'
    });

    this.emit('job.started', job);

    // Execute job with timeout
    this.executeJob(job, worker).catch(error => {
      console.error(`[Scheduler] Error executing job ${job.id}:`, error);
      this.jobQueue.fail(job.id, `Execution error: ${error}`);
      worker.busy = false;
      worker.currentJob = undefined;
    });
  }

  /**
   * Execute a job based on its type
   */
  private async executeJob(job: Job, worker: WorkerState): Promise<void> {
    const startTime = Date.now();
    let result: any;
    let error: string | null = null;

    try {
      // Set timeout for job execution
      const timeout = job.timeout || 300000; // Default 5 minutes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), timeout);
      });

      // Execute job based on type
      const executionPromise = this.executeJobByType(job, worker);

      // Race between execution and timeout
      result = await Promise.race([executionPromise, timeoutPromise]);

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`[Scheduler] Job ${job.id} failed:`, error);
    } finally {
      const duration = Date.now() - startTime;

      // Update worker state
      worker.busy = false;
      worker.currentJob = undefined;

      // Update job state
      if (error) {
        this.jobQueue.fail(job.id, error);
        this.emit('job.failed', job);
      } else {
        this.jobQueue.complete(job.id, result);
        this.emit('job.completed', job);
      }

      console.log(`[Scheduler] Job ${job.id} finished in ${duration}ms`);
    }
  }

  /**
   * Execute job based on its type
   */
  private async executeJobByType(job: Job, worker: WorkerState): Promise<any> {
    switch (job.type) {
      case 'fast':
        return await this.executeFastVerify(job);
      case 'deep':
        return await this.executeDeepVerify(job);
      case 'orchestrated':
        return await this.executeOrchestratedVerify(job);
      case 'matrix':
        return await this.executeMatrixVerify(job);
      case 'intelligent':
        return await this.executeIntelligentVerify(job);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Execute fast verification job
   */
  private async executeFastVerify(job: Job): Promise<any> {
    if (!job.config.fastVerify) {
      throw new Error('Fast verify config missing');
    }

    const config = job.config.fastVerify;

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Running fast verification...'
    });

    const siteConfig: SiteConfig = {
      name: config.name,
      url: config.url,
      expectedStatusCode: config.expectedStatusCode ?? 200,
      viewport: config.viewport,
      timeout: config.timeout ?? 30000,
      checks: config.checks,
      screenshots: config.screenshots?.map(s => typeof s === 'string' ? { name: s } : s),
      customChecks: config.customChecks
    };

    // Verifier will handle its own browser management using BrowserPool
    const verifier = new Verifier(siteConfig);
    return await verifier.verify();
  }

  /**
   * Execute deep verification job
   */
  private async executeDeepVerify(job: Job): Promise<any> {
    if (!job.config.deepVerify) {
      throw new Error('Deep verify config missing');
    }

    const config = job.config.deepVerify;

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Starting deep verification...'
    });

    const apiKey = this.getApiKey();
    const apiBase = this.getApiBase(config.model ?? 'deepseek-v4-flash');

    const agentConfig: AgentConfig = {
      model: config.model ?? 'deepseek-v4-flash',
      maxSteps: config.maxSteps ?? 15,
      apiKey,
      apiBase,
      temperature: config.temperature ?? 0.7,
      maxTokens: 4000,
      requestTimeout: 300000
    };

    const agent = new AgentLoop(agentConfig);

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Running agent loop...'
    });

    return await agent.run(config.task, config.url);
  }

  /**
   * Execute orchestrated verification job
   */
  private async executeOrchestratedVerify(job: Job): Promise<any> {
    if (!job.config.orchestratedVerify) {
      throw new Error('Orchestrated verify config missing');
    }

    const config = job.config.orchestratedVerify;

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Running orchestrated verification...'
    });

    const orchestrator = new VerifyOrchestrator({
      strict: config.strict ?? false,
      model: config.model ?? process.env.LLM_MODEL ?? 'deepseek-v4-flash',
      maxDeepSteps: 15
    });

    // Create temporary config file
    const fs = require('fs');
    const tempConfigPath = `/tmp/verify-orchestrated-${job.id}.json`;
    fs.writeFileSync(tempConfigPath, JSON.stringify({ sites: config.sites }, null, 2));

    try {
      const result = await orchestrator.verifyAll(tempConfigPath);
      return result;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempConfigPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute matrix verification job
   */
  private async executeMatrixVerify(job: Job): Promise<any> {
    if (!job.config.matrixVerify) {
      throw new Error('Matrix verify config missing');
    }

    const config = job.config.matrixVerify;

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Running matrix verification...'
    });

    // Validate that we have at least one site
    if (!config.sites || config.sites.length === 0) {
      throw new Error('Matrix verification requires at least one site');
    }

    // Process the first site (matrix testing is typically for single sites)
    const siteConfig = config.sites[0];
    const matrixConfig: DeviceMatrixConfig = {
      browsers: config.browsers as any,
      viewports: config.viewports?.map((vp, index) => ({
        name: vp.name || `viewport-${index}`,
        width: vp.width,
        height: vp.height
      })),
      locales: config.locales
    };

    // Validate matrix configuration
    const validation = MatrixRunner.validateMatrixConfig(matrixConfig);
    if (!validation.valid) {
      throw new Error(`Invalid matrix configuration: ${validation.errors.join(', ')}`);
    }

    // Create matrix runner and execute
    const runner = new MatrixRunner();
    return await runner.run(siteConfig, matrixConfig);
  }

  /**
   * Execute intelligent verification job
   */
  private async executeIntelligentVerify(job: Job): Promise<any> {
    if (!job.config.intelligentVerify) {
      throw new Error('Intelligent verify config missing');
    }

    const config = job.config.intelligentVerify;

    // Update progress
    this.jobStore.update(job.id, {
      progress: 'Running intelligent verification...'
    });

    // Create test target from config
    const target: TestTarget = {
      url: config.target.url,
      name: config.target.name,
      description: config.target.description,
      tags: config.target.tags,
      priority: config.target.priority || 'normal',
    };

    // Create intelligent orchestrator
    const orchestrator = OrchestratorFactory.create({
      planner: {
        useLLM: config.options?.useLLMPlanner || false,
        llmConfig: config.options?.useLLMPlanner ? {
          llm: {
            apiKey: this.getApiKey(),
            apiBase: this.getApiBase(config.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash'),
            model: config.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
            temperature: 0.7,
            maxTokens: 4000,
          },
        } : undefined,
      },
      executor: {
        outputDir: config.options?.outputDir || './artifacts',
        enableScreenshots: true,
        enableConsoleLogs: true,
        defaultTimeout: 30000,
        maxRetries: 3,
      },
      evaluator: {
        useLLM: config.options?.useLLMEvaluator || false,
        llmConfig: config.options?.useLLMEvaluator ? {
          llm: {
            apiKey: this.getApiKey(),
            apiBase: this.getApiBase(config.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash'),
            model: config.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
            temperature: 0.3,
            maxTokens: 3000,
          },
        } : undefined,
      },
      repairLoop: {
        enable: config.options?.enableRepair !== false,
        maxRounds: config.options?.maxRepairRounds || 3,
      },
    });

    // Initialize orchestrator before running
    await orchestrator.init();

    // Run intelligent verification
    const result = await orchestrator.run(target, {
      useLLMPlanner: config.options?.useLLMPlanner || false,
      useLLMEvaluator: config.options?.useLLMEvaluator || false,
      enableRepair: config.options?.enableRepair !== false,
      maxRepairRounds: config.options?.maxRepairRounds || 3,
      outputDir: config.options?.outputDir || './artifacts',
      verbose: config.options?.verbose || false,
    });

    // Clean up orchestrator
    await orchestrator.close();

    return result;
  }

  /**
   * Handle job completed event from queue
   */
  private handleJobCompleted(job: Job): void {
    console.log(`[Scheduler] Job ${job.id} completed successfully`);

    // Save result if it's a TestResult
    if (job.result) {
      try {
        // Handle different result types
        if (this.isTestResult(job.result)) {
          this.resultStore.save(job.result);
        } else if (this.isOrchestratedResult(job.result)) {
          // Save individual test results from orchestrated results
          if (job.result.sites && Array.isArray(job.result.sites)) {
            for (const siteResult of job.result.sites) {
              if (siteResult.fastResult && this.isTestResult(siteResult.fastResult)) {
                this.resultStore.save(siteResult.fastResult);
              }
            }
          }
        } else if (this.isMatrixResult(job.result)) {
          // Save individual test results from matrix results
          if (job.result.combinations && Array.isArray(job.result.combinations)) {
            for (const combo of job.result.combinations) {
              if (this.isTestResult(combo.result)) {
                this.resultStore.save(combo.result);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Scheduler] Error saving result for job ${job.id}:`, error);
      }
    }
  }

  /**
   * Check if result is a TestResult
   */
  private isTestResult(result: any): result is TestResult {
    return result &&
      typeof result === 'object' &&
      typeof result.siteName === 'string' &&
      typeof result.url === 'string' &&
      typeof result.passed === 'boolean' &&
      typeof result.timestamp === 'string';
  }

  /**
   * Check if result is an OrchestratedResult
   */
  private isOrchestratedResult(result: any): boolean {
    return result &&
      typeof result === 'object' &&
      typeof result.timestamp === 'string' &&
      Array.isArray(result.results);
  }

  /**
   * Check if result is a MatrixResult
   */
  private isMatrixResult(result: any): boolean {
    return result &&
      typeof result === 'object' &&
      typeof result.timestamp === 'string' &&
      typeof result.siteName === 'string' &&
      Array.isArray(result.combinations);
  }

  /**
   * Handle job failed event from queue
   */
  private handleJobFailed(job: Job): void {
    console.log(`[Scheduler] Job ${job.id} failed`);

    // Auto-retry if under limit
    if (job.retryCount < job.maxRetries) {
      console.log(`[Scheduler] Scheduling retry ${job.retryCount + 1}/${job.maxRetries} for job ${job.id}`);

      // Add delay before retry (exponential backoff)
      const retryDelay = Math.min(1000 * Math.pow(2, job.retryCount), 30000);
      setTimeout(() => {
        const retriedJob = this.jobQueue.retryJob(job.id);
        if (retriedJob) {
          console.log(`[Scheduler] Job ${job.id} queued for retry`);
        }
      }, retryDelay);
    } else {
      console.log(`[Scheduler] Job ${job.id} reached max retries (${job.maxRetries})`);
    }
  }

  /**
   * Get API key from environment
   */
  private getApiKey(): string {
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
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

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      maxConcurrency: this.config.maxConcurrency,
      activeWorkers: this.workers.filter(w => w.busy).length,
      availableWorkers: this.workers.filter(w => !w.busy).length,
      queueStats: this.jobQueue.getStats()
    };
  }
}