/**
 * Tests for Smart Scheduler Service
 */

// Vitest globals are available via test setup
import { SmartScheduler, ScheduleRecommendation } from './scheduler-service'
import { StorageService } from './storage-service'
import { ResultStore } from '../../storage/result-store'
import { TestResult } from '../../types'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

describe('SmartScheduler', () => {
  const testDataDir = join(process.cwd(), 'data-test-scheduler')
  let storageService: StorageService
  let resultStore: ResultStore
  let scheduler: SmartScheduler

  beforeEach(() => {
    // Clean up test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true })
    }
    mkdirSync(testDataDir, { recursive: true })

    storageService = new StorageService()
    // Override the resultStore data directory
    resultStore = new ResultStore(testDataDir)
    // Create a new storage service with test resultStore
    storageService = new StorageService() as any
    ;(storageService as any).resultStore = resultStore

    scheduler = new SmartScheduler(storageService)
  })

  // Helper to create mock TestResult
  function createMockResult(
    siteName: string,
    passed: boolean,
    timestamp: Date
  ): TestResult {
    return {
      siteName,
      url: `https://${siteName}.com`,
      timestamp: timestamp.toISOString(),
      passed,
      duration: 1000,
      checks: [
        {
          name: 'status-check',
          type: 'status',
          passed,
          message: passed ? 'Status OK' : 'Status failed'
        },
        {
          name: 'element-check',
          type: 'element',
          passed,
          message: passed ? 'Element found' : 'Element not found'
        }
      ],
      screenshots: [],
      errors: []
    }
  }

  describe('getRecommendedFrequency', () => {
    it('should recommend hourly + fast for high-frequency changes', () => {
      const now = new Date()
      const siteName = 'high-frequency-site'

      // Create 3 results in the last hour
      for (let i = 0; i < 3; i++) {
        const timestamp = new Date(now.getTime() - i * 15 * 60 * 1000) // 0, 15, 30 mins ago
        resultStore.save(createMockResult(siteName, true, timestamp))
      }

      const recommendation = scheduler.getRecommendedFrequency(siteName)

      expect(recommendation.siteName).toBe(siteName)
      expect(recommendation.frequency).toBe('hourly')
      expect(recommendation.verifyMode).toBe('fast')
      expect(recommendation.changeRate).toBe('high')
      expect(recommendation.reason).toContain('High change rate')
    })

    it('should recommend hourly + deep for low pass rate', () => {
      const now = new Date()
      const siteName = 'low-pass-rate-site'

      // Create 7 days of results with low pass rate (mostly failures)
      for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        // Only 3 out of 10 pass (30% pass rate)
        resultStore.save(createMockResult(siteName, i < 3, timestamp))
      }

      const recommendation = scheduler.getRecommendedFrequency(siteName)

      expect(recommendation.siteName).toBe(siteName)
      expect(recommendation.frequency).toBe('hourly')
      expect(recommendation.verifyMode).toBe('deep')
      expect(recommendation.reason).toContain('Low pass rate')
      expect(recommendation.passRate).toBeLessThan(70)
    })

    it('should recommend weekly + fast for very stable sites', () => {
      const now = new Date()
      const siteName = 'stable-site'

      // Create 30 days of results with 100% pass rate
      for (let i = 0; i < 30; i++) {
        const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        resultStore.save(createMockResult(siteName, true, timestamp))
      }

      const recommendation = scheduler.getRecommendedFrequency(siteName)

      expect(recommendation.siteName).toBe(siteName)
      expect(recommendation.frequency).toBe('weekly')
      expect(recommendation.verifyMode).toBe('fast')
      expect(recommendation.reason).toContain('Very stable')
      expect(recommendation.passRate).toBe(100)
    })

    it('should recommend daily + fast for normal sites', () => {
      const now = new Date()
      const siteName = 'normal-site'

      // Create a few results over the last week
      for (let i = 0; i < 3; i++) {
        const timestamp = new Date(now.getTime() - i * 2 * 24 * 60 * 60 * 1000)
        resultStore.save(createMockResult(siteName, true, timestamp))
      }

      const recommendation = scheduler.getRecommendedFrequency(siteName)

      expect(recommendation.siteName).toBe(siteName)
      expect(recommendation.frequency).toBe('daily')
      expect(recommendation.verifyMode).toBe('fast')
    })

    it('should handle sites with no results', () => {
      const recommendation = scheduler.getRecommendedFrequency('nonexistent-site')

      expect(recommendation.siteName).toBe('nonexistent-site')
      expect(recommendation.frequency).toBe('daily')
      expect(recommendation.verifyMode).toBe('fast')
      expect(recommendation.passRate).toBe(0)
      expect(recommendation.changeRate).toBe('low')
    })
  })

  describe('isInReleaseWindow', () => {
    it('should detect release window with multiple recent verifications', () => {
      const now = new Date()
      const siteName = 'release-window-site'

      // Create 3 results in the last 2 hours
      for (let i = 0; i < 3; i++) {
        const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000) // 0, 30, 60 mins ago
        resultStore.save(createMockResult(siteName, true, timestamp))
      }

      const inReleaseWindow = scheduler.isInReleaseWindow(siteName)

      expect(inReleaseWindow).toBe(true)
    })

    it('should not detect release window with infrequent verifications', () => {
      const now = new Date()
      const siteName = 'normal-site'

      // Create 1 result in the last 2 hours
      const timestamp = new Date(now.getTime() - 30 * 60 * 1000)
      resultStore.save(createMockResult(siteName, true, timestamp))

      const inReleaseWindow = scheduler.isInReleaseWindow(siteName)

      expect(inReleaseWindow).toBe(false)
    })

    it('should handle sites with no results', () => {
      const inReleaseWindow = scheduler.isInReleaseWindow('nonexistent-site')

      expect(inReleaseWindow).toBe(false)
    })
  })

  describe('getAllRecommendations', () => {
    it('should return recommendations for all sites', () => {
      const now = new Date()

      // Create results for multiple sites
      const sites = ['site-a', 'site-b', 'site-c']
      sites.forEach(siteName => {
        resultStore.save(createMockResult(siteName, true, now))
      })

      const recommendations = scheduler.getAllRecommendations()

      expect(recommendations).toBeDefined()
      expect(recommendations.length).toBeGreaterThanOrEqual(3)
      expect(recommendations.every(r => r.siteName)).toBe(true)
      expect(recommendations.every(r => typeof r.inReleaseWindow === 'boolean')).toBe(true)
    })
  })
})
