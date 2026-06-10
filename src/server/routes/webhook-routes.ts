/**
 * Webhook Routes
 * Handles webhook management endpoints
 */

import { Router, Request, Response } from 'express';
import { WebhookConfigManager } from '../../config/webhook-config';
import { WebhookDelivery } from '../../integrations/webhook';

export function createWebhookRoutes(): Router {
  const router = Router();

  const webhookConfig = new WebhookConfigManager();
  const webhookDelivery = new WebhookDelivery();

  /**
   * GET /api/webhooks - List all webhooks
   */
  router.get('/webhooks', async (req: Request, res: Response): Promise<void> => {
    try {
      const webhooks = webhookConfig.getAll();
      res.json(webhooks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/webhooks - Create a new webhook
   */
  router.post('/webhooks', async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, secret, events, name } = req.body;
      if (!url || !secret || !events) {
        res.status(400).json({ error: 'url, secret, and events are required' });
        return;
      }
      const wh = webhookConfig.create(url, secret, events, true);
      res.status(201).json(wh);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * PUT /api/webhooks/:id - Update a webhook
   */
  router.put('/webhooks/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const wh = webhookConfig.update(id, req.body);
      if (!wh) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(wh);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/webhooks/:id - Delete a webhook
   */
  router.delete('/webhooks/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const ok = webhookConfig.delete(req.params.id as string);
      res.json({ deleted: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/webhooks/:id/test - Test a webhook
   */
  router.post('/webhooks/:id/test', async (req: Request, res: Response): Promise<void> => {
    try {
      const wh = webhookConfig.get(req.params.id as string);
      if (!wh) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const result = await webhookDelivery.sendTest(wh);
      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export { WebhookConfigManager, WebhookDelivery };
