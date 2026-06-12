/**
 * AI Routes
 * Handles AI-related endpoints including test generation, fix suggestions, and provider management
 */

import { Router, Request, Response } from 'express';
import { AIService, GenerateTestsOptions } from '../services/ai-service';
import { JobService } from '../services/job-service';
import { logger } from '../../utils/logger';

export function createAIRoutes(aiService: AIService, jobService: JobService): Router {
  const router = Router();

  /**
   * POST /api/ai/generate-tests - Generate tests from URL using AI
   */
  router.post('/ai/generate-tests', async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, options } = req.body;

      if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
      }

      const generatedConfig = await aiService.generateTests(url, options as GenerateTestsOptions);

      res.json({
        success: true,
        data: generatedConfig
      });
    } catch (e: unknown) {
      logger.error(`Error generating tests: ${e}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * GET /api/ai/suggest-fixes/:jobId - Get AI suggestions for failed job
   */
  router.get('/ai/suggest-fixes/:jobId', async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = req.params.jobId as string;

      const job = jobService.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const suggestions = await aiService.suggestFixes(job);

      res.json({
        success: true,
        data: suggestions
      });
    } catch (e: unknown) {
      logger.error(`Error suggesting fixes: ${e}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * GET /api/ai/providers - List configured AI providers
   */
  router.get('/ai/providers', async (req: Request, res: Response): Promise<void> => {
    try {
      const providers = aiService.listAIProviders();

      res.json({
        success: true,
        providers,
        count: providers.length
      });
    } catch (e: unknown) {
      logger.error(`Error listing AI providers: ${e}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * GET /api/ai/locator-stats - Get self-healing locator statistics
   */
  router.get('/ai/locator-stats', async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = aiService.getLocatorStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (e: unknown) {
      logger.error(`Error getting locator stats: ${e}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * DELETE /api/ai/locator-cache - Clear self-healing locator cache
   */
  router.delete('/ai/locator-cache', async (req: Request, res: Response): Promise<void> => {
    try {
      aiService.clearLocatorCache();

      res.json({
        success: true,
        message: 'Locator cache cleared successfully'
      });
    } catch (e: unknown) {
      logger.error(`Error clearing locator cache: ${e}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
