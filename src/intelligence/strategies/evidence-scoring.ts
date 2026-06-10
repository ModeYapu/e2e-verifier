/**
 * Evidence Scoring Strategy — Aggregated Evidence Analysis
 *
 * Aggregates results from all verification strategies and produces:
 * - Weighted confidence calculation
 * - Overall verdict with evidence chain
 * - Final verification report with recommendations
 */

import { VerificationStrategy, StrategyVerdict, StrategyIssue, VerificationContext, VerificationReport, Recommendation } from '../verification-types';
import { ScenarioResult } from '../types';

export class EvidenceScoringStrategy implements VerificationStrategy {
  name = 'evidence-scoring';

  /** Default strategy weights */
  private readonly DEFAULT_WEIGHTS: Map<string, number> = new Map([
    ['logic-check', 0.3],        // Logic consistency is most important
    ['visual-consistency', 0.2], // Visual checks are important
    ['cross-reference', 0.25],    // Cross-validation is very important
    ['edge-case', 0.15],          // Edge case analysis is moderately important
    ['evidence-scoring', 0.1],    // Self-weight is minimal
  ]);

  /** Configuration */
  private weights: Map<string, number>;
  private confidenceThreshold: number;
  private evidenceAggregationMethod: 'weighted' | 'average' | 'minimum';

  constructor(config?: {
    weights?: Map<string, number>;
    confidenceThreshold?: number;
    evidenceAggregationMethod?: 'weighted' | 'average' | 'minimum';
  }) {
    this.weights = config?.weights || this.DEFAULT_WEIGHTS;
    this.confidenceThreshold = config?.confidenceThreshold || 0.7;
    this.evidenceAggregationMethod = config?.evidenceAggregationMethod || 'weighted';
  }

  async verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict> {
    // This strategy requires other strategy results to be passed in context
    const strategyVerdicts = context.options?.strategyOptions?.get('strategyVerdicts') as Map<string, StrategyVerdict>;

    if (!strategyVerdicts || strategyVerdicts.size === 0) {
      // If no other strategies run, return basic verdict
      return {
        passed: result.passed,
        confidence: result.passed ? 0.8 : 0.2,
        evidence: ['Basic verification based on result.passed'],
        issues: [],
        metadata: {
          aggregationMethod: this.evidenceAggregationMethod,
          note: 'No other strategy results provided for aggregation',
        },
      };
    }

    // Aggregate all strategy results
    const aggregatedVerdict = this.aggregateStrategyVerdicts(strategyVerdicts, result);
    const allIssues = this.collectAllIssues(strategyVerdicts);
    const allEvidence = this.collectAllEvidence(strategyVerdicts);
    const recommendations = this.generateRecommendations(strategyVerdicts, result);

    return {
      passed: aggregatedVerdict.passed,
      confidence: aggregatedVerdict.confidence,
      evidence: allEvidence,
      issues: allIssues,
      metadata: {
        aggregationMethod: this.evidenceAggregationMethod,
        strategiesAggregated: Array.from(strategyVerdicts.keys()),
        overallPassed: aggregatedVerdict.passed,
        overallConfidence: aggregatedVerdict.confidence,
        recommendations: recommendations.map(r => r.description),
      },
    };
  }

