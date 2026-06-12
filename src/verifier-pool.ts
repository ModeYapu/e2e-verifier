import { chromium, Browser } from '@playwright/test';
import { SiteConfig, TestResult } from './types';
import { Verifier } from './verifier';
import { BrowserPool } from './browser/browser-pool';

export interface VerifyAllOptions {
  parallel?: number;
}

export class VerifierPool {
  private browserPool: BrowserPool;

  constructor() {
    this.browserPool = BrowserPool.getInstance({
      maxInstances: 2,
      headless: true,
    });
  }

  async init(): Promise<void> {
    // BrowserPool initializes lazily, no explicit init needed
  }

  async close(): Promise<void> {
    await this.browserPool.close();
  }

  async verify(config: SiteConfig): Promise<TestResult> {
    const verifier = new Verifier(config, this.browserPool);
    return verifier.verify();
  }

  async verifyAll(configs: SiteConfig[], options?: VerifyAllOptions): Promise<TestResult[]> {
    await this.init();

    const parallel = options?.parallel || 1;
    const results: TestResult[] = [];

    if (parallel <= 1) {
      for (const config of configs) {
        results.push(await this.verify(config));
      }
    } else {
      const chunks = this.chunkArray(configs, parallel);
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(config => this.verify(config))
        );
        results.push(...chunkResults);
      }
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  getBrowserPool(): BrowserPool {
    return this.browserPool;
  }
}
