/**
 * Repair Advisor Routes
 * Provides endpoints for AI-powered repair suggestions
 */

import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storage-service';
import { JobService } from '../services/job-service';
import { RepairAdvisor } from '../../services/repair-advisor';
import { TestResult } from '../../types';
import { logger } from '../../utils/logger';

export function createRepairRoutes(storageService: StorageService, jobService: JobService): Router {
  const router = Router();

  /**
   * GET /api/results/:jobId/repair-suggestions
   * Get AI repair suggestions for a job's failures
   */
  router.get('/results/:jobId/repair-suggestions', async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = req.params.jobId as string;

      logger.info(`Getting repair suggestions for job ${jobId}`);

      // Get job from job service
      const job = jobService.getJob(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
        return;
      }

      // Extract result from job
      const result = job.result as TestResult | undefined;
      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Job result not found - job may not be completed yet'
        });
        return;
      }

      // Analyze the result
      const advisor = new RepairAdvisor();
      const analysis = advisor.analyzeFailure(jobId, result);

      res.json({
        success: true,
        data: {
          jobId,
          suggestions: analysis.suggestions,
          summary: analysis.summary,
          analyzedAt: analysis.analyzedAt
        }
      });
    } catch (error) {
      logger.error(`Error getting repair suggestions: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router
}
