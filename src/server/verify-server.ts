/**
 * HTTP API Server for e2e-verifier
 * Provides REST endpoints for fast verification, deep verification, and orchestrated verification
 */

import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import path from 'path';
import { chromium, Browser } from '@playwright/test';
import { Verifier } from '../verifier';
import { AgentLoop } from '../agent/agent-loop';
import { VerifyOrchestrator } from '../orchestrator/verify-orchestrator';
import { SiteConfig, TestResult } from '../types';
import { AgentConfig, AgentResult } from '../agent/types';
import { OrchestratedResult } from '../orchestrator/verify-orchestrator';
import * as fs from 'fs';
import { JobStore } from '../scheduler/job-store';
import { JobQueue } from '../scheduler/job-queue';
import { Scheduler } from '../scheduler/scheduler';
import { Job, JobConfig, JobType, JobPriority, JobStatus } from '../scheduler/types';
import { MatrixRunner } from '../runner/matrix-runner';
import { WebhookConfigManager } from '../config/webhook-config';
import { WebhookDelivery } from '../integrations/webhook';
import { apiKeyAuth, getAllKeys, createKey, deleteKey } from '../middleware/api-auth';
import { projectAuth } from '../middleware/project-auth';
import { ProjectStore } from '../projects/project-store';
import { Project, CreateProjectRequest, UpdateProjectRequest } from '../projects/types';
import { DeviceMatrixConfig, MatrixResult } from '../types';
import { IntelligentOrchestrator, OrchestratorFactory } from '../intelligence/orchestrator';
import { TestTarget, IntelligenceRunResult } from '../intelligence/types';
import { ResultStore } from '../storage/result-store';
import { TrendAnalyzer } from '../storage/trend-analyzer';
import { QualityProfileCalculator } from '../storage/quality-profile';
import { ProviderFactory, AIProvider } from '../ai/provider';
import { getSelfHealingLocator } from '../ai/self-healing';
import { getSmartTestGenerator } from '../ai/test-generator';
import experienceRoutes from '../api/routes/experience-routes';
import { MultiAgentOrchestrator, MultiAgentConfig, OrchestrationMode } from '../intelligence/multi-test-orchestrator';
import { TestRoleType } from '../intelligence/test-roles';

/**
 * Verification job for async operations
 */
interface VerificationJob {
  id: string;
  type: 'fast' | 'deep' | 'orchestrated';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: string;
  result?: TestResult | AgentResult | OrchestratedResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Server statistics
 */
interface ServerStats {
  totalVerifications: number;
  totalDeepVerifications: number;
  totalOrchestratedVerifications: number;
  uptime: number;
}

/**
 * Request types for API endpoints
 */
interface FastVerifyRequest {
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

interface DeepVerifyRequest {
  url: string;
  task: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

interface OrchestratedVerifyRequest {
  sites: SiteConfig[];
  strict?: boolean;
  model?: string;
  skipDeep?: boolean;
}

interface MatrixVerifyRequest {
  site: SiteConfig;
  matrix: {
    browsers?: ('chromium' | 'webkit' | 'firefox')[];
    viewports?: Array<{ name: string; width: number; height: number }>;
    locales?: string[];
  };
}

interface IntelligentVerifyRequest {
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

/**
 * HTTP API Server class
 */
export class VerifyServer {
  private app: express.Application;
  private router: Router;
  private browser: Browser | null = null;
  private jobs: Map<string, VerificationJob> = new Map();
  private jobStore: JobStore;
  private jobQueue: JobQueue;
  private scheduler: Scheduler;
  private webhookConfig: WebhookConfigManager;
  private webhookDelivery: WebhookDelivery;
  private resultStore: ResultStore;
  private trendAnalyzer: TrendAnalyzer;
  private qualityCalculator: QualityProfileCalculator;
  private intelligentOrchestrator: IntelligentOrchestrator;
  private port: number;
  private host: string;
  private apiToken: string | null;
  private headless: boolean;
  private serverStartTime: number;
  private stats: ServerStats = {
    totalVerifications: 0,
    totalDeepVerifications: 0,
    totalOrchestratedVerifications: 0,
    uptime: 0
  };

