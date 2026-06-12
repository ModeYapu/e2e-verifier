/**
 * Explorer Report Generator
 * Generates JSON and HTML reports from exploration results
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExploreResult, DiscoveryResult, SiteMapNode, PageAnalysis } from './types';
import { Logger } from '../utils/logger';

export interface ReportOptions {
  outputDir: string;
  includeScreenshots?: boolean;
  includeScripts?: boolean;
}

export class ExplorerReport {
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ prefix: 'ExplorerReport' });
  }

  /**
   * Generate all report formats
   */
  generateReports(result: ExploreResult, options: ReportOptions): void {
    this.logger.info('Generating exploration reports...');

    // Generate JSON report
    this.generateJsonReport(result, options);

    // Generate HTML report
    this.generateHtmlReport(result, options);

    this.logger.info(`Reports generated in ${options.outputDir}`);
  }

  /**
   * Generate JSON report
   */
  private generateJsonReport(result: ExploreResult, options: ReportOptions): void {
    const reportData = {
      summary: result.summary,
      config: {
        url: result.config.url,
        maxPages: result.config.maxPages,
        maxDepth: result.config.maxDepth,
        useLlm: result.config.useLlm
      },
      discovery: {
        pagesExplored: result.discovery.length,
        pages: result.discovery.map(p => ({
          url: p.url,
          title: p.title,
          depth: p.depth,
          screenshot: p.screenshot,
          navigationCount: p.navigation.length,
          interactiveElementCount: p.interactiveElements.length,
          formCount: p.forms.length,
          tableCount: p.tables.length
        }))
      },
      testPlan: {
        totalTests: result.testPlan.totalTests,
        pages: result.testPlan.pages.map(p => ({
          url: p.url,
          pageName: p.pageName,
          testCount: p.tests.length,
          tests: p.tests.map(t => ({
            name: t.name,
            priority: t.priority,
            description: t.description
          }))
        }))
      },
      executions: result.executions.map(e => ({
        testName: e.testCase.name,
        url: e.url,
        passed: e.passed,
        duration: e.duration,
        error: e.error,
        hasScreenshot: !!e.screenshot
      })),
      finalScript: result.finalScriptPath,
      timestamp: new Date().toISOString()
    };

    const outputPath = path.join(options.outputDir, `exploration-report-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    this.logger.info(`JSON report: ${outputPath}`);
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(result: ExploreResult, options: ReportOptions): void {
    const html = this.buildHtmlReport(result);

    const outputPath = path.join(options.outputDir, `exploration-report-${Date.now()}.html`);
    fs.writeFileSync(outputPath, html, 'utf-8');
    this.logger.info(`HTML report: ${outputPath}`);
  }

  /**
   * Build HTML report content
   */
  private buildHtmlReport(result: ExploreResult): string {
    const timestamp = new Date().toLocaleString();
    const passRate = result.executions.length > 0
      ? ((result.summary.testsPassed / result.executions.length) * 100).toFixed(1)
      : '0.0';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autonomous Exploration Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 5px; font-size: 28px; }
    h2 { color: #58a6ff; margin: 30px 0 15px; font-size: 20px; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
    h3 { color: #8b949e; margin: 20px 0 10px; font-size: 16px; }
    .timestamp { color: #8b949e; margin-bottom: 30px; }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 36px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .summary-card .label { color: #8b949e; font-size: 13px; }
    .summary-card.passed .value { color: #3fb950; }
    .summary-card.failed .value { color: #f85149; }
    .summary-card.neutral .value { color: #58a6ff; }

    .section {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    /* Page cards */
    .pages-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }
    .page-card {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
    }
    .page-card-header {
      padding: 15px;
      background: #1c2128;
      border-bottom: 1px solid #30363d;
    }
    .page-title { font-weight: 600; color: #c9d1d9; }
    .page-url { color: #8b949e; font-size: 12px; margin-top: 5px; word-break: break-all; }
    .page-card-body { padding: 15px; }
    .page-stats {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .page-stat {
      background: #30363d;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      color: #8b949e;
    }
    .page-screenshot {
      width: 100%;
      height: 150px;
      object-fit: cover;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .page-screenshot:hover { transform: scale(1.02); }

    /* Test results table */
    .test-table {
      width: 100%;
      border-collapse: collapse;
    }
    .test-table th, .test-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #30363d;
    }
    .test-table th {
      background: #21262d;
      color: #8b949e;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }
    .test-table tr:hover { background: #21262d; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.passed { background: #238636; color: #fff; }
    .badge.failed { background: #da3633; color: #fff; }
    .badge.high { background: #d73a49; color: #fff; }
    .badge.medium { background: #db6d28; color: #fff; }
    .badge.low { background: #30363d; color: #8b949e; }

    /* Site map */
    .site-map {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.8;
    }
    .site-map-item {
      padding: 5px 0;
    }
    .site-map-link {
      color: #58a6ff;
      text-decoration: none;
    }
    .site-map-link:hover { text-decoration: underline; }
    .site-map-depth {
      display: inline-block;
      width: 20px;
      color: #8b949e;
    }

    /* Script section */
    .script-block {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 15px;
      overflow-x: auto;
    }
    .script-block pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #8b949e;
    }
    .copy-button {
      float: right;
      padding: 5px 15px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 4px;
      color: #c9d1d9;
      cursor: pointer;
      font-size: 12px;
    }
    .copy-button:hover { background: #30363d; }

    /* Modal */
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

    /* Tabs */
    .tabs { display: flex; gap: 5px; margin-bottom: 20px; }
    .tab {
      padding: 10px 20px;
      background: #21262d;
      border: none;
      border-radius: 6px 6px 0 0;
      color: #8b949e;
      cursor: pointer;
      font-size: 14px;
    }
    .tab.active {
      background: #30363d;
      color: #c9d1d9;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Autonomous Exploration Report</h1>
    <div class="timestamp">Generated: ${timestamp}</div>

    <div class="summary">
      <div class="summary-card neutral">
        <div class="value">${result.summary.pagesExplored}</div>
        <div class="label">Pages Explored</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${result.summary.testsPlanned}</div>
        <div class="label">Tests Planned</div>
      </div>
      <div class="summary-card passed">
        <div class="value">${result.summary.testsPassed}</div>
        <div class="label">Tests Passed</div>
      </div>
      <div class="summary-card failed">
        <div class="value">${result.summary.testsFailed}</div>
        <div class="label">Tests Failed</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${passRate}%</div>
        <div class="label">Pass Rate</div>
      </div>
      <div class="summary-card neutral">
        <div class="value">${Math.round(result.summary.duration / 1000)}s</div>
        <div class="label">Duration</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('discovery')">Discovery</button>
      <button class="tab" onclick="showTab('tests')">Test Results</button>
      <button class="tab" onclick="showTab('sitemap')">Site Map</button>
      <button class="tab" onclick="showTab('script')">Final Script</button>
    </div>

    <div id="discovery" class="tab-content active">
      <h2>📄 Discovered Pages</h2>
      <div class="pages-grid">
        ${this.generatePageCardsHtml(result)}
      </div>
    </div>

    <div id="tests" class="tab-content">
      <h2>🧪 Test Results</h2>
      <div class="section">
        <table class="test-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Page</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${this.generateTestResultsHtml(result)}
          </tbody>
        </table>
      </div>
    </div>

    <div id="sitemap" class="tab-content">
      <h2>🗺️ Site Map</h2>
      <div class="section">
        <div class="site-map">
          ${this.generateSiteMapHtml(result.discovery)}
        </div>
      </div>
    </div>

    <div id="script" class="tab-content">
      <h2>📜 Final Test Script</h2>
      <div class="section">
        <button class="copy-button" onclick="copyScript()">Copy Script</button>
        <div class="script-block">
          <pre>${this.escapeHtml(result.finalScript)}</pre>
        </div>
      </div>
    </div>
  </div>

  <div class="modal" id="imageModal" onclick="this.classList.remove('open')">
    <span class="modal-close">&times;</span>
    <img id="modalImage" src="" alt="">
  </div>

  <script>
    function showTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector(\`.tab[onclick="showTab('\${tabId})"]\`).classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }

    function copyScript() {
      const script = document.querySelector('.script-block pre').textContent;
      navigator.clipboard.writeText(script);
      alert('Script copied to clipboard!');
    }

    document.querySelectorAll('.page-screenshot').forEach(img => {
      img.addEventListener('click', (e) => {
        document.getElementById('imageModal').classList.add('open');
        document.getElementById('modalImage').src = e.target.src;
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Generate HTML for page cards
   */
  private generatePageCardsHtml(result: ExploreResult): string {
    return result.discovery.map(page => {
      const screenshotPath = page.screenshot
        ? path.relative(this.getCurrentDir(), page.screenshot)
        : '';

      return `
        <div class="page-card">
          ${screenshotPath ? `
            <img src="${screenshotPath}" alt="${page.title}" class="page-screenshot"
                 onerror="this.style.display='none'">
          ` : ''}
          <div class="page-card-header">
            <div class="page-title">${this.escapeHtml(page.title)}</div>
            <div class="page-url">${this.escapeHtml(page.url)}</div>
          </div>
          <div class="page-card-body">
            <div class="page-stats">
              <span class="page-stat">Depth: ${page.depth}</span>
              <span class="page-stat">🔗 ${page.navigation.length} links</span>
              <span class="page-stat">🖱️ ${page.interactiveElements.length} interactive</span>
              ${page.forms.length > 0 ? `<span class="page-stat">📝 ${page.forms.length} forms</span>` : ''}
              ${page.tables.length > 0 ? `<span class="page-stat">📊 ${page.tables.length} tables</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Generate HTML for test results table
   */
  private generateTestResultsHtml(result: ExploreResult): string {
    return result.executions.map(exec => {
      const statusClass = exec.passed ? 'passed' : 'failed';
      const statusText = exec.passed ? 'PASSED' : 'FAILED';

      return `
        <tr>
          <td>${this.escapeHtml(exec.testCase.name)}</td>
          <td>${this.escapeHtml(exec.url)}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td><span class="badge ${exec.testCase.priority}">${exec.testCase.priority}</span></td>
          <td>${exec.duration}ms</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Generate HTML for site map
   */
  private generateSiteMapHtml(pages: PageAnalysis[]): string {
    const visited = new Set<string>();
    let html = '';

    const renderNode = (url: string, depth: number = 0): string => {
      if (visited.has(url)) return '';
      visited.add(url);

      const page = pages.find(p => p.url === url);
      if (!page) return '';

      const indent = '│ '.repeat(depth);
      const prefix = depth === 0 ? '🏠 ' : (depth === pages.length - 1 ? '└─ ' : '├─ ');

      let nodeHtml = `
        <div class="site-map-item">
          <span class="site-map-depth">${indent}</span>
          ${prefix}
          <a href="${this.escapeHtml(url)}" class="site-map-link" target="_blank">${this.escapeHtml(page.title)}</a>
        </div>
      `;

      // Render children (pages linked from this page)
      for (const nav of page.navigation) {
        if (nav.isInternal && !visited.has(nav.href)) {
          nodeHtml += renderNode(nav.href, depth + 1);
        }
      }

      return nodeHtml;
    };

    // Start from first page or config URL
    const startUrl = pages[0]?.url || '';
    html += renderNode(startUrl);

    // Add any unvisited pages
    for (const page of pages) {
      if (!visited.has(page.url)) {
        html += renderNode(page.url, 0);
      }
    }

    return html || '<div class="site-map-item">No pages discovered</div>';
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Get current directory
   */
  private getCurrentDir(): string {
    return process.cwd();
  }
}
