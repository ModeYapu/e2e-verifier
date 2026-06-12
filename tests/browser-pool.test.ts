/**
 * BrowserPool unit tests
 *
 * Tests the singleton browser pool implementation for managing shared browser instances
 */

import { BrowserPool } from '../src/browser/browser-pool';

// Mock playwright to avoid actual browser launches
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn()
  }
}));

import { chromium } from 'playwright';

describe('BrowserPool', () => {
  beforeEach(() => {
    // Reset singleton before each test
    BrowserPool.reset();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    try {
      await BrowserPool.getInstance().close();
    } catch {
      // Ignore if already closed
    }
    BrowserPool.reset();
  });

  describe('getInstance', () => {
    test('should return same instance (singleton pattern)', () => {
      const instance1 = BrowserPool.getInstance({ maxInstances: 1 });
      const instance2 = BrowserPool.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('should create new instance if not exists', () => {
      const instance = BrowserPool.getInstance({ maxInstances: 2 });

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(BrowserPool);
    });
  });

  describe('acquirePage', () => {
    test('should create page with browser launch', async () => {
      // Mock browser launch
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 1 });
      const page = await pool.acquirePage();

      expect(page).toBeDefined();
      expect(chromium.launch).toHaveBeenCalled();
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    test('should reuse existing page when available', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 1 });
      const page1 = await pool.acquirePage();

      // Release the page
      pool.releasePage(page1);

      // Acquire again - should reuse
      const page2 = await pool.acquirePage();

      expect(page2).toBeDefined();
      // Should reuse existing browser context
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1); // Only initial context created
    });

    test('should respect maxInstances config', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 2 });

      // Acquire 3 pages - should only create 2 browsers
      await pool.acquirePage();
      await pool.acquirePage();
      await pool.acquirePage();

      expect(chromium.launch).toHaveBeenCalledTimes(2); // maxInstances = 2
    });
  });

  describe('releasePage', () => {
    test('should mark page as available', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 1 });
      const page = await pool.acquirePage();

      let stats = pool.getStats();
      expect(stats.pagesInUse).toBe(1);
      expect(stats.pagesAvailable).toBe(0);

      pool.releasePage(page);

      stats = pool.getStats();
      expect(stats.pagesInUse).toBe(0);
      expect(stats.pagesAvailable).toBe(1);
    });

    test('should handle releasing unknown page gracefully', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 1 });

      // Try to release a page that wasn't acquired
      const fakePage = { close: jest.fn(), on: jest.fn() } as any;
      expect(() => pool.releasePage(fakePage)).not.toThrow();
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn(),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 3 });

      // Initial stats
      let stats = pool.getStats();
      expect(stats.totalBrowsers).toBe(0);
      expect(stats.totalPages).toBe(0);
      expect(stats.pagesInUse).toBe(0);
      expect(stats.maxInstances).toBe(3);

      // Acquire a page
      await pool.acquirePage();
      stats = pool.getStats();
      expect(stats.totalBrowsers).toBeGreaterThanOrEqual(1); // Browser pool may create multiple browsers
      expect(stats.totalPages).toBe(1);
      expect(stats.pagesInUse).toBe(1);
    });
  });

  describe('close', () => {
    test('should close all browsers and cleanup', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 2 });

      // Acquire some pages
      await pool.acquirePage();
      await pool.acquirePage();

      // Close pool
      await pool.close();

      const stats = pool.getStats();
      expect(stats.totalBrowsers).toBe(0);
      expect(stats.totalPages).toBe(0);
      expect(mockBrowser.close).toHaveBeenCalledTimes(2);
      expect(mockContext.close).toHaveBeenCalled();
    });

    test('should handle errors during close gracefully', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockRejectedValue(new Error('Close failed')),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockRejectedValue(new Error('Browser close failed')),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const pool = BrowserPool.getInstance({ maxInstances: 1 });
      await pool.acquirePage();

      // Should not throw even if close fails
      await expect(pool.close()).resolves.not.toThrow();
    });
  });

  describe('reset', () => {
    test('should reset singleton instance', async () => {
      const mockPage = {
        close: jest.fn(),
        on: jest.fn(),
      };
      const mockContext = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
      };
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(mockContext),
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const instance1 = BrowserPool.getInstance({ maxInstances: 1 });
      BrowserPool.reset();

      const instance2 = BrowserPool.getInstance({ maxInstances: 2 });

      // Should be different instances
      expect(instance1).not.toBe(instance2);
    });
  });
});
