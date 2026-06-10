/**
 * Quality Profile for site health assessment
 */

import { ResultStore } from './result-store';
import { TrendAnalyzer } from './trend-analyzer';
import { TestResult } from '../types';

/**
 * Quality trend direction
 */
export type TrendDirection = 'improving' | 'stable' | 'degrading';

/**
 * Dimension scores
 */
export interface DimensionScores {
  performance: number;      // 0-100
  accessibility: number;    // 0-100
  seo: number;              // 0-100
  functionality: number;    // 0-100
}

/**
 * Risk item
 */
export interface RiskItem {
  category: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  count: number;
  lastOccurrence: string;
}

/**
 * Quality profile for a site
 */
export interface QualityProfile {
  siteName: string;
  overallScore: number;     // 0-100
  dimensionScores: DimensionScores;
  trendDirection: TrendDirection;
  riskItems: RiskItem[];
  lastUpdated: string;
  dataPoints: number;
  period: string;           // Analysis period (e.g., "30 days")
}

/**
 * All site profiles
 */
export type AllProfiles = Record<string, QualityProfile>;

/**
 * Quality Profile Calculator
 */
export class QualityProfileCalculator {
  private resultStore: ResultStore;
  private trendAnalyzer: TrendAnalyzer;

  constructor(resultStore?: ResultStore) {
    this.resultStore = resultStore || new ResultStore();
    this.trendAnalyzer = new TrendAnalyzer(this.resultStore);
  }

  /**
   * Calculate quality profile for a site
   */
  calculateProfile(siteName: string, days: number = 30): QualityProfile {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const results = this.resultStore.getBySite(siteName, { start: startDate, end: now });

    if (results.length === 0) {
      return this.createEmptyProfile(siteName, days);
    }

    // Calculate dimension scores
    const dimensionScores = this.calculateDimensionScores(results);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore(dimensionScores);

    // Determine trend direction
    const trendDirection = this.determineTrend(siteName, days);

    // Identify risk items
    const riskItems = this.identifyRisks(siteName, results);

    return {
      siteName,
      overallScore,
      dimensionScores,
      trendDirection,
      riskItems,
      lastUpdated: now.toISOString(),
      dataPoints: results.length,
      period: `${days} days`
    };
  }

  /**
   * Get all site profiles
   */
  getAllProfiles(days: number = 30): AllProfiles {
    const siteNames = this.resultStore.getAllSiteNames();
    const profiles: AllProfiles = {};

    for (const siteName of siteNames) {
      profiles[siteName] = this.calculateProfile(siteName, days);
    }

    return profiles;
  }

  /**
   * Calculate dimension scores from test results
   */
  private calculateDimensionScores(results: TestResult[]): DimensionScores {
    const scores: DimensionScores = {
      performance: 0,
      accessibility: 0,
      seo: 0,
      functionality: 0
    };

    let perfCount = 0, a11yCount = 0, seoCount = 0, funcCount = 0;
    let perfTotal = 0, a11yTotal = 0, seoTotal = 0, funcTotal = 0;

    for (const result of results) {
      // Functionality score: based on overall pass/fail
      funcTotal += result.passed ? 100 : 0;
      funcCount++;

      // Extract dimension-specific scores from checks
      for (const check of result.checks) {
        switch (check.type) {
          case 'performance':
            perfTotal += check.passed ? 100 : 0;
            perfCount++;
            break;
          case 'accessibility':
            a11yTotal += check.passed ? 100 : 0;
            a11yCount++;
            break;
          case 'seo':
            seoTotal += check.passed ? 100 : 0;
            seoCount++;
            break;
        }
      }
    }

    // Calculate averages
    scores.functionality = funcCount > 0 ? funcTotal / funcCount : 0;
    scores.performance = perfCount > 0 ? perfTotal / perfCount : 0;
    scores.accessibility = a11yCount > 0 ? a11yTotal / a11yCount : 0;
    scores.seo = seoCount > 0 ? seoTotal / seoCount : 0;

    return scores;
  }

  /**
   * Calculate overall score with weighted dimensions
   */
  private calculateOverallScore(dimensions: DimensionScores): number {
    // Weights: functionality (40%), performance (25%), accessibility (20%), SEO (15%)
    return (
      dimensions.functionality * 0.40 +
      dimensions.performance * 0.25 +
      dimensions.accessibility * 0.20 +
      dimensions.seo * 0.15
    );
  }

  /**
   * Determine trend direction
   */
  private determineTrend(siteName: string, days: number): TrendDirection {
    // Compare recent half vs older half of the period
    const halfDays = Math.floor(days / 2);
    const recentTrend = this.trendAnalyzer.calculatePassRate(siteName, halfDays);
    const olderTrend = this.trendAnalyzer.calculatePassRate(siteName, days);

    const recentRate = recentTrend.overall.passRate;
    const olderRate = olderTrend.overall.passRate;

    if (recentRate - olderRate > 5) {
      return 'improving';
    } else if (olderRate - recentRate > 5) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * Identify risk items from failed tests
   */
  private identifyRisks(siteName: string, results: TestResult[]): RiskItem[] {
    const risks: RiskItem[] = [];
    const failureClusters = this.trendAnalyzer.clusterFailureModes(siteName, 30);

    for (const cluster of failureClusters) {
      let severity: 'high' | 'medium' | 'low' = 'low';

      if (cluster.percentage > 30) {
        severity = 'high';
      } else if (cluster.percentage > 15) {
        severity = 'medium';
      }

      risks.push({
        category: 'Test Failure',
        severity,
        description: cluster.errorPattern,
        count: cluster.count,
        lastOccurrence: cluster.lastSeen
      });
    }

    // Check for performance risks
    const slowTests = results.filter(r => r.duration > 30000); // > 30 seconds
    if (slowTests.length > 0) {
      risks.push({
        category: 'Performance',
        severity: slowTests.length > results.length * 0.2 ? 'high' : 'medium',
        description: `${slowTests.length} tests took longer than 30 seconds`,
        count: slowTests.length,
        lastOccurrence: slowTests[slowTests.length - 1]?.timestamp || new Date().toISOString()
      });
    }

    // Check for accessibility risks
    const a11yFailures = results.filter(r =>
      r.checks.some(c => c.type === 'accessibility' && !c.passed)
    );
    if (a11yFailures.length > 0) {
      risks.push({
        category: 'Accessibility',
        severity: 'medium',
        description: 'Accessibility checks failing consistently',
        count: a11yFailures.length,
        lastOccurrence: a11yFailures[a11yFailures.length - 1]?.timestamp || new Date().toISOString()
      });
    }

    return risks.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Create empty profile for sites with no data
   */
  private createEmptyProfile(siteName: string, days: number): QualityProfile {
    return {
      siteName,
      overallScore: 0,
      dimensionScores: {
        performance: 0,
        accessibility: 0,
        seo: 0,
        functionality: 0
      },
      trendDirection: 'stable',
      riskItems: [],
      lastUpdated: new Date().toISOString(),
      dataPoints: 0,
      period: `${days} days`
    };
  }

  /**
   * Get score classification
   */
  static getScoreClassification(score: number): { label: string; color: string } {
    if (score >= 90) {
      return { label: 'Excellent', color: 'green' };
    } else if (score >= 75) {
      return { label: 'Good', color: 'light-green' };
    } else if (score >= 60) {
      return { label: 'Fair', color: 'yellow' };
    } else if (score >= 40) {
      return { label: 'Poor', color: 'orange' };
    } else {
      return { label: 'Critical', color: 'red' };
    }
  }
}