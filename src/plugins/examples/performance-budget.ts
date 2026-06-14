/**
 * Example Plugin: Performance Budget
 *
 * Enforces a performance budget against metrics collected during the run.
 *
 * The plugin reads performance metrics from the shared metadata channel
 * (`ctx.metadata.performance`), which the verifier (or a user-supplied
 * adapter) populates with values like FCP, LCP and page weight. In
 * `beforeVerify` it publishes the budget so collectors know the thresholds;
 * in `afterVerify` it appends one CheckResult per exceeded budget.
 *
 * Configuration:
 *   - maxFCPms:         maximum First Contentful Paint in ms
 *   - maxLCPms:         maximum Largest Contentful Paint in ms
 *   - maxLoadTimems:    maximum load time in ms
 *   - maxPageWeightKB:  maximum total page weight in KB
 */

import type { Plugin, BeforeVerifyContext, AfterVerifyContext } from '../types';

export interface PerformanceMetrics {
  fcp?: number;
  lcp?: number;
  loadTime?: number;
  pageWeightKB?: number;
}

export interface PerformanceBudgetOptions {
  maxFCPms?: number;
  maxLCPms?: number;
  maxLoadTimems?: number;
  maxPageWeightKB?: number;
}

interface BudgetRule {
  label: string;
  metric: keyof PerformanceMetrics;
  limit?: number;
  unit: string;
}

export function createPerformanceBudgetPlugin(options: PerformanceBudgetOptions = {}): Plugin {
  // Default budgets mirror common "good" thresholds when not overridden.
  const budget: Required<PerformanceBudgetOptions> = {
    maxFCPms: options.maxFCPms ?? 1800,
    maxLCPms: options.maxLCPms ?? 2500,
    maxLoadTimems: options.maxLoadTimems ?? 5000,
    maxPageWeightKB: options.maxPageWeightKB ?? 2048,
  };

  const rules: BudgetRule[] = [
    { label: 'First Contentful Paint', metric: 'fcp', limit: budget.maxFCPms, unit: 'ms' },
    { label: 'Largest Contentful Paint', metric: 'lcp', limit: budget.maxLCPms, unit: 'ms' },
    { label: 'Load Time', metric: 'loadTime', limit: budget.maxLoadTimems, unit: 'ms' },
    { label: 'Page Weight', metric: 'pageWeightKB', limit: budget.maxPageWeightKB, unit: 'KB' },
  ];

  return {
    name: 'performance-budget',
    version: '1.0.0',
    description: 'Enforces performance budgets (FCP, LCP, load time, page weight).',

    beforeVerify(ctx: BeforeVerifyContext): void {
      // Publish the budget so metric collectors can compare as they run.
      ctx.metadata.performanceBudget = { ...budget };
    },

    afterVerify(ctx: AfterVerifyContext): void {
      const metrics = (ctx.metadata.performance as PerformanceMetrics | undefined) ?? {};

      let anyOver = false;
      const evaluated: Array<{ label: string; value: number; limit: number; passed: boolean }> = [];

      for (const rule of rules) {
        const value = metrics[rule.metric];
        if (value === undefined || rule.limit === undefined) {
          continue;
        }
        const passed = value <= rule.limit;
        evaluated.push({ label: rule.label, value, limit: rule.limit, passed });
        if (!passed) {
          anyOver = true;
        }
      }

      if (evaluated.length === 0) {
        // No metrics were collected — emit an informational check so the
        // budget is visible even when nothing was measured.
        ctx.additionalChecks.push({
          name: 'Performance Budget',
          type: 'performance',
          passed: true,
          severity: 'warning',
          message: 'No performance metrics collected; budget not evaluated.',
          details: { budget },
        });
        return;
      }

      for (const e of evaluated) {
        ctx.additionalChecks.push({
          name: `Budget: ${e.label}`,
          type: 'performance',
          passed: e.passed,
          severity: e.passed ? 'warning' : 'critical',
          message: e.passed
            ? `${e.label} ${e.value} within budget (<= ${e.limit})`
            : `${e.label} ${e.value} exceeds budget (<= ${e.limit})`,
          details: { value: e.value, limit: e.limit },
        });
      }

      // One summary check reflecting the overall budget outcome.
      ctx.additionalChecks.push({
        name: 'Performance Budget',
        type: 'performance',
        passed: !anyOver,
        severity: anyOver ? 'critical' : 'warning',
        message: anyOver
          ? 'Performance budget exceeded'
          : 'Performance budget satisfied',
        details: { budget, evaluated },
      });
    },
  };
}
