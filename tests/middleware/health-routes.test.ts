/**
 * Health Routes Unit Tests
 *
 * Tests the health check endpoints:
 * - GET /api/health returns basic health with memory and dbSize
 * - GET /api/health/detailed returns full system information
 */

import { Request, Response } from 'express';
import { Router } from 'express';
import { VerifyService } from '../../src/server/services/verify-service';
import { BrowserPool } from '../../src/browser/browser-pool';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock VerifyService
jest.mock('../../src/server/services/verify-service', () => ({
  VerifyService: jest.fn().mockImplementation(() => ({
    // Mock implementation
  })),
}));

// Mock BrowserPool
jest.mock('../../src/browser/browser-pool', () => ({
  BrowserPool: {
    getInstance: jest.fn().mockReturnValue({
      getStats: jest.fn().mockReturnValue({
        pagesInUse: 1,
        pagesAvailable: 2,
        maxInstances: 3,
      }),
    }),
  },
}));

// Helper function to extract and call a route handler
function callRoute(router: Router, path: string, req: Request, res: Response): void {
  const routerInstance = router as any;
  const stack = routerInstance.stack || routerInstance.router?.stack || [];

  for (const layer of stack) {
    if (layer.route?.path === path && layer.route?.stack?.[0]?.handle) {
      layer.route.stack[0].handle(req, res);
      return;
    }
    if (layer.name === 'router' && layer.handle?.stack) {
      for (const subLayer of layer.handle.stack) {
        if (subLayer.route?.path === path && subLayer.route?.stack?.[0]?.handle) {
          subLayer.route.stack[0].handle(req, res);
          return;
        }
      }
    }
  }
}

