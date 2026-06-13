/**
 * Report Exporter Service
 * Generates reports in various formats: Markdown, CSV, HTML, and PDF-ready HTML
 */

/**
 * Export format options
 */
export type ExportFormat = 'pdf' | 'md' | 'csv';

/**
 * Failure detail for reporting
 */
export interface FailureDetail {
  step: string;
  expected: string;
  actual: string;
  severity: string;
}

/**
 * Performance data point for reporting
 */
export interface PerformanceData {
  step: string;
  duration: number;
}

/**
 * Trend data point for reporting
 */
export interface TrendData {
  date: string;
  passRate: number;
}

/**
 * Summary statistics for report
 */
export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/**
 * Complete report data
 */
export interface ReportData {
  jobId: string;
  site: string;
  timestamp: string;
  summary: ReportSummary;
  failures: FailureDetail[];
  performance?: PerformanceData[];
  trend?: TrendData[];
}

/**
 * Report Exporter class
 */
export class ReportExporter {
  /**
   * Export report as Markdown
   */
  exportMarkdown(data: ReportData): string {
    const lines: string[] = [];

    // Header
    lines.push(`# E2E Verification Report`);
    lines.push('');
    lines.push(`**Site:** ${data.site}`);
    lines.push(`**Job ID:** ${data.jobId}`);
    lines.push(`**Timestamp:** ${new Date(data.timestamp).toLocaleString()}`);
    lines.push('');

    // Summary
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Checks | ${data.summary.total} |`);
    lines.push(`| Passed | ${data.summary.passed} |`);
    lines.push(`| Failed | ${data.summary.failed} |`);
    lines.push(`| Pass Rate | ${data.summary.passRate.toFixed(1)}% |`);
    lines.push('');

    // Failures
    if (data.failures.length > 0) {
      lines.push(`## Failures (${data.failures.length})`);
      lines.push('');
      lines.push(`| Step | Expected | Actual | Severity |`);
      lines.push(`|------|----------|--------|----------|`);

      for (const failure of data.failures) {
        const expected = this.escapeMarkdown(failure.expected);
        const actual = this.escapeMarkdown(failure.actual);
        lines.push(`| ${failure.step} | ${expected} | ${actual} | ${failure.severity} |`);
      }
      lines.push('');
    } else {
      lines.push(`## Failures`);
      lines.push('');
      lines.push(`✓ No failures detected`);
      lines.push('');
    }

    // Performance
    if (data.performance && data.performance.length > 0) {
      lines.push(`## Performance`);
      lines.push('');
      lines.push(`| Step | Duration (ms) |`);
      lines.push(`|------|---------------|`);

      for (const perf of data.performance) {
        lines.push(`| ${perf.step} | ${perf.duration} |`);
      }
      lines.push('');

      const totalDuration = data.performance.reduce((sum, p) => sum + p.duration, 0);
      lines.push(`**Total Duration:** ${totalDuration} ms`);
      lines.push('');
    }

