/**
 * Job Queue Routes
 * REST API endpoints for managing the Job Queue directly
 * Part of P1 Platform Job Queue System
 */

import { Router, Request, Response } from 'express';
import type { JobQueue, Job, QueueStatus, JobStatus } from '../../scheduler/job-queue';

/**
 * Response wrapper
 */
interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Job list response with pagination
 */
interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Create job queue routes
 * @param jobQueue - The JobQueue instance
 * @returns Express Router
 */
export function createJobQueueRoutes(jobQueue: JobQueue): Router {
  const router = Router();

  /**
   * GET /api/jobs/queue/status
   * Get queue status statistics
   */
  router.get('/jobs/queue/status', (_req: Request, res: Response): void => {
    const status = jobQueue.getQueueStatus();
    res.json({
      success: true,
      data: status
    } as SuccessResponse<QueueStatus>);
  });

  /**
   * GET /api/jobs
   * List all jobs with optional status filter and pagination
   * Query params:
   *   - status: JobStatus filter (optional)
   *   - page: page number (default: 1)
   *   - pageSize: items per page (default: 50)
   */
  router.get('/jobs', (req: Request, res: Response): void => {
    try {
      const status = req.query.status as JobStatus | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;

      // Validate page and pageSize
      const validPage = Math.max(1, page);
      const validPageSize = Math.max(1, Math.min(1000, pageSize));

      // Get filtered jobs
      const allJobs = jobQueue.list(status);
      const total = allJobs.length;

      // Apply pagination
      const offset = (validPage - 1) * validPageSize;
      const jobs = allJobs.slice(offset, offset + validPageSize);

      res.json({
        success: true,
        data: {
          jobs,
          total,
          page: validPage,
          pageSize: validPageSize
        }
      } as SuccessResponse<JobListResponse>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as ErrorResponse);
    }
  });

  /**
   * GET /api/jobs/:id
   * Get a single job by ID
   */
  router.get('/jobs/:id', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const job = jobQueue.get(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        } as ErrorResponse);
        return;
      }

      res.json({
        success: true,
        data: job
      } as SuccessResponse<Job>);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as ErrorResponse);
    }
  });

  /**
   * POST /api/jobs/:id/cancel
   * Cancel a queued or running job
   */
  router.post('/jobs/:id/cancel', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const jobId = Array.isArray(id) ? id[0] : id;
      const cancelled = jobQueue.cancel(jobId);

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Job not found or cannot be cancelled (job may have already completed)'
        } as ErrorResponse);
        return;
      }

      // Return the updated job
      const job = jobQueue.get(jobId);
      res.json({
        success: true,
        data: {
          message: 'Job cancelled successfully',
          job
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as ErrorResponse);
    }
  });

  return router;
}
