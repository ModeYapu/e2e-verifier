/**
 * API Key Management Routes
 * CRUD endpoints for managing API keys with master key authentication
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import type { ApiKey } from '../../middleware/api-auth';
import { loadKeys, saveKeys } from '../../middleware/api-auth';

const MASTER_API_KEY = process.env.MASTER_API_KEY;

/**
 * Middleware to verify master key authentication
 */
function masterKeyAuth(req: Request, res: Response, next: () => void): void {
  const providedKey = req.headers['x-master-key'] as string || req.headers['authorization']?.replace('Bearer ', '');

  if (!MASTER_API_KEY) {
    res.status(500).json({ error: 'MASTER_API_KEY not configured' });
    return;
  }

  if (!providedKey || providedKey !== MASTER_API_KEY) {
    res.status(401).json({ error: 'Unauthorized. Valid master key required.' });
    return;
  }

  next();
}

/**
 * Generate a 32-character hex key
 */
function generateKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Mask API key showing only first 8 characters
 */
function maskKey(key: string): string {
  return `${key.slice(0, 8)}...`;
}

export function apiKeyRouter(): Router {
  const router = Router();

  // Apply master key auth to all routes
  router.use(masterKeyAuth);

  /**
   * POST /api/keys - Create a new API key
   * Body: { name: string }
   * Returns: { id, key, name, createdAt }
   */
  router.post('/keys', (req: Request, res: Response): void => {
    try {
      const { name } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required (string)' });
        return;
      }

      const keys = loadKeys();
      const newKey: ApiKey = {
        id: `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        key: generateKey(),
        name,
        createdAt: new Date().toISOString()
      };

      keys.push(newKey);
      saveKeys(keys);

      res.status(201).json({
        id: newKey.id,
        key: newKey.key,
        name: newKey.name,
        createdAt: newKey.createdAt
      });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * GET /api/keys - List all API keys (masked)
   * Returns: Array of { id, name, createdAt, lastUsedAt, key (first 8 chars masked) }
   */
  router.get('/keys', (req: Request, res: Response): void => {
    try {
      const keys = loadKeys();
      res.json(keys.map(k => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        key: maskKey(k.key)
      })));
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * DELETE /api/keys/:id - Delete an API key by ID
   * Returns: { deleted: boolean }
   */
  router.delete('/keys/:id', (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const keys = loadKeys();
      const idx = keys.findIndex(k => k.id === id);

      if (idx === -1) {
        res.status(404).json({ error: 'Key not found' });
        return;
      }

      keys.splice(idx, 1);
      saveKeys(keys);

      res.json({ deleted: true });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
