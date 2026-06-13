/**
 * Health Routes
 * Provides health check and stats endpoints with enhanced system information
 */

import { Router, Request, Response } from 'express';
import { VerifyService } from '../services/verify-service';
import { BrowserPool } from '../../browser/browser-pool';

// Import version from package.json
const VERSION = '1.0.0';

export function createHealthRoutes(verifyService: VerifyService): Router {
  const router = Router();

  /**
   * GET /api/health - Enhanced health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    const uptime = (req.app.get('uptime') as number) || 0;
    const uptimeSeconds = Math.floor(uptime / 1000);

    // Get browser pool stats if available
    let browserPoolStats: {
      active: number;
      idle: number;
      max: number;
    } = {
      active: 0,
      idle: 0,
      max: 0
    };

    try {
      const pool = BrowserPool.getInstance();
      const stats = pool.getStats();
      browserPoolStats = {
        active: stats.pagesInUse,
        idle: stats.pagesAvailable,
        max: stats.maxInstances
      };
    } catch {
      // Browser pool not initialized, use defaults
    }

    // Determine health status
    let status = 'ok';
    // If browser pool is at max capacity and has no idle pages, consider degraded
    if (browserPoolStats.max > 0 && browserPoolStats.active === browserPoolStats.max && browserPoolStats.idle === 0) {
      status = 'degraded';
    }

    res.json({
      status,
      version: VERSION,
      uptime: uptimeSeconds,
      browserPool: browserPoolStats
    });
  });

  /**
   * GET /api/stats - Server statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    const stats = req.app.get('stats') || {
      totalVerifications: 0,
      totalDeepVerifications: 0,
      totalOrchestratedVerifications: 0,
      uptime: 0
    };
    stats.uptime = (req.app.get('uptime') as number) || 0;

    // Add job statistics if available from jobService
    let jobStats: { active: number; completed: number } = {
      active: 0,
      completed: 0
    };

    try {
      const jobService = req.app.get('jobService');
      if (jobService) {
        const allJobs = jobService.getJobStore()?.list() || [];
        jobStats = {
          active: allJobs.filter((j: { status?: string }) => j.status === 'running' || j.status === 'pending').length,
          completed: allJobs.filter((j: { status?: string }) => j.status === 'completed').length
        };
      }
    } catch {
      // Job service not available, use defaults
    }

    res.json({
      ...stats,
      jobs: jobStats
    });
  });

  return router;
}
