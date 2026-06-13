/**
 * Performance Benchmark Service
 * Tracks performance metrics, computes baselines, and detects regressions
 */

/**
 * Timing data for a single step
 */
export interface StepTiming {
  step: string;       // navigate | interact | screenshot | compare | etc.
  duration: number;   // Duration in milliseconds
  timestamp: string;  // ISO timestamp
}

/**
 * Performance record for a job
 */
export interface PerformanceRecord {
  jobId: string;
  site: string;
  steps: StepTiming[];
  totalDuration: number;
  timestamp: string;
}

/**
 * Baseline statistics for a single step
 */
export interface StepBaseline {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  samples: number;
}

/**
 * Performance baseline for a site
 */
export interface PerformanceBaseline {
  site: string;
  stepBaselines: { [step: string]: StepBaseline };
  updatedAt: string;
}

/**
 * Performance regression detection result
 */
export interface PerformanceRegression {
  step: string;
  baseline: number;
  actual: number;
  zScore: number;
  severity: 'warning' | 'critical';
  jobId: string;
  timestamp: string;
}

/**
 * Options for regression detection
 */
export interface RegressionDetectionOptions {
  threshold?: number;  // Z-score threshold for detection (default: 2)
  minSamples?: number;  // Minimum samples required for baseline (default: 3)
}

/**
 * Performance Benchmark class
 */
export class PerformanceBenchmark {
  private records: Map<string, PerformanceRecord[]> = new Map(); // site -> records
  private baselines: Map<string, PerformanceBaseline> = new Map();

  /**
   * Record performance data for a job
   */
  recordPerformance(rec: PerformanceRecord): void {
    if (!rec.site) {
      throw new Error('Performance record must have a site');
    }

    if (!this.records.has(rec.site)) {
      this.records.set(rec.site, []);
    }

    const siteRecords = this.records.get(rec.site)!;
    siteRecords.push(rec);

    // Keep only the last 1000 records per site to prevent memory issues
    if (siteRecords.length > 1000) {
      siteRecords.splice(0, siteRecords.length - 1000);
    }
  }

  /**
   * Compute and update baseline for a site
   * Requires at least 3 samples
   */
  computeBaseline(site: string, options: RegressionDetectionOptions = {}): PerformanceBaseline {
    const minSamples = options.minSamples ?? 3;

    const siteRecords = this.records.get(site);
    if (!siteRecords || siteRecords.length < minSamples) {
      throw new Error(
        `Insufficient samples for baseline computation: ${siteRecords?.length || 0} (minimum: ${minSamples})`
      );
    }

    const stepBaselines: { [step: string]: StepBaseline } = {};

    // Group timings by step
    const stepTimings: { [step: string]: number[] } = {};

    for (const record of siteRecords) {
      for (const step of record.steps) {
        if (!stepTimings[step.step]) {
          stepTimings[step.step] = [];
        }
        stepTimings[step.step].push(step.duration);
      }
    }

    // Calculate statistics for each step
    for (const [stepName, timings] of Object.entries(stepTimings)) {
      if (timings.length >= minSamples) {
        const stats = this.calculateStatistics(timings);
        stepBaselines[stepName] = stats;
      }
    }

    const baseline: PerformanceBaseline = {
      site,
      stepBaselines,
      updatedAt: new Date().toISOString()
    };

    this.baselines.set(site, baseline);

    return baseline;
  }

  /**
   * Get baseline for a site
   */
  getBaseline(site: string): PerformanceBaseline | null {
    return this.baselines.get(site) || null;
  }

