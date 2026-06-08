import { Page, Response, Request } from '@playwright/test';
import { NetworkResult, FailedRequest, SlowRequest } from '../types';

export class NetworkMonitor {
  private failedRequests: FailedRequest[] = [];
  private slowRequests: SlowRequest[] = [];
  private totalRequests: number = 0;
  private slowThreshold: number;
  private ignorePatterns: RegExp[];

  constructor(page: Page, slowThreshold: number = 3000, ignoreUrlPatterns: string[] = []) {
    this.slowThreshold = slowThreshold;
    this.ignorePatterns = ignoreUrlPatterns.map(p => new RegExp(p));
    this.setupListeners(page);
  }

  private setupListeners(page: Page): void {
    page.on('response', (response: Response) => {
      this.totalRequests++;
      const url = response.url();

      // Skip ignored patterns
      if (this.shouldIgnore(url)) return;

      const status = response.status();
      if (status >= 400) {
        this.failedRequests.push({ url, status });
      }
    });

    page.on('requestfinished', (request: Request) => {
      const url = request.url();

      // Skip ignored patterns
      if (this.shouldIgnore(url)) return;

      const timing = request.timing();
      if (timing && timing.responseEnd > 0) {
        const duration = timing.responseEnd - timing.requestStart;
        if (duration > this.slowThreshold) {
          this.slowRequests.push({ url, duration });
        }
      }
    });
  }

  private shouldIgnore(url: string): boolean {
    return this.ignorePatterns.some(pattern => pattern.test(url));
  }

  getResult(): NetworkResult {
    const passed = this.failedRequests.length === 0;
    return {
      passed,
      failedRequests: [...this.failedRequests],
      slowRequests: [...this.slowRequests],
      totalRequests: this.totalRequests
    };
  }

  formatResult(result: NetworkResult): string {
    const parts: string[] = [];
    parts.push(`${result.totalRequests} requests`);

    if (result.failedRequests.length > 0) {
      parts.push(`${result.failedRequests.length} failed`);
    }

    if (result.slowRequests.length > 0) {
      parts.push(`${result.slowRequests.length} slow`);
    }

    return parts.join(', ') || 'No issues';
  }

  reset(): void {
    this.failedRequests = [];
    this.slowRequests = [];
    this.totalRequests = 0;
  }
}
