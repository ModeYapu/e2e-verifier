/**
 * HTTP API Server for e2e-verifier
 * Provides REST endpoints for fast verification, deep verification, and orchestrated verification
 */

import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import path from 'path';
import { chromium, Browser } from '@playwright/test';
import { BrowserPool } from '../browser/browser-pool';
import { WebhookConfigManager } from '../config/webhook-config';
import { WebhookDelivery } from '../integrations/webhook';
import { projectAuth } from '../middleware/project-auth';
import { apiKeyAuth } from '../middleware/api-auth';
import { ProjectStore } from '../projects/project-store';
import experienceRoutes from '../api/routes/experience-routes';
import { IntelligentOrchestrator } from '../intelligence/orchestrator';
import { parseIntelligenceConfigFromEnv } from '../intelligence/config';
import { LLMRegistry } from '../llm/llm-registry';

// Import services
import { VerifyService } from './services/verify-service';
import { JobService } from './services/job-service';
import { ProjectService } from './services/project-service';
import { AIService } from './services/ai-service';
import { StorageService } from './services/storage-service';

// Import routes
import { createHealthRoutes } from './routes/health-routes';
import { createVerifyRoutes } from './routes/verify-routes';
import { createJobRoutes } from './routes/job-routes';
import { createProjectRoutes } from './routes/project-routes';
import { createWebhookRoutes } from './routes/webhook-routes';
import { createKeyRoutes } from './routes/key-routes';
import { createAIRoutes } from './routes/ai-routes';
import { createDashboardRoutes } from './routes/dashboard-routes';
import { createTrendRoutes } from './routes/trend-routes';
import { createReportRoutes } from './routes/report-routes';
import { errorHandler } from '../middleware/error-handler';

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
 * HTTP API Server class
 */
export class VerifyServer {
  private app: express.Application;
  private router: Router;
  private verifyService: VerifyService;
  private jobService: JobService;
  private projectService: ProjectService;
  private aiService: AIService;
  private storageService: StorageService;
  private webhookConfig: WebhookConfigManager;
  private webhookDelivery: WebhookDelivery;
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

    // Initialize services
    this.verifyService = new VerifyService(this.headless);
    this.jobService = new JobService();
    this.projectService = new ProjectService();
    this.aiService = new AIService();
    this.storageService = new StorageService();

    // Initialize LLM Registry with environment configuration
    LLMRegistry.initialize({
      apiKey: process.env.LLM_API_KEY || '',
      apiBase: process.env.LLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL || 'glm-4',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
      maxSteps: parseInt(process.env.LLM_MAX_STEPS || '20'),
    });

    // Initialize intelligent orchestrator with experience store
    this.intelligentOrchestrator = new IntelligentOrchestrator(parseIntelligenceConfigFromEnv());

    // Make orchestrator and stats available to routes
    this.app.set('orchestrator', this.intelligentOrchestrator);
    this.app.set('stats', this.stats);
    this.app.set('uptime', 0);

    // Initialize webhook integration
    this.webhookConfig = new WebhookConfigManager();
    this.webhookDelivery = new WebhookDelivery();
    this.jobService.getScheduler().on('job.completed', (job: any) => {
      for (const wh of this.webhookConfig.getEnabledForEvent('job.completed')) {
        this.webhookDelivery.send('job.completed', job, wh).catch(() => {});
      }
    });
    this.jobService.getScheduler().on('job.failed', (job: any) => {
      for (const wh of this.webhookConfig.getEnabledForEvent('job.failed')) {
        this.webhookDelivery.send('job.failed', job, wh).catch(() => {});
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Apply API key authentication (automatically skips /health endpoint)
    this.app.use('/api', apiKeyAuth);

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

  private setupRoutes(): void {
    // Register all route modules
    this.app.use('/api', createHealthRoutes(this.verifyService));
    this.app.use('/api', createVerifyRoutes(this.verifyService, this.jobService));
    this.app.use('/api', createJobRoutes(this.jobService));
    this.app.use('/api', createProjectRoutes(this.projectService));
    this.app.use('/api', createWebhookRoutes());
    this.app.use('/api', createKeyRoutes());
    this.app.use('/api', createAIRoutes(this.aiService, this.jobService));
    this.app.use('/api', createDashboardRoutes(this.jobService));
    this.app.use('/api', createTrendRoutes(this.storageService));
    this.app.use('/api', createReportRoutes(this.jobService));

    // Experience store routes (already separated)
    this.app.use('/api', experienceRoutes);
  }

  private setupErrorHandling(): void {
    // Use our centralized error handler
    this.app.use(errorHandler);
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

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Update uptime
    this.app.set('uptime', Date.now() - this.serverStartTime);

    // Initialize browser pool (singleton)
    console.log(`[${new Date().toISOString()}] Initializing browser pool...`);
    BrowserPool.getInstance({
      headless: this.headless,
      maxInstances: 2, // Shared pool for all services
    });
    console.log(`[${new Date().toISOString()}] Browser pool ready`);

    // Initialize intelligent orchestrator
    console.log(`[${new Date().toISOString()}] Initializing intelligent orchestrator...`);
    await this.intelligentOrchestrator.init();
    console.log(`[${new Date().toISOString()}] Intelligent orchestrator ready`);

    // Start scheduler
    console.log(`[${new Date().toISOString()}] Starting job scheduler...`);
    await this.jobService.start();
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
      await this.jobService.stop();
      console.log(`[${new Date().toISOString()}] Job scheduler stopped`);
    } catch (schedulerError) {
      console.error(`[${new Date().toISOString()}] Error stopping scheduler:`, schedulerError);
    }

    // Close browser pool
    try {
      await BrowserPool.getInstance().close();
      console.log(`[${new Date().toISOString()}] Browser pool closed`);
    } catch (browserError) {
      console.error(`[${new Date().toISOString()}] Error closing browser pool:`, browserError);
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

  /**
   * Get Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  private server: ReturnType<express.Application['listen']> | null = null;
}
