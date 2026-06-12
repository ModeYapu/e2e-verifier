import { Page } from '@playwright/test';
import { PerformanceMetrics, PerformanceThresholds } from '../types';
import { logger } from '../utils/logger';

// Types for Performance API entries that may not be fully covered by lib
interface PerformanceEntryWithStart extends PerformanceEntry {
  startTime: number;
}

interface PerformanceResourceEntryWithTransfer extends PerformanceResourceTiming {
  transferSize: number;
}

const DEFAULT_THRESHOLDS: Required<PerformanceThresholds> = {
  fcp: 3000,
  lcp: 4000,
  loadTime: 5000,
  pageWeight: 5 * 1024 * 1024 // 5MB
};

export class PerformanceChecker {
  constructor(private page: Page, private thresholds?: PerformanceThresholds) {}

  async collectMetrics(): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    try {
      // Get performance navigation timing
      const navigationTiming = await this.page.evaluate(() => {
        const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const timing = entries[0];
        return timing ? {
          domContentLoaded: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
          loadTime: timing.loadEventEnd - timing.loadEventStart,
        } : {};
      });

      metrics.domContentLoaded = navigationTiming.domContentLoaded;
      metrics.loadTime = navigationTiming.loadTime;

      // Get Web Vitals (First Contentful Paint)
      const paintTiming = await this.page.evaluate(() => {
        const entries = performance.getEntriesByType('paint') as PerformanceEntryWithStart[];
        const fcp = entries.find((p) => p.name === 'first-contentful-paint');
        return fcp ? fcp.startTime : undefined;
      });
      metrics.fcp = paintTiming;

      // Get Largest Contentful Paint (needs observation)
      metrics.lcp = await this.getLCP();

      // Calculate page weight (transfer size)
      const pageWeight = await this.page.evaluate(() => {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceEntryWithTransfer[];
        return entries.reduce((total: number, entry) => total + (entry.transferSize || 0), 0);
      });
      metrics.pageWeight = pageWeight;

    } catch (error) {
      logger.error(`Error collecting performance metrics: ${error}`);
    }

    return metrics;
  }

  private async getLCP(): Promise<number | undefined> {
    try {
      return await this.page.evaluate(() => {
        return new Promise<number | undefined>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries() as PerformanceEntryWithStart[];
            const lastEntry = entries[entries.length - 1];
            resolve(lastEntry ? lastEntry.startTime : undefined);
          });
          observer.observe({ entryTypes: ['largest-contentful-paint'] });

          // Timeout after 5 seconds
          setTimeout(() => resolve(undefined), 5000);
        });
      });
    } catch (error) {
      logger.error(`Error getting LCP: ${error}`);
      return undefined;
    }
  }

  checkThresholds(metrics: PerformanceMetrics): boolean {
    const effectiveThresholds = { ...DEFAULT_THRESHOLDS, ...this.thresholds };

    // Check FCP
    if (metrics.fcp !== undefined && metrics.fcp > effectiveThresholds.fcp) {
      return false;
    }

    // Check LCP
    if (metrics.lcp !== undefined && metrics.lcp > effectiveThresholds.lcp) {
      return false;
    }

    // Check load time
    if (metrics.loadTime !== undefined && metrics.loadTime > effectiveThresholds.loadTime) {
      return false;
    }

    // Check page weight
    if (metrics.pageWeight !== undefined && metrics.pageWeight > effectiveThresholds.pageWeight) {
      return false;
    }

    return true;
  }

  getThresholdViolations(metrics: PerformanceMetrics): string[] {
    const violations: string[] = [];
    const effectiveThresholds = { ...DEFAULT_THRESHOLDS, ...this.thresholds };

    if (metrics.fcp !== undefined && metrics.fcp > effectiveThresholds.fcp) {
      violations.push(`FCP ${metrics.fcp.toFixed(0)}ms exceeds threshold ${effectiveThresholds.fcp}ms`);
    }

    if (metrics.lcp !== undefined && metrics.lcp > effectiveThresholds.lcp) {
      violations.push(`LCP ${metrics.lcp.toFixed(0)}ms exceeds threshold ${effectiveThresholds.lcp}ms`);
    }

    if (metrics.loadTime !== undefined && metrics.loadTime > effectiveThresholds.loadTime) {
      violations.push(`Load time ${metrics.loadTime.toFixed(0)}ms exceeds threshold ${effectiveThresholds.loadTime}ms`);
    }

    if (metrics.pageWeight !== undefined && metrics.pageWeight > effectiveThresholds.pageWeight) {
      const sizeKB = (metrics.pageWeight / 1024).toFixed(2);
      const thresholdKB = (effectiveThresholds.pageWeight / 1024).toFixed(2);
      violations.push(`Page weight ${sizeKB}KB exceeds threshold ${thresholdKB}KB`);
    }

    return violations;
  }

  formatMetrics(metrics: PerformanceMetrics): string {
    const parts: string[] = [];

    if (metrics.fcp !== undefined) parts.push(`FCP: ${metrics.fcp.toFixed(0)}ms`);
    if (metrics.lcp !== undefined) parts.push(`LCP: ${metrics.lcp.toFixed(0)}ms`);
    if (metrics.domContentLoaded !== undefined) {
      parts.push(`DCL: ${metrics.domContentLoaded.toFixed(0)}ms`);
    }
    if (metrics.loadTime !== undefined) parts.push(`Load: ${metrics.loadTime.toFixed(0)}ms`);
    if (metrics.pageWeight !== undefined) {
      const sizeKB = (metrics.pageWeight / 1024).toFixed(2);
      parts.push(`Size: ${sizeKB}KB`);
    }

    return parts.join(', ') || 'No metrics collected';
  }
}
