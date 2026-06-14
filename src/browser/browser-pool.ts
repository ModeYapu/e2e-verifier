/**
 * Browser Pool - Shared browser instance management
 *
 * Provides a singleton browser pool to avoid launching multiple browser instances.
 * This is critical for memory efficiency and avoiding resource conflicts.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AppError, ErrorCode, fromUnknown } from '../utils/errors';

/**
 * Browser pool configuration
 */
export interface BrowserPoolConfig {
  /** Maximum number of browser instances to maintain */
  maxInstances?: number;
  /** Maximum number of pooled pages (concurrency cap / back-pressure) */
  maxPages?: number;
  /** Whether to run browsers in headless mode */
  headless?: boolean;
  /** Slow motion for debugging (ms) */
  slowMo?: number;
  /** Whether to launch devtools for debugging */
  devtools?: boolean;
  /** Browser launch timeout in ms */
  timeout?: number;
}

/**
 * Page wrapper with metadata
 */
interface PooledPage {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  inUse: boolean;
  createdAt: Date;
}

/**
 * Browser pool singleton class
 */
export class BrowserPool extends EventEmitter {
  private static instance: BrowserPool;
  private browsers: Browser[] = [];
  private pages: PooledPage[] = [];
  private config: Required<BrowserPoolConfig>;
  private initialized: boolean = false;
  /**
   * FIFO of acquirePage() callers blocked because the pool is at the page cap.
   * Resolved (in release order) by releasePage().
   */
  private pendingResolvers: Array<() => void> = [];

