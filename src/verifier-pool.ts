import { chromium, Browser } from '@playwright/test';
import { SiteConfig, TestResult } from './types';
import { Verifier } from './verifier';

export interface VerifyAllOptions {
  parallel?: number;
}

export class VerifierPool {
  private browser: Browser | null = null;

  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async verify(config: SiteConfig): Promise<TestResult> {
    if (!this.browser) {
      throw new Error('Pool not initialized. Call init() first.');
    }
    const verifier = new Verifier(config, this.browser);
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

  getBrowser(): Browser | null {
    return this.browser;
  }
}