describe('Health Routes', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockVerifyService: VerifyService;
  let healthRouter: Router;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset BrowserPool mock to default state
    (BrowserPool.getInstance as jest.Mock).mockReturnValue({
      getStats: jest.fn().mockReturnValue({
        pagesInUse: 1,
        pagesAvailable: 2,
        maxInstances: 3,
      }),
    });

    mockVerifyService = new VerifyService({} as any);

    const mockApp = {
      get: jest.fn((key: string) => {
        if (key === 'uptime') return 3600000;
        if (key === 'stats') return { totalVerifications: 0, totalDeepVerifications: 0, totalOrchestratedVerifications: 0 };
        return undefined;
      }),
      set: jest.fn(),
    } as any;

    mockReq = {
      app: mockApp,
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import and create the router inside beforeEach to get fresh mocks
    jest.isolateModules(() => {
      const { createHealthRoutes } = require('../../src/server/routes/health-routes');
      healthRouter = createHealthRoutes(mockVerifyService);
    });
  });

  describe('GET /api/health', () => {
    test('should return health status with required fields', () => {
      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalled();

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData).toHaveProperty('status');
      expect(responseData).toHaveProperty('version');
      expect(responseData).toHaveProperty('uptime');
      expect(responseData).toHaveProperty('browserPool');
      expect(responseData).toHaveProperty('memory');
      expect(responseData).toHaveProperty('dbSize');
    });

    test('should return correct status types', () => {
      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(typeof responseData.status).toBe('string');
      expect(typeof responseData.version).toBe('string');
      expect(typeof responseData.uptime).toBe('number');

      expect(responseData.browserPool).toHaveProperty('active');
      expect(responseData.browserPool).toHaveProperty('idle');
      expect(responseData.browserPool).toHaveProperty('max');
      expect(typeof responseData.browserPool.active).toBe('number');
      expect(typeof responseData.browserPool.idle).toBe('number');
      expect(typeof responseData.browserPool.max).toBe('number');
    });

    test('should return memory usage information', () => {
      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.memory).toHaveProperty('rss');
      expect(responseData.memory).toHaveProperty('heapTotal');
      expect(responseData.memory).toHaveProperty('heapUsed');
      expect(responseData.memory).toHaveProperty('external');

      expect(typeof responseData.memory.rss).toBe('number');
      expect(typeof responseData.memory.heapTotal).toBe('number');
      expect(typeof responseData.memory.heapUsed).toBe('number');
      expect(typeof responseData.memory.external).toBe('number');
    });

    test('should return dbSize', () => {
      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData).toHaveProperty('dbSize');
      expect(typeof responseData.dbSize).toBe('number');
    });

    test('should return uptime in seconds', () => {
      (mockReq.app.get as jest.Mock).mockReturnValue(3600000);

      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.uptime).toBe(3600);
    });

    test('should return degraded status when browser pool is full', () => {
      (BrowserPool.getInstance as jest.Mock).mockReturnValue({
        getStats: jest.fn().mockReturnValue({
          pagesInUse: 3,
          pagesAvailable: 0,
          maxInstances: 3,
        }),
      });

      // Recreate router with updated mock
      jest.isolateModules(() => {
        const { createHealthRoutes } = require('../../src/server/routes/health-routes');
        healthRouter = createHealthRoutes(mockVerifyService);
      });

      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.status).toBe('degraded');
    });

    test('should return ok status when browser pool has capacity', () => {
      callRoute(healthRouter, '/health', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.status).toBe('ok');
    });
  });

  describe('GET /api/health/detailed', () => {
    test('should return all basic health fields plus detailed system info', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData).toHaveProperty('status');
      expect(responseData).toHaveProperty('version');
      expect(responseData).toHaveProperty('uptime');
      expect(responseData).toHaveProperty('browserPool');
      expect(responseData).toHaveProperty('memory');
      expect(responseData).toHaveProperty('dbSize');

      expect(responseData).toHaveProperty('nodeVersion');
      expect(responseData).toHaveProperty('platform');
      expect(responseData).toHaveProperty('arch');
      expect(responseData).toHaveProperty('cpuUsage');
      expect(responseData).toHaveProperty('loadAverage');
      expect(responseData).toHaveProperty('totalMemory');
      expect(responseData).toHaveProperty('freeMemory');
    });

    test('should return nodeVersion', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(typeof responseData.nodeVersion).toBe('string');
      expect(responseData.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });

    test('should return platform and arch', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(typeof responseData.platform).toBe('string');
      expect(typeof responseData.arch).toBe('string');
    });

    test('should return cpuUsage with user and system', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.cpuUsage).toHaveProperty('user');
      expect(responseData.cpuUsage).toHaveProperty('system');
      expect(typeof responseData.cpuUsage.user).toBe('number');
      expect(typeof responseData.cpuUsage.system).toBe('number');
    });

    test('should return loadAverage array', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(Array.isArray(responseData.loadAverage)).toBe(true);
      expect(responseData.loadAverage).toHaveLength(3);
      expect(typeof responseData.loadAverage[0]).toBe('number');
    });

    test('should return total and free memory', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(typeof responseData.totalMemory).toBe('number');
      expect(typeof responseData.freeMemory).toBe('number');
      expect(responseData.totalMemory).toBeGreaterThan(0);
    });

    test('should include browser pool stats', () => {
      callRoute(healthRouter, '/health/detailed', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.browserPool).toHaveProperty('active');
      expect(responseData.browserPool).toHaveProperty('idle');
      expect(responseData.browserPool).toHaveProperty('max');
    });
  });

  describe('GET /api/stats', () => {
    test('should return statistics', () => {
      (mockReq.app.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'uptime') return 3600000;
        if (key === 'stats') return {
          totalVerifications: 100,
          totalDeepVerifications: 50,
          totalOrchestratedVerifications: 25,
        };
        return undefined;
      });

      callRoute(healthRouter, '/stats', mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalled();

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData).toHaveProperty('totalVerifications');
      expect(responseData).toHaveProperty('totalDeepVerifications');
      expect(responseData).toHaveProperty('totalOrchestratedVerifications');
      expect(responseData).toHaveProperty('uptime');
      expect(responseData).toHaveProperty('jobs');
    });

    test('should return default stats when none are set', () => {
      callRoute(healthRouter, '/stats', mockReq as Request, mockRes as Response);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];

      expect(responseData.totalVerifications).toBe(0);
      expect(responseData.totalDeepVerifications).toBe(0);
      expect(responseData.totalOrchestratedVerifications).toBe(0);
    });
  });
});
