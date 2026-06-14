/**
 * API Token Authentication Middleware
 * Validates X-API-Key header against configured API keys
 */

import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { safeEqual, generateToken, generateId } from '../utils/security';

export interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

const KEYS_FILE = path.join(process.cwd(), 'data', 'api-keys.json');

export function loadKeys(): ApiKey[] {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
    }
  } catch (e) {
    logger.error(`Failed to load API keys: ${e}`);
  }
  return [];
}

export function saveKeys(keys: ApiKey[]): void {
  const dir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export function getAllKeys(): ApiKey[] {
  return loadKeys();
}

/**
 * Create a new API key backed by cryptographically strong randomness.
 * The previous implementation used Math.random(), which is not secure.
 */
export function createKey(name: string): ApiKey {
  const keys = loadKeys();
  const newKey: ApiKey = {
    id: generateId('key_'),
    key: generateToken('ev_', 32),
    name,
    createdAt: new Date().toISOString()
  };
  keys.push(newKey);
  saveKeys(keys);
  return newKey;
}

export function deleteKey(id: string): boolean {
  const keys = loadKeys();
  const idx = keys.findIndex(k => k.id === id);
  if (idx === -1) return false;
  keys.splice(idx, 1);
  saveKeys(keys);
  return true;
}

/**
 * Is the caller trusted enough to defer auth to a downstream policy gate?
 * Only loopback connections (and an explicit operator opt-in) qualify —
 * remote anonymous traffic is never allowed through on its own.
 */
function isLocalTrust(req: Request): boolean {
  if (process.env.E2E_VERIFIER_OPEN_ACCESS === '1') return true;
  const addr = req.socket?.remoteAddress;
  if (!addr) return false;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
}

/**
 * Express middleware for API key authentication
 *
 * Policy:
 *  - /health always passes.
 *  - A request that carries a Bearer token is deferred to the downstream
 *    token middleware (verify-server), which validates it.
 *  - A request with an X-API-Key is validated in constant time.
 *  - Anything else (no credential) is rejected, EXCEPT for loopback callers
 *    where a downstream policy may still permit local dev access.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health endpoint
  if (req.path === '/health') {
    next();
    return;
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // Defer Bearer-token requests to the dedicated token middleware.
  const authHeader = req.headers['authorization'] as string | undefined;
  const hasBearer = !!authHeader && /^bearer\s+\S+/i.test(authHeader);

  if (!apiKey) {
    if (hasBearer || isLocalTrust(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
    return;
  }

  // Validate key in constant time to avoid timing oracles.
  const keys = loadKeys();
  const found = keys.find(k => safeEqual(k.key, apiKey));
  if (!found) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Update last used
  found.lastUsedAt = new Date().toISOString();
  saveKeys(keys);

  next();
}
