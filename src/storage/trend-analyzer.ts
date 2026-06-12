/**
 * Trend Analyzer for historical test analysis
 */

import { ResultStore } from './result-store';
import { TestResult } from '../types';

/**
 * Pass rate trend data
 */
export interface PassRateTrend {
  siteName: string;
  period: number; // days
  overall: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  daily: Array<{
    date: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
}

/**
 * Regression detection result
 */
export interface RegressionResult {
  siteName: string;
  hasRegression: boolean;
  recentPassRate: number;
  historicalPassRate: number;
  difference: number;
  threshold: number;
  recentSample: {
    total: number;
    passed: number;
    failed: number;
  };
  historicalSample: {
    total: number;
    passed: number;
    failed: number;
  };
  recommendation: string;
}

/**
 * Failure mode cluster
 */
export interface FailureCluster {
  errorPattern: string;
  count: number;
  percentage: number;
  firstSeen: string;
  lastSeen: string;
  examples: Array<{
    timestamp: string;
    url: string;
    errors: string[];
  }>;
}

/**
 * Environment comparison result
 */
export interface EnvironmentComparison {
  siteName: string;
  metric: string;
  environments: Array<{
    name: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgDuration: number;
  }>;
  significantDiff: boolean;
  recommendation: string;
}

/**
 * Trend Analyzer class
 */
export class TrendAnalyzer {
  private resultStore: ResultStore;

  constructor(resultStore?: ResultStore) {
    this.resultStore = resultStore || new ResultStore();
  }

  /**
   * Calculate historical pass rate over N days
   */
  calculatePassRate(siteName: string, days: number = 30): PassRateTrend {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const results = this.resultStore.getBySite(siteName, { start: startDate, end: now });

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    // Group by day
    const dailyData: Map<string, { total: number; passed: number; failed: number }> = new Map();

    for (const result of results) {
      const dateStr = new Date(result.timestamp).toISOString().split('T')[0];
      if (!dailyData.has(dateStr)) {
        dailyData.set(dateStr, { total: 0, passed: 0, failed: 0 });
      }
      const dayData = dailyData.get(dateStr)!;
      dayData.total++;
      if (result.passed) {
        dayData.passed++;
      } else {
        dayData.failed++;
      }
    }

    // Convert to array and sort by date
    const daily = Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        total: data.total,
        passed: data.passed,
        failed: data.failed,
        passRate: data.total > 0 ? (data.passed / data.total) * 100 : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      siteName,
      period: days,
      overall: {
        total,
        passed,
        failed,
        passRate
      },
      daily
    };
  }

  /**
   * Detect regressions by comparing recent vs historical performance
   */
  detectRegressions(siteName: string, recentDays: number = 7, historicalDays: number = 30, threshold: number = 10): RegressionResult {
    const now = new Date();
    const recentStart = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
    const historicalStart = new Date(now.getTime() - (recentDays + historicalDays) * 24 * 60 * 60 * 1000);
    const historicalEnd = recentStart;

    const recentResults = this.resultStore.getBySite(siteName, { start: recentStart, end: now });
    const historicalResults = this.resultStore.getBySite(siteName, { start: historicalStart, end: historicalEnd });

    const recentTotal = recentResults.length;
    const recentPassed = recentResults.filter(r => r.passed).length;
    const recentFailed = recentTotal - recentPassed;
    const recentPassRate = recentTotal > 0 ? (recentPassed / recentTotal) * 100 : 0;

    const historicalTotal = historicalResults.length;
    const historicalPassed = historicalResults.filter(r => r.passed).length;
    const historicalFailed = historicalTotal - historicalPassed;
    const historicalPassRate = historicalTotal > 0 ? (historicalPassed / historicalTotal) * 100 : 0;

    const difference = historicalPassRate - recentPassRate;
    const hasRegression = difference > threshold && recentTotal >= 5;

    let recommendation = '';
    if (hasRegression) {
      recommendation = `Pass rate dropped by ${difference.toFixed(1)}% from ${historicalPassRate.toFixed(1)}% to ${recentPassRate.toFixed(1)}%. This indicates a potential regression that should be investigated.`;
    } else if (recentTotal < 5) {
      recommendation = `Insufficient recent data (${recentTotal} tests) to detect regression. Need at least 5 recent tests.`;
    } else {
      recommendation = `No significant regression detected. Current pass rate (${recentPassRate.toFixed(1)}%) is within acceptable range of historical average (${historicalPassRate.toFixed(1)}%).`;
    }

    return {
      siteName,
      hasRegression,
      recentPassRate,
      historicalPassRate,
      difference,
      threshold,
      recentSample: {
        total: recentTotal,
        passed: recentPassed,
        failed: recentFailed
      },
      historicalSample: {
        total: historicalTotal,
        passed: historicalPassed,
        failed: historicalFailed
      },
      recommendation
    };
  }

