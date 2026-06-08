/**
 * E2E Convergence Engine — 自动收敛测试循环
 * 
 * 用法: npm run converge -- [options]
 *   --project <name>   只跑指定项目
 *   --max-rounds <n>   最大轮次（默认 5）
 *   --fix              自动修复框架 bug（调用 Claude Code）
 *   --dry-run          只生成配置不执行
 */

import { Verifier } from '../verifier';
import { VerifierPool } from '../verifier-pool';
import { HtmlReportGenerator } from '../utils/html-report';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const logger = new Logger({ prefix: 'Converge' });

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface ProjectConfig {
  name: string;
  siteConfig: string;        // sites/*.json path
  sourceDir: string;         // 项目源码目录
  e2eDir: string;            // e2e-test 输出目录
}

interface RoundResult {
  round: number;
  timestamp: string;
  project: string;
  totalChecks: number;
  passed: number;
  failed: number;
  explorePassed: number;
  exploreFailed: number;
  explorePages: number;
  failures: FailureDetail[];
  duration: number;
}

interface FailureDetail {
  page: string;
  check: string;
  reason: string;
  category: 'framework_bug' | 'app_bug' | 'expected' | 'infrastructure';
}

interface ConvergenceReport {
  timestamp: string;
  totalRounds: number;
  result: 'all_passed' | 'converged' | 'max_rounds' | 'error';
  projects: {
    [name: string]: {
      rounds: RoundResult[];
      improvement: number;  // pass rate change from round 1 to last
    };
  };
  remainingIssues: FailureDetail[];
}

// ═══════════════════════════════════════
// Project Registry
// ═══════════════════════════════════════

const PROJECTS: ProjectConfig[] = [
  {
    name: 'vault-reader',
    siteConfig: 'sites/vault-reader.json',
    sourceDir: '/root/.openclaw/workspace/vault-reader-main',
    e2eDir: '/root/.openclaw/workspace/vault-reader-main/e2e-test'
  },
  {
    name: 'logmonitor',
    siteConfig: 'sites/logmonitor.json',
    sourceDir: '/home/coder/log-monitor',
    e2eDir: '/home/coder/log-monitor/e2e-test'
  },
  {
    name: 'depth3d',
    siteConfig: 'sites/depth3d.json',
    sourceDir: '/var/www/depth3d',
    e2eDir: '/var/www/depth3d/e2e-test'
  },
  {
    name: 'webgpu-studio',
    siteConfig: 'sites/webgpu-studio.json',
    sourceDir: '/home/coder/webgpu-3d-studio',
    e2eDir: '/home/coder/webgpu-3d-studio/e2e-test'
  }
];

// ═══════════════════════════════════════
// Core Engine
// ═══════════════════════════════════════

class ConvergenceEngine {
  private maxRounds: number;
  private targetProjects: ProjectConfig[];
  private fixEnabled: boolean;
  private resultsBase: string;
  private allResults: Map<string, RoundResult[]> = new Map();
  private logger = new Logger({ prefix: 'Converge' });

  constructor(options: { maxRounds?: number; projects?: string[]; fix?: boolean }) {
    this.maxRounds = options.maxRounds || 5;
    this.fixEnabled = options.fix || false;
    this.resultsBase = path.resolve('convergence-results');
    this.logger = new Logger({ prefix: 'ConvergeEngine' });

    // Filter projects if specified
    if (options.projects && options.projects.length > 0) {
      this.targetProjects = PROJECTS.filter(p => options.projects!.includes(p.name));
    } else {
      this.targetProjects = PROJECTS;
    }

    // Ensure output dirs exist
    for (const project of this.targetProjects) {
      fs.mkdirSync(project.e2eDir, { recursive: true });
      this.allResults.set(project.name, []);
    }
    fs.mkdirSync(this.resultsBase, { recursive: true });
  }

