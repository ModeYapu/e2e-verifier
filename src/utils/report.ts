import * as fs from 'fs';
import * as path from 'path';
import { ReportData, TestResult } from '../types';

export class ReportGenerator {
  constructor(private reportsDir: string = 'reports') {}

  generateReport(results: TestResult[]): ReportData {
    const timestamp = new Date().toISOString();
    const totalSites = results.length;
    const passedSites = results.filter(r => r.passed).length;
    const failedSites = totalSites - passedSites;

    const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
    const passedChecks = results.reduce((sum, r) => 
      sum + r.checks.filter(c => c.passed).length, 0);
    const failedChecks = totalChecks - passedChecks;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return {
      timestamp,
      totalSites,
      passedSites,
      failedSites,
      results,
      summary: {
        totalChecks,
        passedChecks,
        failedChecks,
        totalErrors
      }
    };
  }

  saveJSONReport(reportData: ReportData, filename?: string): string {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = filename || `report-${timestamp}.json`;
    const filepath = path.join(this.reportsDir, reportFilename);

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf-8');

    return filepath;
  }

  saveLatestReport(reportData: ReportData): void {
    const latestPath = path.join(this.reportsDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(reportData, null, 2), 'utf-8');
  }

  generateSummary(reportData: ReportData): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push('E2E VERIFICATION REPORT');
    lines.push('='.repeat(60));
    lines.push(`Timestamp: ${reportData.timestamp}`);
    lines.push(`Total Sites: ${reportData.totalSites}`);
    lines.push(`Passed: ${reportData.passedSites} | Failed: ${reportData.failedSites}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(`Total Checks: ${reportData.summary.totalChecks}`);
    lines.push(`Passed Checks: ${reportData.summary.passedChecks}`);
    lines.push(`Failed Checks: ${reportData.summary.failedChecks}`);
    lines.push(`Total Errors: ${reportData.summary.totalErrors}`);
    lines.push('');

    for (const result of reportData.results) {
      lines.push('-'.repeat(60));
      lines.push(`SITE: ${result.siteName}`);
      lines.push(`URL: ${result.url}`);
      lines.push(`Status: ${result.passed ? '✓ PASSED' : '✗ FAILED'}`);
      lines.push(`Duration: ${result.duration}ms`);

      if (result.checks.length > 0) {
        lines.push('Checks:');
        for (const check of result.checks) {
          lines.push(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.message}`);
        }
      }

      if (result.errors.length > 0) {
        lines.push(`Errors: ${result.errors.length}`);
        for (const error of result.errors) {
          lines.push(`  - ${error}`);
        }
      }

      if (result.screenshots.length > 0) {
        lines.push(`Screenshots: ${result.screenshots.length}`);
        for (const screenshot of result.screenshots) {
          lines.push(`  - ${screenshot.path} (${screenshot.viewport})`);
        }
      }

      lines.push('');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  saveSummary(reportData: ReportData): string {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const summaryPath = path.join(this.reportsDir, `summary-${timestamp}.txt`);
    
    const summaryContent = this.generateSummary(reportData);
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');

    return summaryPath;
  }

  printSummary(reportData: ReportData): void {
    console.log(this.generateSummary(reportData));
  }
}
