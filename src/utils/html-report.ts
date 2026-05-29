import { ReportData } from '../types';
import * as fs from 'fs';
import * as path from 'path';

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
}
