/**
 * Performance Benchmark Tests
 * Tests for performance tracking, baseline computation, and regression detection
 */

import {
  PerformanceBenchmark,
  PerformanceRecord,
  PerformanceBaseline,
  PerformanceRegression,
  StepTiming
} from '../src/services/performance-benchmark';

describe('PerformanceBenchmark', () => {
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    benchmark = new PerformanceBenchmark();
  });

  describe('recordPerformance / getHistory', () => {
    test('records and retrieves performance data', () => {
      const record: PerformanceRecord = {
        jobId: 'job-1',
        site: 'test-site',
        steps: [
          { step: 'navigate', duration: 100, timestamp: '2024-01-01T00:00:00Z' },
          { step: 'screenshot', duration: 50, timestamp: '2024-01-01T00:00:01Z' }
        ],
        totalDuration: 150,
        timestamp: '2024-01-01T00:00:00Z'
      };

      benchmark.recordPerformance(record);
      const history = benchmark.getHistory('test-site');

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    test('returns empty array for site with no records', () => {
      const history = benchmark.getHistory('non-existent-site');
      expect(history).toEqual([]);
    });

    test('limits history records by limit parameter', () => {
      // Create 5 records
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      const history2 = benchmark.getHistory('test-site', 2);
      expect(history2.length).toBeLessThanOrEqual(2);

      const history10 = benchmark.getHistory('test-site', 10);
      expect(history10.length).toBe(5);
    });

    test('returns most recent records first', () => {
      const timestamps = [
        '2024-01-01T00:00:00Z',
        '2024-01-01T01:00:00Z',
        '2024-01-01T02:00:00Z'
      ];

      for (const ts of timestamps) {
        benchmark.recordPerformance({
          jobId: `job-${ts}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: ts }],
          totalDuration: 100,
          timestamp: ts
        });
      }

      const history = benchmark.getHistory('test-site');
      expect(history[0].timestamp).toBe('2024-01-01T02:00:00Z'); // Most recent first
    });

    test('throws error for record without site', () => {
      const invalidRecord = {
        jobId: 'job-1',
        site: '',
        steps: [],
        totalDuration: 0,
        timestamp: new Date().toISOString()
      };

      expect(() => benchmark.recordPerformance(invalidRecord)).toThrow('must have a site');
    });
  });

  describe('computeBaseline', () => {
    test('computes baseline statistics correctly', () => {
      // Add records with consistent timing patterns
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [
            { step: 'navigate', duration: 100 + i * 2, timestamp: new Date().toISOString() }, // 100, 102, 104, 106, 108
            { step: 'screenshot', duration: 50, timestamp: new Date().toISOString() }
          ],
          totalDuration: 150 + i * 2,
          timestamp: new Date().toISOString()
        });
      }

      const baseline = benchmark.computeBaseline('test-site');

      expect(baseline.site).toBe('test-site');
      expect(baseline.stepBaselines['navigate']).toBeDefined();
      expect(baseline.stepBaselines['screenshot']).toBeDefined();

      const navBaseline = baseline.stepBaselines['navigate'];
      expect(navBaseline.samples).toBe(5);
      expect(navBaseline.mean).toBeCloseTo(104, 1); // Average of 100, 102, 104, 106, 108
      expect(navBaseline.min).toBe(100);
      expect(navBaseline.max).toBe(108);
      expect(navBaseline.stdDev).toBeGreaterThan(0);
    });

    test('throws error with insufficient samples', () => {
      benchmark.recordPerformance({
        jobId: 'job-1',
        site: 'test-site',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      expect(() => benchmark.computeBaseline('test-site', { minSamples: 3 }))
        .toThrow('Insufficient samples');
    });

    test('respects custom minSamples parameter', () => {
      // Add 2 records
      for (let i = 0; i < 2; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      // Should fail with default minSamples (3)
      expect(() => benchmark.computeBaseline('test-site')).toThrow();

      // Should succeed with minSamples = 2
      const baseline = benchmark.computeBaseline('test-site', { minSamples: 2 });
      expect(baseline.stepBaselines['navigate'].samples).toBe(2);
    });

    test('calculates standard deviation correctly', () => {
      // Add records with known variance
      const durations = [100, 100, 100, 100]; // All same - stdDev should be 0
      for (let i = 0; i < durations.length; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: durations[i], timestamp: new Date().toISOString() }],
          totalDuration: durations[i],
          timestamp: new Date().toISOString()
        });
      }

      const baseline = benchmark.computeBaseline('test-site');
      expect(baseline.stepBaselines['navigate'].stdDev).toBe(0);
    });

    test('handles multiple steps independently', () => {
      benchmark.recordPerformance({
        jobId: 'job-1',
        site: 'test-site',
        steps: [
          { step: 'navigate', duration: 100, timestamp: new Date().toISOString() },
          { step: 'interact', duration: 200, timestamp: new Date().toISOString() },
          { step: 'screenshot', duration: 50, timestamp: new Date().toISOString() }
        ],
        totalDuration: 350,
        timestamp: new Date().toISOString()
      });

      for (let i = 0; i < 4; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i + 2}`,
          site: 'test-site',
          steps: [
            { step: 'navigate', duration: 100, timestamp: new Date().toISOString() },
            { step: 'screenshot', duration: 50, timestamp: new Date().toISOString() }
          ],
          totalDuration: 150,
          timestamp: new Date().toISOString()
        });
      }

      const baseline = benchmark.computeBaseline('test-site', { minSamples: 3 });

      // navigate has 5 samples
      expect(baseline.stepBaselines['navigate'].samples).toBe(5);

      // interact has only 1 sample, so should not be in baseline (needs 3)
      expect(baseline.stepBaselines['interact']).toBeUndefined();

      // screenshot has 5 samples
      expect(baseline.stepBaselines['screenshot'].samples).toBe(5);
    });
  });

  describe('detectRegressions', () => {
    test('detects performance regressions exceeding threshold', () => {
      // Add baseline records with duration ~100ms
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `baseline-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      // Compute baseline
      benchmark.computeBaseline('test-site');

      // Add a record with significantly slower performance
      benchmark.recordPerformance({
        jobId: 'slow-job',
        site: 'test-site',
        steps: [{ step: 'navigate', duration: 200, timestamp: new Date().toISOString() }],
        totalDuration: 200,
        timestamp: new Date().toISOString()
      });

      const regressions = benchmark.detectRegressions('test-site');

      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions[0].step).toBe('navigate');
      expect(regressions[0].actual).toBe(200);
      expect(regressions[0].baseline).toBeCloseTo(100, 0);
      expect(regressions[0].zScore).toBeGreaterThan(2); // Should exceed default threshold
    });

    test('does not flag normal variations as regressions', () => {
      // Add baseline records
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `baseline-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      // Add a record with minor variation (within normal range)
      benchmark.recordPerformance({
        jobId: 'normal-job',
        site: 'test-site',
        steps: [{ step: 'navigate', duration: 105, timestamp: new Date().toISOString() }],
        totalDuration: 105,
        timestamp: new Date().toISOString()
      });

      const regressions = benchmark.detectRegressions('test-site');
      expect(regressions).toHaveLength(0);
    });

    test('classifies severity based on z-score', () => {
      // Add tight baseline with low variance
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `baseline-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      // Add a very slow job (should be critical)
      benchmark.recordPerformance({
        jobId: 'very-slow-job',
        site: 'test-site',
        steps: [{ step: 'navigate', duration: 200, timestamp: new Date().toISOString() }],
        totalDuration: 200,
        timestamp: new Date().toISOString()
      });

      const regressions = benchmark.detectRegressions('test-site');
      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions[0].severity).toBe('critical');
    });

    test('uses custom threshold parameter', () => {
      // Add baseline records
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `baseline-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      // Add a moderately slow job
      benchmark.recordPerformance({
        jobId: 'slow-job',
        site: 'test-site',
        steps: [{ step: 'navigate', duration: 150, timestamp: new Date().toISOString() }],
        totalDuration: 150,
        timestamp: new Date().toISOString()
      });

      // With threshold = 2, might not detect
      const strictRegressions = benchmark.detectRegressions('test-site', { threshold: 3 });

      // With threshold = 1, should detect
      const looseRegressions = benchmark.detectRegressions('test-site', { threshold: 1 });

      expect(looseRegressions.length).toBeGreaterThanOrEqual(strictRegressions.length);
    });

    test('returns empty array with insufficient data', () => {
      const regressions = benchmark.detectRegressions('non-existent-site');
      expect(regressions).toEqual([]);
    });
  });

  describe('getBaseline', () => {
    test('returns null when no baseline exists', () => {
      const baseline = benchmark.getBaseline('non-existent-site');
      expect(baseline).toBeNull();
    });

    test('returns computed baseline', () => {
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      const computed = benchmark.computeBaseline('test-site');
      const retrieved = benchmark.getBaseline('test-site');

      expect(retrieved).toEqual(computed);
    });
  });

  describe('getStepStats', () => {
    test('returns null for non-existent step', () => {
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      const stats = benchmark.getStepStats('test-site', 'non-existent-step');
      expect(stats).toBeNull();
    });

    test('returns statistics for existing step', () => {
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100 + i, timestamp: new Date().toISOString() }],
          totalDuration: 100 + i,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      const stats = benchmark.getStepStats('test-site', 'navigate');
      expect(stats).toBeDefined();
      expect(stats!.samples).toBe(5);
      expect(stats!.mean).toBeCloseTo(102, 0);
    });
  });

  describe('getSites', () => {
    test('returns list of sites with records', () => {
      benchmark.recordPerformance({
        jobId: 'job-1',
        site: 'site-a',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      benchmark.recordPerformance({
        jobId: 'job-2',
        site: 'site-b',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      const sites = benchmark.getSites();
      expect(sites).toContain('site-a');
      expect(sites).toContain('site-b');
      expect(sites.length).toBe(2);
    });

    test('returns empty array when no records', () => {
      const sites = benchmark.getSites();
      expect(sites).toEqual([]);
    });
  });

  describe('getSiteSummary', () => {
    test('returns null for non-existent site', () => {
      const summary = benchmark.getSiteSummary('non-existent-site');
      expect(summary).toBeNull();
    });

    test('returns summary statistics', () => {
      for (let i = 0; i < 3; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [
            { step: 'navigate', duration: 100, timestamp: new Date().toISOString() },
            { step: 'screenshot', duration: 50, timestamp: new Date().toISOString() }
          ],
          totalDuration: 150,
          timestamp: new Date().toISOString()
        });
      }

      const summary = benchmark.getSiteSummary('test-site');

      expect(summary).toBeDefined();
      expect(summary!.totalRecords).toBe(3);
      expect(summary!.totalSteps).toBe(6);
      expect(summary!.hasBaseline).toBe(false);
      expect(summary!.averageDuration).toBe(150);
    });

    test('includes baseline status in summary', () => {
      for (let i = 0; i < 5; i++) {
        benchmark.recordPerformance({
          jobId: `job-${i}`,
          site: 'test-site',
          steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
          totalDuration: 100,
          timestamp: new Date().toISOString()
        });
      }

      benchmark.computeBaseline('test-site');

      const summary = benchmark.getSiteSummary('test-site');
      expect(summary!.hasBaseline).toBe(true);
    });
  });

  describe('clearSite and clearAll', () => {
    test('clearSite removes data for specific site', () => {
      benchmark.recordPerformance({
        jobId: 'job-1',
        site: 'site-a',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      benchmark.recordPerformance({
        jobId: 'job-2',
        site: 'site-b',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      benchmark.clearSite('site-a');

      expect(benchmark.getHistory('site-a')).toEqual([]);
      expect(benchmark.getHistory('site-b')).toHaveLength(1);
    });

    test('clearAll removes all data', () => {
      benchmark.recordPerformance({
        jobId: 'job-1',
        site: 'site-a',
        steps: [{ step: 'navigate', duration: 100, timestamp: new Date().toISOString() }],
        totalDuration: 100,
        timestamp: new Date().toISOString()
      });

      benchmark.clearAll();

      expect(benchmark.getSites()).toEqual([]);
    });
  });
});