  /**
   * Cluster failure modes by error pattern
   */
  clusterFailureModes(siteName: string, days: number = 30): FailureCluster[] {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const results = this.resultStore.getBySite(siteName, { start: startDate, end: now });
    const failedResults = results.filter(r => !r.passed);

    // Group by error pattern
    const patternMap: Map<string, {
      count: number;
      examples: Array<{ timestamp: string; url: string; errors: string[] }>;
      firstSeen: Date;
      lastSeen: Date;
    }> = new Map();

    for (const result of failedResults) {
      for (const error of result.errors) {
        // Normalize error message to create pattern
        const pattern = this.normalizeErrorPattern(error);

        if (!patternMap.has(pattern)) {
          patternMap.set(pattern, {
            count: 0,
            examples: [],
            firstSeen: new Date(result.timestamp),
            lastSeen: new Date(result.timestamp)
          });
        }

        const cluster = patternMap.get(pattern)!;
        cluster.count++;

        // Add example if we have fewer than 3
        if (cluster.examples.length < 3) {
          cluster.examples.push({
            timestamp: result.timestamp,
            url: result.url,
            errors: result.errors
          });
        }

        // Update timestamps
        const resultDate = new Date(result.timestamp);
        if (resultDate < cluster.firstSeen) {
          cluster.firstSeen = resultDate;
        }
        if (resultDate > cluster.lastSeen) {
          cluster.lastSeen = resultDate;
        }
      }
    }

    const totalFailures = failedResults.length;

    // Convert to array and sort by frequency
    return Array.from(patternMap.entries())
      .map(([errorPattern, data]) => ({
        errorPattern,
        count: data.count,
        percentage: totalFailures > 0 ? (data.count / totalFailures) * 100 : 0,
        firstSeen: data.firstSeen.toISOString(),
        lastSeen: data.lastSeen.toISOString(),
        examples: data.examples
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Compare results across different environments (browsers/viewports)
   */
  compareEnvironments(siteName: string, days: number = 30): EnvironmentComparison[] {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const results = this.resultStore.getBySite(siteName, { start: startDate, end: now });

    // For now, we'll compare by viewport size if available
    // This can be extended to browsers, locales, etc.
    const environmentMap: Map<string, {
      total: number;
      passed: number;
      failed: number;
      durations: number[];
    }> = new Map();

    for (const result of results) {
      // Try to extract viewport from result details or use a default
      let envName = 'default';
      if (result.checks) {
        const viewportCheck = result.checks.find(c => c.type === 'responsive');
        if (viewportCheck?.details && typeof viewportCheck.details === 'object' && 'viewports' in viewportCheck.details) {
          const details = viewportCheck.details as { viewports?: unknown[] };
          if (details.viewports && Array.isArray(details.viewports) && details.viewports.length > 0) {
            envName = `viewport-${details.viewports[0] || 'default'}`;
          }
        }
      }

      if (!environmentMap.has(envName)) {
        environmentMap.set(envName, { total: 0, passed: 0, failed: 0, durations: [] });
      }

      const env = environmentMap.get(envName)!;
      env.total++;
      if (result.passed) {
        env.passed++;
      } else {
        env.failed++;
      }
      env.durations.push(result.duration);
    }

    const environments = Array.from(environmentMap.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      passed: data.passed,
      failed: data.failed,
      passRate: data.total > 0 ? (data.passed / data.total) * 100 : 0,
      avgDuration: data.durations.length > 0
        ? data.durations.reduce((sum, d) => sum + d, 0) / data.durations.length
        : 0
    }));

    // Calculate if there's significant difference
    const passRates = environments.map(e => e.passRate);
    const maxRate = Math.max(...passRates);
    const minRate = Math.min(...passRates);
    const significantDiff = (maxRate - minRate) > 15; // 15% threshold

    let recommendation = '';
    if (significantDiff) {
      const worstEnv = environments.find(e => e.passRate === minRate);
      const bestEnv = environments.find(e => e.passRate === maxRate);
      recommendation = `Significant performance difference detected between environments. ${worstEnv?.name} (${minRate.toFixed(1)}%) vs ${bestEnv?.name} (${maxRate.toFixed(1)}%). Consider investigating environment-specific issues.`;
    } else {
      recommendation = 'No significant performance differences detected across environments.';
    }

    return [{
      siteName,
      metric: 'pass_rate',
      environments,
      significantDiff,
      recommendation
    }];
  }

  /**
   * Normalize error message to create a pattern
   */
  private normalizeErrorPattern(error: string): string {
    // Remove specific values, URLs, timestamps, etc.
    return error
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, '[timestamp]')
      .replace(/https?:\/\/[^\s]+/g, '[url]')
      .replace(/\b\d+\b/g, '[number]')
      .replace(/\b\d+\.\d+\b/g, '[decimal]')
      .replace(/selector\s*:\s*[^,\]]+/gi, 'selector: [selector]')
      .replace(/expected\s*:\s*[^,\]]+/gi, 'expected: [value]')
      .replace(/got\s*:\s*[^,\]]+/gi, 'got: [value]')
      .trim();
  }
}