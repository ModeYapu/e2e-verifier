/**
 * Viewport Matrix unit tests
 *
 * Covers viewport presets (resolution, lookup, validation) and the
 * MatrixRunner pure-logic helpers: validateMatrixConfig (static),
 * generateCombinations (Cartesian product), buildMatrixResult, and
 * createErrorResult.
 */

import {
  VIEWPORT_PRESETS,
  getViewportConfig,
  getAllPresets,
  isPreset,
  resolveViewport,
} from '../../src/config/viewport-presets';
import { MatrixRunner } from '../../src/runner/matrix-runner';
import { DeviceMatrixConfig } from '../../src/types';

// Accessor for MatrixRunner private pure-logic helpers (no I/O)
type MatrixRunnerInternals = {
  generateCombinations: (cfg: DeviceMatrixConfig) => any[];
  buildMatrixResult: (siteConfig: any, results: any[], startTime: number) => any;
  createErrorResult: (siteConfig: any, combination: any, error: string) => any;
};
function internals(runner: MatrixRunner): MatrixRunnerInternals {
  return runner as unknown as MatrixRunnerInternals;
}

describe('Viewport Presets', () => {
  describe('VIEWPORT_PRESETS', () => {
    test('should include desktop, tablet, and mobile presets', () => {
      expect(VIEWPORT_PRESETS.desktop).toBeDefined();
      expect(VIEWPORT_PRESETS.tablet).toBeDefined();
      expect(VIEWPORT_PRESETS.mobile).toBeDefined();
    });

    test('every preset should have a name, positive width and height', () => {
      for (const preset of Object.values(VIEWPORT_PRESETS)) {
        expect(preset.name).toBeTruthy();
        expect(preset.width).toBeGreaterThan(0);
        expect(preset.height).toBeGreaterThan(0);
      }
    });

    test('desktop should be 1920x1080', () => {
      expect(VIEWPORT_PRESETS.desktop.width).toBe(1920);
      expect(VIEWPORT_PRESETS.desktop.height).toBe(1080);
    });

    test('mobile should be smaller than desktop', () => {
      expect(VIEWPORT_PRESETS.mobile.width).toBeLessThan(VIEWPORT_PRESETS.desktop.width);
    });
  });

  describe('getViewportConfig', () => {
    test('should return a preset by name', () => {
      const cfg = getViewportConfig('desktop');
      expect(cfg.name).toBe('desktop');
      expect(cfg.width).toBe(1920);
    });

    test('should throw for an unknown preset, listing available presets', () => {
      expect(() => getViewportConfig('flip-phone')).toThrow(/Unknown viewport preset/);
      expect(() => getViewportConfig('flip-phone')).toThrow(/desktop/);
    });
  });

  describe('getAllPresets', () => {
    test('should return an array including desktop and mobile', () => {
      const names = getAllPresets();
      expect(Array.isArray(names)).toBe(true);
      expect(names).toContain('desktop');
      expect(names).toContain('mobile');
      expect(names.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('isPreset', () => {
    test('should return true for known presets', () => {
      expect(isPreset('desktop')).toBe(true);
      expect(isPreset('mobile')).toBe(true);
    });

    test('should return false for unknown names', () => {
      expect(isPreset('foldable')).toBe(false);
      expect(isPreset('')).toBe(false);
    });
  });

  describe('resolveViewport', () => {
    test('should resolve a string preset into its config', () => {
      const cfg = resolveViewport('tablet');
      expect(cfg.name).toBe('tablet');
      expect(cfg.width).toBe(768);
    });

    test('should pass through a valid custom viewport object', () => {
      const custom = { name: 'ultrawide', width: 3440, height: 1440 };
      expect(resolveViewport(custom)).toEqual(custom);
    });

    test('should reject a custom viewport missing dimensions', () => {
      expect(() => resolveViewport({ name: 'bad' } as any)).toThrow(/width and height/);
    });
  });
});

describe('MatrixRunner.validateMatrixConfig', () => {
  test('should accept a fully valid config', () => {
    const cfg: DeviceMatrixConfig = {
      browsers: ['chromium', 'firefox'],
      viewports: [
        { name: 'desktop', width: 1920, height: 1080 },
        { name: 'mobile', width: 375, height: 812 },
      ],
      locales: ['en-US', 'zh-CN'],
    };
    const result = MatrixRunner.validateMatrixConfig(cfg);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should accept a minimal config (uses defaults)', () => {
    const result = MatrixRunner.validateMatrixConfig({});
    expect(result.valid).toBe(true);
  });

  test('should flag an invalid browser type', () => {
    const result = MatrixRunner.validateMatrixConfig({
      browsers: ['chromium', 'safari' as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('safari'))).toBe(true);
  });

  test('should flag a viewport with non-positive width', () => {
    const result = MatrixRunner.validateMatrixConfig({
      viewports: [{ name: 'bad', width: 0, height: 100 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('viewport'))).toBe(true);
  });

  test('should flag a viewport missing a name', () => {
    const result = MatrixRunner.validateMatrixConfig({
      viewports: [{ width: 100, height: 100 } as any],
    });
    expect(result.valid).toBe(false);
  });

  test('should flag a locale that does not match the xx-XX pattern', () => {
    const result = MatrixRunner.validateMatrixConfig({
      locales: ['english', 'en-us', 'en_US'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  test('should accept a well-formed locale', () => {
    const result = MatrixRunner.validateMatrixConfig({
      locales: ['en-US', 'zh-CN', 'ja-JP'],
    });
    expect(result.valid).toBe(true);
  });
});

describe('MatrixRunner combination generation (private helper)', () => {
  let runner: MatrixRunner;

  beforeEach(() => {
    runner = new MatrixRunner();
  });

  test('should produce the full Cartesian product', () => {
    const cfg: DeviceMatrixConfig = {
      browsers: ['chromium', 'firefox'],
      viewports: [
        { name: 'desktop', width: 1920, height: 1080 },
        { name: 'mobile', width: 375, height: 812 },
      ],
      locales: ['en-US', 'zh-CN'],
    };
    const combos = internals(runner).generateCombinations(cfg);
    // 2 browsers × 2 viewports × 2 locales = 8
    expect(combos).toHaveLength(8);

    // every combination references one of each dimension
    for (const c of combos) {
      expect(cfg.browsers).toContain(c.browser);
      expect(cfg.viewports).toContainEqual(c.viewport);
      expect(cfg.locales).toContain(c.locale);
    }
  });

  test('should apply defaults when dimensions are omitted', () => {
    const combos = internals(runner).generateCombinations({});
    expect(combos).toHaveLength(1);
    expect(combos[0].browser).toBe('chromium');
    expect(combos[0].viewport.name).toBe('desktop');
    expect(combos[0].locale).toBe('en-US');
  });

  test('should handle a single browser across multiple viewports', () => {
    const cfg: DeviceMatrixConfig = {
      browsers: ['chromium'],
      viewports: [
        { name: 'a', width: 1, height: 1 },
        { name: 'b', width: 2, height: 2 },
        { name: 'c', width: 3, height: 3 },
      ],
      locales: ['en-US'],
    };
    const combos = internals(runner).generateCombinations(cfg);
    expect(combos).toHaveLength(3);
    const names = combos.map(c => c.viewport.name);
    expect(names).toEqual(['a', 'b', 'c']);
  });
});

describe('MatrixRunner result building (private helpers)', () => {
  let runner: MatrixRunner;

  beforeEach(() => {
    runner = new MatrixRunner();
  });

  test('buildMatrixResult should aggregate pass/fail counts and group by browser', () => {
    const siteConfig = { name: 'Example', url: 'https://example.com' };
    const results = [
      {
        combination: { browser: 'chromium', viewport: { name: 'desktop', width: 1, height: 1 }, locale: 'en-US' },
        passed: true,
      },
      {
        combination: { browser: 'firefox', viewport: { name: 'desktop', width: 1, height: 1 }, locale: 'en-US' },
        passed: false,
      },
    ];

    const matrix = internals(runner).buildMatrixResult(siteConfig, results as any[], 1000);
    expect(matrix.siteName).toBe('Example');
    expect(matrix.summary.total).toBe(2);
    expect(matrix.summary.passed).toBe(1);
    expect(matrix.summary.failed).toBe(1);
    expect(matrix.byBrowser.chromium).toEqual({ total: 1, passed: 1, failed: 0 });
    expect(matrix.byBrowser.firefox).toEqual({ total: 1, passed: 0, failed: 1 });
    expect(matrix.summary.totalDuration).toBeGreaterThanOrEqual(0);
    expect(typeof matrix.timestamp).toBe('string');
  });

  test('createErrorResult should produce a failing TestResult with the error message', () => {
    const siteConfig = { name: 'Example', url: 'https://example.com' };
    const combination = { browser: 'webkit', viewport: { name: 'mobile', width: 1, height: 1 }, locale: 'en-US' };
    const result = internals(runner).createErrorResult(siteConfig as any, combination, 'boom');

    expect(result.passed).toBe(false);
    expect(result.siteName).toBe('Example');
    expect(result.errors).toEqual(['boom']);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].message).toContain('webkit');
    expect(result.checks[0].message).toContain('boom');
  });
});
