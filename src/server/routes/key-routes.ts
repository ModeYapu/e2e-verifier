/**
 * Key Routes
 * Handles API key management endpoints
 */

import { Router, Request, Response } from 'express';
import { getAllKeys, createKey, deleteKey } from '../../middleware/api-auth';

export function createKeyRoutes(): Router {
  const router = Router();

  /**
   * GET /api/admin/keys - List all API keys
   */
  router.get('/admin/keys', async (req: Request, res: Response): Promise<void> => {
    try {
      const keys = getAllKeys().map(k => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt
      }));
      res.json(keys);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/admin/keys - Create a new API key
   */
  router.post('/admin/keys', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const key = createKey(name);
      res.status(201).json(key);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/admin/keys/:id - Delete an API key
   */
  router.delete('/admin/keys/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const ok = deleteKey(req.params.id as string);
      res.json({ deleted: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
