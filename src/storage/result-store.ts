/**
 * Result Store for persisting test results
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestResult } from '../types';
import { logger } from '../utils/logger';

/**
 * Date range filter
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Aggregated statistics
 */
export interface AggregatedStats {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgDuration: number;
  byDate: Record<string, { total: number; passed: number; failed: number }>;
}

/**
 * Result Store class for managing persistent test result storage
 */
export class ResultStore {
  private dataDir: string;
  private resultsDir: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.resultsDir = path.join(dataDir, 'results');
    this.ensureDataDir();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * Get site directory path
   */
  private getSiteDir(siteName: string): string {
    const siteDir = path.join(this.resultsDir, this.sanitizeSiteName(siteName));
    if (!fs.existsSync(siteDir)) {
      fs.mkdirSync(siteDir, { recursive: true });
    }
    return siteDir;
  }

  /**
   * Sanitize site name for filesystem
   */
  private sanitizeSiteName(siteName: string): string {
    return siteName.replace(/[^a-z0-9_-]/gi, '_');
  }

  /**
   * Get file path for a specific date
   */
  private getFilePath(siteName: string, date: Date): string {
    const siteDir = this.getSiteDir(siteName);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(siteDir, `${dateStr}.json`);
  }

  /**
   * Load results for a specific site and date
   */
  private loadResults(siteName: string, date: Date): TestResult[] {
    const filePath = this.getFilePath(siteName, date);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        return data.results || [];
      }
      return [];
    } catch (error) {
      logger.error(`[ResultStore] Error loading results from ${filePath}: ${error}`);
      return [];
    }
  }

  /**
   * Save results to file with atomic write
   */
  private saveResults(siteName: string, date: Date, results: TestResult[]): void {
    const filePath = this.getFilePath(siteName, date);
    try {
      const content = JSON.stringify({ results, lastUpdated: new Date().toISOString() }, null, 2);
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      logger.error(`[ResultStore] Error saving results to ${filePath}: ${error}`);
      throw error;
    }
  }

  /**
   * Save a test result
   */
  save(result: TestResult): void {
    const date = new Date(result.timestamp);
    const existingResults = this.loadResults(result.siteName, date);
    existingResults.push(result);
    this.saveResults(result.siteName, date, existingResults);
    logger.info(`[ResultStore] Saved result for ${result.siteName} at ${result.timestamp}`);
  }

  /**
   * Get results by site and date range
   */
  getBySite(siteName: string, dateRange?: DateRange): TestResult[] {
    if (!dateRange) {
      // Return all results for the site
      const siteDir = this.getSiteDir(siteName);
      const allResults: TestResult[] = [];

      try {
        const files = fs.readdirSync(siteDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const dateStr = file.replace('.json', '');
            const date = new Date(dateStr);
            const results = this.loadResults(siteName, date);
            allResults.push(...results);
          }
        }
      } catch (error) {
        logger.error(`[ResultStore] Error reading site directory ${siteDir}: ${error}`);
      }

      return allResults.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }

    // Return results within date range
    const results: TestResult[] = [];
    const currentDate = new Date(dateRange.start);

    while (currentDate <= dateRange.end) {
      const dayResults = this.loadResults(siteName, currentDate);
      results.push(...dayResults);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results.filter(result => {
      const resultDate = new Date(result.timestamp);
      return resultDate >= dateRange.start && resultDate <= dateRange.end;
    }).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get results by date (all sites)
   */
  getByDate(date: Date): TestResult[] {
    const allResults: TestResult[] = [];

    try {
      const siteDirs = fs.readdirSync(this.resultsDir);
      for (const siteDir of siteDirs) {
        const siteName = siteDir;
        const results = this.loadResults(siteName, date);
        allResults.push(...results);
      }
    } catch (error) {
      logger.error(`[ResultStore] Error reading results directory ${this.resultsDir}: ${error}`);
    }

    return allResults.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get aggregated statistics for a site over a period
   */
  getAggregated(siteName: string, period: 'day' | 'week' | 'month' = 'day'): AggregatedStats {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const results = this.getBySite(siteName, { start: startDate, end: now });
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const avgDuration = total > 0
      ? results.reduce((sum, r) => sum + r.duration, 0) / total
      : 0;

    // Group by date
    const byDate: Record<string, { total: number; passed: number; failed: number }> = {};
    for (const result of results) {
      const dateStr = new Date(result.timestamp).toISOString().split('T')[0];
      if (!byDate[dateStr]) {
        byDate[dateStr] = { total: 0, passed: 0, failed: 0 };
      }
      byDate[dateStr].total++;
      if (result.passed) {
        byDate[dateStr].passed++;
      } else {
        byDate[dateStr].failed++;
      }
    }

    return {
      total,
      passed,
      failed,
      passRate,
      avgDuration,
      byDate
    };
  }

  /**
   * Get all available site names
   */
  getAllSiteNames(): string[] {
    try {
      const siteDirs = fs.readdirSync(this.resultsDir);
      return siteDirs.map(dir => dir.replace(/_/g, ' ')); // Reverse sanitization for display
    } catch (error) {
      logger.error(`[ResultStore] Error reading results directory: ${error}`);
      return [];
    }
  }

  /**
   * Get results by project sites
   */
  getByProject(projectSites: string[], dateRange?: DateRange): TestResult[] {
    const allResults: TestResult[] = [];

    for (const siteName of projectSites) {
      const siteResults = this.getBySite(siteName, dateRange);
      allResults.push(...siteResults);
    }

    return allResults.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get aggregated statistics for project sites over a period
   */
  getAggregatedForProject(projectSites: string[], period: 'day' | 'week' | 'month' = 'day'): AggregatedStats {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const results = this.getByProject(projectSites, { start: startDate, end: now });
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const avgDuration = total > 0
      ? results.reduce((sum, r) => sum + r.duration, 0) / total
      : 0;

    // Group by date
    const byDate: Record<string, { total: number; passed: number; failed: number }> = {};
    for (const result of results) {
      const dateStr = new Date(result.timestamp).toISOString().split('T')[0];
      if (!byDate[dateStr]) {
        byDate[dateStr] = { total: 0, passed: 0, failed: 0 };
      }
      byDate[dateStr].total++;
      if (result.passed) {
        byDate[dateStr].passed++;
      } else {
        byDate[dateStr].failed++;
      }
    }

    return {
      total,
      passed,
      failed,
      passRate,
      avgDuration,
      byDate
    };
  }

  /**
   * Delete old results (cleanup)
   */
  deleteOldResults(daysToKeep: number = 90): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const siteDirs = fs.readdirSync(this.resultsDir);
      for (const siteDir of siteDirs) {
        const sitePath = path.join(this.resultsDir, siteDir);
        const files = fs.readdirSync(sitePath);

        for (const file of files) {
          if (file.endsWith('.json')) {
            const dateStr = file.replace('.json', '');
            const fileDate = new Date(dateStr);

            if (fileDate < cutoffDate) {
              const filePath = path.join(sitePath, file);
              fs.unlinkSync(filePath);
              logger.info(`[ResultStore] Deleted old result file: ${filePath}`);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[ResultStore] Error during cleanup: ${error}`);
    }
  }

  /**
   * Get release directory path
   */
  private getReleaseDir(siteName: string): string {
    const releaseDir = path.join(this.dataDir, 'releases', this.sanitizeSiteName(siteName));
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    return releaseDir;
  }

  /**
   * Save a result with release tag
   */
  saveWithRelease(result: TestResult, release: string): void {
    // Save normally
    this.save(result);

    // Also save in release-specific location
    const releaseDir = this.getReleaseDir(result.siteName);
    const releaseFile = path.join(releaseDir, `${this.sanitizeSiteName(release)}.json`);

    try {
      let releaseResults: TestResult[] = [];
      if (fs.existsSync(releaseFile)) {
        const content = fs.readFileSync(releaseFile, 'utf-8');
        const data = JSON.parse(content);
        releaseResults = data.results || [];
      }

      // Add result with release metadata
      const resultWithRelease = {
        ...result,
        release
      };
      releaseResults.push(resultWithRelease);

      const content = JSON.stringify({
        release,
        results: releaseResults,
        lastUpdated: new Date().toISOString()
      }, null, 2);

      fs.writeFileSync(releaseFile, content, 'utf-8');
      logger.info(`[ResultStore] Saved result for ${result.siteName} (release: ${release})`);
    } catch (error) {
      logger.error(`[ResultStore] Error saving release result: ${error}`);
    }
  }

  /**
   * Get results by release tag
   */
  getByRelease(siteName: string, release: string): TestResult[] {
    const releaseDir = this.getReleaseDir(siteName);
    const releaseFile = path.join(releaseDir, `${this.sanitizeSiteName(release)}.json`);

    try {
      if (fs.existsSync(releaseFile)) {
        const content = fs.readFileSync(releaseFile, 'utf-8');
        const data = JSON.parse(content);
        return data.results || [];
      }
      return [];
    } catch (error) {
      logger.error(`[ResultStore] Error loading release results: ${error}`);
      return [];
    }
  }

  /**
   * Get all available releases for a site
   */
  getAvailableReleases(siteName: string): string[] {
    const releaseDir = this.getReleaseDir(siteName);

    try {
      if (!fs.existsSync(releaseDir)) {
        return [];
      }

      const files = fs.readdirSync(releaseDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      logger.error(`[ResultStore] Error reading releases: ${error}`);
      return [];
    }
  }
}