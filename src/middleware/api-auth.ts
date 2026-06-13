/**
 * API Token Authentication Middleware
 * Validates X-API-Key header against configured API keys
 */

import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

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

export function createKey(name: string): ApiKey {
  const keys = loadKeys();
  const newKey: ApiKey = {
    id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`,
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
 * Express middleware for API key authentication
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health endpoint
  if (req.path === '/health') {
    next();
    return;
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key'] as string | undefined;
  
  // If no API key provided, check if auth is required
  if (!apiKey) {
    // If no keys configured, allow all requests (backward compat)
    const keys = loadKeys();
    if (keys.length === 0) {
      next();
      return;
    }
    res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
    return;
  }

  // Validate key
  const keys = loadKeys();
  const found = keys.find(k => k.key === apiKey);
  if (!found) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Update last used
  found.lastUsedAt = new Date().toISOString();
  saveKeys(keys);

  next();
}
