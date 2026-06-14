/**
 * ReportGenerator unit tests
 *
 * Covers aggregation (generateReport, generateUnifiedReport), file
 * persistence (saveJSONReport, saveLatestReport, saveSummary,
 * saveUnifiedReport, saveHtmlReport), and summary text formatting.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReportGenerator } from '../src/utils/report';
import { TestResult, UnifiedResult, Artifact } from '../src/types';

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    siteName: 'Example',
    url: 'https://example.com',
    timestamp: new Date().toISOString(),
    passed: true,
    duration: 250,
    checks: [
      { name: 'status', type: 'http', passed: true, message: '200 OK' },
      { name: 'title', type: 'element', passed: true, message: 'Title present' },
    ],
    screenshots: [
      { name: 'home', path: '/tmp/home.png', viewport: 'desktop', timestamp: new Date().toISOString() },
    ],
    errors: [],
    ...overrides,
  };
}

function makeUnifiedResult(overrides: Partial<UnifiedResult> = {}): UnifiedResult {
  return {
    taskId: 'task-1',
    scenarioId: 'scn-1',
    status: 'passed',
    summary: 'Scenario passed',
    checks: [{ name: 'assertion', type: 'assertion', passed: true, message: 'ok' }],
    artifacts: [],
    timestamp: new Date().toISOString(),
    duration: 500,
    ...overrides,
  };
}

describe('ReportGenerator', () => {
  let tempDir: string;
  let generator: ReportGenerator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-gen-test-'));
    generator = new ReportGenerator(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateReport', () => {
    test('should aggregate passed and failed sites', () => {
      const report = generator.generateReport([
        makeResult({ siteName: 'A', passed: true }),
        makeResult({
          siteName: 'B',
          passed: false,
          checks: [
            { name: 'status', type: 'http', passed: true, message: '200' },
            { name: 'title', type: 'element', passed: false, message: 'missing' },
          ],
          errors: ['title missing'],
        }),
      ]);

      expect(report.totalSites).toBe(2);
      expect(report.passedSites).toBe(1);
      expect(report.failedSites).toBe(1);
      expect(report.summary.totalChecks).toBe(4);
      expect(report.summary.passedChecks).toBe(3);
      expect(report.summary.failedChecks).toBe(1);
      expect(report.summary.totalErrors).toBe(1);
      expect(typeof report.timestamp).toBe('string');
    });

    test('should produce an empty report for no results', () => {
      const report = generator.generateReport([]);
      expect(report.totalSites).toBe(0);
      expect(report.passedSites).toBe(0);
      expect(report.summary.totalChecks).toBe(0);
      expect(report.results).toEqual([]);
    });

    test('should count checks even on a passing site with zero checks', () => {
      const report = generator.generateReport([makeResult({ checks: [] })]);
      expect(report.summary.totalChecks).toBe(0);
      expect(report.passedSites).toBe(1);
    });
  });

  describe('saveJSONReport', () => {
    test('should write a JSON report file and return its path', () => {
      const report = generator.generateReport([makeResult()]);
      const filepath = generator.saveJSONReport(report);

      expect(fs.existsSync(filepath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      expect(written.totalSites).toBe(1);
      expect(path.dirname(filepath)).toBe(tempDir);
    });

    test('should honor a caller-supplied filename', () => {
      const report = generator.generateReport([makeResult()]);
      const filepath = generator.saveJSONReport(report, 'custom.json');
      expect(path.basename(filepath)).toBe('custom.json');
    });

    test('should create the reports directory if missing', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
      const filepath = generator.saveJSONReport(generator.generateReport([]));
      expect(fs.existsSync(filepath)).toBe(true);
    });
  });

  describe('saveLatestReport', () => {
    test('should write latest.json into the reports directory', () => {
      const report = generator.generateReport([makeResult()]);
      generator.saveLatestReport(report);
      const latestPath = path.join(tempDir, 'latest.json');
      expect(fs.existsSync(latestPath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
      expect(written.totalSites).toBe(1);
    });
  });

  describe('generateSummary', () => {
    test('should include header, counts, and per-site detail', () => {
      const report = generator.generateReport([
        makeResult({ siteName: 'Example', passed: false, errors: ['err1'] }),
      ]);
      const text = generator.generateSummary(report);

      expect(text).toContain('E2E VERIFICATION REPORT');
      expect(text).toContain('Total Sites: 1');
      expect(text).toContain('Total Checks: 2');
      expect(text).toContain('SITE: Example');
      expect(text).toContain('✗ FAILED');
      expect(text).toContain('Screenshots:');
    });

    test('should mark a passing site with a checkmark', () => {
      const report = generator.generateReport([makeResult({ passed: true })]);
      const text = generator.generateSummary(report);
      expect(text).toContain('✓ PASSED');
    });
  });

  describe('saveSummary', () => {
    test('should write a summary txt file and return its path', () => {
      const report = generator.generateReport([makeResult()]);
      const filepath = generator.saveSummary(report);
      expect(fs.existsSync(filepath)).toBe(true);
      expect(filepath).toMatch(/summary-.*\.txt$/);
      const content = fs.readFileSync(filepath, 'utf-8');
      expect(content).toContain('E2E VERIFICATION REPORT');
    });
  });

  describe('printSummary', () => {
    test('should not throw', () => {
      const report = generator.generateReport([makeResult()]);
      expect(() => generator.printSummary(report)).not.toThrow();
    });
  });

  describe('generateUnifiedReport', () => {
    test('should aggregate task counts and status buckets', () => {
      const report = generator.generateUnifiedReport([
        makeUnifiedResult({ taskId: 't1', status: 'passed' }),
        makeUnifiedResult({ taskId: 't2', status: 'failed' }),
        makeUnifiedResult({ taskId: 't3', status: 'flaky' }),
        makeUnifiedResult({ taskId: 't3', status: 'skipped' }),
      ]);

      expect(report.summary.totalTasks).toBe(3);
      expect(report.summary.totalResults).toBe(4);
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(1);
      expect(report.summary.flaky).toBe(1);
      expect(report.summary.skipped).toBe(1);
      expect(report.summary.totalDuration).toBe(2000);
    });

    test('should classify assertion_failed and infra_failed as failed', () => {
      const report = generator.generateUnifiedReport([
        makeUnifiedResult({ status: 'assertion_failed' }),
        makeUnifiedResult({ status: 'infra_failed' }),
      ]);
      expect(report.summary.failed).toBe(2);
    });

    test('should produce an empty summary for no results', () => {
      const report = generator.generateUnifiedReport([]);
      expect(report.summary.totalTasks).toBe(0);
      expect(report.summary.totalResults).toBe(0);
    });
  });

  describe('saveUnifiedReport / saveHtmlReport', () => {
    test('saveUnifiedReport should write a unified JSON file', () => {
      const report = generator.generateUnifiedReport([makeUnifiedResult()]);
      const filepath = generator.saveUnifiedReport(report, 'unified.json');
      expect(fs.existsSync(filepath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      expect(written.summary.totalTasks).toBe(1);
    });

    test('saveHtmlReport should write an HTML file with content', () => {
      const filepath = generator.saveHtmlReport([makeUnifiedResult()]);
      expect(fs.existsSync(filepath)).toBe(true);
      expect(filepath.endsWith('.html')).toBe(true);
      const html = fs.readFileSync(filepath, 'utf-8');
      expect(html.length).toBeGreaterThan(0);
    });
  });

  describe('aggregateEvidence', () => {
    function artifact(type: Artifact['type'], p: string): Artifact {
      return { type, path: p, timestamp: new Date().toISOString() };
    }

    test('should skip passing results entirely', () => {
      const map = generator.aggregateEvidence([makeUnifiedResult({ status: 'passed', artifacts: [artifact('screenshot', '/x.png')] })]);
      expect(map.size).toBe(0);
    });

    test('should collect console, network, screenshot and dom evidence for failed results', () => {
      const consolePath = path.join(tempDir, 'console.json');
      const networkPath = path.join(tempDir, 'network.json');
      const domPath = path.join(tempDir, 'dom.html');
      fs.writeFileSync(consolePath, JSON.stringify([{ message: 'err', type: 'error', timestamp: 1 }]));
      fs.writeFileSync(networkPath, JSON.stringify({ failed: [{ url: '/api', status: 500 }] }));
      fs.writeFileSync(domPath, '<html><body>snapshot</body></html>');

      const results: UnifiedResult[] = [
        makeUnifiedResult({
          status: 'failed',
          scenarioId: 'scn-fail',
          artifacts: [
            artifact('console-log', consolePath),
            artifact('network-log', networkPath),
            artifact('screenshot', '/tmp/x.png'),
            artifact('dom-snapshot', domPath),
          ],
        }),
      ];

      const map = generator.aggregateEvidence(results);
      expect(map.size).toBe(1);
      const evidence = map.get('scn-fail')!;
      expect(evidence.console).toHaveLength(1);
      expect(evidence.network).toEqual([{ url: '/api', status: 500 }]);
      expect(evidence.screenshot).toBe('/tmp/x.png');
      expect(evidence.domSnapshot).toContain('snapshot');
    });

    test('should use stepId as the key when present', () => {
      const results: UnifiedResult[] = [
        makeUnifiedResult({
          status: 'failed',
          stepId: 'step-7',
          scenarioId: 'scn-1',
          artifacts: [artifact('screenshot', '/x.png')],
        }),
      ];
      const map = generator.aggregateEvidence(results);
      expect(map.has('step-7')).toBe(true);
      expect(map.has('scn-1')).toBe(false);
    });

    test('should ignore artifacts pointing at non-existent files', () => {
      const map = generator.aggregateEvidence([
        makeUnifiedResult({
          status: 'failed',
          scenarioId: 'scn-1',
          artifacts: [
            artifact('console-log', path.join(tempDir, 'missing.json')),
            artifact('network-log', path.join(tempDir, 'missing-net.json')),
            artifact('dom-snapshot', path.join(tempDir, 'missing-dom.html')),
          ],
        }),
      ]);
      // screenshot does not require the file to exist, so we still get 1 entry
      expect(map.size).toBe(0);
    });

    test('should fall back to an error console entry when the JSON is malformed', () => {
      const badPath = path.join(tempDir, 'bad.json');
      fs.writeFileSync(badPath, '{not json');
      const map = generator.aggregateEvidence([
        makeUnifiedResult({
          status: 'failed',
          scenarioId: 'scn-1',
          artifacts: [artifact('console-log', badPath)],
        }),
      ]);
      const evidence = map.get('scn-1')!;
      expect(Array.isArray(evidence.console)).toBe(true);
      expect((evidence.console as any[])[0].message).toContain('Failed to parse');
    });

    test('should default network evidence to [] on parse failure', () => {
      const badPath = path.join(tempDir, 'bad-net.json');
      fs.writeFileSync(badPath, '{not json');
      const map = generator.aggregateEvidence([
        makeUnifiedResult({
          status: 'failed',
          scenarioId: 'scn-1',
          artifacts: [artifact('network-log', badPath)],
        }),
      ]);
      const evidence = map.get('scn-1')!;
      expect(evidence.network).toEqual([]);
    });
  });

  describe('printUnifiedSummary', () => {
    test('should not throw and should respect root cause / step fields', () => {
      const report = generator.generateUnifiedReport([
        makeUnifiedResult({
          taskId: 't1',
          status: 'failed',
          stepId: 'step-2',
          summary: 'assertion blew up',
          rootCause: { category: 'selector' as any, message: 'button not found' },
          artifacts: [{ type: 'screenshot', path: '/x.png', timestamp: new Date().toISOString() }],
        }),
      ]);
      expect(() => generator.printUnifiedSummary(report)).not.toThrow();
    });

    test('should not throw for an empty report', () => {
      const report = generator.generateUnifiedReport([]);
      expect(() => generator.printUnifiedSummary(report)).not.toThrow();
    });
  });
});
