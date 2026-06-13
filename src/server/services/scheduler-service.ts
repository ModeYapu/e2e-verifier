/**
 * Smart Scheduler Service
 * Provides intelligent scheduling recommendations based on site behavior patterns
 */

import { StorageService } from './storage-service'
import { ResultStore } from '../../storage/result-store'

// =====================================================
// TYPES
// =====================================================

export type VerifyFrequency = 'hourly' | 'daily' | 'weekly'
export type VerifyMode = 'fast' | 'deep'

export interface ScheduleRecommendation {
  siteName: string
  frequency: VerifyFrequency
  reason: string
  verifyMode: VerifyMode
  lastVerified?: string
  changeRate: 'high' | 'normal' | 'low'
  passRate: number
}

export interface SiteSchedule extends ScheduleRecommendation {
  inReleaseWindow: boolean
}

// =====================================================
// SMART SCHEDULER CLASS
// =====================================================

export class SmartScheduler {
  private storageService: StorageService
  private resultStore: ResultStore

  constructor(storageService: StorageService) {
    this.storageService = storageService
    this.resultStore = storageService.getResultStore()
  }

  /**
   * Determine optimal verification frequency for a site
   * Based on change frequency, pass rate, and stability metrics
   */
  getRecommendedFrequency(siteName: string): ScheduleRecommendation {
    const now = Date.now()
    const oneHourAgo = new Date(now - 60 * 60 * 1000)
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

    // Get recent results
    const lastHourResults = this.resultStore.getBySite(siteName, { start: oneHourAgo, end: new Date() })
    const lastDayResults = this.resultStore.getBySite(siteName, { start: oneDayAgo, end: new Date() })
    const lastWeekResults = this.resultStore.getBySite(siteName, { start: sevenDaysAgo, end: new Date() })
    const lastMonthResults = this.resultStore.getBySite(siteName, { start: thirtyDaysAgo, end: new Date() })

    // Calculate pass rates
    const weekPassRate = this.calculatePassRate(lastWeekResults)
    const monthPassRate = this.calculatePassRate(lastMonthResults)

    // Determine change rate based on verification frequency
    const changesInLastHour = lastHourResults.length
    const changesInLastDay = lastDayResults.length

    let changeRate: 'high' | 'normal' | 'low' = 'normal'
    if (changesInLastHour >= 3) {
      changeRate = 'high'
    } else if (changesInLastDay === 0) {
      changeRate = 'low'
    }

    // Get latest result timestamp
    const latestResult = lastDayResults[0]
    const lastVerified = latestResult?.timestamp

    // Decision logic
    let frequency: VerifyFrequency = 'daily'
    let verifyMode: VerifyMode = 'fast'
    let reason = 'Normal verification schedule'

    // High-frequency changes -> hourly + fast
    if (changesInLastHour >= 3) {
      frequency = 'hourly'
      verifyMode = 'fast'
      reason = `High change rate detected: ${changesInLastHour} verifications in the last hour`
    }
    // Low pass rate (< 70%) -> hourly + deep
    else if (weekPassRate < 70 && lastWeekResults.length >= 5) {
      frequency = 'hourly'
      verifyMode = 'deep'
      reason = `Low pass rate (${weekPassRate.toFixed(1)}%) over the last 7 days - requires close monitoring`
    }
    // Very stable (100% pass rate over 30 days, infrequent changes) -> weekly + fast
    else if (
      monthPassRate === 100 &&
      lastMonthResults.length >= 10 &&
      changesInLastDay <= 1
    ) {
      frequency = 'weekly'
      verifyMode = 'fast'
      reason = 'Very stable site with 100% pass rate over 30 days and infrequent changes'
    }
    // Normal -> daily + fast
    else {
      frequency = 'daily'
      verifyMode = 'fast'
      reason = 'Standard verification schedule'
    }

    return {
      siteName,
      frequency,
      reason,
      verifyMode,
      lastVerified,
      changeRate,
      passRate: weekPassRate
    }
  }

  /**
   * Get schedule recommendations for all sites
   */
  getAllRecommendations(): SiteSchedule[] {
    const allSites = this.resultStore.getAllSiteNames()

    return allSites.map(siteName => {
      const recommendation = this.getRecommendedFrequency(siteName)
      return {
        ...recommendation,
        inReleaseWindow: this.isInReleaseWindow(siteName)
      }
    })
  }

  /**
   * Check if a site is in a release window (high-change period)
   * Detected by multiple verification runs within a short time window
   */
  isInReleaseWindow(siteName: string): boolean {
    const now = Date.now()
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000)

    const recentResults = this.resultStore.getBySite(siteName, {
      start: twoHoursAgo,
      end: new Date()
    })

    // If there are 3+ verification runs in the last 2 hours, consider it a release window
    return recentResults.length >= 3
  }

  /**
   * Calculate pass rate from results
   */
  private calculatePassRate(results: unknown[]): number {
    if (results.length === 0) return 0

    // Handle both TestResult array and other formats
    let passed = 0
    let total = 0

    for (const result of results) {
      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>
        if ('passed' in r && typeof r.passed === 'boolean') {
          total++
          if (r.passed) passed++
        }
      }
    }

    return total > 0 ? (passed / total) * 100 : 0
  }
}
