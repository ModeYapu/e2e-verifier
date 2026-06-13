/**
 * Notification Routes
 * Provides endpoints for managing notification configuration and history
 */

import { Router, Request, Response } from 'express';
import { Notifier, NotificationConfig } from '../../services/notifier';
import { logger } from '../../utils/logger';

// Singleton notifier instance
let notifierInstance: Notifier | null = null;

/**
 * Get or create the singleton notifier instance
 */
function getNotifier(): Notifier {
  if (!notifierInstance) {
    // Initialize with environment-based config
    notifierInstance = new Notifier();
  }
  return notifierInstance;
}

export function createNotificationRoutes(): Router {
  const router = Router();

  /**
   * POST /api/notifications/config
   * Update notification configuration
   */
  router.post('/notifications/config', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as Partial<NotificationConfig>;

      logger.info('Updating notification configuration');

      const notifier = getNotifier();
      notifier.updateConfig(body);

      const updatedConfig = notifier.getConfig();

      res.json({
        success: true,
        data: {
          config: updatedConfig,
          message: 'Notification configuration updated successfully'
        }
      });
    } catch (error) {
      logger.error(`Error updating notification config: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/notifications/config
   * Get current notification configuration
   */
  router.get('/notifications/config', async (req: Request, res: Response): Promise<void> => {
    try {
      const notifier = getNotifier();
      const config = notifier.getConfig();

      // Don't expose sensitive data like webhook URLs in full
      const sanitizedConfig = {
        channels: {
          feishu: config.channels.feishu
            ? { webhookUrl: '***configured***' }
            : undefined,
          email: config.channels.email
            ? {
                smtpHost: config.channels.email.smtpHost,
                port: config.channels.email.port,
                from: config.channels.email.from,
                to: config.channels.email.to,
              }
            : undefined,
          slack: config.channels.slack
            ? { webhookUrl: '***configured***' }
            : undefined,
        },
        rules: config.rules,
      };

      res.json({
        success: true,
        data: {
          config: sanitizedConfig
        }
      });
    } catch (error) {
      logger.error(`Error getting notification config: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/notifications/history
   * Get notification history
   */
  router.get('/notifications/history', async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const notifier = getNotifier();
      const history = notifier.getHistory(limit);

      res.json({
        success: true,
        data: {
          history,
          total: history.length
        }
      });
    } catch (error) {
      logger.error(`Error getting notification history: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router
}
