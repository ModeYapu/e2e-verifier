/**
 * Trend Routes
 * Handles trend analysis and quality profile endpoints
 */

import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storage-service';

export function createTrendRoutes(storageService: StorageService): Router {
  const router = Router();

  /**
   * Extract string parameter from request params
   */
  function extractParam(params: Record<string, string | string[]>, key: string): string {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * GET /api/trends/:site - Get historical trend data for a site
   */
  router.get('/trends/:site', async (req: Request, res: Response): Promise<void> => {
    try {
      const siteName = extractParam(req.params, 'site');
      const days = parseInt(req.query.days as string) || 30;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const trend = storageService.getSiteTrends(siteName, days);

      res.json({
        success: true,
        data: trend
      });
    } catch (error) {
      console.error('Error getting site trends:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/trends/:site/regressions - Get regression detection for a site
   */
  router.get('/trends/:site/regressions', async (req: Request, res: Response): Promise<void> => {
    try {
      const siteName = req.params.site as string;
      const recentDays = parseInt(req.query.recentDays as string) || 7;
      const historicalDays = parseInt(req.query.historicalDays as string) || 30;
      const threshold = parseInt(req.query.threshold as string) || 10;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const regression = storageService.getSiteRegressions(
        siteName,
        recentDays,
        historicalDays,
        threshold
      );

      res.json({
        success: true,
        data: regression
      });
    } catch (error) {
      console.error('Error detecting regressions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/profiles - Get all site quality profiles
   */
  router.get('/profiles', async (req: Request, res: Response): Promise<void> => {
    try {
      const days = parseInt(req.query.days as string) || 30;

      // Filter by project sites if project context exists
      let allSiteNames = storageService.getAllSiteNames();

      if (req.project && req.project.sites.length > 0) {
        allSiteNames = allSiteNames.filter(site => req.project!.sites.includes(site));
      }

      const profiles = storageService.getAllProfiles(days, allSiteNames);

      res.json({
        success: true,
        data: profiles
      });
    } catch (error) {
      console.error('Error getting all profiles:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/profiles/:site - Get quality profile for a specific site
   */
  router.get('/profiles/:site', async (req: Request, res: Response): Promise<void> => {
    try {
      const siteName = req.params.site as string;
      const days = parseInt(req.query.days as string) || 30;

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(siteName)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          });
          return;
        }
      }

      const profile = storageService.getSiteProfile(siteName, days);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Error getting site profile:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