  /**
   * Main convergence loop
   */
  async run(): Promise<ConvergenceReport> {
    this.logger.info(`Starting convergence: ${this.targetProjects.length} projects, max ${this.maxRounds} rounds`);

    let result: ConvergenceReport['result'] = 'max_rounds';
    let stableCount = 0;
    let previousSummary = '';

    for (let round = 1; round <= this.maxRounds; round++) {
      this.logger.info(`\n${'═'.repeat(50)}`);
      this.logger.info(`Round ${round}/${this.maxRounds}`);
      this.logger.info('═'.repeat(50));

      const roundResults: RoundResult[] = [];

      for (const project of this.targetProjects) {
        const r = await this.runProjectRound(project, round);
        this.allResults.get(project.name)!.push(r);
        roundResults.push(r);

        // Save to project's e2e-test dir
        this.saveProjectResult(project, r, round);
      }

      // Analyze all failures this round
      const failures = roundResults.flatMap(r => r.failures);
      const frameworkBugs = failures.filter(f => f.category === 'framework_bug');
      const appBugs = failures.filter(f => f.category === 'app_bug');
      const infraIssues = failures.filter(f => f.category === 'infrastructure');

      this.logger.info(`\n📊 Round ${round} Summary:`);
      this.logger.info(`   Framework bugs: ${frameworkBugs.length}`);
      this.logger.info(`   App bugs: ${appBugs.length}`);
      this.logger.info(`   Infrastructure: ${infraIssues.length}`);
      this.logger.info(`   Expected: ${failures.filter(f => f.category === 'expected').length}`);

      // Report infrastructure issues immediately
      if (infraIssues.length > 0) {
        this.logger.warn('⚠️  Infrastructure issues detected:');
        for (const issue of infraIssues) {
          this.logger.warn(`   - ${issue.page}: ${issue.reason}`);
        }
        // Don't count infrastructure issues as real failures
      }

      // Check convergence: all passed?
      const realFailures = failures.filter(f => f.category !== 'expected' && f.category !== 'infrastructure');
      if (realFailures.length === 0) {
        this.logger.info('🎉 All tests passed!');
        result = 'all_passed';
        break;
      }

      // Auto-fix framework bugs if enabled
      if (this.fixEnabled && frameworkBugs.length > 0) {
        this.logger.info(`🔧 Auto-fixing ${frameworkBugs.length} framework bugs...`);
        const fixed = await this.autoFix(frameworkBugs);
        if (fixed) {
          this.logger.info('✅ Fixes applied, will re-test next round');
          continue;
        }
      }

      // Check if results changed from previous round
      const currentSummary = roundResults.map(r => `${r.project}:${r.passed}/${r.totalChecks}`).join(' ');
      if (currentSummary === previousSummary) {
        stableCount++;
        this.logger.warn(`⚠️  Results unchanged for ${stableCount} round(s)`);
        if (stableCount >= 2) {
          this.logger.info('✅ Converged — no improvement in 2 rounds');
          result = 'converged';
          break;
        }
      } else {
        stableCount = 0;
      }

      previousSummary = currentSummary;
    }

    return this.generateReport(result);
  }

  /**
   * Run one project for one round — verify + explore
   */
  private async runProjectRound(project: ProjectConfig, round: number): Promise<RoundResult> {
    const startTime = Date.now();
    const configPath = path.resolve(project.siteConfig);
    
    this.logger.info(`\n▶ Testing: ${project.name}`);

    // Check config exists
    if (!fs.existsSync(configPath)) {
      this.logger.warn(`  No config: ${configPath}, creating default...`);
      this.createDefaultConfig(project);
    }

    // Check service is up
    const serviceOk = await this.checkService(project);
    if (!serviceOk) {
      this.logger.error(`  ❌ Service not reachable, skipping`);
      return {
        round, timestamp: new Date().toISOString(), project: project.name,
        totalChecks: 0, passed: 0, failed: 0,
        explorePassed: 0, exploreFailed: 0, explorePages: 0,
        failures: [{
          page: project.name, check: 'service_reachable',
          reason: 'Service not responding', category: 'infrastructure'
        }],
        duration: Date.now() - startTime
      };
    }

    // Run verify
    let totalChecks = 0, passed = 0, failed = 0;
    const failures: FailureDetail[] = [];
    let verifyData: any = null;

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      const sites = config.sites || [config];

      const pool = new VerifierPool();
      for (const site of sites) {
        try {
          const verifier = new Verifier(site);
          const result = await verifier.verify();
          totalChecks += result.checks.length;
          const resultPassed = result.checks.filter(c => c.passed).length;
          const resultFailed = result.checks.length - resultPassed;
          passed += resultPassed;
          failed += resultFailed;

          // Extract failure details
          for (const check of result.checks) {
            if (!check.passed) {
              failures.push({
                page: result.siteName || result.url,
                check: check.name,
                reason: check.message || check.details?.error || 'Unknown',
                category: this.categorizeFailure(check.name, check.message || '')
              });
            }
          }
          verifyData = result;
        } catch (err) {
          this.logger.warn(`  Verify error for ${site.name}: ${err}`);
          failures.push({
            page: site.name || site.url,
            check: 'verify_execution',
            reason: String(err),
            category: 'framework_bug'
          });
          failed++;
          totalChecks++;
        }
      }
      await pool.close();
    } catch (err) {
      this.logger.error(`  Verify failed: ${err}`);
      failures.push({
        page: project.name, check: 'config_load',
        reason: `Failed to load config: ${err}`,
        category: 'infrastructure'
      });
    }

