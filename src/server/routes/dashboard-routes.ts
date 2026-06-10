/**
 * Dashboard Routes
 * Handles dashboard API endpoints for overview statistics and site health
 */

import { Router, Request, Response } from 'express';
import { JobService } from '../services/job-service';

export function createDashboardRoutes(jobService: JobService): Router {
  const router = Router();

  /**
   * GET /api/dashboard/overview - Dashboard overview statistics
   */
  router.get('/dashboard/overview', async (req: Request, res: Response): Promise<void> => {
    try {
      let allJobs = jobService.listJobs({});

      // Filter by project sites if project context exists
      if (req.project && req.project.sites.length > 0) {
        allJobs = allJobs.filter(job => {
          const siteName = job.config?.name || '';
          return req.project!.sites.includes(siteName);
        });
      }

      const recentJobs = allJobs.slice(0, 10);

      const totalJobs = allJobs.length;
      const completedJobs = allJobs.filter(j => j.status === 'completed').length;
      const failedJobs = allJobs.filter(j => j.status === 'failed').length;
      const runningJobs = allJobs.filter(j => j.status === 'running').length;
      const pendingJobs = allJobs.filter(j => j.status === 'pending').length;

      const passRate = completedJobs > 0 ? ((completedJobs - failedJobs) / completedJobs) * 100 : 0;

      res.json({
        success: true,
        totalJobs,
        completedJobs,
        failedJobs,
        runningJobs,
        pendingJobs,
        passRate,
        recentJobs: recentJobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          error: job.error
        }))
      });
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/dashboard/sites - Sites health status
   */
  router.get('/dashboard/sites', async (req: Request, res: Response): Promise<void> => {
    try {
      let allJobs = jobService.listJobs({});

      // Filter by project sites if project context exists
      if (req.project && req.project.sites.length > 0) {
        allJobs = allJobs.filter(job => {
          const siteName = job.config?.name || '';
          return req.project!.sites.includes(siteName);
        });
      }

      // Group jobs by site and collect statistics
      const siteMap = new Map<string, any>();

      for (const job of allJobs) {
        if (job.status !== 'completed') continue;

        const siteName = job.config?.name || 'Unknown';
        const siteUrl = job.config?.url || 'Unknown';

        if (!siteMap.has(siteName)) {
          siteMap.set(siteName, {
            name: siteName,
            url: siteUrl,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            lastResult: null,
            lastJobId: null
          });
        }

        const site = siteMap.get(siteName)!;
        site.totalTests++;

        if (job.result?.passed) {
          site.passedTests++;
          site.lastResult = { passed: true };
          site.lastJobId = job.id;
        } else if (job.result?.passed === false) {
          site.failedTests++;
          site.lastResult = { passed: false };
          site.lastJobId = job.id;
        }
      }

      const sites = Array.from(siteMap.values());

      res.json({
        success: true,
        sites,
        totalSites: sites.length
      });
    } catch (error) {
      console.error('Error getting dashboard sites:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/dashboard/trends - Historical pass rate trends (last 30 days)
   */
  router.get('/dashboard/trends', async (req: Request, res: Response): Promise<void> => {
    try {
      const allJobs = jobService.listJobs({});
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Filter jobs from the last 30 days
      const recentJobs = allJobs.filter(job =>
        job.createdAt >= thirtyDaysAgo && job.status === 'completed'
      );

      // Group by day
      const trendsByDay = new Map<string, { total: number; passed: number }>();

      for (const job of recentJobs) {
        const dayKey = job.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!trendsByDay.has(dayKey)) {
          trendsByDay.set(dayKey, { total: 0, passed: 0 });
        }

        const day = trendsByDay.get(dayKey)!;
        day.total++;

        if (job.result?.passed) {
          day.passed++;
        }
      }

      // Convert to array and sort by date
      const trends = Array.from(trendsByDay.entries())
        .map(([date, stats]) => ({
          date,
          passRate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        success: true,
        trends,
        period: {
          start: thirtyDaysAgo.toISOString(),
          end: now.toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting dashboard trends:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
