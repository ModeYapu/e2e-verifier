import { ReportData, UnifiedResult, ExecutionStatus, UnifiedReportData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class HtmlReportGenerator {
  generateHtmlReport(reportData: ReportData): string {
    const timestamp = new Date(reportData.timestamp).toLocaleString();
    const passedRate = reportData.totalSites > 0
      ? ((reportData.passedSites / reportData.totalSites) * 100).toFixed(1)
      : '0.0';

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E Verification Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 10px; }
    .timestamp { color: #8b949e; margin-bottom: 20px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .summary-card .label { color: #8b949e; font-size: 14px; }
    .summary-card.passed .value { color: #3fb950; }
    .summary-card.failed .value { color: #f85149; }
    .summary-card.neutral .value { color: #58a6ff; }

    .site-result {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .site-result.passed { border-left: 4px solid #3fb950; }
    .site-result.failed { border-left: 4px solid #f85149; }

    .site-header {
      padding: 15px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    .site-header:hover { background: #21262d; }
    .site-name { font-weight: 600; font-size: 16px; }
    .site-url { color: #8b949e; font-size: 14px; margin-top: 4px; }
    .site-status {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .site-status.passed { background: #238636; color: #fff; }
    .site-status.failed { background: #da3633; color: #fff; }
    .site-duration { color: #8b949e; font-size: 14px; margin-left: 10px; }

    .site-details {
      padding: 20px;
      display: none;
    }
    .site-details.open { display: block; }

    .checks-section { margin-bottom: 20px; }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #8b949e;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .check-item {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #21262d;
    }
    .check-item:last-child { border-bottom: none; }
    .check-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      margin-right: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .check-item.passed .check-icon { background: #238636; }
    .check-item.failed .check-icon { background: #da3633; }
    .check-name { flex: 1; }
    .check-message { color: #8b949e; font-size: 14px; }

    .errors-section {
      background: #1c1e24;
      border-radius: 6px;
      padding: 12px;
      margin-top: 15px;
    }
    .error-item {
      color: #f85149;
      padding: 4px 0;
      font-size: 14px;
      line-height: 1.4;
    }

    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 10px;
    }
    .screenshot-item {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #30363d;
    }
    .screenshot-item img {
      width: 100%;
      height: auto;
      display: block;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .screenshot-item:hover img { transform: scale(1.05); }
    .screenshot-name {
      padding: 8px 12px;
      font-size: 12px;
      color: #8b949e;
      background: #21262d;
    }

    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }
    .modal.open { display: flex; }
    .modal img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    }
    .modal-close {
      position: absolute;
      top: 20px;
      right: 20px;
      color: #fff;
      font-size: 30px;
      cursor: pointer;
    }

    .toggle-icon { transition: transform 0.2s; margin-left: 10px; }
    .site-header.open .toggle-icon { transform: rotate(180deg); }
  </style>
</head>
<body>
  <div class="container">
    <h1>E2E Verification Report</h1>
    <div class="timestamp">Generated: ${timestamp}</div>

    <div class="summary">
      <div class="summary-card neutral">
        <div class="value">${reportData.totalSites}</div>
        <div class="label">Total Sites</div>
      </div>
      <div class="summary-card passed">
        <div class="value">${reportData.passedSites}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-card failed">
        <div class="value">${reportData.failedSites}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${passedRate}%</div>
        <div class="label">Pass Rate</div>
      </div>
    </div>

    ${this.generateSiteResultsHtml(reportData)}
  </div>

  <div class="modal" id="imageModal">
    <span class="modal-close">&times;</span>
    <img id="modalImage" src="" alt="">
  </div>

  <script>
    // Toggle site details
    document.querySelectorAll('.site-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        const details = header.nextElementSibling;
        details.classList.toggle('open');
      });
    });

    // Image modal
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const closeBtn = document.querySelector('.modal-close');

    document.querySelectorAll('.screenshot-item img').forEach(img => {
      img.addEventListener('click', () => {
        modal.classList.add('open');
        modalImg.src = img.src;
      });
    });

    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', () => modal.classList.remove('open'));
  </script>
</body>
</html>`;

    return html;
  }

  private generateSiteResultsHtml(reportData: ReportData): string {
    return reportData.results.map(result => {
      const statusClass = result.passed ? 'passed' : 'failed';
      const statusText = result.passed ? 'PASSED' : 'FAILED';
      const duration = `${result.duration}ms`;

      const checksHtml = result.checks.map(check => `
        <div class="check-item ${check.passed ? 'passed' : 'failed'}">
          <div class="check-icon">${check.passed ? '✓' : '✗'}</div>
          <div class="check-name">${check.name}</div>
          <div class="check-message">${check.message}</div>
        </div>
      `).join('');

      const errorsHtml = result.errors.length > 0 ? `
        <div class="errors-section">
          ${result.errors.map(err => `<div class="error-item">⚠ ${err}</div>`).join('')}
        </div>
      ` : '';

      const screenshotsHtml = result.screenshots.length > 0 ? `
        <div class="section-title">Screenshots</div>
        <div class="screenshots-grid">
          ${result.screenshots.map(ss => `
            <div class="screenshot-item">
              <img src="${ss.path}" alt="${ss.name}" onerror="this.style.display='none'">
              <div class="screenshot-name">${ss.name}</div>
            </div>
          `).join('')}
        </div>
      ` : '';

      return `
        <div class="site-result ${statusClass}">
          <div class="site-header">
            <div>
              <div class="site-name">${result.siteName} <span class="toggle-icon">▼</span></div>
              <div class="site-url">${result.url}</div>
            </div>
            <div>
              <span class="site-status ${statusClass}">${statusText}</span>
              <span class="site-duration">${duration}</span>
            </div>
          </div>
          <div class="site-details">
            <div class="checks-section">
              <div class="section-title">Checks</div>
              ${checksHtml}
            </div>
            ${errorsHtml}
            ${screenshotsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  saveHtmlReport(reportData: ReportData, outputPath: string): void {
    const html = this.generateHtmlReport(reportData);
    fs.writeFileSync(outputPath, html, 'utf-8');
  }

  // ============================================================
  // UNIFIED REPORT SUPPORT (P0 - Task 2)
  // ============================================================

  generateUnifiedHtmlReport(reportData: UnifiedReportData): string {
    const timestamp = new Date(reportData.timestamp).toLocaleString();
    const passRate = reportData.summary.totalResults > 0
      ? ((reportData.summary.passed / reportData.summary.totalResults) * 100).toFixed(1)
      : '0.0';
    const totalDurationSec = (reportData.summary.totalDuration / 1000).toFixed(1);
    const isAllPassed = reportData.summary.failed === 0 && reportData.summary.flaky === 0 && reportData.summary.blocked === 0;
    const ciStatus = isAllPassed ? 'PASSED' : 'FAILED';
    const ciColor = isAllPassed ? '#3fb950' : '#f85149';

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unified E2E Verification Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.5;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 10px; }
    .timestamp { color: #8b949e; margin-bottom: 20px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .summary-card .label { color: #8b949e; font-size: 14px; }
    .summary-card.passed .value { color: #3fb950; }
    .summary-card.failed .value { color: #f85149; }
    .summary-card.flaky .value { color: #d29922; }
    .summary-card.blocked .value { color: #a371f7; }
    .summary-card.skipped .value { color: #8b949e; }
    .summary-card.neutral .value { color: #58a6ff; }

    .task-group {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .task-group.passed { border-left: 4px solid #3fb950; }
    .task-group.failed { border-left: 4px solid #f85149; }
    .task-group.flaky { border-left: 4px solid #d29922; }
    .task-group.blocked { border-left: 4px solid #a371f7; }
    .task-group.skipped { border-left: 4px solid #8b949e; }

    .task-header {
      padding: 15px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    .task-header:hover { background: #21262d; }
    .task-info { flex: 1; }
    .task-id { font-weight: 600; font-size: 16px; }
    .task-meta { color: #8b949e; font-size: 14px; margin-top: 4px; }
    .task-status {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 10px;
    }
    .task-status.passed { background: #238636; color: #fff; }
    .task-status.failed { background: #da3633; color: #fff; }
    .task-status.flaky { background: #966600; color: #fff; }
    .task-status.blocked { background: #8957e5; color: #fff; }
    .task-status.infra_failed { background: #db6d28; color: #fff; }
    .task-status.assertion_failed { background: #da3633; color: #fff; }
    .task-status.skipped { background: #4a5a6a; color: #fff; }

    .task-details {
      padding: 20px;
      display: none;
    }
    .task-details.open { display: block; }

    .scenario-list { margin-top: 15px; }
    .scenario-item {
      background: #21262d;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .scenario-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .scenario-name { font-weight: 500; }
    .scenario-summary { color: #8b949e; font-size: 13px; }

    .step-list { margin-top: 10px; display: none; }
    .step-list.open { display: block; }
    .step-item {
      padding: 8px 12px;
      border-left: 3px solid #30363d;
      margin-left: 8px;
      margin-bottom: 5px;
    }
    .step-item.passed { border-left-color: #3fb950; }
    .step-item.failed { border-left-color: #f85149; }
    .step-name { font-size: 13px; }
    .step-status {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: 8px;
    }
    .step-status.passed { background: #238636; color: #fff; }
    .step-status.failed { background: #da3633; color: #fff; }

    .evidence-section {
      background: #1c1e24;
      border-radius: 6px;
      padding: 12px;
      margin-top: 10px;
    }
    .evidence-title {
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .evidence-item {
      font-size: 13px;
      padding: 4px 0;
      color: #f85149;
    }
    .artifact-link {
      color: #58a6ff;
      text-decoration: none;
      font-size: 12px;
      display: inline-block;
      margin-right: 10px;
    }
    .artifact-link:hover { text-decoration: underline; }

    .toggle-icon { transition: transform 0.2s; margin-left: 10px; }
    .task-header.open .toggle-icon { transform: rotate(180deg); }

    .ci-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 16px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .ci-badge .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .screenshot-inline {
      max-width: 100%;
      max-height: 200px;
      border-radius: 4px;
      border: 1px solid #30363d;
      margin-top: 6px;
      cursor: pointer;
    }
    .screenshot-inline:hover { opacity: 0.85; }

    .perf-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .perf-item {
      background: #21262d;
      border-radius: 4px;
      padding: 8px 10px;
      text-align: center;
    }
    .perf-value { font-size: 18px; font-weight: bold; color: #58a6ff; }
    .perf-label { font-size: 11px; color: #8b949e; margin-top: 2px; }
    .perf-value.good { color: #3fb950; }
    .perf-value.warning { color: #d29922; }
    .perf-value.bad { color: #f85149; }

    .duration-bar {
      height: 4px;
      background: #30363d;
      border-radius: 2px;
      margin-top: 4px;
      overflow: hidden;
    }
    .duration-fill {
      height: 100%;
      border-radius: 2px;
    }
    .duration-fill.fast { background: #3fb950; }
    .duration-fill.medium { background: #d29922; }
    .duration-fill.slow { background: #f85149; }

    .filter-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 6px 12px;
      border: 1px solid #30363d;
      background: #161b22;
      color: #c9d1d9;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: #21262d; }
    .filter-btn.active { background: #238636; border-color: #238636; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Unified E2E Verification Report</h1>
    <div class="ci-badge">
      <span class="dot" style="background:${ciColor}"></span>
      <strong>${ciStatus}</strong>
      <span style="color:#8b949e">|</span>
      <span style="color:#8b949e">${passRate}% pass rate</span>
      <span style="color:#8b949e">|</span>
      <span style="color:#8b949e">${reportData.summary.totalTasks} tasks in ${totalDurationSec}s</span>
    </div>
    <div class="timestamp">Generated: ${timestamp}</div>

    <div class="summary">
      <div class="summary-card neutral">
        <div class="value">${reportData.summary.totalTasks}</div>
        <div class="label">Tasks</div>
      </div>
      <div class="summary-card passed">
        <div class="value">${reportData.summary.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-card failed">
        <div class="value">${reportData.summary.failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-card flaky">
        <div class="value">${reportData.summary.flaky}</div>
        <div class="label">Flaky</div>
      </div>
      <div class="summary-card blocked">
        <div class="value">${reportData.summary.blocked}</div>
        <div class="label">Blocked</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${passRate}%</div>
        <div class="label">Pass Rate</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${totalDurationSec}s</div>
        <div class="label">Duration</div>
      </div>
    </div>

    ${this.generateUnifiedResultsHtml(reportData)}
  </div>

  <div class="modal" id="imageModal">
    <span class="modal-close">&times;</span>
    <img id="modalImage" src="" alt="">
  </div>

  <script>
    // Filter functionality
    const filterBtns = document.querySelectorAll('.filter-btn');
    const taskGroups = document.querySelectorAll('.task-group');

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        taskGroups.forEach(group => {
          if (filter === 'all' || group.classList.contains(filter)) {
            group.style.display = '';
          } else {
            group.style.display = 'none';
          }
        });
      });
    });

    // Toggle task details
    document.querySelectorAll('.task-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        const details = header.nextElementSibling;
        details.classList.toggle('open');
      });
    });

    // Toggle scenario details
    document.querySelectorAll('.scenario-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        header.classList.toggle('open');
        const steps = header.nextElementSibling;
        steps.classList.toggle('open');
      });
    });

    // Screenshot modal for inline images
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const closeBtn = document.querySelector('.modal-close');
    document.querySelectorAll('.screenshot-inline').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (modal && modalImg) {
          modal.classList.add('open');
          modalImg.src = (img as HTMLImageElement).src;
        }
      });
    });
    if (closeBtn) closeBtn.addEventListener('click', () => modal?.classList.remove('open'));
    modal?.addEventListener('click', () => modal?.classList.remove('open'));
  </script>
</body>
</html>`;

    return html;
  }

  private generateUnifiedResultsHtml(reportData: UnifiedReportData): string {
    // Group results by task
    const taskGroups = new Map<string, UnifiedResult[]>();
    for (const result of reportData.results) {
      if (!taskGroups.has(result.taskId)) {
        taskGroups.set(result.taskId, []);
      }
      taskGroups.get(result.taskId)!.push(result);
    }

    // Determine task status based on results
    const getTaskStatus = (results: UnifiedResult[]): string => {
      if (results.every(r => r.status === 'passed')) return 'passed';
      if (results.some(r => r.status === 'flaky')) return 'flaky';
      if (results.some(r => r.status === 'blocked')) return 'blocked';
      if (results.some(r => r.status === 'skipped')) return 'skipped';
      return 'failed';
    };

    let html = '<div class="filter-bar">';
    html += '<button class="filter-btn active" data-filter="all">All</button>';
    html += '<button class="filter-btn" data-filter="passed">Passed</button>';
    html += '<button class="filter-btn" data-filter="failed">Failed</button>';
    html += '<button class="filter-btn" data-filter="flaky">Flaky</button>';
    html += '</div>';

    for (const [taskId, results] of taskGroups) {
      const taskStatus = getTaskStatus(results);
      const taskDuration = results.reduce((sum, r) => sum + r.duration, 0);

      html += `
        <div class="task-group ${taskStatus}">
          <div class="task-header">
            <div class="task-info">
              <div class="task-id">Task: ${taskId} <span class="toggle-icon">▼</span></div>
              <div class="task-meta">${results.length} scenarios | ${taskDuration}ms</div>
            </div>
            <div>
              <span class="task-status ${taskStatus}">${taskStatus.toUpperCase()}</span>
            </div>
          </div>
          <div class="task-details">
            ${this.generateScenariosHtml(results)}
          </div>
        </div>
      `;
    }

    return html;
  }

  private generateScenariosHtml(results: UnifiedResult[]): string {
    // Group by scenario
    const scenarios = new Map<string, UnifiedResult[]>();
    for (const result of results) {
      const key = result.scenarioId;
      if (!scenarios.has(key)) {
        scenarios.set(key, []);
      }
      scenarios.get(key)!.push(result);
    }

    let html = '<div class="scenario-list">';

    for (const [scenarioId, scenarioResults] of scenarios) {
      const status = this.getOverallStatus(scenarioResults);
      const failedResult = scenarioResults.find(r =>
        r.status === 'failed' ||
        r.status === 'assertion_failed' ||
        r.status === 'infra_failed'
      );

      html += `
        <div class="scenario-item">
          <div class="scenario-header">
            <div>
              <div class="scenario-name">Scenario: ${scenarioId}</div>
              <div class="scenario-summary">${failedResult?.summary || 'All checks passed'}</div>
            </div>
            <span class="task-status ${status}">${status.toUpperCase()}</span>
          </div>
          <div class="step-list ${scenarioResults.length > 1 ? 'open' : ''}">
            ${scenarioResults.map(r => this.generateStepHtml(r)).join('')}
            ${failedResult ? this.generateEvidenceHtml(failedResult) : ''}
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  private getOverallStatus(results: UnifiedResult[]): string {
    if (results.every(r => r.status === 'passed')) return 'passed';
    if (results.some(r => r.status === 'infra_failed')) return 'infra_failed';
    if (results.some(r => r.status === 'assertion_failed')) return 'assertion_failed';
    if (results.some(r => r.status === 'flaky')) return 'flaky';
    if (results.some(r => r.status === 'blocked')) return 'blocked';
    if (results.some(r => r.status === 'skipped')) return 'skipped';
    return 'failed';
  }

  private generateStepHtml(result: UnifiedResult): string {
    const statusClass = result.status === 'passed' ? 'passed' : 'failed';
    const stepId = result.stepId || 'summary';
    const durationMs = result.duration || 0;
    const maxDuration = 30000; // 30s reference
    const durationPct = Math.min((durationMs / maxDuration) * 100, 100);
    const durationClass = durationMs < 3000 ? 'fast' : durationMs < 10000 ? 'medium' : 'slow';

    // Find screenshot artifacts for inline display
    const screenshots = result.artifacts.filter(a => a.type === 'screenshot');
    const screenshotHtml = screenshots.map(a =>
      `<img class="screenshot-inline" src="${a.path}" alt="${a.type}" onerror="this.style.display='none'">`
    ).join('');

    return `
      <div class="step-item ${statusClass}">
        <div class="step-name">
          ${stepId}
          <span class="step-status ${statusClass}">${result.status}</span>
          ${durationMs > 0 ? `<span style="color:#8b949e;font-size:11px;margin-left:8px">${durationMs}ms</span>` : ''}
        </div>
        ${durationMs > 0 ? `<div class="duration-bar"><div class="duration-fill ${durationClass}" style="width:${durationPct}%"></div></div>` : ''}
        ${screenshotHtml}
        ${result.artifacts.length > 0 ? this.generateArtifactsHtml(result.artifacts) : ''}
        ${result.rootCause ? `<div style="color:#f85149;font-size:12px;margin-top:4px">[${result.rootCause.category}] ${result.rootCause.message}</div>` : ''}
      </div>
    `;
  }

  private generateArtifactsHtml(artifacts: any[]): string {
    const links = artifacts.map(a =>
      `<a class="artifact-link" href="${a.path}" target="_blank">${a.type}</a>`
    ).join('');

    return links ? `<div style="margin-top:4px;">${links}</div>` : '';
  }

  private generateEvidenceHtml(result: UnifiedResult): string {
    if (!result.rootCause?.evidence) return '';

    const evidence = result.rootCause.evidence;
    let html = '<div class="evidence-section">';
    html += '<div class="evidence-title">Evidence</div>';

    if (evidence.screenshot) {
      html += `<div class="evidence-item">📸 <a href="${evidence.screenshot}" target="_blank" style="color:#58a6ff">Screenshot</a></div>`;
      html += `<img class="screenshot-inline" src="${evidence.screenshot}" alt="Failure screenshot" onerror="this.style.display='none'">`;
    }

    if (evidence.console?.length) {
      html += `<div class="evidence-item">⚠ Console Errors: ${evidence.console.length}</div>`;
      html += evidence.console.slice(0, 5).map(e =>
        `<div style="color:#f85149;font-size:12px;padding:2px 0 2px 16px">${e.message}</div>`
      ).join('');
    }

    if (evidence.network?.length) {
      html += `<div class="evidence-item">🌐 Failed Requests: ${evidence.network.length}</div>`;
      html += evidence.network.slice(0, 5).map(r =>
        `<div style="color:#d29922;font-size:12px;padding:2px 0 2px 16px">${r.url} (${r.status})</div>`
      ).join('');
    }

    if (evidence.domSnapshot) {
      html += `<div class="evidence-item">📄 <a href="#" style="color:#58a6ff" onclick="const w=window.open();w.document.write(this.dataset.snippet);return false;" data-snippet="">DOM Snapshot available</a></div>`;
    }

    html += '</div>';
    return html;
  }
}
