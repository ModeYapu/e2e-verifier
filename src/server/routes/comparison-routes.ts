/**
 * Release Comparison Routes
 * Handles endpoints for comparing verification results between releases
 */

import { Router, Request, Response } from 'express'
import { StorageService } from '../services/storage-service'
import { ReleaseComparator } from '../../storage/release-comparator'
import { logger } from '../../utils/logger'

// =====================================================
// ROUTE CREATOR
// =====================================================

export function createComparisonRoutes(storageService: StorageService): Router {
  const router = Router()

  /**
   * GET /api/results/compare - Compare results between two releases
   * Query params: site, release_a, release_b
   */
  router.get('/results/compare', async (req: Request, res: Response): Promise<void> => {
    try {
      const site = req.query.site as string
      const releaseA = req.query.release_a as string
      const releaseB = req.query.release_b as string

      if (!site || !releaseA || !releaseB) {
        res.status(400).json({
          success: false,
          error: 'Missing required query parameters: site, release_a, release_b'
        })
        return
      }

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

      const resultStore = storageService.getResultStore()
      const comparator = new ReleaseComparator(resultStore)

      const comparison = comparator.compareReleases(site, releaseA, releaseB)

      logger.info(`Compared releases for ${site}: ${releaseA} vs ${releaseB}`)

      res.json({
        success: true,
        data: comparison
      })
    } catch (error) {
      logger.error(`Error comparing releases: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * GET /api/releases/:site - Get all available releases for a site
   */
  router.get('/releases/:site', async (req: Request, res: Response): Promise<void> => {
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

      const resultStore = storageService.getResultStore()
      const releases = resultStore.getAvailableReleases(site)

      res.json({
        success: true,
        data: {
          site,
          releases
        }
      })
    } catch (error) {
      logger.error(`Error getting releases: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  return router
}
