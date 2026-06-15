/**
 * Performance Benchmark Routes
 * Handles endpoints for performance tracking, baselines, and regression detection
 */

import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storage-service';
import {
  PerformanceBenchmark,
  PerformanceRecord,
  PerformanceBaseline,
  PerformanceRegression,
  StepTiming
} from '../../services/performance-benchmark';
import { logger } from '../../utils/logger';

/**
 * Shape of a POSTed performance record. Fields are optional because this
 * models untrusted request-body input that is validated in the handler
 * before being turned into a fully-typed `PerformanceRecord`.
 */
interface PerformanceRecordInput {
  jobId?: string;
  steps?: Array<{ step?: string; duration?: number }>;
  totalDuration?: number;
  timestamp?: string;
}

// Singleton instance for performance benchmarking
const benchmarkService = new PerformanceBenchmark();

export function createBenchmarkRoutes(storageService: StorageService): Router {
  const router = Router();

  /**
   * GET /api/benchmarks/:site - Get performance baseline for a site
   */
  router.get('/benchmarks/:site', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = req.params.site as string;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const baseline = benchmarkService.getBaseline(site);

      if (!baseline) {
        res.status(404).json({
          success: false,
          error: 'No baseline found for site. Use POST /api/benchmarks/:site/compute to create one.'
        });
        return;
      }

      res.json({
        success: true,
        data: baseline
      });
    } catch (error) {
      logger.error(`Error getting baseline: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/benchmarks/:site/compute - Compute baseline for a site
   * Query params: minSamples (default 3)
   */
  router.post('/benchmarks/:site/compute', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];
      const minSamples = parseInt(req.query.minSamples as string) || 3;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const baseline = benchmarkService.computeBaseline(site, { minSamples });

      logger.info(`Computed baseline for ${site} with ${Object.keys(baseline.stepBaselines).length} steps`);

      res.json({
        success: true,
        data: baseline
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error computing baseline: ${error}`);

      if (message.includes('Insufficient samples')) {
        res.status(400).json({
          success: false,
          error: message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: message
      });
    }
  });

  /**
   * GET /api/benchmarks/:site/regressions - Get performance regressions for a site
   * Query params: threshold (default 2), minSamples (default 3)
   */
  router.get('/benchmarks/:site/regressions', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];
      const threshold = parseFloat(req.query.threshold as string) || 2;
      const minSamples = parseInt(req.query.minSamples as string) || 3;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const regressions = benchmarkService.detectRegressions(site, { threshold, minSamples });

      res.json({
        success: true,
        data: {
          site,
          threshold,
          regressions,
          count: regressions.length
        }
      });
    } catch (error) {
      logger.error(`Error detecting regressions: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/benchmarks/:site/history - Get performance history for a site
   * Query params: limit (default 100)
   */
  router.get('/benchmarks/:site/history', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];
      const limit = parseInt(req.query.limit as string) || 100;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const history = benchmarkService.getHistory(site, limit);

      res.json({
        success: true,
        data: {
          site,
          limit,
          count: history.length,
          history
        }
      });
    } catch (error) {
      logger.error(`Error getting history: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/benchmarks/:site/record - Submit performance record for a site
   * Body: PerformanceRecord
   */
  router.post('/benchmarks/:site/record', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];
      const recordData = req.body as PerformanceRecordInput;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      // Validate record structure
      if (!recordData.jobId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: jobId'
        });
        return;
      }

      if (!Array.isArray(recordData.steps)) {
        res.status(400).json({
          success: false,
          error: 'Missing or invalid field: steps (must be array)'
        });
        return;
      }

      // Validate each step
      for (const step of recordData.steps) {
        if (!step.step || typeof step.step !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Invalid step: missing or invalid step name (string)'
          });
          return;
        }
        if (typeof step.duration !== 'number' || step.duration < 0) {
          res.status(400).json({
            success: false,
            error: 'Invalid step: duration must be a non-negative number'
          });
          return;
        }
      }

      // Build a fully-typed record from the validated input. Each input step
      // is normalized into a StepTiming (validation above guarantees `step`
      // is a non-empty string and `duration` is a non-negative number).
      const resolvedTimestamp = recordData.timestamp || new Date().toISOString();
      const steps: StepTiming[] = recordData.steps.map(s => ({
        step: s.step ?? 'unknown',
        duration: s.duration ?? 0,
        timestamp: resolvedTimestamp,
      }));

      const record: PerformanceRecord = {
        jobId: recordData.jobId,
        site,
        steps,
        totalDuration: recordData.totalDuration || steps.reduce((sum, s) => sum + s.duration, 0),
        timestamp: resolvedTimestamp
      };

      benchmarkService.recordPerformance(record);

      logger.info(`Recorded performance for ${site}, job ${record.jobId}: ${record.steps.length} steps`);

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      logger.error(`Error recording performance: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/benchmarks - Get all sites with benchmark data
   */
  router.get('/benchmarks', async (_req: Request, res: Response): Promise<void> => {
    try {
      const sites = benchmarkService.getSites();
      const summaries = sites.map(site => ({
        site,
        summary: benchmarkService.getSiteSummary(site)
      }));

      res.json({
        success: true,
        data: {
          count: sites.length,
          sites: summaries
        }
      });
    } catch (error) {
      logger.error(`Error getting benchmarks: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/benchmarks/:site/summary - Get summary statistics for a site
   */
  router.get('/benchmarks/:site/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const summary = benchmarkService.getSiteSummary(site);

      if (!summary) {
        res.status(404).json({
          success: false,
          error: `No performance data found for site: ${site}`
        });
        return;
      }

      res.json({
        success: true,
        data: {
          site,
          ...summary
        }
      });
    } catch (error) {
      logger.error(`Error getting summary: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/benchmarks/:site/steps/:step - Get statistics for a specific step
   */
  router.get('/benchmarks/:site/steps/:step', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = typeof req.params.site === "string" ? req.params.site : req.params.site[0];
      const stepName = typeof req.params.step === "string" ? req.params.step : req.params.step[0];

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const stats = benchmarkService.getStepStats(site, stepName);

      if (!stats) {
        res.status(404).json({
          success: false,
          error: `No statistics found for step: ${stepName}`
        });
        return;
      }

      res.json({
        success: true,
        data: {
          site,
          step: stepName,
          ...stats
        }
      });
    } catch (error) {
      logger.error(`Error getting step stats: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