  constructor(port?: number, host?: string, headless?: boolean) {
    this.port = port ?? parseInt(process.env.E2E_VERIFIER_PORT ?? '3001', 10);
    this.host = host ?? '127.0.0.1';
    this.apiToken = process.env.E2E_VERIFIER_API_TOKEN || null;
    this.headless = headless ?? true;
    this.serverStartTime = Date.now();

    this.app = express();
    this.router = Router();

    // Initialize job queue components
    this.jobStore = new JobStore();
    this.jobQueue = new JobQueue(this.jobStore);
    this.scheduler = new Scheduler(this.jobQueue, this.jobStore, {
      maxConcurrency: 2,
      headless: this.headless
    });

    // Initialize result analysis components
    this.resultStore = new ResultStore();
    this.trendAnalyzer = new TrendAnalyzer(this.resultStore);
    this.qualityCalculator = new QualityProfileCalculator(this.resultStore);

    // Initialize intelligent orchestrator with experience store
    this.intelligentOrchestrator = OrchestratorFactory.fromEnv();

    // Make orchestrator available to routes
    this.app.set('orchestrator', this.intelligentOrchestrator);

    this.setupMiddleware();
    // Initialize webhook integration
    this.webhookConfig = new WebhookConfigManager();
    this.webhookDelivery = new WebhookDelivery();
    this.scheduler.on('job.completed', (job: any) => {
      for (const wh of this.webhookConfig.getEnabledForEvent('job.completed')) {
        this.webhookDelivery.send('job.completed', job, wh).catch(() => {});
      }
    });
    this.scheduler.on('job.failed', (job: any) => {
      for (const wh of this.webhookConfig.getEnabledForEvent('job.failed')) {
        this.webhookDelivery.send('job.failed', job, wh).catch(() => {});
      }
    });

    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static dashboard files
    const dashboardPath = path.join(__dirname, '../../dashboard');
    this.app.use('/dashboard', express.static(dashboardPath));
    this.app.get('/', (_req: Request, res: Response) => {
      res.sendFile(path.join(dashboardPath, 'index.html'));
    });

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path}`);
      next();
    });

    this.app.use('/api', (req, res, next) => {
      if (req.path === '/health') {
        next();
        return;
      }

      if (!this.shouldRequireApiAuth()) {
        // Apply project auth even for local host when API keys are configured
        if (ProjectStore.getAll().length > 0) {
          projectAuth(req, res, next);
        } else {
          next();
        }
        return;
      }

      // For remote access or when API token is set, require both token and project auth
      const token = this.extractBearerToken(req);
      if (!token || token !== this.apiToken) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }

      // Apply project authentication
      projectAuth(req, res, next);
    });
  }

  private shouldRequireApiAuth(): boolean {
    return !this.isLocalHost(this.host) || !!this.apiToken;
  }

  private isLocalHost(host: string): boolean {
    return ['127.0.0.1', 'localhost', '::1'].includes(host);
  }

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.header('authorization');
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }

  private setupRoutes(): void {
    // Health check
    this.router.get('/health', this.getHealth.bind(this));

    // Stats
    this.router.get('/stats', this.getStats.bind(this));

    // Fast verification (synchronous)
    this.router.post('/verify', this.postFastVerify.bind(this));

    // Deep verification (asynchronous)
    this.router.post('/verify/deep', this.postDeepVerify.bind(this));

    // Orchestrated verification (asynchronous)
    this.router.post('/verify/orchestrated', this.postOrchestratedVerify.bind(this));

    // Matrix verification
    this.router.post('/verify/matrix', this.postMatrixVerify.bind(this));

    // Intelligent verification
    this.router.post('/verify/intelligent', this.postIntelligentVerify.bind(this));
    this.router.post('/verify/multi-agent', this.postMultiAgentVerify.bind(this));

    // Legacy job management (for backward compatibility)
    this.router.get('/jobs/:jobId', this.getLegacyJob.bind(this));
    this.router.delete('/jobs/:jobId', this.deleteLegacyJob.bind(this));
    this.router.get('/jobs', this.listLegacyJobs.bind(this));

    // New job queue API endpoints
    this.router.post('/jobs', this.postCreateJob.bind(this));
    this.router.get('/jobs/list', this.listJobs.bind(this));
    this.router.get('/jobs/:id/detail', this.getJobDetail.bind(this));
    this.router.delete('/jobs/:id/cancel', this.cancelJob.bind(this));
    this.router.post('/jobs/:id/retry', this.retryJob.bind(this));
    this.router.post('/jobs/batch', this.postBatchJobs.bind(this));

    // Webhook management endpoints
    this.router.get('/webhooks', this.listWebhooks.bind(this));
    this.router.post('/webhooks', this.createWebhook.bind(this));
    this.router.put('/webhooks/:id', this.updateWebhook.bind(this));
    this.router.delete('/webhooks/:id', this.deleteWebhook.bind(this));
    this.router.post('/webhooks/:id/test', this.testWebhook.bind(this));

    // API key management endpoints
    this.router.get('/admin/keys', this.listApiKeys.bind(this));
    this.router.post('/admin/keys', this.createApiKey.bind(this));
    this.router.delete('/admin/keys/:id', this.deleteApiKey.bind(this));

    // Project management endpoints
    this.router.post('/admin/projects', this.createProject.bind(this));
    this.router.get('/admin/projects', this.listProjects.bind(this));
    this.router.get('/admin/projects/:id', this.getProject.bind(this));
    this.router.put('/admin/projects/:id', this.updateProject.bind(this));
    this.router.delete('/admin/projects/:id', this.deleteProject.bind(this));
    this.router.post('/admin/projects/:id/sites', this.addSiteToProject.bind(this));
    this.router.delete('/admin/projects/:id/sites/:siteName', this.removeSiteFromProject.bind(this));
    this.router.post('/admin/projects/:id/members', this.addMemberToProject.bind(this));
    this.router.delete('/admin/projects/:id/members/:userId', this.removeMemberFromProject.bind(this));
    this.router.patch('/admin/projects/:id/members/:userId', this.updateMemberRole.bind(this));

    // Dashboard API endpoints
    this.router.get('/dashboard/overview', this.getDashboardOverview.bind(this));
    this.router.get('/dashboard/sites', this.getDashboardSites.bind(this));
    this.router.get('/dashboard/trends', this.getDashboardTrends.bind(this));
    this.router.get('/reports/:id', this.getReportDetail.bind(this));

    // Trend analysis endpoints
    this.router.get('/trends/:site', this.getSiteTrends.bind(this));
    this.router.get('/trends/:site/regressions', this.getSiteRegressions.bind(this));

    // Quality profile endpoints
    this.router.get('/profiles', this.getAllProfiles.bind(this));
    this.router.get('/profiles/:site', this.getSiteProfile.bind(this));

    // AI endpoints
    this.router.post('/ai/generate-tests', this.generateTests.bind(this));
    this.router.get('/ai/suggest-fixes/:jobId', this.suggestFixes.bind(this));
    this.router.get('/ai/providers', this.listAIProviders.bind(this));
    this.router.get('/ai/locator-stats', this.getLocatorStats.bind(this));
    this.router.delete('/ai/locator-cache', this.clearLocatorCache.bind(this));

    // Experience store endpoints
    this.app.use('/api', experienceRoutes);

    this.app.use('/api', this.router);
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
      console.error(`[${new Date().toISOString()}] Error:`, err.message);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    });
  }

  /**
   * GET /api/health - Health check endpoint
   */
  private getHealth(req: Request, res: Response): void {
    res.json({
      status: 'ok',
      version: '1.0.0',
      uptime: Date.now() - this.serverStartTime,
      browser: this.browser ? 'connected' : 'disconnected'
    });
  }

  /**
   * GET /api/stats - Server statistics
   */
  private getStats(req: Request, res: Response): void {
    this.stats.uptime = Date.now() - this.serverStartTime;
    res.json(this.stats);
  }

  /**
   * POST /api/verify - Fast verification (synchronous)
   */
  private async postFastVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as FastVerifyRequest;

      if (!body.url || !body.name) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: url, name'
        });
        return;
      }

      console.log(`[${new Date().toISOString()}] Starting fast verification for: ${body.name} (${body.url})`);

      const config: SiteConfig = {
        name: body.name,
        url: body.url,
        expectedStatusCode: body.expectedStatusCode ?? 200,
        viewport: body.viewport,
        timeout: body.timeout ?? 30000,
        checks: body.checks,
        screenshots: body.screenshots?.map(s => typeof s === 'string' ? { name: s } : s),
        customChecks: body.customChecks
      };

      const verifier = new Verifier(config);
      const result = await verifier.verify();

      // Save result automatically
      try {
        this.resultStore.save(result);
      } catch (saveError) {
        console.error(`[${new Date().toISOString()}] Error saving result:`, saveError);
      }

      this.stats.totalVerifications++;

      console.log(`[${new Date().toISOString()}] Fast verification completed: ${result.passed ? 'PASSED' : 'FAILED'}`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Fast verification error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * POST /api/verify/deep - Deep verification (asynchronous)
   */
  private async postDeepVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as DeepVerifyRequest;

      if (!body.url || !body.task) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: url, task'
        });
        return;
      }

      const jobId = crypto.randomUUID();
      const apiKey = this.getApiKey();
      const apiBase = this.getApiBase(body.model ?? 'deepseek-v4-flash');

      const job: VerificationJob = {
        id: jobId,
        type: 'deep',
        status: 'pending',
        progress: 'Initializing deep verification...',
        createdAt: new Date()
      };

      this.jobs.set(jobId, job);

      console.log(`[${new Date().toISOString()}] Created deep verification job: ${jobId}`);

      // Return immediately with job ID
      res.status(202).json({
        success: true,
        jobId,
        status: 'pending',
        message: 'Deep verification job created. Use GET /api/jobs/:jobId to poll for results.'
      });

      // Start deep verification in background
      this.runDeepVerification(jobId, body, apiKey, apiBase).catch(err => {
        console.error(`[${new Date().toISOString()}] Deep verification background task error:`, err);
        const currentJob = this.jobs.get(jobId);
        if (currentJob) {
          currentJob.status = 'failed';
          currentJob.error = err instanceof Error ? err.message : String(err);
          currentJob.completedAt = new Date();
        }
      });

      this.stats.totalDeepVerifications++;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Deep verification setup error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Run deep verification in background
   */
  private async runDeepVerification(
    jobId: string,
    body: DeepVerifyRequest,
    apiKey: string,
    apiBase: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.progress = 'Starting agent loop...';

      const config: AgentConfig = {
        model: body.model ?? 'deepseek-v4-flash',
        maxSteps: body.maxSteps ?? 15,
        apiKey,
        apiBase,
        temperature: body.temperature ?? 0.7,
        maxTokens: 4000,
        requestTimeout: 300000
      };

      const agent = new AgentLoop(config);
      const result = await agent.run(body.task, body.url);

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
   * POST /api/verify/orchestrated - Orchestrated verification (asynchronous)
   */
  private async postOrchestratedVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as OrchestratedVerifyRequest;

      if (!body.sites || !Array.isArray(body.sites) || body.sites.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: sites (non-empty array)'
        });
        return;
      }

      const jobId = crypto.randomUUID();

      const job: VerificationJob = {
        id: jobId,
        type: 'orchestrated',
        status: 'pending',
        progress: 'Initializing orchestrated verification...',
        createdAt: new Date()
      };

      this.jobs.set(jobId, job);

      console.log(`[${new Date().toISOString()}] Created orchestrated verification job: ${jobId}`);

      res.status(202).json({
        success: true,
        jobId,
        status: 'pending',
        message: 'Orchestrated verification job created. Use GET /api/jobs/:jobId to poll for results.'
      });

      // Start orchestrated verification in background
      this.runOrchestratedVerification(jobId, body).catch(err => {
        console.error(`[${new Date().toISOString()}] Orchestrated verification background task error:`, err);
        const currentJob = this.jobs.get(jobId);
        if (currentJob) {
          currentJob.status = 'failed';
          currentJob.error = err instanceof Error ? err.message : String(err);
          currentJob.completedAt = new Date();
        }
      });

      this.stats.totalOrchestratedVerifications++;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Orchestrated verification setup error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Run orchestrated verification in background
   */
  private async runOrchestratedVerification(
    jobId: string,
    body: OrchestratedVerifyRequest
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.progress = 'Running fast verification for all sites...';

      const orchestrator = new VerifyOrchestrator({
        strict: body.strict ?? false,
        model: body.model ?? process.env.LLM_MODEL ?? 'deepseek-v4-flash',
        maxDeepSteps: 15
      });

      // Create a temporary config file for the orchestrator
      const tempConfigPath = `/tmp/verify-orchestrated-${jobId}.json`;
      require('fs').writeFileSync(tempConfigPath, JSON.stringify({ sites: body.sites }, null, 2));

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
   * POST /api/verify/matrix - Matrix verification (synchronous)
   */
  private async postMatrixVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as MatrixVerifyRequest;

      if (!body.site || !body.matrix) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: site, matrix'
        });
        return;
      }

      if (!body.site.name || !body.site.url) {
        res.status(400).json({
          success: false,
          error: 'Missing required site fields: name, url'
        });
        return;
      }

      console.log(`[${new Date().toISOString()}] Starting matrix verification for: ${body.site.name} (${body.site.url})`);

      // Validate matrix configuration
      const matrixConfig: DeviceMatrixConfig = {
        browsers: body.matrix.browsers,
        viewports: body.matrix.viewports,
        locales: body.matrix.locales
      };

      const validation = MatrixRunner.validateMatrixConfig(matrixConfig);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Invalid matrix configuration',
          details: validation.errors
        });
        return;
      }

      // Create matrix runner and execute
      const runner = new MatrixRunner();
      const result = await runner.run(body.site, matrixConfig);

      // Save individual test results from matrix
      try {
        for (const combo of result.combinations) {
          this.resultStore.save(combo.result);
        }
      } catch (saveError) {
        console.error(`[${new Date().toISOString()}] Error saving matrix results:`, saveError);
      }

      console.log(`[${new Date().toISOString()}] Matrix verification completed: ${result.summary.passed}/${result.summary.total} passed`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Matrix verification error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * POST /api/verify/intelligent - Intelligent verification (synchronous or asynchronous)
   */
  private async postIntelligentVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as IntelligentVerifyRequest;

      if (!body.target || !body.target.url) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: target.url'
        });
        return;
      }

      console.log(`[${new Date().toISOString()}] Starting intelligent verification for: ${body.target.name || body.target.url}`);

      // If async mode requested, create a job
      if (body.async) {
        const jobConfig: JobConfig = {
          intelligentVerify: {
            target: body.target,
            options: body.options
          }
        };

        const job = this.jobQueue.createJob('intelligent', jobConfig, 'normal');
        this.jobQueue.enqueue(job);
        console.log(`[${new Date().toISOString()}] Intelligent verification job created: ${job.id}`);

        res.json({
          success: true,
          jobId: job.id,
          status: job.status,
          message: 'Intelligent verification job queued'
        });
        return;
      }

      // Synchronous execution
      const target: TestTarget = {
        url: body.target.url,
        name: body.target.name,
        description: body.target.description,
        tags: body.target.tags,
        priority: body.target.priority || 'normal',
      };

      // Create intelligent orchestrator
      const orchestrator = OrchestratorFactory.create({
        planner: {
          useLLM: body.options?.useLLMPlanner || false,
          llmConfig: body.options?.useLLMPlanner ? {
            llm: {
              apiKey: process.env.LLM_API_KEY || '',
              apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
              model: body.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
              temperature: 0.7,
              maxTokens: 4000,
            },
          } : undefined,
        },
        executor: {
          outputDir: body.options?.outputDir || './artifacts',
          enableScreenshots: true,
          enableConsoleLogs: true,
          defaultTimeout: 30000,
          maxRetries: 3,
        },
        evaluator: {
          evaluatorType: body.options?.evaluatorType || (body.options?.useLLMEvaluator ? 'llm' : 'rule'),
          useLLM: body.options?.useLLMEvaluator || false,
          llmConfig: body.options?.useLLMEvaluator ? {
            llm: {
              apiKey: process.env.LLM_API_KEY || '',
              apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
              model: body.options?.model || process.env.LLM_MODEL || 'deepseek-v4-flash',
              temperature: 0.3,
              maxTokens: 3000,
            },
          } : undefined,
          multiStrategyConfig: body.options?.evaluatorType === 'multi-strategy' ? {
            enabledStrategies: body.options?.enabledStrategies || [
              'logic-check',
              'visual-consistency',
              'cross-reference',
              'edge-case',
              'evidence-scoring',
            ],
            confidenceThreshold: body.options?.confidenceThreshold || 0.7,
            outputDir: body.options?.outputDir || './output',
            verbose: body.options?.verbose || false,
          } : undefined,
        },
        repairLoop: {
          enable: body.options?.enableRepair !== false,
          maxRounds: body.options?.maxRepairRounds || 3,
        },
      });

      // Run intelligent verification
      const result: IntelligenceRunResult = await orchestrator.run(target, {
        useLLMPlanner: body.options?.useLLMPlanner || false,
        useLLMEvaluator: body.options?.useLLMEvaluator || false,
        enableRepair: body.options?.enableRepair !== false,
        maxRepairRounds: body.options?.maxRepairRounds || 3,
        outputDir: body.options?.outputDir || './artifacts',
        verbose: body.options?.verbose || false,
      });

      // Save scenario results from intelligent verification
      try {
        if (result.scenarioResults && Array.isArray(result.scenarioResults)) {
          for (const scenarioResult of result.scenarioResults) {
            // Create a TestResult from ScenarioResult for storage
            const testResult: TestResult = {
              siteName: body.target.name || body.target.url,
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

      console.log(`[${new Date().toISOString()}] Intelligent verification completed: ${result.summary.passedScenarios}/${result.summary.totalScenarios} passed`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Intelligent verification error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * POST /api/verify/multi-agent - Multi-agent verification (synchronous)
   */
  private async postMultiAgentVerify(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      if (!body.target || !body.target.url) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: target.url'
        });
        return;
      }

      if (!body.mode || !body.roles) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: mode, roles'
        });
        return;
      }

      console.log(`[${new Date().toISOString()}] Starting multi-agent verification for: ${body.target.url}`);
      console.log(`Mode: ${body.mode}, Roles: ${body.roles.join(', ')}`);

      // Validate orchestration mode
      const validModes: OrchestrationMode[] = ['sequential', 'parallel', 'hierarchical', 'debate'];
      if (!validModes.includes(body.mode)) {
        res.status(400).json({
          success: false,
          error: `Invalid mode: ${body.mode}. Must be one of: ${validModes.join(', ')}`
        });
        return;
      }

      // Validate roles
      const validRoles: TestRoleType[] = ['explorer', 'tester', 'reviewer', 'repairer'];
      const invalidRoles = body.roles.filter((role: string) => !validRoles.includes(role as TestRoleType));
      if (invalidRoles.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid roles: ${invalidRoles.join(', ')}. Must be one of: ${validRoles.join(', ')}`
        });
        return;
      }

