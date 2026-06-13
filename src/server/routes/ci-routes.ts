/**
 * CI/CD Webhook Trigger Routes
 * Handles CI/CD integration endpoints for triggering verification jobs and quality gates
 */

import { Router, Request, Response } from 'express'
import { VerifyService } from '../services/verify-service'
import { JobService } from '../services/job-service'
import { StorageService } from '../services/storage-service'
import { logger } from '../../utils/logger'

// =====================================================
// REQUEST/RESPONSE TYPES
// =====================================================

export interface CITriggerRequest {
  site: string
  release: string
  priority?: 'high' | 'normal'
}

export interface CITriggerResponse {
  job_id: string
  status: 'queued'
}

export interface CIGateRequest {
  site: string
  release: string
}

export interface CIGateCheck {
  name: string
  passed: boolean
  message: string
}

export interface CIGateResponse {
  status: 'pass' | 'fail'
  score: number
  checks: CIGateCheck[]
}

export interface CIJobResultResponse {
  job_id: string
  status: string
  result?: unknown
  error?: string
}

// =====================================================
// ROUTE CREATOR
// =====================================================

export function createCIRoutes(
  verifyService: VerifyService,
  jobService: JobService,
  storageService: StorageService
): Router {
  const router = Router()

  /**
   * Extract string parameter from request params
   */
  function extractParam(params: Record<string, string | string[]>, key: string): string {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  /**
   * POST /api/ci/trigger - Trigger a verification job
   * Creates a job for the given site with release tag in metadata
   */
  router.post('/ci/trigger', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as CITriggerRequest

      if (!body.site || !body.release) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: site, release'
        })
        return
      }

      // Create job configuration with release metadata
      const jobConfig = {
        fastVerify: {
          url: body.site,
          name: `CI: ${body.release}`,
          checks: ['status', 'title', 'console-errors']
        }
      }

      const priority = body.priority || 'normal'

      // Create job with metadata including release tag
      const job = jobService.createAndEnqueueJob(
        'fast',
        jobConfig,
        priority,
        3,
        30000
      )

      // Store release tag in job metadata (if Job interface supports it)
      if (job && typeof job === 'object' && 'id' in job) {
        try {
          ;(job as unknown as Record<string, unknown>).metadata = {
            release: body.release,
            triggeredBy: 'ci-webhook'
          }
        } catch {
          // Metadata may not be writable, that's okay
        }
      }

      logger.info(`CI job triggered for ${body.site} (release: ${body.release})`)

      const response: CITriggerResponse = {
        job_id: job.id,
        status: 'queued'
      }

      res.status(201).json(response)
    } catch (error) {
      logger.error(`Error triggering CI job: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * POST /api/ci/gate - Quality gate check
   * Returns pass/fail status based on latest verification results
   */
  router.post('/ci/gate', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as CIGateRequest

      if (!body.site || !body.release) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: site, release'
        })
        return
      }

      const resultStore = storageService.getResultStore()

      // Get results for the site
      const results = resultStore.getBySite(body.site)

      // Filter for results from this release (if we can identify them)
      // For now, we'll use the latest results
      const latestResult = results[0]

      if (!latestResult) {
        res.status(404).json({
          success: false,
          error: 'No verification results found for this site'
        })
        return
      }

      // Calculate quality score (pass rate percentage)
      const totalChecks = latestResult.checks.length
      const passedChecks = latestResult.checks.filter(c => c.passed).length
      const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0

      // Status is pass if score >= 80
      const status = score >= 80 ? 'pass' : 'fail'

      // Build checks array
      const checks: CIGateCheck[] = latestResult.checks.map(c => ({
        name: c.name,
        passed: c.passed,
        message: c.message
      }))

      const response: CIGateResponse = {
        status,
        score,
        checks
      }

      logger.info(`CI gate check for ${body.site} (release: ${body.release}): ${status} (${score}%)`)

      res.json(response)
    } catch (error) {
      logger.error(`Error checking CI gate: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * GET /api/ci/result/:job_id - Get job status and results
   */
  router.get('/ci/result/:job_id', async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = extractParam(req.params, 'job_id')
      const job = jobService.getJob(jobId)

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        })
        return
      }

      const response: CIJobResultResponse = {
        job_id: job.id,
        status: job.status
      }

      if (job.status === 'completed' && job.result) {
        response.result = job.result
      }

      if (job.status === 'failed' && job.error) {
        response.error = job.error
      }

      res.json(response)
    } catch (error) {
      logger.error(`Error getting CI job result: ${error}`)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  return router
}
