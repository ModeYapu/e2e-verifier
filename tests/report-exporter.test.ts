/**
 * Report Exporter Tests
 * Tests for report generation in various formats
 */

import {
  ReportExporter,
  ReportData,
  ReportSummary,
  FailureDetail,
  PerformanceData,
  TrendData
} from '../src/services/report-exporter';

describe('ReportExporter', () => {
  let exporter: ReportExporter;
  let sampleData: ReportData;

  beforeEach(() => {
    exporter = new ReportExporter();

    const summary: ReportSummary = {
      total: 10,
      passed: 7,
      failed: 3,
      passRate: 70
    };

    const failures: FailureDetail[] = [
      {
        step: 'Check page title',
        expected: 'Expected Title',
        actual: 'Wrong Title',
        severity: 'high'
      },
      {
        step: 'Check button click',
        expected: 'Button to work',
        actual: 'Button not responding',
        severity: 'critical'
      },
      {
        step: 'Check form validation',
        expected: 'Form to validate',
        actual: 'Validation error',
        severity: 'medium'
      }
    ];

    const performance: PerformanceData[] = [
      { step: 'navigate', duration: 150 },
      { step: 'interact', duration: 75 },
      { step: 'screenshot', duration: 50 }
    ];

    const trend: TrendData[] = [
      { date: '2024-01-01', passRate: 80 },
      { date: '2024-01-02', passRate: 75 },
      { date: '2024-01-03', passRate: 70 }
    ];

    sampleData = {
      jobId: 'test-job-123',
      site: 'example.com',
      timestamp: '2024-01-15T10:30:00Z',
      summary,
      failures,
      performance,
      trend
    };
  });

  describe('exportMarkdown', () => {
    test('generates markdown with all key sections', () => {
      const markdown = exporter.exportMarkdown(sampleData);

      // Check for header
      expect(markdown).toContain('# E2E Verification Report');

      // Check for metadata
      expect(markdown).toContain('example.com');
      expect(markdown).toContain('test-job-123');

      // Check for summary section
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('Total Checks');
      expect(markdown).toContain('Passed');
      expect(markdown).toContain('Failed');
      expect(markdown).toContain('Pass Rate');

      // Check for failures section
      expect(markdown).toContain('## Failures');
      expect(markdown).toContain('Check page title');
      expect(markdown).toContain('Expected Title');
      expect(markdown).toContain('Wrong Title');

      // Check for performance section
      expect(markdown).toContain('## Performance');
      expect(markdown).toContain('navigate');
      expect(markdown).toContain('Total Duration');

      // Check for trend section
      expect(markdown).toContain('## Trend');
      expect(markdown).toContain('2024-01-01');
    });

    test('includes proper markdown table formatting', () => {
      const markdown = exporter.exportMarkdown(sampleData);

      // Check for table syntax
      expect(markdown).toContain('|');
      expect(markdown).toContain('---'); // Markdown table separator
    });

    test('handles empty failures gracefully', () => {
      const emptyData: ReportData = {
        ...sampleData,
        failures: []
      };

      const markdown = exporter.exportMarkdown(emptyData);
      expect(markdown).toContain('No failures detected');
    });

    test('handles missing optional sections', () => {
      const minimalData: ReportData = {
        jobId: 'test-job',
        site: 'test.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 1, passed: 1, failed: 0, passRate: 100 },
        failures: []
      };

      const markdown = exporter.exportMarkdown(minimalData);

      // Should still have basic structure
      expect(markdown).toContain('# E2E Verification Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('No failures detected');
    });
  });

  describe('exportCSV', () => {
    test('generates CSV with proper structure', () => {
      const csv = exporter.exportCSV(sampleData);

      // Check for header with metadata
      expect(csv).toContain('# E2E Verification Report');
      expect(csv).toContain('# Site: example.com');

      // Check for summary section
      expect(csv).toContain('## SUMMARY');
      expect(csv).toContain('Metric,Value');
      expect(csv).toContain('Total Checks,10');

      // Check for failures section
      expect(csv).toContain('## FAILURES');
      expect(csv).toContain('Step,Expected,Actual,Severity');
      expect(csv).toContain('Check page title,Expected Title,Wrong Title,high');

      // Check for performance section
      expect(csv).toContain('## PERFORMANCE');
      expect(csv).toContain('Step,Duration (ms)');

      // Check for trend section
      expect(csv).toContain('## TREND');
      expect(csv).toContain('Date,Pass Rate');
    });

    test('properly escapes CSV special characters', () => {
      const dataWithSpecialChars: ReportData = {
        ...sampleData,
        failures: [
          {
            step: 'Step, with, commas',
            expected: 'Expected "value"',
            actual: 'Actual\nwith newline',
            severity: 'high'
          }
        ]
      };

      const csv = exporter.exportCSV(dataWithSpecialChars);

      // Check that fields with special chars are quoted
      expect(csv).toContain('"Step, with, commas"');
      expect(csv).toContain('"Expected ""value"""');
    });

    test('handles empty failures', () => {
      const emptyData: ReportData = {
        ...sampleData,
        failures: []
      };

      const csv = exporter.exportCSV(emptyData);

      // Should still have structure
      expect(csv).toContain('## SUMMARY');
      expect(csv).toContain('## FAILURES');
    });
  });

  describe('exportHTML', () => {
    test('generates complete HTML document', () => {
      const html = exporter.exportHTML(sampleData);

      // Check for HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</html>');
    });

    test('includes inline CSS styling', () => {
      const html = exporter.exportHTML(sampleData);

      expect(html).toContain('<style>');
      expect(html).toContain('.container');
      expect(html).toContain('.header');
      expect(html).toContain('.section');
    });

    test('contains all key data sections', () => {
      const html = exporter.exportHTML(sampleData);

      // Check for header with metadata
      expect(html).toContain('example.com');
      expect(html).toContain('test-job-123');

      // Check for summary
      expect(html).toContain('Total Checks');
      expect(html).toContain('10'); // total count

      // Check for failures
      expect(html).toContain('Check page title');
      expect(html).toContain('Expected Title');

      // Check for performance
      expect(html).toContain('navigate');
      expect(html).toContain('150'); // duration

      // Check for trend
      expect(html).toContain('2024-01-01');
      expect(html).toContain('80'); // pass rate
    });

    test('includes severity classes', () => {
      const html = exporter.exportHTML(sampleData);

      expect(html).toContain('severity critical');
      expect(html).toContain('severity high');
      expect(html).toContain('severity medium');
    });

    test('handles empty failures with success message', () => {
      const emptyData: ReportData = {
        ...sampleData,
        failures: []
      };

      const html = exporter.exportHTML(emptyData);
      expect(html).toContain('No failures detected');
    });

    test('generates responsive HTML', () => {
      const html = exporter.exportHTML(sampleData);

      // Check for viewport meta tag
      expect(html).toContain('viewport');

      // Check for responsive CSS
      expect(html).toContain('@media');
    });
  });

  describe('exportPDFReady', () => {
    test('includes PDF-specific styles', () => {
      const pdf = exporter.exportPDFReady(sampleData);

      // Should still be valid HTML
      expect(pdf).toContain('<!DOCTYPE html>');
      expect(pdf).toContain('</html>');

      // Should include PDF-specific media queries
      expect(pdf).toContain('@page');
      expect(pdf).toContain('@media print');
    });

    test('maintains all content from base HTML', () => {
      const pdf = exporter.exportPDFReady(sampleData);

      expect(pdf).toContain('example.com');
      expect(pdf).toContain('Check page title');
      expect(pdf).toContain('navigate');
    });
  });

  describe('edge cases and special characters', () => {
    test('handles special characters in failure details', () => {
      const specialData: ReportData = {
        jobId: 'job-<script>',
        site: 'example.com & test.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 1, passed: 0, failed: 1, passRate: 0 },
        failures: [
          {
            step: 'Step with <tag> & symbols',
            expected: 'Expected "quoted" value',
            actual: 'Actual with \'quotes\' & ampersands',
            severity: 'critical'
          }
        ]
      };

      const html = exporter.exportHTML(specialData);
      const markdown = exporter.exportMarkdown(specialData);

      // HTML should escape special characters
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('example.com &amp; test.com');
      expect(html).toContain('&lt;tag&gt;');

      // Markdown should handle quotes
      expect(markdown).toContain('job-<script>');
    });

    test('handles very long step names', () => {
      const longStepName = 'A'.repeat(200);
      const longData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 1, passed: 0, failed: 1, passRate: 0 },
        failures: [
          {
            step: longStepName,
            expected: 'Expected',
            actual: 'Actual',
            severity: 'high'
          }
        ]
      };

      const html = exporter.exportHTML(longData);
      const csv = exporter.exportCSV(longData);

      expect(html).toContain(longStepName);
      expect(csv).toContain(longStepName);
    });

    test('handles zero total checks', () => {
      const zeroData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 0, passed: 0, failed: 0, passRate: 0 },
        failures: []
      };

      const html = exporter.exportHTML(zeroData);
      const markdown = exporter.exportMarkdown(zeroData);

      expect(html).toContain('0');
      expect(markdown).toContain('0');
    });

    test('handles perfect pass rate (100%)', () => {
      const perfectData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 10, passed: 10, failed: 0, passRate: 100 },
        failures: []
      };

      const html = exporter.exportHTML(perfectData);

      expect(html).toContain('100');
      expect(html).toContain('No failures detected');
    });

    test('handles zero pass rate (0%)', () => {
      const failData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 10, passed: 0, failed: 10, passRate: 0 },
        failures: Array(10).fill({
          step: 'Failed step',
          expected: 'Expected',
          actual: 'Actual',
          severity: 'critical'
        }).map((f, i) => ({ ...f, step: `Failed step ${i}` }))
      };

      const html = exporter.exportHTML(failData);

      expect(html).toContain('0');
      expect(html).toContain('10'); // failed count
    });
  });

  describe('performance data handling', () => {
    test('calculates total duration correctly', () => {
      const perfData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 0, passed: 0, failed: 0, passRate: 0 },
        failures: [],
        performance: [
          { step: 'step1', duration: 100 },
          { step: 'step2', duration: 200 },
          { step: 'step3', duration: 150 }
        ]
      };

      const markdown = exporter.exportMarkdown(perfData);
      const html = exporter.exportHTML(perfData);

      expect(markdown).toContain('450'); // Total: 100 + 200 + 150
      expect(html).toContain('450');
    });

    test('handles missing performance section', () => {
      const noPerfData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 1, passed: 1, failed: 0, passRate: 100 },
        failures: []
      };

      const markdown = exporter.exportMarkdown(noPerfData);
      const html = exporter.exportHTML(noPerfData);

      // Should not have performance section
      expect(markdown).not.toContain('## Performance');
      expect(html).not.toContain('Performance');
    });
  });

  describe('trend data handling', () => {
    test('displays trend data correctly', () => {
      const html = exporter.exportHTML(sampleData);

      expect(html).toContain('2024-01-01');
      expect(html).toContain('2024-01-02');
      expect(html).toContain('2024-01-03');
    });

    test('uses color coding for pass rates in HTML', () => {
      const html = exporter.exportHTML(sampleData);

      // Check for color styles (green for >= 80%, etc.)
      expect(html).toContain('#67c23a'); // Green for high pass rate
      expect(html).toContain('#e6a23c'); // Orange for medium
      expect(html).toContain('#f56c6c'); // Red for low
    });

    test('handles missing trend section', () => {
      const noTrendData: ReportData = {
        jobId: 'test-job',
        site: 'example.com',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 1, passed: 1, failed: 0, passRate: 100 },
        failures: []
      };

      const html = exporter.exportHTML(noTrendData);

      // Should not have trend section
      expect(html).not.toContain('Trend');
    });
  });
});
