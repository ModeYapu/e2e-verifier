/**
 * Batch Routes
 * Handles batch operations for multiple sites including verification and scheduling
 */

import { Router, Request, Response } from 'express';
import { JobService } from '../services/job-service';
import { StorageService } from '../services/storage-service';
import { ScheduleManager } from '../../scheduler/schedule-manager';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// TYPES
// =====================================================

interface BatchSiteConfig {
  url: string;
  name?: string;
  checks?: string[];
}

interface BatchVerifyRequest {
  sites: BatchSiteConfig[];
  priority?: 'high' | 'normal';
  configPath?: string;
}

interface BatchVerifyResponse {
  batchId: string;
  jobs: Array<{ site: string; jobId: string; status: string }>;
  totalJobs: number;
}

interface BatchScheduleRequest {
  sites: BatchSiteConfig[];
  schedule: {
    frequency: 'hourly' | 'daily' | 'weekly';
    time?: string;
  };
  configPath?: string;
}

interface BatchScheduleResponse {
  batchId: string;
  scheduled: Array<{ site: string; scheduleId: string; nextRun: string }>;
  totalScheduled: number;
}

interface BatchStatusResponse {
  batchId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalJobs: number;
  completedJobs: number;
  passedJobs: number;
  failedJobs: number;
  jobs: Array<{ site: string; jobId: string; status: string; passed?: boolean }>;
}

interface BatchState {
  batchId: string;
  type: 'verify' | 'schedule';
  status: 'pending' | 'running' | 'completed' | 'failed';
  jobs: Array<{ site: string; jobId: string; status: string; passed?: boolean }>;
  createdAt: string;
  completedAt?: string;
}

// =====================================================
// BATCH STATE STORAGE
// =====================================================

const BATCH_DIR = path.join(process.cwd(), 'data', 'batch');

/**
 * Ensure batch directory exists
 */
function ensureBatchDir(): void {
  if (!fs.existsSync(BATCH_DIR)) {
    fs.mkdirSync(BATCH_DIR, { recursive: true });
  }
}

/**
 * Save batch state to file
 */
function saveBatchState(state: BatchState): void {
  ensureBatchDir();
  const filePath = path.join(BATCH_DIR, `${state.batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

/**
 * Load batch state from file
 */
function loadBatchState(batchId: string): BatchState | null {
  const filePath = path.join(BATCH_DIR, `${batchId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as BatchState;
  } catch {
    return null;
  }
}

/**
 * Load sites from config file
 */
function loadSitesFromConfig(configPath: string): BatchSiteConfig[] | null {
  const fullPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(data);
    return config.sites || null;
  } catch {
    return null;
  }
}

// =====================================================
// ROUTE CREATOR
// =====================================================