      // Create multi-agent configuration
      const config: MultiAgentConfig = {
        mode: body.mode,
        roles: body.roles,
        maxParallelAgents: body.maxParallelAgents || 3,
        debateRounds: body.debateRounds || 2,
        confidenceThreshold: body.confidenceThreshold || 0.7,
        timeout: body.timeout || 120000,
      };

      // Create multi-agent orchestrator
      const orchestrator = new MultiAgentOrchestrator(config);

      // Create test target
      const target = {
        url: body.target.url,
        name: body.target.name || 'Multi-Agent Test',
        description: body.target.description || 'Multi-agent verification test',
        tags: body.target.tags || [],
        priority: body.target.priority || 'normal',
      };

      // Run multi-agent verification
      const result = await orchestrator.run(target);

      console.log(`[${new Date().toISOString()}] Multi-agent verification completed: ${result.finalVerdict}`);
      console.log(`Confidence: ${result.confidence}, Duration: ${result.duration}ms`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Multi-agent verification error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/jobs/:jobId - Get job status and result (legacy)
   */
  private getLegacyJob(req: Request, res: Response): void {
    const { jobId } = req.params;
    const job = this.jobs.get(String(jobId));

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      });
      return;
    }

    const response: any = {
      success: true,
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt.toISOString()
    };

