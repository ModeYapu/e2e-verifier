/**
 * Storage Service
 * Handles storage operations for trends, profiles, and results using ResultStore, TrendAnalyzer, and QualityProfileCalculator
 */

import { ResultStore } from '../../storage/result-store';
import { TrendAnalyzer } from '../../storage/trend-analyzer';
import { QualityProfileCalculator } from '../../storage/quality-profile';

export class StorageService {
  private resultStore: ResultStore;
  private trendAnalyzer: TrendAnalyzer;
  private qualityCalculator: QualityProfileCalculator;

  constructor() {
    this.resultStore = new ResultStore();
    this.trendAnalyzer = new TrendAnalyzer(this.resultStore);
    this.qualityCalculator = new QualityProfileCalculator(this.resultStore);
  }

  /**
   * Get result store instance
   */
  getResultStore(): ResultStore {
    return this.resultStore;
  }

  /**
   * Get trend analyzer instance
   */
  getTrendAnalyzer(): TrendAnalyzer {
    return this.trendAnalyzer;
  }

  /**
   * Get quality profile calculator instance
   */
  getQualityCalculator(): QualityProfileCalculator {
    return this.qualityCalculator;
  }

  /**
   * Save test result
   */
  saveResult(result: any): void {
    this.resultStore.save(result);
  }

  /**
   * Get all site names
   */
  getAllSiteNames(): string[] {
    return this.resultStore.getAllSiteNames();
  }

  /**
   * Get historical trend data for a site
   */
  getSiteTrends(siteName: string, days: number = 30): unknown {
    return this.trendAnalyzer.calculatePassRate(siteName, days);
  }

  /**
   * Get regression detection for a site
   */
  getSiteRegressions(siteName: string, recentDays: number = 7, historicalDays: number = 30, threshold: number = 10): unknown {
    return this.trendAnalyzer.detectRegressions(siteName, recentDays, historicalDays, threshold);
  }

  /**
   * Get all site quality profiles
   */
  getAllProfiles(days: number = 30, siteNames?: string[]): unknown[] {
    const allSiteNames = siteNames || this.resultStore.getAllSiteNames();
    return allSiteNames.map(siteName =>
      this.qualityCalculator.calculateProfile(siteName, days)
    );
  }

  /**
   * Get quality profile for a specific site
   */
  getSiteProfile(siteName: string, days: number = 30): unknown {
    return this.qualityCalculator.calculateProfile(siteName, days);
  }

}