    // Trend
    if (data.trend && data.trend.length > 0) {
      lines.push(`## Trend`);
      lines.push('');
      lines.push(`| Date | Pass Rate |`);
      lines.push(`|------|-----------|`);

      for (const t of data.trend) {
        lines.push(`| ${t.date} | ${t.passRate.toFixed(1)}% |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export report as CSV
   */
  exportCSV(data: ReportData): string {
    const lines: string[] = [];

    // Header with metadata
    lines.push(`# E2E Verification Report`);
    lines.push(`# Site: ${data.site}`);
    lines.push(`# Job ID: ${data.jobId}`);
    lines.push(`# Timestamp: ${data.timestamp}`);
    lines.push(`# Pass Rate: ${data.summary.passRate.toFixed(1)}%`);
    lines.push('');

    // Summary section
    lines.push('## SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Total Checks,${data.summary.total}`);
    lines.push(`Passed,${data.summary.passed}`);
    lines.push(`Failed,${data.summary.failed}`);
    lines.push(`Pass Rate,${data.summary.passRate.toFixed(1)}%`);
    lines.push('');

    // Failures section
    lines.push('## FAILURES');
    lines.push('Step,Expected,Actual,Severity');
    for (const failure of data.failures) {
      const step = this.escapeCSV(failure.step);
      const expected = this.escapeCSV(failure.expected);
      const actual = this.escapeCSV(failure.actual);
      lines.push(`${step},${expected},${actual},${failure.severity}`);
    }
    lines.push('');

    // Performance section
    if (data.performance && data.performance.length > 0) {
      lines.push('## PERFORMANCE');
      lines.push('Step,Duration (ms)');
      for (const perf of data.performance) {
        lines.push(`${perf.step},${perf.duration}`);
      }
      lines.push('');

      const totalDuration = data.performance.reduce((sum, p) => sum + p.duration, 0);
      lines.push(`Total Duration,${totalDuration}`);
      lines.push('');
    }

    // Trend section
    if (data.trend && data.trend.length > 0) {
      lines.push('## TREND');
      lines.push('Date,Pass Rate');
      for (const t of data.trend) {
        lines.push(`${t.date},${t.passRate.toFixed(1)}%`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export report as HTML
   * Returns a complete HTML document with inline CSS
   */
  exportHTML(data: ReportData): string {
    const summarySection = this.generateSummaryHTML(data);
    const failuresSection = this.generateFailuresHTML(data);
    const performanceSection = this.generatePerformanceHTML(data);
    const trendSection = this.generateTrendHTML(data);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E Verification Report - ${data.site}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f7fa;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header .meta {
      opacity: 0.9;
      font-size: 14px;
    }
    .section {
      padding: 25px 30px;
      border-bottom: 1px solid #ebeef5;
    }
    .section:last-child {
      border-bottom: none;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }
    .summary-card {
      background: #f5f7fa;
      border-radius: 6px;
      padding: 15px;
      text-align: center;
    }
    .summary-label {
      font-size: 12px;
      color: #909399;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 600;
      color: #303133;
    }
    .summary-value.pass { color: #67c23a; }
    .summary-value.fail { color: #f56c6c; }
    .summary-value.rate { color: #409eff; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ebeef5;
    }
    th {
      background: #f5f7fa;
      font-weight: 600;
      font-size: 13px;
      color: #606266;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      font-size: 14px;
      color: #303133;
    }
    .severity {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .severity.critical { background: #fef0f0; color: #f56c6c; }
    .severity.high { background: #fdf6ec; color: #e6a23c; }
    .severity.medium { background: #ecf5ff; color: #409eff; }
    .severity.low { background: #f0f9ff; color: #909399; }
    .no-data {
      text-align: center;
      padding: 30px;
      color: #909399;
      font-style: italic;
    }
    .pass-indicator {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .pass-indicator.pass { background: #67c23a; }
    .pass-indicator.fail { background: #f56c6c; }
    @media print {
      body { padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>E2E Verification Report</h1>
      <div class="meta">
        Site: ${this.escapeHTML(data.site)} |
        Job: ${this.escapeHTML(data.jobId)} |
        ${new Date(data.timestamp).toLocaleString()}
      </div>
    </div>

    ${summarySection}

    ${failuresSection}

    ${performanceSection}

    ${trendSection}

    <div class="section">
      <div style="text-align: center; color: #909399; font-size: 12px; padding: 20px 0;">
        Generated by e2e-verifier
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Export report as PDF-ready HTML
   * Returns HTML string that can be converted to PDF using puppeteer or similar
   * If puppeteer is not available, returns the HTML for browser printing
   */
  exportPDFReady(data: ReportData): string {
    // Add PDF-specific styles to the HTML
    const baseHTML = this.exportHTML(data);

    // Inject PDF-specific styles
    const pdfStyles = `
    @media print {
      @page {
        size: A4;
        margin: 1cm;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .section {
        page-break-inside: avoid;
      }
      table {
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
    }`;

    return baseHTML.replace('</style>', `  ${pdfStyles}\n  </style>`);
  }

  /**
   * Generate summary section HTML
   */
  private generateSummaryHTML(data: ReportData): string {
    const passRate = data.summary.passRate;
    const passRateClass = passRate >= 80 ? 'pass' : passRate >= 50 ? 'rate' : 'fail';

    return `
    <div class="section">
      <div class="section-title">📊 Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Total Checks</div>
          <div class="summary-value">${data.summary.total}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Passed</div>
          <div class="summary-value pass">${data.summary.passed}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Failed</div>
          <div class="summary-value fail">${data.summary.failed}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Pass Rate</div>
          <div class="summary-value ${passRateClass}">${passRate.toFixed(1)}%</div>
        </div>
      </div>
    </div>`;
  }

  /**
   * Generate failures section HTML
   */
  private generateFailuresHTML(data: ReportData): string {
    if (data.failures.length === 0) {
      return `
    <div class="section">
      <div class="section-title">
        <span class="pass-indicator pass"></span>
        Failures
      </div>
      <div class="no-data">✓ No failures detected</div>
    </div>`;
    }

    const rows = data.failures.map(f => {
      const severityClass = f.severity.toLowerCase();
      return `
      <tr>
        <td>${this.escapeHTML(f.step)}</td>
        <td>${this.escapeHTML(f.expected)}</td>
        <td>${this.escapeHTML(f.actual)}</td>
        <td><span class="severity ${severityClass}">${f.severity}</span></td>
      </tr>`;
    }).join('');

    return `
    <div class="section">
      <div class="section-title">
        <span class="pass-indicator fail"></span>
        Failures (${data.failures.length})
      </div>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>`;
  }

  /**
   * Generate performance section HTML
   */
  private generatePerformanceHTML(data: ReportData): string {
    if (!data.performance || data.performance.length === 0) {
      return '';
    }

    const rows = data.performance.map(p => `
      <tr>
        <td>${this.escapeHTML(p.step)}</td>
        <td>${p.duration}</td>
      </tr>`).join('');

    const totalDuration = data.performance.reduce((sum, p) => sum + p.duration, 0);

    return `
    <div class="section">
      <div class="section-title">⚡ Performance</div>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Duration (ms)</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
        <tfoot>
          <tr style="background: #f5f7fa; font-weight: 600;">
            <td>Total</td>
            <td>${totalDuration}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }

  /**
   * Generate trend section HTML
   */
  private generateTrendHTML(data: ReportData): string {
    if (!data.trend || data.trend.length === 0) {
      return '';
    }

    const rows = data.trend.map(t => `
      <tr>
        <td>${this.escapeHTML(t.date)}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 100px; height: 8px; background: #ebeef5; border-radius: 4px; overflow: hidden;">
              <div style="width: ${Math.min(t.passRate, 100)}%; height: 100%; background: ${t.passRate >= 80 ? '#67c23a' : t.passRate >= 50 ? '#e6a23c' : '#f56c6c'};"></div>
            </div>
            <span>${t.passRate.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`).join('');

    return `
    <div class="section">
      <div class="section-title">📈 Trend</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Pass Rate</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape CSV special characters
   */
  private escapeCSV(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  /**
   * Escape Markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return text
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
  }
}
