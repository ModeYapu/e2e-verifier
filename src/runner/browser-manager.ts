/**
 * Browser Manager for Multi-Browser Support
 * Manages browser instances with lazy initialization and graceful shutdown
 */

import { chromium, webkit, firefox, Browser, BrowserType as PlaywrightBrowserType } from '@playwright/test';
import { Logger } from '../utils/logger';

export type BrowserType = 'chromium' | 'webkit' | 'firefox';

/**
 * Browser instance holder
 */
interface BrowserInstance {
  browser: Browser;
  refCount: number;
}

/**
 * Browser Manager class
 * Implements lazy initialization and browser pooling
 */
export class BrowserManager {
  private browsers: Map<BrowserType, BrowserInstance> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ prefix: 'BrowserManager' });
  }

  /**
   * Get or create a browser instance (lazy initialization)
   */
  async getBrowser(type: BrowserType = 'chromium'): Promise<Browser> {
    // Check if browser already exists
    if (this.browsers.has(type)) {
      const instance = this.browsers.get(type)!;
      instance.refCount++;
      this.logger.debug(`Reusing existing ${type} browser (ref count: ${instance.refCount})`);
      return instance.browser;
    }

    // Create new browser instance
    this.logger.info(`Launching new ${type} browser...`);
    const browser = await this.launchBrowser(type);

    const instance: BrowserInstance = {
      browser,
      refCount: 1
    };

    this.browsers.set(type, instance);
    this.logger.info(`${type} browser launched successfully`);
    return browser;
  }

  /**
   * Release a browser reference (decrement ref count)
   */
  releaseBrowser(type: BrowserType): void {
    const instance = this.browsers.get(type);
    if (!instance) {
      this.logger.warn(`Attempted to release non-existent ${type} browser`);
      return;
    }

    instance.refCount--;
    this.logger.debug(`Released ${type} browser (ref count: ${instance.refCount})`);

    // Close browser if no more references
    if (instance.refCount <= 0) {
      this.closeBrowser(type);
    }
  }

  /**
   * Launch a specific browser type
   */
  private async launchBrowser(type: BrowserType): Promise<Browser> {
    try {
      let browserType: PlaywrightBrowserType;

      switch (type) {
        case 'chromium':
          browserType = chromium;
          break;
        case 'webkit':
          browserType = webkit;
          break;
        case 'firefox':
          browserType = firefox;
          break;
        default:
          throw new Error(`Unsupported browser type: ${type}`);
      }

      return await browserType.launch({ headless: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to launch ${type} browser: ${errorMessage}`);

      // Check if browser is not installed
      if (errorMessage.includes('Executable doesn\'t exist') ||
          errorMessage.includes('browser is not installed')) {
        throw new Error(
          `${type} browser is not installed. Run: npx playwright install ${type}`
        );
      }

      throw error;
    }
  }

  /**
   * Close a specific browser
   */
  private async closeBrowser(type: BrowserType): Promise<void> {
    const instance = this.browsers.get(type);
    if (!instance) {
      return;
    }

    try {
      await instance.browser.close();
      this.browsers.delete(type);
      this.logger.info(`Closed ${type} browser`);
    } catch (error) {
      this.logger.error(`Error closing ${type} browser: ${error}`);
    }
  }

  /**
   * Close all browsers gracefully
   */
  async closeAll(): Promise<void> {
    this.logger.info('Closing all browsers...');

    const closePromises = Array.from(this.browsers.entries()).map(
      async ([type, instance]) => {
        try {
          await instance.browser.close();
          this.logger.info(`Closed ${type} browser`);
        } catch (error) {
          this.logger.error(`Error closing ${type} browser: ${error}`);
        }
      }
    );

    await Promise.all(closePromises);
    this.browsers.clear();
    this.logger.info('All browsers closed');
  }

  /**
   * Get statistics about current browser instances
   */
  getStats(): { [key: string]: { refCount: number } } {
    const stats: { [key: string]: { refCount: number } } = {};

    for (const [type, instance] of this.browsers.entries()) {
      stats[type] = {
        refCount: instance.refCount
      };
    }

    return stats;
  }

  /**
   * Check if a browser type is available
   */
  hasBrowser(type: BrowserType): boolean {
    return this.browsers.has(type);
  }
}
