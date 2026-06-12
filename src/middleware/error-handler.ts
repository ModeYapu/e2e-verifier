/**
 * Express Error Handler Middleware
 * Provides centralized error handling for Express routes
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

/**
 * Create a standardized error object
 */
export function createError(
  message: string,
  code: string = 'INTERNAL_ERROR',
  details?: unknown
): Error & { code: string; details?: unknown } {
  const error = new Error(message) as Error & { code: string; details?: unknown };
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

/**
 * Express error handler middleware
 * Catches all errors from routes and returns consistent error responses
 */
export function errorHandler(
  err: Error & { code?: string; details?: unknown },
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error with context
  logger.error(`[Error Handler] ${new Date().toISOString()} - ${req.method} ${req.path}: ${err.message}`);
  if (err.stack) {
    logger.error(err.stack);
  }

  // Determine error code
  const code = err.code || 'INTERNAL_ERROR';

  // Determine HTTP status code based on error type
  let statusCode = 500;
  if (code === 'VALIDATION_ERROR') {
    statusCode = 400;
  } else if (code === 'NOT_FOUND') {
    statusCode = 404;
  } else if (code === 'UNAUTHORIZED') {
    statusCode = 401;
  } else if (code === 'FORBIDDEN') {
    statusCode = 403;
  } else if (code === 'CONFLICT') {
    statusCode = 409;
  }

  // Create error response
  const errorResponse: ErrorResponse = {
    error: err.message || 'An unexpected error occurred',
    code: code,
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Include details in development mode
  if (process.env.NODE_ENV === 'development' && err.details) {
    errorResponse.details = err.details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}
