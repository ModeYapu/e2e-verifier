/**
 * Scheduler Routes
 * Handles endpoints for smart scheduler recommendations
 */

import { Router, Request, Response } from 'express'
import { StorageService } from '../services/storage-service'
import { SmartScheduler } from '../services/scheduler-service'
import { logger } from '../../utils/logger'

export function createSchedulerRoutes(storageService: StorageService): Router {
  const router = Router()

  /**
   * GET /api/scheduler/recommendations - Get smart scheduler recommendations
   */
  router.get('/scheduler/recommendations', async (req: Request, res: Response): Promise<void> => {
    try {
      const scheduler = new SmartScheduler(storageService)
      const recommendations = scheduler.getAllRecommendations()

      res.json({
        success: true,
        data: {
          recommendations
        }
      })
    } catch (error) {
      logger.error(`Error getting scheduler recommendations: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * GET /api/scheduler/recommendations/:site - Get recommendation for a specific site
   */
  router.get('/scheduler/recommendations/:site', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = req.params.site as string

      // Check if user has access to this site when project context exists
      if (req.project && req.project.sites.length > 0) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this site'
          })
          return
        }
      }

      const scheduler = new SmartScheduler(storageService)
      const recommendation = scheduler.getRecommendedFrequency(site)

      res.json({
        success: true,
        data: {
          recommendation,
          inReleaseWindow: scheduler.isInReleaseWindow(site)
        }
      })
    } catch (error) {
      logger.error(`Error getting scheduler recommendation: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  return router
}
