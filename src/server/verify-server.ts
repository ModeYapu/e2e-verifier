/**
 * HTTP API Server for e2e-verifier
 * Provides REST endpoints for fast verification, deep verification, and orchestrated verification
 */

import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import { chromium, Browser } from '@playwright/test';
import { Verifier } from '../verifier';
import { AgentLoop } from '../agent/agent-loop';
import { VerifyOrchestrator } from '../orchestrator/verify-orchestrator';
import { SiteConfig, TestResult } from '../types';
import { AgentConfig, AgentResult } from '../agent/types';
import { OrchestratedResult } from '../orchestrator/verify-orchestrator';
import * as fs from 'fs';

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

/**
 * HTTP API Server class
 */
export class VerifyServer {
  private app: express.Application;
  private router: Router;
  private browser: Browser | null = null;
  private jobs: Map<string, VerificationJob> = new Map();
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
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
        next();
        return;
      }

      const token = this.extractBearerToken(req);
      if (!token || token !== this.apiToken) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }

      next();
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

    // Job management
    this.router.get('/jobs/:jobId', this.getJob.bind(this));
    this.router.delete('/jobs/:jobId', this.deleteJob.bind(this));
    this.router.get('/jobs', this.listJobs.bind(this));

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
   * GET /api/jobs/:jobId - Get job status and result
   */
  private getJob(req: Request, res: Response): void {
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
   * DELETE /api/jobs/:jobId - Cancel/delete a job
   */
  private deleteJob(req: Request, res: Response): void {
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
   * GET /api/jobs - List all jobs
   */
  private listJobs(req: Request, res: Response): void {
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
        console.log(`  - GET    /api/jobs/:jobId         Poll job status`);
        console.log(`  - GET    /api/jobs                List all jobs`);
        console.log(`  - DELETE /api/jobs/:jobId         Cancel job`);
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

    return new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.server.close(async (err?: Error) => {
          if (err) {
            console.error(`[${new Date().toISOString()}] Error closing server:`, err);
            reject(err);
            return;
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

          console.log(`[${new Date().toISOString()}] VerifyServer stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private server: ReturnType<express.Application['listen']> | null = null;
}

// ────────────────────────────────────────────────────────────────────
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
