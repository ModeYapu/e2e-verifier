/**
 * Health Routes
 * Provides health check and stats endpoints with enhanced system information
 */

import { Router, Request, Response } from 'express';
import { VerifyService } from '../services/verify-service';
import { BrowserPool } from '../../browser/browser-pool';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Get data directory size
    let dbSize = 0;
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        const stats = fs.statSync(dataDir);
        dbSize = stats.size;
        // If it's a directory, try to get approximate size
        if (stats.isDirectory()) {
          try {
            const files = fs.readdirSync(dataDir);
            let totalSize = 0;
            for (const file of files) {
              const filePath = path.join(dataDir, file);
              try {
                const fileStats = fs.statSync(filePath);
                totalSize += fileStats.size;
              } catch {
                // Skip files that can't be read
              }
            }
            dbSize = totalSize;
          } catch {
            // Use directory entry size if listing fails
          }
        }
      }
    } catch {
      // Data directory doesn't exist or can't be read
      dbSize = 0;
    }

    res.json({
      status,
      version: VERSION,
      uptime: uptimeSeconds,
      browserPool: browserPoolStats,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      dbSize
    });
  });

  /**
   * GET /api/health/detailed - Detailed health check with system information
   */
  router.get('/health/detailed', (req: Request, res: Response) => {
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
    if (browserPoolStats.max > 0 && browserPoolStats.active === browserPoolStats.max && browserPoolStats.idle === 0) {
      status = 'degraded';
    }

    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Get data directory size
    let dbSize = 0;
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        const stats = fs.statSync(dataDir);
        dbSize = stats.size;
        if (stats.isDirectory()) {
          try {
            const files = fs.readdirSync(dataDir);
            let totalSize = 0;
            for (const file of files) {
              const filePath = path.join(dataDir, file);
              try {
                const fileStats = fs.statSync(filePath);
                totalSize += fileStats.size;
              } catch {
                // Skip files that can't be read
              }
            }
            dbSize = totalSize;
          } catch {
            // Use directory entry size if listing fails
          }
        }
      }
    } catch {
      dbSize = 0;
    }

    // Get CPU usage
    const cpuUsage = process.cpuUsage();

    // Get load average (only on Unix)
    const loadAvg = os.loadavg();

    res.json({
      status,
      version: VERSION,
      uptime: uptimeSeconds,
      browserPool: browserPoolStats,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      dbSize,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      loadAverage: loadAvg,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem()
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
