/**
 * Project Authentication Middleware
 * Validates X-API-Key header and attaches project context to request
 */

import { Request, Response, NextFunction } from 'express';
import { ProjectStore } from '../projects/project-store';
import { Project } from '../projects/types';

declare global {
  namespace Express {
    interface Request {
      project?: Project;
    }
  }
}

/**
 * Express middleware for project-based API key authentication
 */
export function projectAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health endpoint
  if (req.path === '/health') {
    next();
    return;
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // If no API key provided, deny access
  if (!apiKey) {
    res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
    return;
  }

  // Validate key and lookup project
  const project = ProjectStore.findByApiKey(apiKey);
  if (!project) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Attach project to request
  req.project = project;

  next();
}

/**
 * Optional project auth - attaches project if API key provided, but doesn't require it
 */
export function optionalProjectAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health endpoint
  if (req.path === '/health') {
    next();
    return;
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    // Try to lookup and attach project
    const project = ProjectStore.findByApiKey(apiKey);
    if (project) {
      req.project = project;
    }
  }

  next();
}
