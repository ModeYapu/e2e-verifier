/**
 * Health Routes
 * Provides health check and stats endpoints
 */

import { Router, Request, Response } from 'express';
import { VerifyService } from '../services/verify-service';

export function createHealthRoutes(verifyService: VerifyService): Router {
  const router = Router();

  /**
   * GET /api/health - Health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      uptime: req.app.get('uptime') || 0,
      browser: 'connected'
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
    stats.uptime = req.app.get('uptime') || 0;
    res.json(stats);
  });

  return router;
}
