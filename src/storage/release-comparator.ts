/**
 * Release Comparator
 * Compares verification results between two releases to detect regressions, improvements, and new failures
 */

import { ResultStore } from './result-store'
import { TestResult, CheckResult } from '../types'

// =====================================================
// TYPES
// =====================================================

export interface ReleaseComparison {
  siteName: string
  releaseA: string
  releaseB: string
  summary: {
    passRateA: number
    passRateB: number
    passRateChange: number
    avgDurationA: number
    avgDurationB: number
    durationChange: number
  }
  newFailures: CheckResult[]
  fixed: CheckResult[]
  regressions: CheckResult[]
  allResultsA: TestResult[]
  allResultsB: TestResult[]
}

// =====================================================
// RELEASE COMPARATOR CLASS
// =====================================================

export class ReleaseComparator {
  private resultStore: ResultStore

  constructor(resultStore: ResultStore) {
    this.resultStore = resultStore
  }

  /**
   * Compare verification results between two releases
   */
  compareReleases(
    siteName: string,
    releaseA: string,
    releaseB: string
  ): ReleaseComparison {
    // Get results for both releases
    const resultsA = this.resultStore.getByRelease(siteName, releaseA)
    const resultsB = this.resultStore.getByRelease(siteName, releaseB)

    // Calculate summary metrics
    const summary = this.calculateSummary(resultsA, resultsB)

    // Identify new failures, fixed items, and regressions
    const newFailures = this.findNewFailures(resultsA, resultsB)
    const fixed = this.findFixed(resultsA, resultsB)
    const regressions = this.findRegressions(resultsA, resultsB)

    return {
      siteName,
      releaseA,
      releaseB,
      summary,
      newFailures,
      fixed,
      regressions,
      allResultsA: resultsA,
      allResultsB: resultsB
    }
  }

  /**
   * Calculate summary statistics for comparison
   */
  private calculateSummary(resultsA: TestResult[], resultsB: TestResult[]) {
    const passRateA = this.calculatePassRate(resultsA)
    const passRateB = this.calculatePassRate(resultsB)
    const passRateChange = passRateB - passRateA

    const avgDurationA = this.calculateAvgDuration(resultsA)
    const avgDurationB = this.calculateAvgDuration(resultsB)
    const durationChange = avgDurationB - avgDurationA

    return {
      passRateA,
      passRateB,
      passRateChange,
      avgDurationA,
      avgDurationB,
      durationChange
    }
  }

  /**
   * Find checks that passed in release A but failed in release B
   */
  private findNewFailures(resultsA: TestResult[], resultsB: TestResult[]): CheckResult[] {
    const newFailures: CheckResult[] = []

    // Get all checks from both releases
    const checksA = this.getAllChecks(resultsA)
    const checksB = this.getAllChecks(resultsB)

    // Find checks by name that passed in A but failed in B
    for (const [checkName, checkA] of Object.entries(checksA)) {
      if (checkA.passed) {
        const checkB = checksB[checkName]
        if (checkB && !checkB.passed) {
          newFailures.push({
            ...checkB,
            message: `Previously passed: ${checkB.message}`
          })
        }
      }
    }

    return newFailures
  }

  /**
   * Find checks that failed in release A but passed in release B
   */
  private findFixed(resultsA: TestResult[], resultsB: TestResult[]): CheckResult[] {
    const fixed: CheckResult[] = []

    const checksA = this.getAllChecks(resultsA)
    const checksB = this.getAllChecks(resultsB)

    for (const [checkName, checkA] of Object.entries(checksA)) {
      if (!checkA.passed) {
        const checkB = checksB[checkName]
        if (checkB && checkB.passed) {
          fixed.push({
            ...checkB,
            message: `Previously failed: ${checkA.message} - now passing`
          })
        }
      }
    }

    return fixed
  }

  /**
   * Find checks that failed in both releases (ongoing issues)
   */
  private findRegressions(resultsA: TestResult[], resultsB: TestResult[]): CheckResult[] {
    const regressions: CheckResult[] = []

    const checksA = this.getAllChecks(resultsA)
    const checksB = this.getAllChecks(resultsB)

    for (const [checkName, checkA] of Object.entries(checksA)) {
      if (!checkA.passed) {
        const checkB = checksB[checkName]
        if (checkB && !checkB.passed) {
          regressions.push({
            ...checkB,
            message: `Ongoing issue: ${checkB.message}`
          })
        }
      }
    }

    return regressions
  }

  /**
   * Get all checks from results, indexed by check name
   * Uses the most recent occurrence of each check
   */
  private getAllChecks(results: TestResult[]): Record<string, CheckResult> {
    const checks: Record<string, CheckResult> = {}

    for (const result of results) {
      for (const check of result.checks) {
        // Store only the first occurrence (most recent due to sorting)
        if (!checks[check.name]) {
          checks[check.name] = check
        }
      }
    }

    return checks
  }

  /**
   * Calculate pass rate percentage
   */
  private calculatePassRate(results: TestResult[]): number {
    if (results.length === 0) return 0

    let totalChecks = 0
    let passedChecks = 0

    for (const result of results) {
      totalChecks += result.checks.length
      passedChecks += result.checks.filter(c => c.passed).length
    }

    return totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0
  }

  /**
   * Calculate average duration
   */
  private calculateAvgDuration(results: TestResult[]): number {
    if (results.length === 0) return 0

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    return Math.round(totalDuration / results.length)
  }
}
