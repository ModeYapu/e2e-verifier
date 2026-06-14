/**
 * PluginManager unit tests
 *
 * Covers registration lifecycle, hook ordering, shared metadata, the
 * beforeVerify veto short-circuit + error fallback, and afterVerify
 * additional-check merging + error containment.
 */

import { PluginManager } from '../../src/plugins/plugin-manager';
import { Plugin, BeforeVerifyContext, AfterVerifyContext } from '../../src/plugins/types';
import { SiteConfig, TestResult } from '../../src/types';

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

describe('PluginManager registration', () => {
  let pm: PluginManager;

  beforeEach(() => {
    pm = new PluginManager();
  });

  test('register should add a plugin and run its setup hook', async () => {
    const setup = jest.fn();
    await pm.register({ name: 'p1', setup });
    expect(pm.count).toBe(1);
    expect(pm.getPlugin('p1')).toBeDefined();
    expect(setup).toHaveBeenCalledTimes(1);
  });

  test('registerAll should preserve order', async () => {
    const order: string[] = [];
    await pm.registerAll([
      { name: 'a', setup: () => { order.push('a'); } },
      { name: 'b', setup: () => { order.push('b'); } },
      { name: 'c', setup: () => { order.push('c'); } },
    ]);
    expect(pm.getPlugins().map(p => p.name)).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('register should reject a duplicate name', async () => {
    await pm.register({ name: 'p1' });
    await expect(pm.register({ name: 'p1' })).rejects.toThrow(/already registered/);
    expect(pm.count).toBe(1);
  });

  test('unregister should run teardown and return true', async () => {
    const teardown = jest.fn();
    await pm.register({ name: 'p1', teardown });
    expect(await pm.unregister('p1')).toBe(true);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(pm.count).toBe(0);
  });

  test('unregister should return false for an unknown plugin', async () => {
    expect(await pm.unregister('ghost')).toBe(false);
  });

  test('getPlugin should return undefined for unknown names', () => {
    expect(pm.getPlugin('ghost')).toBeUndefined();
  });

  test('teardownAll should run teardowns in reverse order and clear the registry', async () => {
    const order: string[] = [];
    await pm.registerAll([
      { name: 'a', teardown: () => { order.push('a'); } },
      { name: 'b', teardown: () => { order.push('b'); } },
    ]);
    await pm.teardownAll();
    expect(order).toEqual(['b', 'a']);
    expect(pm.count).toBe(0);
  });

  test('teardownAll should swallow teardown errors', async () => {
    await pm.register({ name: 'boom', teardown: () => { throw new Error('nope'); } });
    await expect(pm.teardownAll()).resolves.not.toThrow();
    expect(pm.count).toBe(0);
  });
});

describe('PluginManager hooks', () => {
  let pm: PluginManager;

  beforeEach(() => {
    pm = new PluginManager();
  });

  describe('runBeforeVerify', () => {
    test('should fire hooks in registration order', async () => {
      const calls: string[] = [];
      await pm.registerAll([
        { name: 'a', beforeVerify: () => { calls.push('a'); } },
        { name: 'b', beforeVerify: () => { calls.push('b'); } },
      ]);
      await pm.runBeforeVerify(siteConfig());
      expect(calls).toEqual(['a', 'b']);
    });

    test('should share one metadata object across plugins', async () => {
      await pm.registerAll([
        { name: 'writer', beforeVerify: (ctx: BeforeVerifyContext) => { ctx.metadata.token = 'abc'; } },
        { name: 'reader', beforeVerify: (ctx: BeforeVerifyContext) => { ctx.metadata.seen = ctx.metadata.token; } },
      ]);
      const ctx = await pm.runBeforeVerify(siteConfig());
      expect(ctx.metadata.token).toBe('abc');
      expect(ctx.metadata.seen).toBe('abc');
    });

    test('should skip plugins without a beforeVerify hook', async () => {
      const calls: string[] = [];
      await pm.registerAll([
        { name: 'noop' },
        { name: 'acts', beforeVerify: () => { calls.push('acts'); } },
      ]);
      await pm.runBeforeVerify(siteConfig());
      expect(calls).toEqual(['acts']);
    });

    test('should short-circuit remaining hooks when one vetoes', async () => {
      const calls: string[] = [];
      await pm.registerAll([
        { name: 'a', beforeVerify: () => { calls.push('a'); } },
        { name: 'gate', beforeVerify: (ctx: BeforeVerifyContext) => { calls.push('gate'); ctx.veto = { reason: 'locked env' }; } },
        { name: 'c', beforeVerify: () => { calls.push('c'); } },
      ]);
      const ctx = await pm.runBeforeVerify(siteConfig());
      expect(ctx.veto).toEqual({ reason: 'locked env' });
      expect(calls).toEqual(['a', 'gate']); // c must not run
    });

    test('should convert a throwing hook into a veto', async () => {
      await pm.register({ name: 'boom', beforeVerify: () => { throw new Error('kaboom'); } });
      const ctx = await pm.runBeforeVerify(siteConfig());
      expect(ctx.veto).toBeDefined();
      expect(ctx.veto!.reason).toContain('boom');
      expect(ctx.veto!.reason).toContain('errored');
    });

    test('should expose the target url on the context', async () => {
      const ctx = await pm.runBeforeVerify(siteConfig({ url: 'https://test.example' }));
      expect(ctx.url).toBe('https://test.example');
    });
  });

  describe('runAfterVerify', () => {
    test('should fire hooks in order and collect additional checks', async () => {
      await pm.registerAll([
        { name: 'a', afterVerify: (ctx: AfterVerifyContext) => { ctx.additionalChecks.push({ name: 'A', type: 'x', passed: true, message: 'a ok' }); } },
        { name: 'b', afterVerify: (ctx: AfterVerifyContext) => { ctx.additionalChecks.push({ name: 'B', type: 'x', passed: false, message: 'b bad' }); } },
      ]);
      const checks = await pm.runAfterVerify(siteConfig(), testResult());
      expect(checks.map(c => c.name)).toEqual(['A', 'B']);
      expect(checks[1].passed).toBe(false);
    });

    test('should share metadata from beforeVerify', async () => {
      await pm.registerAll([
        { name: 'writer', beforeVerify: (ctx: BeforeVerifyContext) => { ctx.metadata.color = 'red'; } },
        { name: 'reader', afterVerify: (ctx: AfterVerifyContext) => { ctx.additionalChecks.push({ name: `color-${ctx.metadata.color}`, type: 'x', passed: true, message: '' }); } },
      ]);
      const cfg = siteConfig();
      await pm.runBeforeVerify(cfg);
      const checks = await pm.runAfterVerify(cfg, testResult());
      expect(checks[0].name).toBe('color-red');
    });

    test('should convert a throwing afterVerify hook into a warning check', async () => {
      await pm.register({ name: 'boom', afterVerify: () => { throw new Error('nope'); } });
      const checks = await pm.runAfterVerify(siteConfig(), testResult());
      expect(checks).toHaveLength(1);
      expect(checks[0].passed).toBe(false);
      expect(checks[0].severity).toBe('warning');
      expect(checks[0].message).toContain('boom');
    });

    test('should return an empty array when no plugin has afterVerify', async () => {
      await pm.registerAll([{ name: 'noop' }]);
      const checks = await pm.runAfterVerify(siteConfig(), testResult());
      expect(checks).toEqual([]);
    });
  });

  describe('metadata lifecycle', () => {
    test('resetMetadata should clear data between runs', async () => {
      await pm.register({ name: 'w', beforeVerify: (ctx: BeforeVerifyContext) => { ctx.metadata.thing = 1; } });
      const cfg = siteConfig();
      await pm.runBeforeVerify(cfg);
      expect(pm.getMetadata().thing).toBe(1);
      pm.resetMetadata();
      expect(pm.getMetadata().thing).toBeUndefined();
    });

    test('getMetadata should return a copy', async () => {
      await pm.register({ name: 'w', beforeVerify: (ctx: BeforeVerifyContext) => { ctx.metadata.thing = 1; } });
      await pm.runBeforeVerify(siteConfig());
      const m = pm.getMetadata();
      m.thing = 99;
      expect(pm.getMetadata().thing).toBe(1);
    });
  });
});
