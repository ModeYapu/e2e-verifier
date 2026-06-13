/**
 * Webhook Trigger Routes
 * Handles webhook-triggered verification with optional callback support
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { JobService } from '../services/job-service';
import type { JobConfig, JobType } from '../../scheduler/types';

/**
 * Webhook trigger request body
 */
interface WebhookTriggerRequest {
  sites: Array<{
    url: string;
    name: string;
    expectedStatusCode?: number;
    viewport?: { width: number; height: number };
    timeout?: number;
    checks?: string[];
  }>;
  callbackUrl?: string;
  jobType?: 'fast' | 'deep' | 'orchestrated';
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Webhook trigger response
 */
interface WebhookTriggerResponse {
  success: boolean;
  jobId?: string;
  jobIds?: string[];
  message?: string;
  error?: string;
}

/**
 * Callback payload for webhook notifications
 */
interface CallbackPayload {
  jobId: string;
  status: 'completed' | 'failed';
  result?: unknown;
  error?: string;
  completedAt: string;
}

/**
 * Send callback notification
 */
async function sendCallback(url: string, payload: CallbackPayload): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn(`[WebhookTrigger] Callback to ${url} failed with status ${response.status}`);
    } else {
      logger.info(`[WebhookTrigger] Callback sent successfully to ${url}`);
    }
  } catch (error) {
    logger.error(`[WebhookTrigger] Failed to send callback to ${url}: ${(error as Error).message}`);
  }
}

/**
 * Create webhook trigger routes
 */
export function createWebhookTriggerRoutes(jobService: JobService): Router {
  const router = Router();

  /**
   * POST /api/webhook/trigger - Trigger verification via webhook
   */
  router.post('/webhook/trigger', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as WebhookTriggerRequest;

      // Validate request
      if (!body.sites || !Array.isArray(body.sites) || body.sites.length === 0) {
        res.status(400).json({
          success: false,
          error: 'sites array is required and must not be empty',
        } as WebhookTriggerResponse);
        return;
      }

      for (const site of body.sites) {
        if (!site.url || !site.name) {
          res.status(400).json({
            success: false,
            error: 'Each site must have url and name',
          } as WebhookTriggerResponse);
          return;
        }
      }

      // Determine job type
      const jobType: JobType = body.jobType ?? 'fast';
      const priority = body.priority ?? 'normal';

      // If callback URL is provided, we need to track these jobs
      const callbackUrl = body.callbackUrl;
      const jobIds: string[] = [];

      if (body.sites.length === 1) {
        // Single site verification
        const site = body.sites[0];
        const config: JobConfig = {
          url: site.url,
          name: site.name,
        };

        // Add type-specific config
        if (jobType === 'fast') {
          config.fastVerify = {
            url: site.url,
            name: site.name,
            checks: site.checks,
            viewport: site.viewport,
            timeout: site.timeout,
            expectedStatusCode: site.expectedStatusCode,
          };
        } else if (jobType === 'deep') {
          config.deepVerify = {
            url: site.url,
            task: `Verify ${site.name}`,
            maxSteps: 20,
          };
        } else if (jobType === 'orchestrated') {
          config.orchestratedVerify = {
            sites: [{
              name: site.name,
              url: site.url,
              expectedStatusCode: site.expectedStatusCode,
              viewport: site.viewport,
              timeout: site.timeout,
              checks: site.checks,
            }],
          };
        }

        const job = jobService.createAndEnqueueJob(jobType, config, priority);
        jobIds.push(job.id);

        // Register callback if provided
        if (callbackUrl) {
          registerCallback(job.id, callbackUrl, jobService);
        }
      } else {
        // Multiple sites - use orchestrated verify
        const config: JobConfig = {
          orchestratedVerify: {
            sites: body.sites.map(site => ({
              name: site.name,
              url: site.url,
              expectedStatusCode: site.expectedStatusCode,
              viewport: site.viewport,
              timeout: site.timeout,
              checks: site.checks,
            })),
          },
        };

        const job = jobService.createAndEnqueueJob('orchestrated', config, priority);
        jobIds.push(job.id);

        // Register callback if provided
        if (callbackUrl) {
          registerCallback(job.id, callbackUrl, jobService);
        }
      }

      logger.info(`[WebhookTrigger] Created ${jobIds.length} job(s) for webhook trigger`);

      const response: WebhookTriggerResponse = {
        success: true,
        jobIds,
        jobId: jobIds[0], // Primary job ID for backward compatibility
        message: `Created ${jobIds.length} job(s)`,
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error(`[WebhookTrigger] Error processing webhook trigger: ${(error as Error).message}`);

      res.status(500).json({
        success: false,
        error: (error as Error).message,
      } as WebhookTriggerResponse);
    }
  });

  /**
   * GET /api/webhook/trigger/status/:jobId - Check job status (for webhook callbacks)
   */
  router.get('/webhook/trigger/status/:jobId', (req: Request, res: Response): void => {
    try {
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const job = jobService.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
        });
        return;
      }

      res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        type: job.type,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        result: job.result,
        error: job.error,
      });
    } catch (error) {
      logger.error(`[WebhookTrigger] Error fetching job status: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  return router;
}

/**
 * Register callback for job completion
 */
function registerCallback(jobId: string, callbackUrl: string, jobService: JobService): void {
  const scheduler = jobService.getScheduler();

  // Register one-time listeners for completion
  const onCompleted = (job: unknown) => {
    const typedJob = job as { id: string; result?: unknown; status: string };
    if (typedJob.id === jobId) {
      scheduler.off('job.completed', onCompleted);
      scheduler.off('job.failed', onFailed);

      sendCallback(callbackUrl, {
        jobId: typedJob.id,
        status: 'completed',
        result: typedJob.result,
        completedAt: new Date().toISOString(),
      });
    }
  };

  const onFailed = (job: unknown) => {
    const typedJob = job as { id: string; error?: string; status: string };
    if (typedJob.id === jobId) {
      scheduler.off('job.completed', onCompleted);
      scheduler.off('job.failed', onFailed);

      sendCallback(callbackUrl, {
        jobId: typedJob.id,
        status: 'failed',
        error: typedJob.error,
        completedAt: new Date().toISOString(),
      });
    }
  };

  scheduler.on('job.completed', onCompleted);
  scheduler.on('job.failed', onFailed);

  logger.debug(`[WebhookTrigger] Registered callback for job ${jobId} to ${callbackUrl}`);
}
