/**
 * Express Error Handler Middleware
 * Provides centralized error handling for Express routes using AppError
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError, isAppError, fromUnknown, ErrorCode } from '../utils/errors';

/**
 * Legacy error with code and details (for backward compatibility)
 * @deprecated Use AppError instead
 */
export interface LegacyError extends Error {
  code: string;
  details?: unknown;
}

/**
 * Create a standardized error object
 * @deprecated Use AppError instead. Kept for backward compatibility with existing routes.
 */
export function createError(
  message: string,
  code: string = ErrorCode.INTERNAL_ERROR,
  details?: unknown
): LegacyError {
  const error = new Error(message) as LegacyError;
  error.name = 'LegacyError';
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

/**
 * Standardized API error response format
 */
export interface ApiResponseError {
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    details?: unknown;
    stack?: string;
  };
}

/**
 * Express error handler middleware
 * Catches all errors from routes and returns standardized JSON responses
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Convert unknown error to AppError if needed
  const appError = isAppError(err) ? err : fromUnknown(err);

  // Log error with context
  logger.error(`[Error Handler] ${new Date().toISOString()} - ${req.method} ${req.path}: ${appError.message}`);
  if (appError.stack) {
    logger.error(appError.stack);
  }

  // Build standardized error response
  const errorResponse: ApiResponseError = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      timestamp: appError.timestamp,
    },
  };

  // Include details if present
  if (appError.details !== undefined) {
    errorResponse.error.details = appError.details;
  }

  // Include stack trace in development mode for debugging
  if (process.env.NODE_ENV === 'development' && appError.stack) {
    errorResponse.error.stack = appError.stack;
  }

  // Send error response with appropriate status code
  res.status(appError.statusCode).json(errorResponse);
}
