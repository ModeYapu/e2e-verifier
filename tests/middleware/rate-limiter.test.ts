/**
 * Rate limiter middleware unit tests
 *
 * Tests the in-memory sliding window rate limiter:
 * - Normal requests pass through
 * - Requests beyond limit are blocked with 429
 * - Sliding window expires correctly
 * - Status headers are added
 * - Health endpoint is exempt
 * - Reset functionality works
 */

import { Request, Response, NextFunction } from 'express';
import {
  rateLimiter,
  resetRateLimiter,
  destroyRateLimiter,
  getGlobalLimiter,
  RateLimiterOptions,
} from '../../src/middleware/rate-limiter';
import { ErrorCode } from '../../src/utils/errors';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('rateLimiter middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Destroy and recreate global rate limiter before each test
    // This ensures each test gets a fresh limiter with its own configuration
    destroyRateLimiter();

    // Create mock request/response
    mockReq = {
      path: '/api/test',
      headers: {},
      socket: { remoteAddress: '192.168.1.1' } as any,
    };

    mockRes = {
      setHeader: jest.fn() as any,
    };

    mockNext = jest.fn();
  });

  afterAll(() => {
    // Clean up global limiter
    destroyRateLimiter();
  });

  describe('basic rate limiting', () => {
    test('should allow requests within limit', () => {
      const middleware = rateLimiter({
        maxRequests: 5,
        windowMs: 10000,
      });

      // Make 5 requests (at the limit)
      for (let i = 0; i < 5; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(5);
      // setHeader is called 3 times per request: Limit, Remaining, Reset
      expect(mockRes.setHeader).toHaveBeenCalledTimes(15);
    });

    test('should block requests exceeding limit', () => {
      const middleware = rateLimiter({
        maxRequests: 3,
        windowMs: 10000,
      });

      // Make 3 allowed requests
      for (let i = 0; i < 3; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      // 4th request should throw
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });

    test('should include retry information in error', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      // Fill the limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // 3rd request should throw with details
      try {
        middleware(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown RATE_LIMIT_ERROR');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.RATE_LIMIT_ERROR);
        expect(error.message).toBe('Too many requests. Please try again later.');
        expect(error.details).toBeDefined();
        expect(error.details.retryAfter).toBeGreaterThan(0);
        expect(error.details.resetAt).toBeDefined();
      }
    });
  });

  describe('sliding window behavior', () => {
    test('should reset window after expiration', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 100, // Very short window for testing
      });

      // Fill the limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // Wait for window to expire
      return new Promise<void>((done) => {
        setTimeout(() => {
          // Reset next mock to verify new calls
          mockNext = jest.fn();

          // Should be allowed again after window expires
          middleware(mockReq as Request, mockRes as Response, mockNext);
          expect(mockNext).toHaveBeenCalledTimes(1);

          done();
        }, 150);
      });
    });

    test('should track requests in sliding window (not fixed window)', () => {
      const middleware = rateLimiter({
        maxRequests: 3,
        windowMs: 200,
      });

      // Make 3 requests
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked now
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // Wait for part of window to pass (half the window)
      return new Promise<void>((done) => {
        setTimeout(() => {
          // Reset next mock
          mockNext = jest.fn();

          // Should still be blocked because we're still in the window
          // and original requests are still within the window
          expect(() => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
          }).toThrow();

          // Wait longer for full window expiration
          setTimeout(() => {
            mockNext = jest.fn();
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
            done();
          }, 150);
        }, 100);
      });
    });

    test('should slide window with new requests', () => {
      const middleware = rateLimiter({
        maxRequests: 3,
        windowMs: 200,
      });

      // Make 2 initial requests
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Wait for 100ms (half window)
      return new Promise<void>((done) => {
        setTimeout(() => {
          mockNext = jest.fn();

          // At 100ms, the first 2 requests are still within the window (0ms + 200ms = 200ms)
          // So we can only make 1 more request (limit is 3)
          middleware(mockReq as Request, mockRes as Response, mockNext);
          expect(mockNext).toHaveBeenCalledTimes(1);

          // 4th request should be blocked
          expect(() => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
          }).toThrow();

          done();
        }, 100);
      });
    });
  });

  describe('rate limit headers', () => {
    test('should add rate limit headers to response', () => {
      const middleware = rateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    test('should decrease remaining with each request', () => {
      const middleware = rateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');

      mockRes.setHeader = jest.fn() as any;
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '3');

      mockRes.setHeader = jest.fn() as any;
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');
    });

    test('should show 0 remaining when at limit', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // First request - remaining 1
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Second request - remaining 0
      mockRes.setHeader = jest.fn() as any;
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });
  });

  describe('key extraction', () => {
    test('should use IP address as default key', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      (mockReq as any).socket = { remoteAddress: '192.168.1.100' };

      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked for this IP
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });

    test('should use x-api-key header when present', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      mockReq.headers = { 'x-api-key': 'test-key-123' };

      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked for this API key
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });

    test('should track different clients separately', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      // First client (IP 1)
      mockReq = { ...mockReq, socket: { remoteAddress: '192.168.1.1' } as any, headers: {} };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked for first client
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // Second client (different IP) should still be allowed
      mockReq = { ...mockReq, socket: { remoteAddress: '192.168.1.2' } as any };
      mockNext = jest.fn();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should use x-forwarded-for header when present', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      mockReq.headers = { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' };

      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should use the first IP from the header
      // (we can't directly test the key, but we verify no error is thrown)
      expect(mockNext).toHaveBeenCalled();
    });

    test('should use x-real-ip header when present', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      mockReq.headers = { 'x-real-ip': '10.0.0.5' };

      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should use custom key extractor', () => {
      const customKeyExtractor = jest.fn().mockReturnValue('custom-key');

      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
        keyExtractor: customKeyExtractor,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(customKeyExtractor).toHaveBeenCalledWith(mockReq);

      // Should be blocked for this custom key
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });
  });

  describe('health endpoint exemption', () => {
    test('should skip rate limiting for /health endpoint', () => {
      const middleware = rateLimiter({
        maxRequests: 1, // Very low limit
        windowMs: 10000,
      });

      (mockReq as any).path = '/health';

      // Make many requests - should all pass
      for (let i = 0; i < 10; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(10);
      expect(mockRes.setHeader).not.toHaveBeenCalled();
    });

    test('should skip rate limiting for /api/health endpoint', () => {
      const middleware = rateLimiter({
        maxRequests: 1,
        windowMs: 10000,
      });

      (mockReq as any).path = '/api/health';

      // Make many requests
      for (let i = 0; i < 10; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(10);
    });

    test('should rate limit non-health endpoints', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      (mockReq as any).path = '/api/verify';

      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });
  });

  describe('default options', () => {
    test('should use default maxRequests of 60', () => {
      const middleware = rateLimiter();

      // Make 60 requests - should all pass
      for (let i = 0; i < 60; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(60);

      // 61st should be blocked
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });

    test('should use default windowMs of 60000 (1 minute)', () => {
      const middleware = rateLimiter({ maxRequests: 2 });

      // Fill the limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // We can't easily test the 60s window in unit tests,
      // but we can verify the option is used by checking behavior
    });
  });

  describe('reset and destroy', () => {
    test('should reset rate limiter state', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      // Fill the limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // Reset the limiter
      resetRateLimiter();

      // Should now be allowed again
      mockNext = jest.fn();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should destroy rate limiter and clear state', () => {
      const middleware = rateLimiter({
        maxRequests: 2,
        windowMs: 10000,
      });

      // Fill the limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Destroy the limiter
      destroyRateLimiter();

      // Global limiter should be null
      expect(getGlobalLimiter()).toBeNull();

      // Recreate and test
      const newMiddleware = rateLimiter({ maxRequests: 2, windowMs: 10000 });
      mockNext = jest.fn();
      newMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should get global limiter instance', () => {
      rateLimiter();

      const limiter = getGlobalLimiter();
      expect(limiter).not.toBeNull();

      // Verify it has the reset method
      expect(typeof limiter?.reset).toBe('function');
    });

    test('should return null for global limiter before first use', () => {
      destroyRateLimiter();

      expect(getGlobalLimiter()).toBeNull();
    });
  });

  describe('multiple middleware instances', () => {
    test('should share state across middleware instances', () => {
      // Create two middleware instances with same config
      const middleware1 = rateLimiter({ maxRequests: 2, windowMs: 10000 });
      const middleware2 = rateLimiter({ maxRequests: 2, windowMs: 10000 });

      // Use first middleware
      middleware1(mockReq as Request, mockRes as Response, mockNext);
      middleware1(mockReq as Request, mockRes as Response, mockNext);

      // Should be blocked on first middleware
      expect(() => {
        middleware1(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();

      // Should also be blocked on second middleware (shared state)
      expect(() => {
        middleware2(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow();
    });
  });

  describe('error handling', () => {
    test('should handle unknown key extraction gracefully', () => {
      const badKeyExtractor = () => {
        throw new Error('Extraction failed');
      };

      const middleware = rateLimiter({
        maxRequests: 10,
        windowMs: 10000,
        keyExtractor: badKeyExtractor,
      });

      // Should not throw, should use 'unknown' key
      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getStatus method', () => {
    test('should return correct remaining count', () => {
      const middleware = rateLimiter({ maxRequests: 5, windowMs: 10000 });

      // First request
      middleware(mockReq as Request, mockRes as Response, mockNext);
      const calls = (mockRes.setHeader as jest.MockedFunction<any>).mock.calls;
      // Last call is X-RateLimit-Reset, second to last is Remaining
      const remaining1 = calls[calls.length - 2][1];
      expect(remaining1).toBe('4');

      // Second request
      mockRes.setHeader = jest.fn() as any;
      middleware(mockReq as Request, mockRes as Response, mockNext);
      const calls2 = (mockRes.setHeader as jest.MockedFunction<any>).mock.calls;
      const remaining2 = calls2[calls2.length - 2][1];
      expect(remaining2).toBe('3');
    });

    test('should return max remaining for new client', () => {
      const middleware = rateLimiter({ maxRequests: 10, windowMs: 10000 });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      const calls = (mockRes.setHeader as jest.MockedFunction<any>).mock.calls;
      const remaining = calls[calls.length - 2][1];
      expect(remaining).toBe('9');
    });
  });
});
