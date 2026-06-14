/**
 * Example plugin tests
 *
 * Drives accessibility-check and performance-budget through a real
 * PluginManager so the metadata hand-off and CheckResult emission are
 * exercised end to end.
 */

import { PluginManager } from '../../src/plugins/plugin-manager';
import { createAccessibilityCheckPlugin } from '../../src/plugins/examples/accessibility-check';
import { createPerformanceBudgetPlugin } from '../../src/plugins/examples/performance-budget';
import { SiteConfig, TestResult, AccessibilityIssue } from '../../src/types';

function siteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return { name: 'Example', url: 'https://example.com', ...overrides } as SiteConfig;
}

function testResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    siteName: 'Example',
    url: 'https://example.com',
    timestamp: new Date().toISOString(),
    passed: true,
    duration: 100,
    checks: [],
    screenshots: [],
    errors: [],
    ...overrides,
  };
}

describe('accessibility-check plugin', () => {
  test('should publish its policy in beforeVerify', async () => {
    const pm = new PluginManager();
    await pm.register(createAccessibilityCheckPlugin({ maxIssues: 2 }));
    const ctx = await pm.runBeforeVerify(siteConfig());
    expect(ctx.metadata.a11yPolicy).toEqual({ maxIssues: 2, failOnSeverities: ['error'] });
  });

  test('should pass when there are no issues', async () => {
    const pm = new PluginManager();
    await pm.register(createAccessibilityCheckPlugin());
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks).toHaveLength(1);
    expect(checks[0].passed).toBe(true);
    expect(checks[0].type).toBe('accessibility');
    expect(checks[0].severity).toBe('warning');
  });

  test('should fail when issue count exceeds the budget', async () => {
    const pm = new PluginManager();
    await pm.register(createAccessibilityCheckPlugin({ maxIssues: 1 }));
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    pm.getMetadata(); // ensure channel exists
    // Simulate the verifier populating findings via metadata
    (pm as any).sharedMetadata.a11y = [
      { type: 'img-alt', element: 'img', message: 'missing alt', severity: 'warning' },
      { type: 'img-alt', element: 'img2', message: 'missing alt', severity: 'warning' },
      { type: 'img-alt', element: 'img3', message: 'missing alt', severity: 'warning' },
    ] as AccessibilityIssue[];
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks[0].passed).toBe(false);
    expect(checks[0].severity).toBe('critical');
    expect(checks[0].details).toMatchObject({ totalIssues: 3, maxIssues: 1 });
  });

  test('should fail when an issue matches a failing severity regardless of count', async () => {
    const pm = new PluginManager();
    await pm.register(createAccessibilityCheckPlugin({ maxIssues: 10, failOnSeverities: ['error'] }));
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    (pm as any).sharedMetadata.a11y = [
      { type: 'contrast', element: 'div', message: 'low contrast', severity: 'error' },
    ] as AccessibilityIssue[];
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks[0].passed).toBe(false);
  });

  test('should treat warnings as non-failing when failOnSeverities is empty', async () => {
    const pm = new PluginManager();
    await pm.register(createAccessibilityCheckPlugin({ maxIssues: 5, failOnSeverities: [] }));
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    (pm as any).sharedMetadata.a11y = [
      { type: 'x', element: 'div', message: 'warn', severity: 'warning' },
    ] as AccessibilityIssue[];
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks[0].passed).toBe(true);
  });
});

describe('performance-budget plugin', () => {
  test('should publish the budget in beforeVerify', async () => {
    const pm = new PluginManager();
    await pm.register(createPerformanceBudgetPlugin({ maxLCPms: 2000 }));
    const ctx = await pm.runBeforeVerify(siteConfig());
    expect(ctx.metadata.performanceBudget).toMatchObject({ maxLCPms: 2000, maxFCPms: 1800 });
  });

  test('should emit an informational check when no metrics were collected', async () => {
    const pm = new PluginManager();
    await pm.register(createPerformanceBudgetPlugin());
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks).toHaveLength(1);
    expect(checks[0].passed).toBe(true);
    expect(checks[0].message).toMatch(/No performance metrics/);
  });

  test('should pass when all metrics are within budget', async () => {
    const pm = new PluginManager();
    await pm.register(createPerformanceBudgetPlugin({ maxFCPms: 1000, maxLCPms: 2000, maxPageWeightKB: 500 }));
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    (pm as any).sharedMetadata.performance = { fcp: 800, lcp: 1500, pageWeightKB: 300 };
    const checks = await pm.runAfterVerify(cfg, testResult());
    const summary = checks.find(c => c.name === 'Performance Budget')!;
    expect(summary.passed).toBe(true);
    expect(checks.find(c => c.name === 'Budget: Largest Contentful Paint')!.passed).toBe(true);
  });

  test('should fail and flag the exceeded metrics', async () => {
    const pm = new PluginManager();
    await pm.register(createPerformanceBudgetPlugin({ maxFCPms: 1000, maxLCPms: 2000, maxPageWeightKB: 500 }));
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    (pm as any).sharedMetadata.performance = { fcp: 1800, lcp: 1500, pageWeightKB: 900 };
    const checks = await pm.runAfterVerify(cfg, testResult());

    const fcp = checks.find(c => c.name === 'Budget: First Contentful Paint')!;
    const lcp = checks.find(c => c.name === 'Budget: Largest Contentful Paint')!;
    const weight = checks.find(c => c.name === 'Budget: Page Weight')!;
    const summary = checks.find(c => c.name === 'Performance Budget')!;

    expect(fcp.passed).toBe(false);
    expect(lcp.passed).toBe(true);
    expect(weight.passed).toBe(false);
    expect(summary.passed).toBe(false);
    expect(summary.severity).toBe('critical');
  });

  test('should skip metrics that were not measured', async () => {
    const pm = new PluginManager();
    await pm.register(createPerformanceBudgetPlugin());
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    // Only LCP was measured; FCP/load/weight are absent.
    (pm as any).sharedMetadata.performance = { lcp: 1000 };
    const checks = await pm.runAfterVerify(cfg, testResult());
    expect(checks.find(c => c.name === 'Budget: First Contentful Paint')).toBeUndefined();
    expect(checks.find(c => c.name === 'Budget: Load Time')).toBeUndefined();
    expect(checks.find(c => c.name === 'Budget: Page Weight')).toBeUndefined();
    expect(checks.find(c => c.name === 'Budget: Largest Contentful Paint')).toBeDefined();
    expect(checks.find(c => c.name === 'Budget: Largest Contentful Paint')!.passed).toBe(true);
    expect(checks.find(c => c.name === 'Performance Budget')!.passed).toBe(true);
  });
});

describe('example plugins combined', () => {
  test('both plugins can run together and merge their checks', async () => {
    const pm = new PluginManager();
    await pm.registerAll([
      createAccessibilityCheckPlugin(),
      createPerformanceBudgetPlugin({ maxLCPms: 1000 }),
    ]);
    const cfg = siteConfig();
    await pm.runBeforeVerify(cfg);
    (pm as any).sharedMetadata.a11y = [];
    (pm as any).sharedMetadata.performance = { lcp: 3000 };
    const checks = await pm.runAfterVerify(cfg, testResult());

    const a11y = checks.find(c => c.name === 'Accessibility Policy');
    const perf = checks.find(c => c.name === 'Performance Budget');
    expect(a11y).toBeDefined();
    expect(a11y!.passed).toBe(true);
    expect(perf).toBeDefined();
    expect(perf!.passed).toBe(false);
  });
});