  /**
   * Generate final verification report
   */
  generateVerificationReport(
    result: ScenarioResult,
    context: VerificationContext,
    strategyVerdicts: Map<string, StrategyVerdict>
  ): VerificationReport {
    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(strategyVerdicts);

    // Determine overall passed status
    const overallPassed = this.determineOverallPassed(strategyVerdicts, overallConfidence);

    // Collect all verdicts
    const verdicts = strategyVerdicts;

    // Generate summary
    const summary = this.generateSummary(strategyVerdicts, overallPassed, overallConfidence);

    // Generate recommendations
    const recommendations = this.generateRecommendations(strategyVerdicts, result);

    return {
      overallPassed,
      overallConfidence,
      verdicts,
      summary,
      recommendations,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        strategiesUsed: Array.from(strategyVerdicts.keys()),
        totalDuration: result.duration,
      },
    };
  }

  /**
   * Aggregate strategy verdicts
   */
  private aggregateStrategyVerdicts(
    strategyVerdicts: Map<string, StrategyVerdict>,
    result: ScenarioResult
  ): { passed: boolean; confidence: number } {
    const overallConfidence = this.calculateOverallConfidence(strategyVerdicts);
    const overallPassed = this.determineOverallPassed(strategyVerdicts, overallConfidence);

    return { passed: overallPassed, confidence: overallConfidence };
  }

  /**
   * Calculate overall confidence from all strategies
   */
  private calculateOverallConfidence(strategyVerdicts: Map<string, StrategyVerdict>): number {
    if (strategyVerdicts.size === 0) {
      return 0.5; // Neutral confidence
    }

    switch (this.evidenceAggregationMethod) {
      case 'weighted':
        return this.calculateWeightedConfidence(strategyVerdicts);

      case 'average':
        return this.calculateAverageConfidence(strategyVerdicts);

      case 'minimum':
        return this.calculateMinimumConfidence(strategyVerdicts);

      default:
        return this.calculateWeightedConfidence(strategyVerdicts);
    }
  }

  /**
   * Calculate weighted confidence
   */
  private calculateWeightedConfidence(strategyVerdicts: Map<string, StrategyVerdict>): number {
    let totalWeight = 0;
    let weightedSum = 0;

    strategyVerdicts.forEach((verdict, strategyName) => {
      const weight = this.weights.get(strategyName) || (1 / strategyVerdicts.size);
      weightedSum += verdict.confidence * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(strategyVerdicts: Map<string, StrategyVerdict>): number {
    let sum = 0;
    strategyVerdicts.forEach(verdict => {
      sum += verdict.confidence;
    });
    return sum / strategyVerdicts.size;
  }

  /**
   * Calculate minimum confidence (conservative approach)
   */
  private calculateMinimumConfidence(strategyVerdicts: Map<string, StrategyVerdict>): number {
    let minConfidence = 1.0;
    strategyVerdicts.forEach(verdict => {
      minConfidence = Math.min(minConfidence, verdict.confidence);
    });
    return minConfidence;
  }

  /**
   * Determine overall passed status
   */
  private determineOverallPassed(
    strategyVerdicts: Map<string, StrategyVerdict>,
    overallConfidence: number
  ): boolean {
    // If confidence is below threshold, fail
    if (overallConfidence < this.confidenceThreshold) {
      return false;
    }

    // Check if any critical strategies failed
    const criticalStrategies = ['logic-check', 'cross-reference'];
    for (const critical of criticalStrategies) {
      const verdict = strategyVerdicts.get(critical);
      if (verdict && !verdict.passed) {
        return false;
      }
    }

    // Check if most strategies passed
    let passedCount = 0;
    strategyVerdicts.forEach(verdict => {
      if (verdict.passed) passedCount++;
    });

    const passRate = passedCount / strategyVerdicts.size;
    return passRate >= 0.6; // At least 60% of strategies must pass
  }

  /**
   * Collect all issues from all strategies
   */
  private collectAllIssues(strategyVerdicts: Map<string, StrategyVerdict>): StrategyIssue[] {
    const allIssues: StrategyIssue[] = [];

    strategyVerdicts.forEach((verdict, strategyName) => {
      verdict.issues.forEach(issue => {
        // Add source strategy to issue metadata
        allIssues.push({
          ...issue,
          metadata: {
            ...issue.metadata,
            sourceStrategy: strategyName,
          },
        });
      });
    });

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return allIssues;
  }

  /**
   * Collect all evidence from all strategies
   */
  private collectAllEvidence(strategyVerdicts: Map<string, StrategyVerdict>): string[] {
    const allEvidence: string[] = [];

    strategyVerdicts.forEach((verdict, strategyName) => {
      verdict.evidence.forEach(evidence => {
        allEvidence.push(`[${strategyName}] ${evidence}`);
      });
    });

    return allEvidence;
  }

  /**
   * Generate summary of verification results
   */
  private generateSummary(
    strategyVerdicts: Map<string, StrategyVerdict>,
    overallPassed: boolean,
    overallConfidence: number
  ): string {
    const parts: string[] = [];

    // Overall status
    parts.push(`Verification ${overallPassed ? 'PASSED' : 'FAILED'} with ${(overallConfidence * 100).toFixed(1)}% confidence.`);

    // Strategy breakdown
    parts.push('\nStrategy Results:');
    strategyVerdicts.forEach((verdict, strategyName) => {
      const status = verdict.passed ? '✓' : '✗';
      parts.push(`  ${status} ${strategyName}: ${(verdict.confidence * 100).toFixed(1)}% confidence`);
      if (verdict.issues.length > 0) {
        parts.push(`    - ${verdict.issues.length} issue(s) found`);
      }
    });

    // Issue summary
    const totalIssues = Array.from(strategyVerdicts.values()).reduce((sum, v) => sum + v.issues.length, 0);
    if (totalIssues > 0) {
      parts.push(`\nTotal Issues: ${totalIssues}`);
    }

    return parts.join('\n');
  }

  /**
   * Generate recommendations based on all strategy results
   */
  private generateRecommendations(
    strategyVerdicts: Map<string, StrategyVerdict>,
    result: ScenarioResult
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Analyze issues across all strategies
    strategyVerdicts.forEach((verdict, strategyName) => {
      verdict.issues.forEach(issue => {
        const recommendation = this.createRecommendationFromIssue(issue, strategyName, result);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      });
    });

    // Add strategic recommendations
    const strategicRecs = this.generateStrategicRecommendations(strategyVerdicts, result);
    recommendations.push(...strategicRecs);

    // Prioritize and deduplicate
    return this.prioritizeRecommendations(recommendations);
  }

  /**
   * Create recommendation from issue
   */
  private createRecommendationFromIssue(
    issue: StrategyIssue,
    strategyName: string,
    result: ScenarioResult
  ): Recommendation | null {
    const rec: Recommendation = {
      type: 'investigate',
      priority: issue.severity === 'critical' ? 'critical' : issue.severity,
      description: `[${strategyName}] ${issue.description}`,
      confidence: 0.7,
    };

    // Map issue categories to recommendation types
    switch (issue.category) {
      case 'contradiction':
      case 'logical-inconsistency':
        rec.type = 'repair';
        rec.action = 'Review and fix logical inconsistencies in test assertions';
        break;

      case 'selector':
      case 'ordering':
        rec.type = 'repair';
        rec.action = 'Fix selector or step ordering issues';
        if (issue.stepId) {
          rec.appliesTo = { stepId: issue.stepId };
        }
        break;

      case 'timing':
        rec.type = 'modify';
        rec.action = 'Adjust timing or add explicit waits';
        if (issue.stepId) {
          rec.appliesTo = { stepId: issue.stepId };
        }
        break;

      case 'visual-blank':
      case 'visual-layout':
        rec.type = 'investigate';
        rec.action = 'Investigate visual issues - may indicate page rendering problems';
        break;

      case 'edge-case-security':
        rec.type = 'modify';
        rec.action = 'Add security edge case tests to prevent vulnerabilities';
        break;

      case 'console-critical-no-failure':
        rec.type = 'modify';
        rec.action = 'Add error detection for critical console errors';
        break;

      case 'performance-extreme-violation':
        rec.type = 'modify';
        rec.action = 'Optimize performance or adjust thresholds';
        break;

      case 'flaky-pattern':
        rec.type = 'retry';
        rec.action = 'Address flaky test behavior - likely timing or race condition issue';
        break;

      default:
        rec.type = 'investigate';
        rec.action = `Investigate ${issue.category} issue`;
    }

    return rec;
  }

  /**
   * Generate strategic recommendations
   */
  private generateStrategicRecommendations(
    strategyVerdicts: Map<string, StrategyVerdict>,
    result: ScenarioResult
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check if result needs retry
    const hasFlakyIndicators = Array.from(strategyVerdicts.values()).some(verdict =>
      verdict.issues.some(issue =>
        issue.category === 'flaky-pattern' ||
        issue.category === 'timing-outlier'
      )
    );

    if (hasFlakyIndicators) {
      recommendations.push({
        type: 'retry',
        priority: 'medium',
        description: 'Test shows indicators of flakiness - consider retry with retries enabled',
        action: 'Re-run test with retry logic enabled',
        confidence: 0.6,
      });
    }

    // Check if test needs repair
    const hasRepairableIssues = Array.from(strategyVerdicts.values()).some(verdict =>
      verdict.issues.some(issue =>
        issue.category === 'selector' ||
        issue.category === 'timing'
      )
    );

    if (hasRepairableIssues) {
      recommendations.push({
        type: 'repair',
        priority: 'high',
        description: 'Test has repairable issues (selectors/timing) - consider automated repair',
        action: 'Run repair loop to fix selector and timing issues',
        confidence: 0.7,
      });
    }

    // Check if test needs acceptance
    const hasLowSeverityIssues = Array.from(strategyVerdicts.values()).every(verdict =>
      verdict.issues.filter(issue => issue.severity === 'critical' || issue.severity === 'high').length === 0
    );

    if (hasLowSeverityIssues && result.passed) {
      recommendations.push({
        type: 'accept',
        priority: 'low',
        description: 'Test passed with only minor issues - suitable for production',
        action: 'Accept test results and continue monitoring',
        confidence: 0.8,
      });
    }

    return recommendations;
  }

  /**
   * Prioritize and deduplicate recommendations
   */
  private prioritizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
    // Deduplicate by description
    const uniqueRecs = new Map<string, Recommendation>();

    recommendations.forEach(rec => {
      const existing = uniqueRecs.get(rec.description);
      if (!existing || (rec.confidence || 0) > (existing.confidence || 0)) {
        uniqueRecs.set(rec.description, rec);
      }
    });

    // Convert to array and sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = Array.from(uniqueRecs.values()).sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Within same priority, sort by confidence
      return (b.confidence || 0) - (a.confidence || 0);
    });

    return sorted.slice(0, 10); // Top 10 recommendations
  }
}