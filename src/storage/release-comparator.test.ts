/**
 * Tests for Release Comparator
 */

// Vitest globals are available via test setup
import { ReleaseComparator } from './release-comparator'
import { ResultStore } from './result-store'
import { TestResult } from '../types'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

describe('ReleaseComparator', () => {
  const testDataDir = join(process.cwd(), 'data-test-release-comparator')
  let resultStore: ResultStore
  let comparator: ReleaseComparator

  beforeEach(() => {
    // Clean up test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true })
    }
    mkdirSync(testDataDir, { recursive: true })

    resultStore = new ResultStore(testDataDir)
    comparator = new ReleaseComparator(resultStore)
  })

  // Helper to create mock TestResult
  function createMockResult(
    siteName: string,
    passed: boolean,
    checkNames: string[]
  ): TestResult {
    return {
      siteName,
      url: `https://${siteName}.com`,
      timestamp: new Date().toISOString(),
      passed,
      duration: 1000,
      checks: checkNames.map(name => ({
        name,
        type: 'element',
        passed: checkNames.indexOf(name) % 2 === 0, // Alternate pass/fail for variety
        message: `${name} check ${checkNames.indexOf(name) % 2 === 0 ? 'passed' : 'failed'}`
      })),
      screenshots: [],
      errors: []
    }
  }

  describe('compareReleases', () => {
    it('should compare two releases and return summary', () => {
      const resultA1 = createMockResult('test-site', true, ['check1', 'check2', 'check3'])
      const resultA2 = createMockResult('test-site', true, ['check1', 'check2'])
      const resultB1 = createMockResult('test-site', false, ['check1', 'check2', 'check4'])
      const resultB2 = createMockResult('test-site', true, ['check1', 'check3', 'check4'])

      // Save with release tags
      resultStore.saveWithRelease(resultA1, 'v1.0.0')
      resultStore.saveWithRelease(resultA2, 'v1.0.0')
      resultStore.saveWithRelease(resultB1, 'v1.1.0')
      resultStore.saveWithRelease(resultB2, 'v1.1.0')

      const comparison = comparator.compareReleases('test-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.siteName).toBe('test-site')
      expect(comparison.releaseA).toBe('v1.0.0')
      expect(comparison.releaseB).toBe('v1.1.0')
      expect(comparison.summary).toBeDefined()
      expect(typeof comparison.summary.passRateA).toBe('number')
      expect(typeof comparison.summary.passRateB).toBe('number')
      expect(typeof comparison.summary.passRateChange).toBe('number')
    })

    it('should detect new failures (passed in A, failed in B)', () => {
      // Release A: all checks pass
      const resultA = createMockResult('test-site', true, ['check1', 'check2', 'check3'])
      resultA.checks.forEach(c => c.passed = true)

      // Release B: check2 fails
      const resultB = createMockResult('test-site', false, ['check1', 'check2', 'check3'])
      resultB.checks[0].passed = true // check1 passes
      resultB.checks[1].passed = false // check2 fails
      resultB.checks[2].passed = true // check3 passes

      resultStore.saveWithRelease(resultA, 'v1.0.0')
      resultStore.saveWithRelease(resultB, 'v1.1.0')

      const comparison = comparator.compareReleases('test-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.newFailures).toBeDefined()
      expect(comparison.newFailures.length).toBeGreaterThan(0)
      expect(comparison.newFailures.some(f => f.name === 'check2')).toBe(true)
    })

    it('should detect fixed items (failed in A, passed in B)', () => {
      // Release A: check2 fails
      const resultA = createMockResult('test-site', false, ['check1', 'check2', 'check3'])
      resultA.checks[0].passed = true
      resultA.checks[1].passed = false
      resultA.checks[2].passed = true

      // Release B: all checks pass
      const resultB = createMockResult('test-site', true, ['check1', 'check2', 'check3'])
      resultB.checks.forEach(c => c.passed = true)

      resultStore.saveWithRelease(resultA, 'v1.0.0')
      resultStore.saveWithRelease(resultB, 'v1.1.0')

      const comparison = comparator.compareReleases('test-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.fixed).toBeDefined()
      expect(comparison.fixed.length).toBeGreaterThan(0)
      expect(comparison.fixed.some(f => f.name === 'check2')).toBe(true)
    })

    it('should detect regressions (failed in both)', () => {
      // Both releases have check2 failing
      const resultA = createMockResult('test-site', false, ['check1', 'check2', 'check3'])
      resultA.checks[0].passed = true
      resultA.checks[1].passed = false
      resultA.checks[2].passed = true

      const resultB = createMockResult('test-site', false, ['check1', 'check2', 'check3'])
      resultB.checks[0].passed = true
      resultB.checks[1].passed = false
      resultB.checks[2].passed = true

      resultStore.saveWithRelease(resultA, 'v1.0.0')
      resultStore.saveWithRelease(resultB, 'v1.1.0')

      const comparison = comparator.compareReleases('test-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.regressions).toBeDefined()
      expect(comparison.regressions.length).toBeGreaterThan(0)
      expect(comparison.regressions.some(r => r.name === 'check2')).toBe(true)
    })

    it('should handle empty results gracefully', () => {
      const comparison = comparator.compareReleases('nonexistent-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.siteName).toBe('nonexistent-site')
      expect(comparison.summary.passRateA).toBe(0)
      expect(comparison.summary.passRateB).toBe(0)
      expect(comparison.newFailures).toEqual([])
      expect(comparison.fixed).toEqual([])
      expect(comparison.regressions).toEqual([])
    })
  })

  describe('pass rate calculation', () => {
    it('should correctly calculate pass rate', () => {
      const result = createMockResult('test-site', true, ['check1', 'check2', 'check3', 'check4'])
      result.checks[0].passed = true
      result.checks[1].passed = true
      result.checks[2].passed = false
      result.checks[3].passed = true

      // 3 out of 4 checks passed = 75%
      const passRate = (result.checks.filter(c => c.passed).length / result.checks.length) * 100
      expect(passRate).toBe(75)
    })
  })

  describe('duration calculation', () => {
    it('should correctly calculate average duration', () => {
      const result1 = createMockResult('test-site', true, ['check1'])
      result1.duration = 1000

      const result2 = createMockResult('test-site', true, ['check2'])
      result2.duration = 2000

      resultStore.saveWithRelease(result1, 'v1.0.0')
      resultStore.saveWithRelease(result2, 'v1.1.0')

      const comparison = comparator.compareReleases('test-site', 'v1.0.0', 'v1.1.0')

      expect(comparison.summary.avgDurationA).toBe(1000)
      expect(comparison.summary.avgDurationB).toBe(2000)
      expect(comparison.summary.durationChange).toBe(1000)
    })
  })
})
