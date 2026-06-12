/**
 * Verification Routes
 * Handles all verification endpoints including fast, deep, orchestrated, matrix, intelligent, and multi-agent verification
 */

import { Router, Request, Response } from 'express';
import { VerifyService, FastVerifyRequest, DeepVerifyRequest, OrchestratedVerifyRequest, MatrixVerifyRequest, IntelligentVerifyRequest, MultiAgentVerifyRequest } from '../services/verify-service';
import { JobService } from '../services/job-service';
import {
  FastVerifyRequest as TypedFastVerifyRequest,
  DeepVerifyRequest as TypedDeepVerifyRequest,
  OrchestratedVerifyRequest as TypedOrchestratedVerifyRequest,
  MatrixVerifyRequest as TypedMatrixVerifyRequest,
  IntelligentVerifyRequest as TypedIntelligentVerifyRequest,
  createError
} from '../../types/express';
import { validateBody, validationSchemas } from '../../middleware/validate';

export function createVerifyRoutes(verifyService: VerifyService, jobService: JobService): Router {
  const router = Router();

  /**
   * POST /api/verify - Fast verification (synchronous)
   */
  router.post('/verify', validateBody(validationSchemas.verify), async (req: TypedFastVerifyRequest, res: Response): Promise<void> => {
    try {
      const body = req.body;

      if (!body.url || !body.name) {
        throw createError('Missing required fields: url, name', 'VALIDATION_ERROR');
      }

      console.log(`[${new Date().toISOString()}] Starting fast verification for: ${body.name} (${body.url})`);

      const result = await verifyService.fastVerify(body);

      // Update stats
      const stats = req.app.get('stats');
      if (stats) {
        stats.totalVerifications++;
      }

      console.log(`[${new Date().toISOString()}] Fast verification completed: ${result.passed ? 'PASSED' : 'FAILED'}`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      // Let error handler middleware take care of errors
      throw error;
    }
  });

  /**
   * POST /api/verify/deep - Deep verification (asynchronous)
   */
  router.post('/verify/deep', validateBody(validationSchemas.verify), async (req: TypedDeepVerifyRequest, res: Response): Promise<void> => {
    try {
      const body = req.body;

      if (!body.url || !body.task) {
        throw createError('Missing required fields: url, task', 'VALIDATION_ERROR');
      }

      const job = jobService.createAndEnqueueJob('deep', {
        deepVerify: {
          url: body.url,
          task: body.task,
          model: body.model,
          maxSteps: body.maxSteps,
          temperature: body.temperature
        }
      });

      console.log(`[${new Date().toISOString()}] Created deep verification job: ${job.id}`);

      // Return immediately with job ID
      res.status(202).json({
        success: true,
        jobId: job.id,
        status: 'pending',
        message: 'Deep verification job created. Use GET /api/jobs/:id/detail to poll for results.'
      });

      // Update stats
      const stats = req.app.get('stats');
      if (stats) {
        stats.totalDeepVerifications++;
      }
    } catch (error) {
      // Let error handler middleware take care of errors
      throw error;
    }
  });

  /**
   * POST /api/verify/orchestrated - Orchestrated verification (asynchronous)
   */
  router.post('/verify/orchestrated', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as OrchestratedVerifyRequest;

      if (!body.sites || !Array.isArray(body.sites) || body.sites.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: sites (non-empty array)'
        });
        return;
      }

      const job = jobService.createAndEnqueueJob('orchestrated', {
        orchestratedVerify: {
          sites: body.sites,
          strict: body.strict,
          model: body.model,
          skipDeep: body.skipDeep
        }
      });

      console.log(`[${new Date().toISOString()}] Created orchestrated verification job: ${job.id}`);

      res.status(202).json({
        success: true,
        jobId: job.id,
        status: 'pending',
        message: 'Orchestrated verification job created. Use GET /api/jobs/:id/detail to poll for results.'
      });

      // Update stats
      const stats = req.app.get('stats');
      if (stats) {
        stats.totalOrchestratedVerifications++;
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Orchestrated verification setup error:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/verify/matrix - Matrix verification (synchronous)
   */
  router.post('/verify/matrix', async (req: Request, res: Response): Promise<void> => {
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

      const result = await verifyService.matrixVerify(body);

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
  });

  /**
   * POST /api/verify/intelligent - Intelligent verification (synchronous or asynchronous)
   */
  router.post('/verify/intelligent', validateBody(validationSchemas.verify), async (req: Request, res: Response): Promise<void> => {
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

      // If async mode requested, create a job (this would need job service integration)
      if (body.async) {
        // For now, just return not implemented for async mode
        res.status(501).json({
          success: false,
          error: 'Async intelligent verification not yet implemented'
        });
        return;
      }

      // Synchronous execution
      const result = await verifyService.intelligentVerify(body);

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
  });

  /**
   * POST /api/verify/multi-agent - Multi-agent verification (synchronous)
   */
  router.post('/verify/multi-agent', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as MultiAgentVerifyRequest;

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

      const result = await verifyService.multiAgentVerify(body);

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
  });

  return router;
}