  private constructor(config: BrowserPoolConfig = {}) {
    super();
    this.config = {
      maxInstances: config.maxInstances || 2,
      maxPages: config.maxPages || 8,
      headless: config.headless !== false,
      slowMo: config.slowMo || 0,
      devtools: config.devtools || false,
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: BrowserPoolConfig): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool(config);
    }
    return BrowserPool.instance;
  }

  /**
   * Initialize the browser pool (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('[BrowserPool] Initializing browser pool...');
      this.emit('initializing');

      // Launch initial browser instance
      const browser = await this.launchBrowser();
      this.browsers.push(browser);

      this.initialized = true;
      logger.info(`[BrowserPool] Browser pool initialized with ${this.config.maxInstances} max instances`);
      this.emit('initialized');
    } catch (error) {
      logger.error(`[BrowserPool] Failed to initialize browser pool: ${error}`);
      this.emit('error', error);
      throw fromUnknown(error, ErrorCode.BROWSER_ERROR);
    }
  }

  /**
   * Launch a new browser instance
   */
  private async launchBrowser(): Promise<Browser> {
    try {
      const browser = await chromium.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        // devtools option may not be available in all Playwright versions
        timeout: this.config.timeout,
      });

      logger.info('[BrowserPool] Launched new browser instance');
      this.emit('browser-launched', browser);

      // Handle browser crashes
      browser.on('disconnected', () => {
        logger.warn('[BrowserPool] Browser disconnected, attempting to restart...');
        this.handleBrowserDisconnect(browser);
      });

      return browser;
    } catch (error) {
      logger.error(`[BrowserPool] Failed to launch browser: ${error}`);
      throw fromUnknown(error, ErrorCode.BROWSER_ERROR);
    }
  }

  /**
   * Handle browser disconnect/crash
   */
  private async handleBrowserDisconnect(browser: Browser): Promise<void> {
    this.emit('browser-disconnected', browser);

    // Remove from pool
    const index = this.browsers.indexOf(browser);
    if (index > -1) {
      this.browsers.splice(index, 1);
    }

    // Clean up associated pages
    this.pages = this.pages.filter(p => p.browser !== browser);

    // Restart if needed
    if (this.browsers.length === 0) {
      try {
        const newBrowser = await this.launchBrowser();
        this.browsers.push(newBrowser);
      } catch (error) {
        logger.error(`[BrowserPool] Failed to restart browser: ${error}`);
      }
    }
  }

  /**
   * Reset a pooled page's state so a reused page does not leak cookies,
   * storage or URL from the previous verification. Best-effort: every step is
   * guarded so a failure on one page cannot break the pool.
   */
  private async resetPageState(p: PooledPage): Promise<void> {
    try {
      await p.context.clearCookies();
    } catch (e) {
      logger.warn(`[BrowserPool] clearCookies failed during reset: ${e}`);
    }
    try {
      await p.page.goto('about:blank', { waitUntil: 'domcontentloaded' } as any);
    } catch (e) {
      // about:blank navigation can no-op or fail on closed pages — ignore.
    }
    try {
      await p.page.evaluate(() => {
        try { localStorage.clear(); } catch (e) { /* ignore */ }
        try { sessionStorage.clear(); } catch (e) { /* ignore */ }
      });
    } catch (e) {
      // ignore — fresh navigation above already isolates most state.
    }
  }

  /**
   * Acquire a page from the pool.
   *
   * Enforces a page cap ({@link BrowserPoolConfig.maxPages}) as a semaphore:
   * when the pool holds maxPages live pages and none are free, callers block
   * until a page is released. Reused pages are reset before hand-off so no
   * state bleeds between verifications.
   */
  async acquirePage(): Promise<Page> {
    await this.ensureInitialized();

    // Semaphore / back-pressure loop.
    for (;;) {
      const available = this.pages.find(p => !p.inUse);
      if (available) {
        available.inUse = true;
        await this.resetPageState(available);
        logger.info('[BrowserPool] Reusing existing page from pool');
        this.emit('page-acquired', available.page);
        return available.page;
      }

      // No free page. If under the page cap, create one; otherwise wait.
      if (this.pages.length < this.config.maxPages) {
        return await this.createNewPage();
      }

      // At capacity — block until a page is released.
      await new Promise<void>(resolve => this.pendingResolvers.push(resolve));
      // Loop: the released page (or a new slot) will be picked up next iter.
    }
  }

  /**
   * Allocate a brand-new page, launching a browser when under maxInstances
   * or reusing an existing browser otherwise.
   */
  private async createNewPage(): Promise<Page> {
    // Launch new browser if under max instances
    if (this.browsers.length < this.config.maxInstances) {
      try {
        const browser = await this.launchBrowser();
        this.browsers.push(browser);

        const context = await browser.newContext();
        const page = await context.newPage();

        const pooledPage: PooledPage = {
          page,
          context,
          browser,
          inUse: true,
          createdAt: new Date(),
        };

        this.pages.push(pooledPage);
        logger.info('[BrowserPool] Created new page with new browser instance');
        this.emit('page-acquired', page);
        return page;
      } catch (error) {
        logger.error(`[BrowserPool] Failed to create new page: ${error}`);
        throw fromUnknown(error, ErrorCode.BROWSER_ERROR);
      }
    }

    // Use existing browser to create new context and page
    const browser = this.browsers[0];
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      const pooledPage: PooledPage = {
        page,
        context,
        browser,
        inUse: true,
        createdAt: new Date(),
      };

      this.pages.push(pooledPage);
      logger.info('[BrowserPool] Created new page with existing browser');
      this.emit('page-acquired', page);
      return page;
    } catch (error) {
      logger.error(`[BrowserPool] Failed to create new page: ${error}`);
      throw error;
    }
  }

  /**
   * Release a page back to the pool and wake the next blocked acquirer, if any.
   */
  releasePage(page: Page): void {
    const pooledPage = this.pages.find(p => p.page === page);
    if (!pooledPage) {
      logger.warn('[BrowserPool] Attempted to release unknown page');
      return;
    }

    pooledPage.inUse = false;
    logger.info('[BrowserPool] Released page back to pool');
    this.emit('page-released', page);

    // Wake one blocked acquirer; it will find this freshly-freed page.
    const next = this.pendingResolvers.shift();
    if (next) {
      // Run on the next tick so releasePage stays synchronous from the
      // caller's perspective.
      Promise.resolve().then(() => next());
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalBrowsers: number;
    totalPages: number;
    pagesInUse: number;
    pagesAvailable: number;
    maxInstances: number;
  } {
    return {
      totalBrowsers: this.browsers.length,
      totalPages: this.pages.length,
      pagesInUse: this.pages.filter(p => p.inUse).length,
      pagesAvailable: this.pages.filter(p => !p.inUse).length,
      maxInstances: this.config.maxInstances,
    };
  }

  /**
   * Close all browsers and clean up
   */
  async close(): Promise<void> {
    logger.info('[BrowserPool] Closing browser pool...');
    this.emit('closing');

    // Close all pages and contexts
    for (const pooledPage of this.pages) {
      try {
        await pooledPage.context.close();
      } catch (error) {
        logger.error(`[BrowserPool] Error closing context: ${error}`);
      }
    }
    this.pages = [];

    // Close all browsers
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        logger.error(`[BrowserPool] Error closing browser: ${error}`);
      }
    }
    this.browsers = [];

    this.initialized = false;
    logger.info('[BrowserPool] Browser pool closed');
    this.emit('closed');
  }

  /**
   * Reset the singleton (for testing purposes)
   */
  static reset(): void {
    if (BrowserPool.instance) {
      BrowserPool.instance.close().catch(() => {});
      BrowserPool.instance = undefined as any;
    }
  }
}