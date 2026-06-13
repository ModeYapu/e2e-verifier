/**
 * Visual Comparison Routes
 * Handles endpoints for visual diff comparison with ignore regions and heatmap generation
 */

import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storage-service';
import { VisualComparator, IgnoreRegion } from '../../services/visual-comparator';
import { logger } from '../../utils/logger';

export function createVisualRoutes(storageService: StorageService): Router {
  const router = Router();
  const comparator = new VisualComparator();

  /**
   * POST /api/config/ignore-regions - Set ignore regions for a site
   * Body: { site, regions: IgnoreRegion[] }
   */
  router.post('/config/ignore-regions', async (req: Request, res: Response): Promise<void> => {
    try {
      const { site, regions } = req.body;

      if (!site || !Array.isArray(regions)) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: site (string), regions (array)'
        });
        return;
      }

      // Validate ignore region format
      for (const region of regions) {
        if (region.selector !== undefined && typeof region.selector !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Invalid region: selector must be a string'
          });
          return;
        }
        if (region.x !== undefined && (typeof region.x !== 'number' || region.x < 0)) {
          res.status(400).json({
            success: false,
            error: 'Invalid region: x must be a non-negative number'
          });
          return;
        }
        if (region.y !== undefined && (typeof region.y !== 'number' || region.y < 0)) {
          res.status(400).json({
            success: false,
            error: 'Invalid region: y must be a non-negative number'
          });
          return;
        }
        if (region.width !== undefined && (typeof region.width !== 'number' || region.width <= 0)) {
          res.status(400).json({
            success: false,
            error: 'Invalid region: width must be a positive number'
          });
          return;
        }
        if (region.height !== undefined && (typeof region.height !== 'number' || region.height <= 0)) {
          res.status(400).json({
            success: false,
            error: 'Invalid region: height must be a positive number'
          });
          return;
        }
      }

      comparator.setIgnoreRegions(site, regions);

      logger.info(`Set ignore regions for site ${site}: ${regions.length} regions`);

      res.json({
        success: true,
        data: {
          site,
          count: regions.length,
          regions
        }
      });
    } catch (error) {
      logger.error(`Error setting ignore regions: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/config/ignore-regions?site=xxx - Get ignore regions for a site
   */
  router.get('/config/ignore-regions', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = req.query.site as string;

      if (!site) {
        res.status(400).json({
          success: false,
          error: 'Missing query parameter: site'
        });
        return;
      }

      const regions = comparator.getIgnoreRegions(site);

      res.json({
        success: true,
        data: {
          site,
          regions
        }
      });
    } catch (error) {
      logger.error(`Error getting ignore regions: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * DELETE /api/config/ignore-regions?site=xxx - Clear ignore regions for a site
   */
  router.delete('/config/ignore-regions', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = req.query.site as string;

      if (!site) {
        res.status(400).json({
          success: false,
          error: 'Missing query parameter: site'
        });
        return;
      }

      comparator.setIgnoreRegions(site, []);

      logger.info(`Cleared ignore regions for site ${site}`);

      res.json({
        success: true,
        data: {
          site,
          count: 0,
          regions: []
        }
      });
    } catch (error) {
      logger.error(`Error clearing ignore regions: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/results/:jobId/diff-heatmap - Generate diff heatmap
   * Body: { baseline (base64), current (base64), options? }
   */
  router.post('/results/:jobId/diff-heatmap', async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { baseline, current, options } = req.body;

      if (!baseline || !current) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: baseline (base64 string), current (base64 string)'
        });
        return;
      }

      // Parse base64 strings to buffers
      const baselineBuffer = Buffer.from(baseline, 'base64');
      const currentBuffer = Buffer.from(current, 'base64');

      // Validate buffers are valid images
      if (baselineBuffer.length < 8) {
        res.status(400).json({
          success: false,
          error: 'Invalid baseline image: too small to be valid'
        });
        return;
      }

      if (currentBuffer.length < 8) {
        res.status(400).json({
          success: false,
          error: 'Invalid current image: too small to be valid'
        });
        return;
      }

      // Perform comparison
      const compareOptions = options || {};
      const result = comparator.compare(baselineBuffer, currentBuffer, compareOptions);

      logger.info(`Generated diff heatmap for job ${jobId}: ${result.diffPercentage.toFixed(2)}% diff`);

      res.json({
        success: true,
        data: {
          jobId,
          ...result
        }
      });
    } catch (error) {
      logger.error(`Error generating diff heatmap: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/compare/direct - Direct image comparison without job context
   * Body: { site?, baseline, current, options? }
   */
  router.post('/compare/direct', async (req: Request, res: Response): Promise<void> => {
    try {
      const { site, baseline, current, options } = req.body;

      if (!baseline || !current) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: baseline (base64 string), current (base64 string)'
        });
        return;
      }

      // Parse base64 strings to buffers
      const baselineBuffer = Buffer.from(baseline, 'base64');
      const currentBuffer = Buffer.from(current, 'base64');

      // Perform comparison
      const compareOptions = options || {};
      let result = comparator.compare(baselineBuffer, currentBuffer, compareOptions);

      // Apply ignore regions if site is provided
      if (site) {
        const ignoreRegions = comparator.getIgnoreRegions(site);
        result.ignoredRegions = ignoreRegions;
        // Filter out diff regions that overlap with ignore regions
        result.regions = result.regions.filter(region => {
          return !comparator['isPointIgnored'](
            region.x + region.width / 2,
            region.y + region.height / 2,
            ignoreRegions
          );
        });
      }

      logger.info(`Direct comparison: ${result.diffPercentage.toFixed(2)}% diff, ${result.regions.length} regions`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error(`Error in direct comparison: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