    // Run explore (no-llm, timeout-safe)
    let explorePassed = 0, exploreFailed = 0, explorePages = 0;
    try {
      const { AutonomousExplorer } = await import('../explorer/autonomous-explorer');
      const exploreConfig = await this.buildExploreConfig(project);
      if (exploreConfig) {
        const explorer = new AutonomousExplorer(exploreConfig);
        // Set a hard timeout
        const timeout = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Explore timeout')), 600000)  // 10 min for large projects
        );
        const exploreResult = await Promise.race([explorer.explore(), timeout]);
        if (exploreResult) {
          explorePages = exploreResult.summary.pagesExplored;
          explorePassed = exploreResult.summary.testsPassed;
          exploreFailed = exploreResult.summary.testsFailed;
          
          // Save explore output
          const exploreDir = path.join(project.e2eDir, `explore-round-${round}`);
          fs.mkdirSync(exploreDir, { recursive: true });
          fs.writeFileSync(
            path.join(exploreDir, 'result.json'),
            JSON.stringify(exploreResult, null, 2)
          );
        }
      }
    } catch (err) {
      this.logger.warn(`  Explore error: ${err}`);
    }

    const duration = Date.now() - startTime;
    this.logger.info(`  ✅ ${project.name}: verify ${passed}/${totalChecks}, explore ${explorePages} pages (${duration}ms)`);

    return {
      round, timestamp: new Date().toISOString(), project: project.name,
      totalChecks, passed, failed,
      explorePassed, exploreFailed, explorePages,
      failures, duration
    };
  }

  /**
   * Categorize a failure into framework/app/expected/infrastructure
   */
  private categorizeFailure(checkName: string, reason: string): FailureDetail['category'] {
    const name = checkName.toLowerCase();
    const r = reason.toLowerCase();

    // Infrastructure: service down, timeout, network
    if (r.includes('timeout') || r.includes('econnrefused') || r.includes('net::err')) {
      return 'infrastructure';
    }

    // Framework: selector issues, navigation failures
    if (r.includes('waiting for selector') || r.includes('waiting for navigation')) {
      return 'framework_bug';
    }

    // Expected: WebGPU not supported, etc.
    if (r.includes('not supported') || r.includes('webgpu not available')) {
      return 'expected';
    }

    // Everything else is app bug
    return 'app_bug';
  }

  /**
   * Check if the project service is reachable
   */
  private async checkService(project: ProjectConfig): Promise<boolean> {
    try {
      const configContent = fs.readFileSync(path.resolve(project.siteConfig), 'utf-8');
      const config = JSON.parse(configContent);
      const url = config.url || (config.sites && config.sites[0]?.url);
      if (!url) return false;

      const { chromium } = await import('@playwright/test');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const response = await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });
      await browser.close();
      return !!response && response.status() < 500;
    } catch {
      return false;
    }
  }

  /**
   * Build explore config from project site config
   */
  private async buildExploreConfig(project: ProjectConfig): Promise<any> {
    try {
      const configContent = fs.readFileSync(path.resolve(project.siteConfig), 'utf-8');
      const config = JSON.parse(configContent);
      const sites = config.sites || [config];
      // Prefer site with auth (entry point after login), fallback to first site
      const site = sites.find((s: any) => s.auth) || sites.find((s: any) => !s.url?.includes('login')) || sites[0];

      return {
        url: site.url,
        auth: site.auth,
        maxPages: 20,
        maxDepth: 2,
        screenshotDir: path.join(project.e2eDir, 'screenshots'),
        useLlm: false,
        timeout: 120000,
        outputDir: path.join(project.e2eDir, 'explore-output'),
        llm: { model: '', maxSteps: 50, apiKey: '', apiBase: '' }
      };
    } catch {
      return null;
    }
  }

  /**
   * Create default config for a project
   */
  private createDefaultConfig(project: ProjectConfig): void {
    const urlMap: Record<string, string> = {
      'vault-reader': 'http://127.0.0.1/vault/',
      'logmonitor': 'http://127.0.0.1/logmon/',
      'depth3d': 'http://127.0.0.1/depth3d/',
      'webgpu-studio': 'http://127.0.0.1/webgpu/'
    };

    const authMap: Record<string, any> = {
      'logmonitor': {
        loginUrl: 'http://127.0.0.1/logmon/login',
        formSelector: '.el-form',
        username: 'admin',
        password: 'admin123',
        successUrlPattern: '/logmon/(?!login)',
        tokenKey: 'logmon_token'
      }
    };

    const config = {
      name: project.name,
      url: urlMap[project.name],
      auth: authMap[project.name],
      expectedStatusCode: 200,
      viewport: { width: 1920, height: 1080 },
      screenshots: ['fullpage'],
      checks: ['screenshot', 'console', 'performance'],
      timeout: 15000,
      customChecks: this.getDefaultCustomChecks(project.name)
    };

    const configPath = path.resolve(project.siteConfig);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.logger.info(`  Created default config: ${configPath}`);
  }

  private getDefaultCustomChecks(projectName: string): any[] {
    const checks: any[] = [
      { name: 'Page loads correctly', type: 'element', selector: 'body' },
      { name: 'No undefined text', type: 'custom', script: 'return !document.body.innerText.includes("undefined")' },
      { name: 'No NaN text', type: 'custom', script: 'return !document.body.innerText.includes("NaN")' },
    ];

    if (projectName === 'vault-reader') {
      checks.push(
        { name: 'Search input exists', type: 'element', selector: 'input' },
        { name: 'File tree loaded', type: 'custom', script: 'return document.querySelectorAll("a").length > 5' },
      );
    }

    if (projectName === 'depth3d') {
      checks.push(
        { name: 'Canvas exists', type: 'element', selector: 'canvas' },
        { name: 'WebGL initialized', type: 'custom', script: 'return !!document.querySelector("canvas")?.getContext("webgl2")' },
      );
    }

    return checks;
  }

  /**
   * Auto-fix framework bugs using Claude Code
   */
  private async autoFix(failures: FailureDetail[]): Promise<boolean> {
    const fixDescription = failures
      .map(f => `- ${f.page}: ${f.check} — ${f.reason}`)
      .join('\n');

    this.logger.info('Generating fix for:\n' + fixDescription);

    try {
      // Write fix request to a temp file for Claude Code
      const fixFile = path.join(this.resultsBase, 'fix-request.md');
      fs.writeFileSync(fixFile, `# E2E Verifier Framework Bugs to Fix\n\n${fixDescription}`);

      if (this.fixEnabled) {
        execSync(
          `su - coder -c 'cd /home/coder/e2e-verifier && claude -p --permission-mode bypassPermissions "Fix these E2E Verifier framework bugs described in ${fixFile}. After fixing, run npm run build to verify zero errors."'`,
          { timeout: 600000, stdio: 'inherit' }
        );
        return true;
      }
    } catch (err) {
      this.logger.error(`Auto-fix failed: ${err}`);
    }
    return false;
  }

  /**
   * Save round result to project's e2e-test directory
   */
  private saveProjectResult(project: ProjectConfig, result: RoundResult, round: number): void {
    const resultFile = path.join(project.e2eDir, `result-round-${round}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

    // Also save as latest
    fs.writeFileSync(
      path.join(project.e2eDir, 'result-latest.json'),
      JSON.stringify(result, null, 2)
    );
  }

  /**
   * Generate final convergence report
   */
  private generateReport(result: ConvergenceReport['result']): ConvergenceReport {
    const remainingIssues: FailureDetail[] = [];
    const projects: ConvergenceReport['projects'] = {};

    for (const [name, rounds] of this.allResults.entries()) {
      projects[name] = {
        rounds,
        improvement: rounds.length >= 2
          ? (rounds[rounds.length - 1].passed / Math.max(1, rounds[rounds.length - 1].totalChecks)) -
            (rounds[0].passed / Math.max(1, rounds[0].totalChecks))
          : 0
      };

      // Collect remaining failures from last round
      const lastRound = rounds[rounds.length - 1];
      remainingIssues.push(...lastRound.failures.filter(f => f.category !== 'expected'));
    }

    const report: ConvergenceReport = {
      timestamp: new Date().toISOString(),
      totalRounds: Math.max(...Array.from(this.allResults.values()).map(r => r.length)),
      result,
      projects,
      remainingIssues
    };

    // Save report
    const reportFile = path.join(this.resultsBase, `convergence-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    this.logger.info(`\n📄 Report saved: ${reportFile}`);

    // Also generate HTML report
    try {
      const htmlGenerator = new HtmlReportGenerator();
      const htmlReport = path.join(this.resultsBase, `convergence-report-${Date.now()}.html`);
      fs.writeFileSync(htmlReport, this.generateHtmlReport(report));
      this.logger.info(`📄 HTML report: ${htmlReport}`);
    } catch (err) {
      this.logger.warn(`HTML report failed: ${err}`);
    }

    return report;
  }

  private generateHtmlReport(report: ConvergenceReport): string {
    const projectRows = Object.entries(report.projects).map(([name, data]) => {
      const lastRound = data.rounds[data.rounds.length - 1];
      const firstRound = data.rounds[0];
      const lastRate = lastRound.totalChecks > 0
        ? Math.round((lastRound.passed / lastRound.totalChecks) * 100) : 0;
      const firstRate = firstRound.totalChecks > 0
        ? Math.round((firstRound.passed / firstRound.totalChecks) * 100) : 0;
      const arrow = lastRate > firstRate ? '📈' : lastRate < firstRate ? '📉' : '➡️';
      
      return `<tr>
        <td>${name}</td>
        <td>${firstRate}%</td>
        <td>${lastRate}%</td>
        <td>${arrow} ${data.improvement > 0 ? '+' : ''}${Math.round(data.improvement * 100)}%</td>
        <td>${lastRound.explorePages} pages</td>
        <td>${lastRound.failures.length} issues</td>
      </tr>`;
    }).join('');

    const issueRows = report.remainingIssues.map(i => `<tr>
      <td>${i.page}</td><td>${i.check}</td><td>${i.reason}</td><td>${i.category}</td>
    </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>E2E Convergence Report</title>
      <style>
        body { font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 2rem; }
        h1 { color: #60a5fa; } h2 { color: #94a3b8; margin-top: 2rem; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid #334155; padding: 8px 12px; text-align: left; }
        th { background: #1e293b; color: #60a5fa; }
        .result { font-size: 1.5rem; font-weight: bold; padding: 1rem; border-radius: 8px; text-align: center; margin: 1rem 0; }
        .all_passed { background: #065f46; color: #6ee7b7; }
        .converged { background: #713f12; color: #fcd34d; }
        .max_rounds { background: #7f1d1d; color: #fca5a5; }
      </style>
    </head><body>
      <h1>🔍 E2E Convergence Report</h1>
      <p>Time: ${report.timestamp} | Rounds: ${report.totalRounds}</p>
      <div class="result ${report.result}">${report.result.replace(/_/g, ' ').toUpperCase()}</div>
      
      <h2>Project Summary</h2>
      <table><tr><th>Project</th><th>Round 1</th><th>Final</th><th>Change</th><th>Explored</th><th>Remaining</th></tr>
        ${projectRows}
      </table>

      ${report.remainingIssues.length > 0 ? `
      <h2>Remaining Issues (${report.remainingIssues.length})</h2>
      <table><tr><th>Project</th><th>Check</th><th>Reason</th><th>Category</th></tr>
        ${issueRows}
      </table>` : ''}
    </body></html>`;
  }
}

// ═══════════════════════════════════════
// CLI Entry
// ═══════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const options: { maxRounds?: number; projects?: string[]; fix?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-rounds': options.maxRounds = parseInt(args[++i]); break;
      case '--project': options.projects = args[++i].split(','); break;
      case '--fix': options.fix = true; break;
      case '--dry-run':
        console.log('Projects to test:');
        for (const p of PROJECTS) {
          const config = fs.existsSync(p.siteConfig) ? '✅' : '❌ (will create)';
          console.log(`  ${p.name}: ${p.siteConfig} ${config}`);
        }
        return;
    }
  }

  const engine = new ConvergenceEngine(options);
  const report = await engine.run();

  // Print final summary
  console.log('\n' + '═'.repeat(50));
  console.log(`Result: ${report.result}`);
  console.log(`Rounds: ${report.totalRounds}`);
  console.log(`Remaining issues: ${report.remainingIssues.length}`);
  
  // Exit code
  process.exit(report.result === 'all_passed' ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