export function createBatchRoutes(
  jobService: JobService,
  storageService: StorageService,
  scheduleManager: ScheduleManager
): Router {
  const router = Router();

  /**
   * POST /api/batch/verify
   * Trigger verification for multiple sites
   */
  router.post('/batch/verify', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as BatchVerifyRequest;

      // Load sites from config file if provided
      let sites = body.sites || [];
      if (body.configPath) {
        const configSites = loadSitesFromConfig(body.configPath);
        if (!configSites) {
          res.status(400).json({
            success: false,
            error: `Config file not found or invalid: ${body.configPath}`
          });
          return;
        }
        sites = configSites;
      }

      if (sites.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No sites provided for batch verification'
        });
        return;
      }

      // Generate batch ID
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create jobs for each site
      const jobs: Array<{ site: string; jobId: string; status: string }> = [];

      for (const siteConfig of sites) {
        try {
          const jobConfig = {
            fastVerify: {
              url: siteConfig.url,
              name: siteConfig.name || siteConfig.url,
              checks: siteConfig.checks || ['status', 'title', 'console-errors']
            }
          };

          const job = jobService.createAndEnqueueJob(
            'fast',
            jobConfig,
            body.priority || 'normal',
            3,
            30000
          );

          jobs.push({
            site: siteConfig.url,
            jobId: job.id,
            status: 'queued'
          });
        } catch (jobError) {
          logger.error(`Failed to create job for site ${siteConfig.url}: ${jobError}`);
          jobs.push({
            site: siteConfig.url,
            jobId: 'failed',
            status: 'failed'
          });
        }
      }

      // Save batch state
      const batchState: BatchState = {
        batchId,
        type: 'verify',
        status: jobs.length > 0 ? 'running' : 'failed',
        jobs,
        createdAt: new Date().toISOString()
      };
      saveBatchState(batchState);

      logger.info(`Batch verify created: ${batchId} with ${jobs.length} jobs`);

      const response: BatchVerifyResponse = {
        batchId,
        jobs,
        totalJobs: jobs.length
      };

      res.status(201).json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error(`Error in batch verify: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/batch/schedule
   * Set up recurring verification for multiple sites
   */
  router.post('/batch/schedule', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as BatchScheduleRequest;

      // Validate schedule
      if (!body.schedule || !body.schedule.frequency) {
        res.status(400).json({
          success: false,
          error: 'Missing required schedule configuration'
        });
        return;
      }

      // Load sites from config file if provided
      let sites = body.sites || [];
      if (body.configPath) {
        const configSites = loadSitesFromConfig(body.configPath);
        if (!configSites) {
          res.status(400).json({
            success: false,
            error: `Config file not found or invalid: ${body.configPath}`
          });
          return;
        }
        sites = configSites;
      }

      if (sites.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No sites provided for batch scheduling'
        });
        return;
      }

      // Generate batch ID
      const batchId = `batch-schedule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Schedule each site
      const scheduled: Array<{ site: string; scheduleId: string; nextRun: string }> = [];

      // Use the provided schedule manager

      for (const siteConfig of sites) {
        try {
          // Create cron expression based on frequency
          let cronExpr: string;
          const frequency = body.schedule.frequency;
          const time = body.schedule.time || '00:00';

          if (frequency === 'hourly') {
            cronExpr = '0 * * * *'; // Every hour at minute 0
          } else if (frequency === 'daily') {
            const [hour, minute] = time.split(':').map(Number);
            cronExpr = `${minute} ${hour} * * *`;
          } else if (frequency === 'weekly') {
            const [hour, minute] = time.split(':').map(Number);
            cronExpr = `${minute} ${hour} * * 1`; // Every Monday at specified time
          } else {
            continue;
          }

          const scheduleId = scheduleManager.addSchedule({
            name: siteConfig.name || siteConfig.url,
            cron: cronExpr,
            enabled: true,
            siteConfig: {
              name: siteConfig.name || siteConfig.url,
              url: siteConfig.url,
              checks: siteConfig.checks || ['status', 'title', 'console-errors']
            }
          });

          // Calculate next run (simplified)
          const nextRun = new Date();
          if (frequency === 'hourly') {
            nextRun.setHours(nextRun.getHours() + 1);
          } else if (frequency === 'daily') {
            const [hour] = time.split(':').map(Number);
            nextRun.setHours(hour, 0, 0);
            if (nextRun <= new Date()) {
              nextRun.setDate(nextRun.getDate() + 1);
            }
          } else if (frequency === 'weekly') {
            nextRun.setDate(nextRun.getDate() + 7);
          }

          scheduled.push({
            site: siteConfig.url,
            scheduleId,
            nextRun: nextRun.toISOString()
          });
        } catch (scheduleError) {
          logger.error(`Failed to schedule site ${siteConfig.url}: ${scheduleError}`);
        }
      }

      // Save batch state
      const batchState: BatchState = {
        batchId,
        type: 'schedule',
        status: scheduled.length > 0 ? 'completed' : 'failed',
        jobs: scheduled.map(s => ({
          site: s.site,
          jobId: s.scheduleId,
          status: 'scheduled'
        })),
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
      saveBatchState(batchState);

      logger.info(`Batch schedule created: ${batchId} with ${scheduled.length} schedules`);

      const response: BatchScheduleResponse = {
        batchId,
        scheduled,
        totalScheduled: scheduled.length
      };

      res.status(201).json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error(`Error in batch schedule: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/batch/status/:batchId
   * Check batch operation status
   */
  router.get('/batch/status/:batchId', async (req: Request, res: Response): Promise<void> => {
    try {
      const batchId = req.params.batchId as string;

      const batchState = loadBatchState(batchId);
      if (!batchState) {
        res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
        return;
      }

      // Update job statuses from job service
      let completedJobs = 0;
      let passedJobs = 0;
      let failedJobs = 0;

      const updatedJobs = batchState.jobs.map(jobInfo => {
        if (jobInfo.jobId === 'failed') {
          failedJobs++;
          return jobInfo;
        }

        const job = jobService.getJob(jobInfo.jobId);
        if (!job) {
          return jobInfo;
        }

        if (job.status === 'completed') {
          completedJobs++;
          if (job.result && typeof job.result === 'object' && 'passed' in job.result) {
            if ((job.result as { passed: boolean }).passed) {
              passedJobs++;
            } else {
              failedJobs++;
            }
          }
        } else if (job.status === 'failed') {
          completedJobs++;
          failedJobs++;
        }

        return {
          site: jobInfo.site,
          jobId: job.id,
          status: job.status,
          passed: job.result && typeof job.result === 'object' && 'passed' in job.result
            ? (job.result as { passed: boolean }).passed
            : undefined
        };
      });

      // Update batch status based on job completion
      let batchStatus = batchState.status;
      if (batchState.type === 'verify' && completedJobs === batchState.jobs.length) {
        batchStatus = 'completed';
      }

      // Update the batch state
      batchState.status = batchStatus;
      batchState.jobs = updatedJobs;
      if (batchStatus === 'completed') {
        batchState.completedAt = new Date().toISOString();
      }
      saveBatchState(batchState);

      const response: BatchStatusResponse = {
        batchId,
        status: batchStatus,
        totalJobs: batchState.jobs.length,
        completedJobs,
        passedJobs,
        failedJobs,
        jobs: updatedJobs
      };

      res.json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error(`Error getting batch status: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router
}