    if (job.completedAt) {
      response.completedAt = job.completedAt.toISOString();
    }

    if (job.status === 'completed' && job.result) {
      response.result = job.result;
    }

    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    res.json(response);
  }

  /**
   * DELETE /api/jobs/:jobId - Cancel/delete a job (legacy)
   */
  private deleteLegacyJob(req: Request, res: Response): void {
    const { jobId } = req.params;
    const jobIdStr = String(jobId);
    const job = this.jobs.get(jobIdStr);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      });
      return;
    }

    if (job.status === 'running') {
      // Mark as cancelled (note: actual process cancellation is not implemented in MVP)
      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.completedAt = new Date();
    }

    this.jobs.delete(jobIdStr);

    res.json({
      success: true,
      message: 'Job deleted'
    });
  }

  /**
   * GET /api/jobs - List all jobs (legacy)
   */
  private listLegacyJobs(req: Request, res: Response): void {
    const jobs = Array.from(this.jobs.values()).map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString()
    }));

    res.json({
      success: true,
      count: jobs.length,
      jobs
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NEW JOB QUEUE API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /api/jobs - Create a new job
   */
  private async postCreateJob(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      if (!body.type || !body.config) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: type, config'
        });
        return;
      }

      // Validate job type
      const validTypes: JobType[] = ['fast', 'deep', 'orchestrated', 'matrix'];
      if (!validTypes.includes(body.type)) {
        res.status(400).json({
          success: false,
          error: `Invalid job type. Must be one of: ${validTypes.join(', ')}`
        });
        return;
      }

      // Create job
      const job = this.jobQueue.createJob(
        body.type as JobType,
        body.config as JobConfig,
        body.priority as JobPriority || 'normal',
        body.maxRetries || 3,
        body.timeout
      );

      // Enqueue job
      this.jobQueue.enqueue(job);

      console.log(`[${new Date().toISOString()}] Created ${body.type} job: ${job.id}`);

      res.status(201).json({
        success: true,
        jobId: job.id,
        type: job.type,
        status: job.status,
        priority: job.priority,
        message: 'Job created and queued. Use GET /api/jobs/:id/detail to check status.'
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error creating job:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/jobs/list - List jobs with filtering
   */
  private listJobs(req: Request, res: Response): void {
    try {
      const status = req.query.status as JobStatus | undefined;
      const type = req.query.type as JobType | undefined;
      const priority = req.query.priority as JobPriority | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;

      const filter = {
        status,
        type,
        priority,
        offset: (page - 1) * pageSize,
        limit: pageSize
      };

      const jobs = this.jobQueue.getStats().total === 0
        ? []
        : this.jobStore.list(filter);

      const totalJobs = this.jobQueue.getStats().total;

      res.json({
        success: true,
        count: jobs.length,
        total: totalJobs,
        page,
        pageSize,
        jobs: jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          progress: job.progress,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          error: job.error
        }))
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error listing jobs:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/jobs/:id/detail - Get job details
   */
  private getJobDetail(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const job = this.jobStore.get(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
        return;
      }

      const response: any = {
        success: true,
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          config: job.config,
          progress: job.progress,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          timeout: job.timeout
        }
      };

      if (job.status === 'completed' && job.result) {
        response.job.result = job.result;
      }

      if (job.status === 'failed' && job.error) {
        response.job.error = job.error;
      }

      res.json(response);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting job detail:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * DELETE /api/jobs/:id/cancel - Cancel a job
   */
  private cancelJob(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const cancelled = this.jobQueue.cancel(jobId);

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Job not found or cannot be cancelled (job may already be running)'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Job cancelled successfully'
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error cancelling job:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * POST /api/jobs/:id/retry - Retry a failed job
   */
  private retryJob(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const job = this.jobQueue.retryJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found or cannot be retried (job may not be failed or max retries reached)'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Job queued for retry',
        job: {
          id: job.id,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          status: job.status
        }
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error retrying job:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * POST /api/jobs/batch - Create multiple jobs
   */
  private async postBatchJobs(req: Request, res: Response): Promise<void> {
    try {
      const { jobs } = req.body;

      if (!Array.isArray(jobs) || jobs.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: jobs (non-empty array)'
        });
        return;
      }

      const createdJobs: string[] = [];

      for (const jobData of jobs) {
        if (!jobData.type || !jobData.config) {
          console.warn(`[Batch] Skipping invalid job: ${JSON.stringify(jobData)}`);
          continue;
        }

        const validTypes: JobType[] = ['fast', 'deep', 'orchestrated', 'matrix'];
        if (!validTypes.includes(jobData.type)) {
          console.warn(`[Batch] Skipping job with invalid type: ${jobData.type}`);
          continue;
        }

        const job = this.jobQueue.createJob(
          jobData.type as JobType,
          jobData.config as JobConfig,
          jobData.priority as JobPriority || 'normal',
          jobData.maxRetries || 3,
          jobData.timeout
        );

        this.jobQueue.enqueue(job);
        createdJobs.push(job.id);
      }

      console.log(`[${new Date().toISOString()}] Created batch of ${createdJobs.length} jobs`);

      res.status(201).json({
        success: true,
        created: createdJobs.length,
        jobIds: createdJobs,
        message: `${createdJobs.length} jobs created and queued`
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error creating batch jobs:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get API key from environment
   */
  private getApiKey(): string {
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }
    console.log(`[DEBUG] Checking API keys: OPENAI=${!!process.env.OPENAI_API_KEY}, ANTHROPIC=${!!process.env.ANTHROPIC_API_KEY}, GLM=${!!process.env.GLM_API_KEY}, LLM=${!!process.env.LLM_API_KEY}, DEEPSEEK=${!!process.env.DEEPSEEK_API_KEY}`);
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

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Launch browser pool (singleton)
    console.log(`[${new Date().toISOString()}] Launching browser pool...`);
    this.browser = await chromium.launch({ headless: this.headless });
    console.log(`[${new Date().toISOString()}] Browser pool ready`);

    // Start scheduler
    console.log(`[${new Date().toISOString()}] Starting job scheduler...`);
    await this.scheduler.start();
    console.log(`[${new Date().toISOString()}] Job scheduler started`);

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`[${new Date().toISOString()}] VerifyServer started`);
        console.log(`[${new Date().toISOString()}] Listening on http://${this.host}:${this.port}`);
        if (this.shouldRequireApiAuth()) {
          console.log(`[${new Date().toISOString()}] API auth: bearer token required`);
        } else {
          console.log(`[${new Date().toISOString()}] API auth: disabled for local-only access`);
        }
        console.log(`[${new Date().toISOString()}] API endpoints:`);
        console.log(`  - POST   /api/verify              Fast verification (sync)`);
        console.log(`  - POST   /api/verify/deep         Deep verification (async)`);
        console.log(`  - POST   /api/verify/orchestrated Orchestrated verification (async)`);
        console.log(`  - POST   /api/verify/matrix       Matrix verification (sync)`);
        console.log(`  - POST   /api/jobs                Create job`);
        console.log(`  - GET    /api/jobs/list           List jobs`);
        console.log(`  - GET    /api/jobs/:id/detail     Job details`);
        console.log(`  - DELETE /api/jobs/:id/cancel     Cancel job`);
        console.log(`  - POST   /api/jobs/:id/retry      Retry job`);
        console.log(`  - POST   /api/jobs/batch          Batch create jobs`);
        console.log(`  - GET    /api/jobs/:jobId         Poll job status (legacy)`);
        console.log(`  - GET    /api/jobs                List all jobs (legacy)`);
        console.log(`  - DELETE /api/jobs/:jobId         Cancel job (legacy)`);
        console.log(`  - GET    /api/health              Health check`);
        console.log(`  - GET    /api/stats               Server statistics`);
        resolve();
      });

      this.server.on('error', (err: Error) => {
        console.error(`[${new Date().toISOString()}] Server error:`, err);
        reject(err);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Stopping VerifyServer...`);

    // Stop scheduler first
    console.log(`[${new Date().toISOString()}] Stopping job scheduler...`);
    try {
      await this.scheduler.stop();
      console.log(`[${new Date().toISOString()}] Job scheduler stopped`);
    } catch (schedulerError) {
      console.error(`[${new Date().toISOString()}] Error stopping scheduler:`, schedulerError);
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
        console.log(`[${new Date().toISOString()}] Browser pool closed`);
      } catch (browserError) {
        console.error(`[${new Date().toISOString()}] Error closing browser:`, browserError);
      }
    }

    return new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.server.close((err?: Error) => {
          if (err) {
            console.error(`[${new Date().toISOString()}] Error closing server:`, err);
            reject(err);
            return;
          }

          console.log(`[${new Date().toISOString()}] VerifyServer stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private server: ReturnType<express.Application['listen']> | null = null;

  // ─── Dashboard API Handlers ────────────────────────────────

  /**
   * GET /api/dashboard/overview - Dashboard overview statistics
   */
  private async getDashboardOverview(req: Request, res: Response): Promise<void> {
    try {
      let allJobs = this.jobStore.list({});

      // Filter by project sites if project context exists
      if (req.project && req.project.sites.length > 0) {
        allJobs = allJobs.filter(job => {
          const siteName = job.config?.name || '';
          return req.project!.sites.includes(siteName);
        });
      }

      const recentJobs = allJobs.slice(0, 10);

      const totalJobs = allJobs.length;
      const completedJobs = allJobs.filter(j => j.status === 'completed').length;
      const failedJobs = allJobs.filter(j => j.status === 'failed').length;
      const runningJobs = allJobs.filter(j => j.status === 'running').length;
      const pendingJobs = allJobs.filter(j => j.status === 'pending').length;

      const passRate = completedJobs > 0 ? ((completedJobs - failedJobs) / completedJobs) * 100 : 0;

      res.json({
        success: true,
        totalJobs,
        completedJobs,
        failedJobs,
        runningJobs,
        pendingJobs,
        passRate,
        recentJobs: recentJobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          error: job.error
        }))
      });
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/dashboard/sites - Sites health status
   */
  private async getDashboardSites(req: Request, res: Response): Promise<void> {
    try {
      let allJobs = this.jobStore.list({});

      // Filter by project sites if project context exists
      if (req.project && req.project.sites.length > 0) {
        allJobs = allJobs.filter(job => {
          const siteName = job.config?.name || '';
          return req.project!.sites.includes(siteName);
        });
      }

      // Group jobs by site and collect statistics
      const siteMap = new Map<string, any>();

      for (const job of allJobs) {
        if (job.status !== 'completed') continue;

        const siteName = job.config?.name || 'Unknown';
        const siteUrl = job.config?.url || 'Unknown';

        if (!siteMap.has(siteName)) {
          siteMap.set(siteName, {
            name: siteName,
            url: siteUrl,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            lastResult: null,
            lastJobId: null
          });
        }

        const site = siteMap.get(siteName)!;
        site.totalTests++;

        if (job.result?.passed) {
          site.passedTests++;
          site.lastResult = { passed: true };
          site.lastJobId = job.id;
        } else if (job.result?.passed === false) {
          site.failedTests++;
          site.lastResult = { passed: false };
          site.lastJobId = job.id;
        }
      }

      const sites = Array.from(siteMap.values());

      res.json({
        success: true,
        sites,
        totalSites: sites.length
      });
    } catch (error) {
      console.error('Error getting dashboard sites:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/dashboard/trends - Historical pass rate trends (last 30 days)
   */
  private async getDashboardTrends(req: Request, res: Response): Promise<void> {
    try {
      const allJobs = this.jobStore.list({});
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Filter jobs from the last 30 days
      const recentJobs = allJobs.filter(job =>
        job.createdAt >= thirtyDaysAgo && job.status === 'completed'
      );

      // Group by day
      const trendsByDay = new Map<string, { total: number; passed: number }>();

      for (const job of recentJobs) {
        const dayKey = job.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!trendsByDay.has(dayKey)) {
          trendsByDay.set(dayKey, { total: 0, passed: 0 });
        }

        const day = trendsByDay.get(dayKey)!;
        day.total++;

        if (job.result?.passed) {
          day.passed++;
        }
      }

      // Convert to array and sort by date
      const trends = Array.from(trendsByDay.entries())
        .map(([date, stats]) => ({
          date,
          passRate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        success: true,
        trends,
        period: {
          start: thirtyDaysAgo.toISOString(),
          end: now.toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting dashboard trends:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/reports/:id - Get detailed test report by job ID
   */
  private async getReportDetail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;

      const job = this.jobStore.get(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
        return;
      }

      const response: any = {
        success: true,
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          config: job.config,
          progress: job.progress,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          timeout: job.timeout,
          error: job.error
        }
      };

      if (job.status === 'completed' && job.result) {
        response.job.result = job.result;
      }

      res.json(response);
    } catch (error) {
      console.error('Error getting report detail:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ─── Webhook & API Key Handlers ────────────────────────

  private async listWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const webhooks = this.webhookConfig.getAll();
      res.json(webhooks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { url, secret, events, name } = req.body;
      if (!url || !secret || !events) {
        res.status(400).json({ error: 'url, secret, and events are required' });
        return;
      }
      const wh = this.webhookConfig.create(url, secret, events, true);
      res.status(201).json(wh);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const wh = this.webhookConfig.update(id, req.body);
      if (!wh) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(wh);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      const ok = this.webhookConfig.delete(req.params.id as string);
      res.json({ deleted: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const wh = this.webhookConfig.get(req.params.id as string);
      if (!wh) { res.status(404).json({ error: 'Not found' }); return; }
      const result = await this.webhookDelivery.sendTest(wh);
      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async listApiKeys(req: Request, res: Response): Promise<void> {
    try {
      const keys = getAllKeys().map(k => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt }));
      res.json(keys);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async createApiKey(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const key = createKey(name);
      res.status(201).json(key);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  private async deleteApiKey(req: Request, res: Response): Promise<void> {
    try {
      const ok = deleteKey(req.params.id as string);
      res.json({ deleted: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  // ─── Project Management Handlers ─────────────────────────────────

  /**
   * POST /api/admin/projects - Create a new project
   */
  private async createProject(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as CreateProjectRequest;

      if (!body.name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const project = ProjectStore.create(body);

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/admin/projects - List all projects
   */
  private async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const projects = ProjectStore.getAll();

      res.json({
        success: true,
        data: projects,
        count: projects.length
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * Extract string parameter from request params
   */
  private extractParam(params: any, key: string): string {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * GET /api/admin/projects/:id - Get project by ID
   */
  private async getProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');

      const project = ProjectStore.getById(id);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * PUT /api/admin/projects/:id - Update project
   */
  private async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const body = req.body as UpdateProjectRequest;

      const project = ProjectStore.update(id, body);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * DELETE /api/admin/projects/:id - Delete project
   */
  private async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');

      const deleted = ProjectStore.delete(id);

      if (!deleted) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * POST /api/admin/projects/:id/sites - Add site to project
   */
  private async addSiteToProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const { siteName } = req.body;

      if (!siteName) {
        res.status(400).json({ error: 'siteName is required' });
        return;
      }

      const project = ProjectStore.addSite(id, siteName);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * DELETE /api/admin/projects/:id/sites/:siteName - Remove site from project
   */
  private async removeSiteFromProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const siteName = this.extractParam(req.params, 'siteName');

      const project = ProjectStore.removeSite(id, siteName);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * POST /api/admin/projects/:id/members - Add member to project
   */
  private async addMemberToProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const { userId, role } = req.body;

      if (!userId || !role) {
        res.status(400).json({ error: 'userId and role are required' });
        return;
      }

      if (!['owner', 'developer', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'role must be owner, developer, or viewer' });
        return;
      }

      const project = ProjectStore.addMember(id, userId, role);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * DELETE /api/admin/projects/:id/members/:userId - Remove member from project
   */
  private async removeMemberFromProject(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const userId = this.extractParam(req.params, 'userId');

      const project = ProjectStore.removeMember(id, userId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * PATCH /api/admin/projects/:id/members/:userId - Update member role
   */
  private async updateMemberRole(req: Request, res: Response): Promise<void> {
    try {
      const id = this.extractParam(req.params, 'id');
      const userId = this.extractParam(req.params, 'userId');
      const { role } = req.body;

      if (!role) {
        res.status(400).json({ error: 'role is required' });
        return;
      }

      if (!['owner', 'developer', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'role must be owner, developer, or viewer' });
        return;
      }

      const project = ProjectStore.updateMemberRole(id, userId, role);

      if (!project) {
        res.status(404).json({ error: 'Project or member not found' });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  // ─── AI Endpoint Handlers ─────────────────────────────────────────

  /**
   * POST /api/ai/generate-tests - Generate tests from URL using AI
   */
  private async generateTests(req: Request, res: Response): Promise<void> {
    try {
      const { url, options } = req.body;

      if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
      }

      const generator = getSmartTestGenerator();
      const generatedConfig = await generator.generateFromUrl(url, options);

      // Optionally save to file
      if (options?.saveToFile) {
        const filePath = generator.saveToFile(generatedConfig);
        generatedConfig.metadata['savedToFile'] = filePath;
      }

      res.json({
        success: true,
        data: generatedConfig
      });
    } catch (e: any) {
      console.error('Error generating tests:', e);
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /api/ai/suggest-fixes/:jobId - Get AI suggestions for failed job
   */
  private async suggestFixes(req: Request, res: Response): Promise<void> {
    try {
      const jobId = this.extractParam(req.params, 'jobId');

      const job = this.jobStore.get(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (job.status !== 'failed') {
        res.status(400).json({ error: 'Job must be failed to get fix suggestions' });
        return;
      }

      const error = job.error || 'Unknown error';
      const siteName = job.config?.name || 'unknown';
      const siteUrl = job.config?.url || 'unknown';

      // Use AI to analyze the failure and suggest fixes
      const provider = ProviderFactory.createFromEnv();
      const prompt = `
I need help fixing a failed test. Here are the details:

Site Name: ${siteName}
Site URL: ${siteUrl}
Job ID: ${jobId}
Error: ${error}
Job Type: ${job.type}
Configuration: ${JSON.stringify(job.config, null, 2)}

Please analyze this failure and suggest:
1. What might have caused this failure
2. How to fix it
3. Specific steps to implement the fix
4. How to prevent this in the future

Respond in JSON format:
{
  "rootCause": "analysis of what went wrong",
  "fixSuggestions": ["step 1", "step 2", "step 3"],
  "preventionMeasures": ["measure 1", "measure 2"],
  "confidence": 85
}
`;

      const response = await provider.chat([
        { role: 'user', content: prompt }
      ]);

      const suggestions = JSON.parse(response);

      res.json({
        success: true,
        data: {
          jobId,
          error,
          suggestions,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (e: any) {
      console.error('Error suggesting fixes:', e);
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /api/ai/providers - List configured AI providers
   */
  private async listAIProviders(req: Request, res: Response): Promise<void> {
    try {
      const providers: Array<{
        name: string;
        type: string;
        available: boolean;
        model?: string;
      }> = [];

      // Check OpenAI
      if (process.env.OPENAI_API_KEY) {
        providers.push({
          name: 'OpenAI',
          type: 'openai',
          available: true,
          model: process.env.OPENAI_MODEL || 'gpt-4'
        });
      }

      // Check Anthropic
      if (process.env.ANTHROPIC_API_KEY) {
        providers.push({
          name: 'Anthropic',
          type: 'anthropic',
          available: true,
          model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
        });
      }

      // Check GLM
      if (process.env.GLM_API_KEY) {
        providers.push({
          name: 'GLM',
          type: 'glm',
          available: true,
          model: process.env.GLM_MODEL || 'glm-4'
        });
      }

      // Check LLM generic
      if (process.env.LLM_API_KEY) {
        providers.push({
          name: 'Generic LLM',
          type: 'generic',
          available: true,
          model: process.env.LLM_MODEL || 'unknown'
        });
      }

      res.json({
        success: true,
        providers,
        count: providers.length
      });
    } catch (e: any) {
      console.error('Error listing AI providers:', e);
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /api/ai/locator-stats - Get self-healing locator statistics
   */
  private async getLocatorStats(req: Request, res: Response): Promise<void> {
    try {
      const locator = getSelfHealingLocator();
      const stats = locator.getCacheStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (e: any) {
      console.error('Error getting locator stats:', e);
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * DELETE /api/ai/locator-cache - Clear self-healing locator cache
   */
  private async clearLocatorCache(req: Request, res: Response): Promise<void> {
    try {
      const locator = getSelfHealingLocator();
      locator.clearCache();

      res.json({
        success: true,
        message: 'Locator cache cleared successfully'
      });
    } catch (e: any) {
      console.error('Error clearing locator cache:', e);
      res.status(500).json({ error: e.message });
    }
  }

  /**
   * GET /api/trends/:site - Get historical trend data for a site
   */
  private async getSiteTrends(req: Request, res: Response): Promise<void> {
    try {
      const siteName = this.extractParam(req.params, 'site');
      const days = parseInt(req.query.days as string) || 30;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const trend = this.trendAnalyzer.calculatePassRate(siteName, days);

      res.json({
        success: true,
        data: trend
      });
    } catch (error) {
      console.error('Error getting site trends:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/trends/:site/regressions - Get regression detection for a site
   */
  private async getSiteRegressions(req: Request, res: Response): Promise<void> {
    try {
      const siteName = req.params.site as string;
      const recentDays = parseInt(req.query.recentDays as string) || 7;
      const historicalDays = parseInt(req.query.historicalDays as string) || 30;
      const threshold = parseInt(req.query.threshold as string) || 10;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const regression = this.trendAnalyzer.detectRegressions(
        siteName,
        recentDays,
        historicalDays,
        threshold
      );

      res.json({
        success: true,
        data: regression
      });
    } catch (error) {
      console.error('Error detecting regressions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/profiles - Get all site quality profiles
   */
  private async getAllProfiles(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;

      // Filter by project sites if project context exists
      let allSiteNames = this.resultStore.getAllSiteNames();

      if (req.project && req.project.sites.length > 0) {
        allSiteNames = allSiteNames.filter(site => req.project!.sites.includes(site));
      }

      const profiles = allSiteNames.map(siteName =>
        this.qualityCalculator.calculateProfile(siteName, days)
      );

      res.json({
        success: true,
        data: profiles
      });
    } catch (error) {
      console.error('Error getting all profiles:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/profiles/:site - Get quality profile for a specific site
   */
  private async getSiteProfile(req: Request, res: Response): Promise<void> {
    try {
      const siteName = req.params.site as string;
      const days = parseInt(req.query.days as string) || 30;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const profile = this.qualityCalculator.calculateProfile(siteName, days);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Error getting site profile:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
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
}

// Startup
// ────────────────────────────────────────────────────────────────────

// Create and start server
const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '127.0.0.1';
const HEADLESS = process.env.HEADLESS !== 'false';

const server = new VerifyServer(PORT, HOST, HEADLESS);

server.start().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});

// Handle graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[${new Date().toISOString()}] Received ${signal} - shutting down gracefully...`);

  try {
    await server.stop();
    console.log(`[${new Date().toISOString()}] Shutdown complete`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during shutdown:`, error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
