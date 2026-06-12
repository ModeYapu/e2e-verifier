/**
 * Job Routes
 * Handles all job-related endpoints including creating, listing, and managing jobs
 */

import { Router, Request, Response } from 'express';
import { JobService } from '../services/job-service';
import { JobType, JobPriority, JobStatus } from '../../scheduler/types';
import { CreateJobRequest, createError } from '../../types/express';
import { validateBody, validationSchemas } from '../../middleware/validate';

// =====================================================
// REQUEST/RESPONSE TYPES
// =====================================================

export interface LegacyJobResponse {
  success: boolean;
  jobId: string;
  type: JobType;
  status: JobStatus;
  progress: string;
  createdAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface JobDetailResponse {
  success: boolean;
  job: {
    id: string;
    type: JobType;
    status: JobStatus;
    priority: JobPriority;
    config: unknown;
    progress: string;
    retryCount: number;
    maxRetries: number;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    timeout?: number;
    result?: unknown;
    error?: string;
  };
}

export interface CreateBatchJobRequest {
  jobs: any[];
}

export function createJobRoutes(jobService: JobService): Router {
  const router = Router();

  /**
   * GET /api/jobs/:jobId - Get job status and result (legacy)
   */
  router.get('/jobs/:jobId', (req: Request, res: Response): void => {
    const { jobId } = req.params;
    const jobIdString = Array.isArray(jobId) ? jobId[0] : jobId;
    const job = jobService.getJob(jobIdString);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      });
      return;
    }

    const response: LegacyJobResponse = {
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
  });

  /**
   * DELETE /api/jobs/:jobId - Cancel/delete a job (legacy)
   */
  router.delete('/jobs/:jobId', (req: Request, res: Response): void => {
    const { jobId } = req.params;
    const jobIdString = Array.isArray(jobId) ? jobId[0] : jobId;
    const deleted = jobService.cancelJob(jobIdString);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Job deleted'
    });
  });

  /**
   * GET /api/jobs - List all jobs (legacy)
   */
  router.get('/jobs', (req: Request, res: Response): void => {
    const jobs = jobService.listJobs({offset: 0, limit: 1000});

    res.json({
      success: true,
      count: jobs.length,
      jobs
    });
  });

  /**
   * POST /api/jobs - Create a new job
   */
  router.post('/jobs', validateBody(validationSchemas.job), async (req: CreateJobRequest, res: Response): Promise<void> => {
    try {
      const body = req.body;

      if (!body.type || !body.config) {
        throw createError('Missing required fields: type, config', 'VALIDATION_ERROR');
      }

      // Validate job type
      const validTypes: JobType[] = ['fast', 'deep', 'orchestrated', 'matrix', 'intelligent'];
      if (!validTypes.includes(body.type)) {
        throw createError(`Invalid job type. Must be one of: ${validTypes.join(', ')}`, 'VALIDATION_ERROR');
      }

      // Create job
      const job = jobService.createAndEnqueueJob(
        body.type as JobType,
        body.config,
        body.priority as JobPriority || 'normal',
        body.maxRetries || 3,
        body.timeout
      );

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
      // Let error handler middleware take care of errors
      throw error;
    }
  });

  /**
   * GET /api/jobs/list - List jobs with filtering
   */
  router.get('/jobs/list', (req: Request, res: Response): void => {
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

      const queueStats = jobService.getQueueStats() as { total: number; pending: number; running: number; completed: number; failed: number };
      const jobs = queueStats.total === 0
        ? []
        : jobService.listJobs(filter);

      const totalJobs = queueStats.total;

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
  });

  /**
   * GET /api/jobs/:id/detail - Get job details
   */
  router.get('/jobs/:id/detail', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const job = jobService.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
        return;
      }

      const response: JobDetailResponse = {
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
  });

  /**
   * DELETE /api/jobs/:id/cancel - Cancel a job
   */
  router.delete('/jobs/:id/cancel', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const cancelled = jobService.cancelJob(jobId);

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
  });

  /**
   * POST /api/jobs/:id/retry - Retry a failed job
   */
  router.post('/jobs/:id/retry', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const job = jobService.retryJob(jobId);

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
  });

  /**
   * POST /api/jobs/batch - Create multiple jobs
   */
  router.post('/jobs/batch', async (req: Request, res: Response): Promise<void> => {
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

        const job = jobService.createAndEnqueueJob(
          jobData.type as JobType,
          jobData.config,
          jobData.priority as JobPriority || 'normal',
          jobData.maxRetries || 3,
          jobData.timeout
        );

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
  });

  return router;
}
