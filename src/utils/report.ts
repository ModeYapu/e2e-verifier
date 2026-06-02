import * as fs from 'fs';
import * as path from 'path';
import { ReportData, TestResult, UnifiedResult, ExecutionStatus, Artifact, Evidence } from '../types';
import { HtmlReportGenerator } from './html-report';

export class ReportGenerator {
  private htmlGenerator: HtmlReportGenerator;

  constructor(private reportsDir: string = 'reports') {
    this.htmlGenerator = new HtmlReportGenerator();
  }

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

  // ============================================================
  // UNIFIED RESULTS SUPPORT (P0 - Task 2)
  // ============================================================

  generateUnifiedReport(unifiedResults: UnifiedResult[]): UnifiedReportData {
    const timestamp = new Date().toISOString();
    const totalTasks = new Set(unifiedResults.map(r => r.taskId)).size;
    const passed = unifiedResults.filter(r => r.status === 'passed').length;
    const failed = unifiedResults.filter(r =>
      r.status === 'failed' ||
      r.status === 'assertion_failed' ||
      r.status === 'infra_failed'
    ).length;
    const flaky = unifiedResults.filter(r => r.status === 'flaky').length;
    const blocked = unifiedResults.filter(r => r.status === 'blocked').length;
    const skipped = unifiedResults.filter(r => r.status === 'skipped').length;

    const totalDuration = unifiedResults.reduce((sum, r) => sum + r.duration, 0);

    return {
      timestamp,
      summary: {
        totalTasks,
        totalResults: unifiedResults.length,
        passed,
        failed,
        flaky,
        blocked,
        skipped,
        totalDuration
      },
      results: unifiedResults
    };
  }

  saveUnifiedReport(reportData: UnifiedReportData, filename?: string): string {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = filename || `unified-report-${timestamp}.json`;
    const filepath = path.join(this.reportsDir, reportFilename);

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf-8');

    return filepath;
  }

  saveHtmlReport(unifiedResults: UnifiedResult[], filename?: string): string {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const reportData = this.generateUnifiedReport(unifiedResults);
    const html = this.htmlGenerator.generateUnifiedHtmlReport(reportData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = filename || `report-${timestamp}.html`;
    const filepath = path.join(this.reportsDir, reportFilename);

    fs.writeFileSync(filepath, html, 'utf-8');

    return filepath;
  }

  aggregateEvidence(results: UnifiedResult[]): Map<string, Evidence> {
    const evidenceMap = new Map<string, Evidence>();

    for (const result of results) {
      if (result.status === 'failed' || result.status === 'infra_failed') {
        const evidence: Evidence = {};

        // Collect console evidence
        for (const artifact of result.artifacts) {
          switch (artifact.type) {
            case 'console-log':
              if (fs.existsSync(artifact.path)) {
                try {
                  evidence.console = JSON.parse(fs.readFileSync(artifact.path, 'utf-8'));
                } catch {
                  evidence.console = [{ message: 'Failed to parse console log', type: 'error', timestamp: Date.now() }];
                }
              }
              break;
            case 'network-log':
              if (fs.existsSync(artifact.path)) {
                try {
                  const networkData = JSON.parse(fs.readFileSync(artifact.path, 'utf-8'));
                  evidence.network = networkData.failed || [];
                } catch {
                  evidence.network = [];
                }
              }
              break;
            case 'screenshot':
              evidence.screenshot = artifact.path;
              break;
            case 'dom-snapshot':
              if (fs.existsSync(artifact.path)) {
                evidence.domSnapshot = fs.readFileSync(artifact.path, 'utf-8');
              }
              break;
          }
        }

        if (Object.keys(evidence).length > 0) {
          evidenceMap.set(result.stepId || result.scenarioId, evidence);
        }
      }
    }

    return evidenceMap;
  }

  printUnifiedSummary(reportData: UnifiedReportData): void {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('UNIFIED VERIFICATION REPORT');
    lines.push('='.repeat(60));
    lines.push(`Timestamp: ${reportData.timestamp}`);
    lines.push(`Total Tasks: ${reportData.summary.totalTasks}`);
    lines.push(`Total Results: ${reportData.summary.totalResults}`);
    lines.push('');
    lines.push('Status Breakdown:');
    lines.push(`  ✓ Passed: ${reportData.summary.passed}`);
    lines.push(`  ✗ Failed: ${reportData.summary.failed}`);
    lines.push(`  ~ Flaky: ${reportData.summary.flaky}`);
    lines.push(`  ⊗ Blocked: ${reportData.summary.blocked}`);
    lines.push(`  ○ Skipped: ${reportData.summary.skipped}`);
    lines.push(`  Total Duration: ${reportData.summary.totalDuration}ms`);
    lines.push('');

    for (const result of reportData.results) {
      lines.push('-'.repeat(60));
      lines.push(`Task: ${result.taskId}`);
      lines.push(`Scenario: ${result.scenarioId}`);
      if (result.stepId) {
        lines.push(`Step: ${result.stepId}`);
      }
      lines.push(`Status: ${this.formatStatus(result.status)}`);
      lines.push(`Summary: ${result.summary}`);
      lines.push(`Duration: ${result.duration}ms`);

      if (result.rootCause) {
        lines.push(`Root Cause: [${result.rootCause.category}] ${result.rootCause.message}`);
      }

      if (result.artifacts.length > 0) {
        lines.push(`Artifacts: ${result.artifacts.map(a => `${a.type}:${a.path}`).join(', ')}`);
      }

      lines.push('');
    }

    lines.push('='.repeat(60));

    console.log(lines.join('\n'));
  }

  private formatStatus(status: ExecutionStatus): string {
    const statusMap: Record<ExecutionStatus, string> = {
      passed: '✓ PASSED',
      failed: '✗ FAILED',
      flaky: '~ FLAKY',
      blocked: '⊗ BLOCKED',
      infra_failed: '⚠ INFRA_FAILED',
      assertion_failed: '✗ ASSERTION_FAILED',
      skipped: '○ SKIPPED'
    };
    return statusMap[status] || status.toUpperCase();
  }
}

export interface UnifiedReportData {
  timestamp: string;
  summary: {
    totalTasks: number;
    totalResults: number;
    passed: number;
    failed: number;
    flaky: number;
    blocked: number;
    skipped: number;
    totalDuration: number;
  };
  results: UnifiedResult[];
}