  /**
   * Detect performance regressions for a site
   * Returns steps where actual duration exceeds baseline by more than threshold * stdDev
   */
  detectRegressions(site: string, options: RegressionDetectionOptions = {}): PerformanceRegression[] {
    const threshold = options.threshold ?? 2;
    const minSamples = options.minSamples ?? 3;

    const baseline = this.baselines.get(site);
    if (!baseline) {
      // Try to compute baseline if not exists
      try {
        this.computeBaseline(site, { minSamples });
      } catch {
        return []; // Not enough data
      }
    }

    const updatedBaseline = this.baselines.get(site);
    if (!updatedBaseline || Object.keys(updatedBaseline.stepBaselines).length === 0) {
      return [];
    }

    const regressions: PerformanceRegression[] = [];

    // Get the most recent record for comparison
    const siteRecords = this.records.get(site);
    if (!siteRecords || siteRecords.length === 0) {
      return [];
    }

    const latestRecord = siteRecords[siteRecords.length - 1];

    // Check each step against baseline
    for (const step of latestRecord.steps) {
      const stepBaseline = updatedBaseline.stepBaselines[step.step];
      if (!stepBaseline) continue;

      let zScore: number;
      if (stepBaseline.stdDev > 0) {
        zScore = (step.duration - stepBaseline.mean) / stepBaseline.stdDev;
      } else if (step.duration > stepBaseline.mean * 1.2) {
        // When stdDev is 0 (all baseline values identical), flag regression only if >20% above mean
        zScore = Infinity;
      } else {
        zScore = 0;
      }

      // Detect regression (positive z-score means slower than baseline)
      if (zScore > threshold) {
        regressions.push({
          step: step.step,
          baseline: stepBaseline.mean,
          actual: step.duration,
          zScore,
          severity: zScore > 3 ? 'critical' : 'warning',
          jobId: latestRecord.jobId,
          timestamp: step.timestamp
        });
      }
    }

    return regressions;
  }

  /**
   * Get historical performance records for a site
   */
  getHistory(site: string, limit: number = 100): PerformanceRecord[] {
    const siteRecords = this.records.get(site);
    if (!siteRecords) {
      return [];
    }

    // Return most recent records first
    const records = [...siteRecords].reverse();
    return records.slice(0, Math.min(limit, records.length));
  }

  /**
   * Get all sites that have performance records
   */
  getSites(): string[] {
    return Array.from(this.records.keys());
  }

  /**
   * Get statistics for a specific step across all records
   */
  getStepStats(site: string, stepName: string): StepBaseline | null {
    const baseline = this.baselines.get(site);
    if (!baseline) {
      return null;
    }

    return baseline.stepBaselines[stepName] || null;
  }

  /**
   * Clear all data for a site
   */
  clearSite(site: string): void {
    this.records.delete(site);
    this.baselines.delete(site);
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.records.clear();
    this.baselines.clear();
  }

  /**
   * Calculate statistics for a set of values
   * Uses Welford's algorithm for numerical stability
   */
  private calculateStatistics(values: number[]): StepBaseline {
    if (values.length === 0) {
      return {
        mean: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        samples: 0
      };
    }

    let mean = values[0];
    let m2 = 0;
    let min = values[0];
    let max = values[0];

    for (let i = 1; i < values.length; i++) {
      const x = values[i];
      const delta = x - mean;
      mean += delta / (i + 1);
      const delta2 = x - mean;
      m2 += delta * delta2;

      if (x < min) min = x;
      if (x > max) max = x;
    }

    const variance = values.length > 1 ? m2 / values.length : 0;
    const stdDev = Math.sqrt(variance);

    return {
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      samples: values.length
    };
  }

  /**
   * Get summary statistics for a site
   */
  getSiteSummary(site: string): {
    totalRecords: number;
    hasBaseline: boolean;
    totalSteps: number;
    averageDuration: number;
  } | null {
    const siteRecords = this.records.get(site);
    if (!siteRecords) {
      return null;
    }

    const totalRecords = siteRecords.length;
    const hasBaseline = this.baselines.has(site);
    let totalSteps = 0;
    let totalDuration = 0;

    for (const record of siteRecords) {
      totalSteps += record.steps.length;
      totalDuration += record.totalDuration;
    }

    const averageDuration = totalRecords > 0 ? totalDuration / totalRecords : 0;

    return {
      totalRecords,
      hasBaseline,
      totalSteps,
      averageDuration: Math.round(averageDuration * 100) / 100
    };
  }
}
