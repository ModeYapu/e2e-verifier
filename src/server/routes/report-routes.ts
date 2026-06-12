/**
 * Report Routes
 * Handles report generation endpoints
 */

import { Router, Request, Response } from 'express';
import { JobService } from '../services/job-service';

// =====================================================
// RESPONSE TYPES
// =====================================================

export interface JobReportResponse {
  success: boolean;
  job: {
    id: string;
    type: string;
    status: string;
    priority: string;
    config: unknown;
    progress: string;
    retryCount: number;
    maxRetries: number;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    timeout?: number;
    error?: string;
    result?: unknown;
  };
}

export function createReportRoutes(jobService: JobService): Router {
  const router = Router();

  /**
   * GET /api/reports/:id - Get detailed test report by job ID
   */
  router.get('/reports/:id', async (req: Request, res: Response): Promise<void> => {
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

      const response: JobReportResponse = {
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
  });

  return router;
}
