/**
 * In-Memory Rate Limiter Middleware
 *
 * Simple sliding window rate limiter using a Map-based storage.
 * Tracks requests by IP address or API key and enforces configurable limits.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Rate limiter configuration options
 */
export interface RateLimiterOptions {
  /** Maximum number of requests allowed in the time window (default: 60) */
  maxRequests?: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Custom key extractor function (default: IP-based) */
  keyExtractor?: (req: Request) => string;
  /** Whether to skip rate limiting for successful API key auth (default: false) */
  skipSuccessfulAuth?: boolean;
}

/**
 * Request timestamp entry for tracking within the window
 */
interface TimestampEntry {
  count: number;
  windowStart: number;
}

/**
 * Rate limiter state for each client key
 */
interface RateLimitState {
  timestamps: number[];
  resetAt: number;
}

/**
 * In-memory rate limiter using sliding window algorithm
 */
class InMemoryRateLimiter {
  private clients: Map<string, RateLimitState> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodically clean up expired entries (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanup(Date.now());
    }, 5 * 60 * 1000);
  }

  /**
   * Check if a request should be rate limited
   * @returns true if rate limited, false otherwise
   */
  isRateLimited(key: string, now: number): { limited: boolean; resetAt: number } {
    let state = this.clients.get(key);

    // Initialize new client state
    if (!state || state.resetAt < now) {
      state = {
        timestamps: [],
        resetAt: now + this.windowMs
      };
      this.clients.set(key, state);
    }

    // Remove timestamps outside the current window
    state.timestamps = state.timestamps.filter(ts => ts > now - this.windowMs);

    // Check if limit exceeded
    if (state.timestamps.length >= this.maxRequests) {
      // Calculate when the oldest request will expire
      const oldestTimestamp = state.timestamps[0];
      const resetAt = oldestTimestamp + this.windowMs;
      return { limited: true, resetAt };
    }

    // Add current request timestamp
    state.timestamps.push(now);
    return { limited: false, resetAt: state.resetAt };
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(key: string, now: number): { remaining: number; resetAt: number } {
    const state = this.clients.get(key);
    if (!state || state.resetAt < now) {
      return { remaining: this.maxRequests, resetAt: now + this.windowMs };
    }

    // Clean up expired timestamps
    state.timestamps = state.timestamps.filter(ts => ts > now - this.windowMs);
    return {
      remaining: Math.max(0, this.maxRequests - state.timestamps.length),
      resetAt: state.resetAt
    };
  }

  /**
   * Clean up expired client states
   */
  private cleanup(now: number): void {
    let cleaned = 0;
    for (const [key, state] of this.clients.entries()) {
      if (state.resetAt < now && state.timestamps.length === 0) {
        this.clients.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`[RateLimiter] Cleaned up ${cleaned} expired client states`);
    }
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.clients.clear();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clients.clear();
  }
}

/**
 * Global rate limiter instance (can be configured via options)
 */
let globalLimiter: InMemoryRateLimiter | null = null;

/**
 * Default rate limiter options
 */
const DEFAULT_OPTIONS: Required<RateLimiterOptions> = {
  maxRequests: 60,
  windowMs: 60000, // 1 minute
  keyExtractor: (req: Request) => {
    // Try API key first, fall back to IP
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      return `apikey:${apiKey}`;
    }
    // Extract IP from request (handling proxy headers)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.headers['x-real-ip'] as string
      || req.socket.remoteAddress
      || 'unknown';
    return `ip:${ip}`;
  },
  skipSuccessfulAuth: false,
};

/**
 * Extract client identifier from request
 */
function extractKey(req: Request, options: Required<RateLimiterOptions>): string {
  try {
    return options.keyExtractor(req);
  } catch {
    return 'unknown';
  }
}

/**
 * Create rate limiter middleware factory function
 *
 * @param options - Rate limiter configuration options
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * // Use default settings (60 req/min)
 * app.use('/api', rateLimiter());
 *
 * // Custom settings
 * app.use('/api', rateLimiter({
 *   maxRequests: 100,
 *   windowMs: 30000,  // 30 seconds
 * }));
 * ```
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Create or reuse global limiter (to support multiple middleware instances with shared state)
  if (!globalLimiter) {
    globalLimiter = new InMemoryRateLimiter(config.maxRequests, config.windowMs);
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting for health endpoint
    if (req.path === '/health' || req.path === '/api/health') {
      next();
      return;
    }

    const key = extractKey(req, config);
    const now = Date.now();

    const result = globalLimiter!.isRateLimited(key, now);

    if (result.limited) {
      const resetAfter = Math.ceil((result.resetAt - now) / 1000);

      logger.warn(`[RateLimiter] Rate limit exceeded for ${key}`);

      throw new AppError(
        ErrorCode.RATE_LIMIT_ERROR,
        'Too many requests. Please try again later.',
        {
          details: {
            retryAfter: resetAfter,
            resetAt: new Date(result.resetAt).toISOString()
          }
        }
      );
    }

    // Add rate limit headers to response
    const status = globalLimiter!.getStatus(key, now);
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', status.remaining.toString());
    res.setHeader('X-RateLimit-Reset', status.resetAt.toString());

    next();
  };
}

/**
 * Get the global rate limiter instance (for testing/monitoring)
 */
export function getGlobalLimiter(): InMemoryRateLimiter | null {
  return globalLimiter;
}

/**
 * Reset the global rate limiter (for testing)
 */
export function resetRateLimiter(): void {
  if (globalLimiter) {
    globalLimiter.reset();
  }
}

/**
 * Destroy the global rate limiter
 */
export function destroyRateLimiter(): void {
  if (globalLimiter) {
    globalLimiter.destroy();
    globalLimiter = null;
  }
}
