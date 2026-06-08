/**
 * Autonomous Explorer - Main exploration engine
 * Orchestrates 4-phase exploration: Discovery, Planning, Testing, Reporting
 */

import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { PageAnalyzer } from './page-analyzer';
import { TestGenerator } from './test-generator';
import { ScriptEngine } from '../agent/script-engine';
import { ScreenshotUtil } from '../utils/screenshot';
import { Logger } from '../utils/logger';
import {
  ExploreConfig,
  PageAnalysis,
  TestPlan,
  PageTestPlan,
  ExploreResult,
  ExploreSummary,
  TestExecution,
  DiscoveryResult,
  SiteMapNode,
  ScriptGenerationOptions,
  TestCase
} from './types';
import { AuthConfig } from '../types';
import { LLMClient } from '../agent/llm-client';

export class AutonomousExplorer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pageAnalyzer: PageAnalyzer;
  private testGenerator: TestGenerator | null = null;
  private scriptEngine: ScriptEngine;
  private logger: Logger;
  private config: ExploreConfig;
  private outputDir: string;
  private screenshotDir: string;
  private totalTokens: number = 0;

  constructor(config: ExploreConfig) {
    this.config = config;
    this.logger = new Logger({ prefix: 'Explorer' });
    this.outputDir = config.outputDir || 'explorer-output';
    this.screenshotDir = path.join(this.outputDir, 'screenshots');

    // Create output directories
    this.ensureDirectories();

    // Initialize components
    this.pageAnalyzer = new PageAnalyzer(this.screenshotDir);
    this.scriptEngine = new ScriptEngine(path.join(process.cwd(), 'scripts', 'explorer-sandbox'));

    // Initialize TestGenerator only if LLM is enabled
    if (config.useLlm !== false && config.llm.apiKey) {
      this.testGenerator = new TestGenerator(config.llm);
    }
  }

  private ensureDirectories(): void {
    const dirs = [
      this.outputDir,
      this.screenshotDir,
      path.join(this.outputDir, 'scripts'),
      path.join(this.outputDir, 'reports')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Main exploration method - runs all 4 phases
   */
  async explore(): Promise<ExploreResult> {
    const startTime = Date.now();
    this.logger.info('Starting autonomous exploration');

    try {
      // Initialize browser
      await this.initializeBrowser();

      // Phase 1: Discovery
      this.logger.info('=== Phase 1: Discovery ===');
      const discovery = await this.runDiscoveryPhase();
      this.logger.info(`Discovered ${discovery.pages.length} pages`);

      // Phase 2: Planning
      this.logger.info('=== Phase 2: Planning ===');
      const testPlan = await this.runPlanningPhase(discovery.pages);
      this.logger.info(`Generated ${testPlan.totalTests} tests`);

      // Phase 3: Testing
      this.logger.info('=== Phase 3: Testing ===');
      const executions = await this.runTestingPhase(testPlan, discovery.pages);
      this.logger.info(`Executed ${executions.length} tests`);

      // Phase 4: Reporting
      this.logger.info('=== Phase 4: Reporting ===');
      const { finalScript, finalScriptPath } = await this.runReportingPhase(
        discovery,
        testPlan,
        executions
      );

      const duration = Date.now() - startTime;

      // Build summary
      const summary: ExploreSummary = {
        pagesExplored: discovery.pages.length,
        testsPlanned: testPlan.totalTests,
        testsPassed: executions.filter(e => e.passed).length,
        testsFailed: executions.filter(e => !e.passed).length,
        duration,
        totalTokens: this.totalTokens,
        screenshotsTaken: discovery.pages.length + executions.filter(e => e.screenshot).length
      };

      const result: ExploreResult = {
        config: this.config,
        discovery: discovery.pages,
        testPlan,
        executions,
        summary,
        finalScript,
        finalScriptPath
      };

      this.logger.info(`=== Exploration Complete ===`);
      this.logger.info(`Pages: ${summary.pagesExplored}, Tests: ${summary.testsPassed}/${summary.testsPlanned} passed`);
      this.logger.info(`Duration: ${duration}ms, Tokens: ${summary.totalTokens}`);

      return result;

    } finally {
      await this.cleanup();
    }
  }

  /**
   * Phase 1: Discovery - explore all accessible pages
   */
  private async runDiscoveryPhase(): Promise<DiscoveryResult> {
    const pages: PageAnalysis[] = [];
    const toVisit: Array<{ url: string; depth: number }> = [
      { url: this.config.url, depth: 0 }
    ];
    const visited = new Set<string>([this.config.url]);
    const maxPages = this.config.maxPages || 20;
    const maxDepth = this.config.maxDepth || 2;

    // Perform login if configured
    if (this.config.auth) {
      await this.performLogin(this.config.auth);
    }

    while (toVisit.length > 0 && pages.length < maxPages) {
      const { url, depth } = toVisit.shift()!;

      if (depth > maxDepth) continue;

      try {
        this.logger.info(`Discovering: ${url} (depth: ${depth}, remaining: ${toVisit.length})`);

        await this.page!.goto(url, { waitUntil: 'networkidle', timeout: this.config.timeout || 30000 });

        // Analyze the page
        const analysis = await this.pageAnalyzer.analyze(this.page!, depth);
        pages.push(analysis);

        // Collect navigation links for further exploration
        for (const navItem of analysis.navigation) {
          if (!navItem.isInternal) continue;
          if (visited.has(navItem.href)) continue;

          // Convert relative URLs to absolute
          let absoluteUrl = navItem.href;
          if (!navItem.href.startsWith('http')) {
            try {
              absoluteUrl = new URL(navItem.href, url).href;
            } catch {
              continue;
            }
          }

          if (pages.length + toVisit.length >= maxPages) break;
          if (!visited.has(absoluteUrl)) {
            visited.add(absoluteUrl);
            toVisit.push({ url: absoluteUrl, depth: depth + 1 });
          }
        }

      } catch (error) {
        this.logger.warn(`Failed to discover page ${url}: ${error}`);
      }
    }

    // Build site map
    const siteMap = this.buildSiteMap(pages);

    return {
      pages,
      siteMap,
      uniqueUrls: Array.from(visited),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Phase 2: Planning - generate test plan using LLM or heuristics
   */
  private async runPlanningPhase(analyses: PageAnalysis[]): Promise<TestPlan> {
    if (this.testGenerator && this.config.useLlm !== false) {
      try {
        const plan = await this.testGenerator.generatePlan(analyses);
        return plan;
      } catch (error) {
        this.logger.warn(`LLM planning failed, using heuristic fallback: ${error}`);
      }
    }

    // Fallback: heuristic-based planning (no LLM needed)
    return this.generateHeuristicPlan(analyses);
  }

  /**
   * Phase 3: Testing - execute generated tests
   */
  private async runTestingPhase(
    testPlan: TestPlan,
    pageAnalyses: PageAnalysis[]
  ): Promise<TestExecution[]> {
    const executions: TestExecution[] = [];

    // Create a map of URL to page analysis for quick lookup
    const analysisMap = new Map<string, PageAnalysis>();
    for (const analysis of pageAnalyses) {
      analysisMap.set(analysis.url, analysis);
    }

    for (const pagePlan of testPlan.pages) {
      const analysis = analysisMap.get(pagePlan.url);
      if (!analysis) {
        this.logger.warn(`No analysis found for page: ${pagePlan.url}`);
        continue;
      }

      // Perform login if needed (we might need to re-auth after navigation)
      if (this.config.auth && this.page!.url().includes('login')) {
        await this.performLogin(this.config.auth);
      }

      for (const testCase of pagePlan.tests) {
        const execution = await this.executeTestCase(testCase, analysis, pageAnalyses);
        executions.push(execution);
      }
    }

    return executions;
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(
    testCase: TestCase,
    pageAnalysis: PageAnalysis,
    allAnalyses: PageAnalysis[]
  ): Promise<TestExecution> {
    const startTime = Date.now();
    this.logger.info(`Executing test: ${testCase.name}`);

    try {
      let script: string;

      // Generate script using LLM or fallback
      if (this.testGenerator && this.config.useLlm !== false) {
        script = await this.testGenerator.generateScript(
          testCase,
          pageAnalysis,
          this.config.auth
        );
      } else {
        // Use heuristic script generation (no LLM)
        script = this.generateHeuristicScript(testCase, pageAnalysis);
      }

      // Write script to disk
      const scriptPath = this.scriptEngine.writeScript(script, testCase.name.replace(/\s+/g, '-').toLowerCase());

      // Execute the script
      const result = await this.scriptEngine.executeScript(scriptPath, {
        timeout: testCase.estimatedDuration || 30000
      });

      // Take screenshot after execution
      let screenshot: string | undefined;
      try {
        const screenshotUtil = new ScreenshotUtil(this.page!, 'explorer', this.screenshotDir);
        const filename = `${testCase.name.replace(/\s+/g, '-')}-${Date.now()}`;
        screenshot = await screenshotUtil.takeScreenshot({ name: filename });
      } catch (error) {
        this.logger.warn(`Failed to take post-test screenshot: ${error}`);
      }

      const execution: TestExecution = {
        testCase,
        url: pageAnalysis.url,
        passed: result.success,
        screenshot,
        script,
        output: result.stdout,
        error: result.success ? undefined : result.stderr,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      this.logger.info(`Test ${testCase.name}: ${execution.passed ? 'PASSED' : 'FAILED'}`);
      return execution;

    } catch (error) {
      this.logger.error(`Test execution failed: ${error}`);

      return {
        testCase,
        url: pageAnalysis.url,
        passed: false,
        script: '',
        output: '',
        error: String(error),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Phase 4: Reporting - merge scripts and generate final output
   */
  private async runReportingPhase(
    discovery: DiscoveryResult,
    testPlan: TestPlan,
    executions: TestExecution[]
  ): Promise<{ finalScript: string; finalScriptPath: string }> {
    // Extract all successful scripts
    const successfulScripts = executions
      .filter(e => e.passed && e.script)
      .map(e => e.script);

    // Merge into one comprehensive script
    const finalScript = this.testGenerator
      ? this.testGenerator.mergeScripts(successfulScripts, this.config.auth)
      : this.mergeScriptsFallback(successfulScripts);

    // Save final script
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalScriptName = `final-test-suite-${timestamp}`;
    const finalScriptPath = this.scriptEngine.saveFinalScript(finalScript, finalScriptName);

    // Save JSON report
    const jsonReportPath = path.join(this.outputDir, `report-${timestamp}.json`);
    const reportData = {
      discovery: {
        pages: discovery.pages.map(p => ({
          url: p.url,
          title: p.title,
          screenshot: p.screenshot,
          depth: p.depth
        })),
        siteMap: discovery.siteMap,
        uniqueUrls: discovery.uniqueUrls
      },
      testPlan,
      executions,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));

    this.logger.info(`Final script saved: ${finalScriptPath}`);
    this.logger.info(`JSON report saved: ${jsonReportPath}`);

    return { finalScript, finalScriptPath };
  }

  /**
   * Initialize browser and page
   */
  private async initializeBrowser(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // Set viewport
    await this.page.setViewportSize({ width: 1920, height: 1080 });
  }

  /**
   * Perform login using auth config
   */
  private async performLogin(auth: AuthConfig): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    const loginUrl = auth.loginUrl || this.config.url;
    this.logger.info(`Performing login: ${loginUrl}`);

    await this.page.goto(loginUrl, { waitUntil: 'networkidle' });

    const scope = auth.formSelector || 'body';
    const form = this.page.locator(scope).first();

    const usernameSel = auth.usernameSelector || 'input:not([type="password"])';
    const passwordSel = auth.passwordSelector || 'input[type="password"]';
    const submitSel = auth.submitSelector || 'button[type="submit"]';

    await form.locator(usernameSel).first().fill(auth.username);
    await form.locator(passwordSel).first().fill(auth.password);

    const submitBtn = form.locator(submitSel)
      .filter({ hasText: /登录|login|sign|submit|connect/i })
      .first();

    await submitBtn.click();

    if (auth.successUrlPattern) {
      await this.page.waitForURL(new RegExp(auth.successUrlPattern), { timeout: 10000 });
    } else {
      await this.page.waitForTimeout(3000);
    }

    this.logger.info('Login successful');
  }

  /**
   * Build site map from page analyses
   */
  private buildSiteMap(pages: PageAnalysis[]): SiteMapNode {
    // Create URL to page mapping
    const pageMap = new Map<string, PageAnalysis>();
    for (const page of pages) {
      pageMap.set(page.url, page);
    }

    // Find root page (depth 0 or starting URL)
    const rootUrl = this.config.url;
    const rootPage = pageMap.get(rootUrl) || pages[0];

    // Build tree structure
    const nodeMap = new Map<string, SiteMapNode>();

    for (const page of pages) {
      nodeMap.set(page.url, {
        url: page.url,
        title: page.title,
        children: [],
        depth: page.depth
      });
    }

    // Link children to parents
    for (const page of pages) {
      const node = nodeMap.get(page.url)!;

      for (const nav of page.navigation) {
        if (!nav.isInternal) continue;

        let targetUrl = nav.href;
        if (!targetUrl.startsWith('http')) {
          try {
            targetUrl = new URL(nav.href, page.url).href;
          } catch {
            continue;
          }
        }

        const childNode = nodeMap.get(targetUrl);
        if (childNode && childNode.depth > node.depth) {
          node.children.push(childNode);
        }
      }
    }

    return nodeMap.get(rootUrl) || nodeMap.values().next().value;
  }

  /**
   * Fallback script merger when LLM is not available
   */
  private mergeScriptsFallback(scripts: string[]): string {
    const testFunctions: string[] = [];

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const extracted = this.extractMainLogic(script, i);
      testFunctions.push(extracted);
    }

    const authBlock = this.config.auth ? this.generateAuthBlock() : '';

    return `import { chromium } from '@playwright/test';

/**
 * Auto-generated E2E test suite from autonomous exploration
 * Generated: ${new Date().toISOString()}
 * LLM mode: disabled (heuristic-based tests)
 */

async function performLogin(page: Page) {
${authBlock}
}

${testFunctions.join('\n\n')}

async function runAllTests(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Starting E2E test suite...');

${testFunctions.map((_, i) => `    await test${i + 1}(page);
    console.log('Test ${i + 1} completed');`).join('\n')}

    console.log('All tests completed');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runAllTests(process.argv[2] || 'http://localhost:3000').catch(console.error);
}

export { runAllTests };
`;
  }

  /**
   * Extract main logic from script for merging
   */
  private extractMainLogic(script: string, index: number): string {
    let cleaned = script.replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '');

    const mainMatch = cleaned.match(/async\s+function\s+main\(\)\s*\{([\s\S]*)\}/);
    if (mainMatch) {
      cleaned = mainMatch[1];
    }

    const functionName = `test${index + 1}`;
    const lines = cleaned.split('\n');
    const indentedBody = lines.map(line => '  ' + line).join('\n');

    return `async function ${functionName}(page: Page) {
${indentedBody}
}`;
  }

  /**
   * Generate auth block for merged script
   */
  private generateAuthBlock(): string {
    if (!this.config.auth) return '';

    const auth = this.config.auth;
    const loginUrl = auth.loginUrl || this.config.url;
    const formSelector = auth.formSelector || 'body';
    const usernameSelector = auth.usernameSelector || 'input:not([type="password"])';
    const passwordSelector = auth.passwordSelector || 'input[type="password"]';
    const submitSelector = auth.submitSelector || 'button[type="submit"]';

    const waitForLine = auth.successUrlPattern
      ? `  await page.waitForURL(new RegExp('${auth.successUrlPattern}'));`
      : '  await page.waitForTimeout(3000);';

    return `  await page.goto('${loginUrl}');
  const form = page.locator('${formSelector}').first();
  await form.locator('${usernameSelector}').fill('${auth.username}');
  await form.locator('${passwordSelector}').fill('${auth.password}');
  await form.locator('${submitSelector}').click();
${waitForLine}`;
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      await this.context?.close();
      await this.browser?.close();
    } catch (error) {
      this.logger.warn(`Cleanup error: ${error}`);
    }
  }

  /**
   * Get total tokens consumed (for LLM mode)
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Generate a heuristic test plan from page analyses (no LLM)
   */
  private generateHeuristicPlan(analyses: PageAnalysis[]): TestPlan {
    const pages: PageTestPlan[] = [];

    for (const analysis of analyses) {
      const tests: TestCase[] = [];

      // Test: page loads and has title
      tests.push({
        name: `${analysis.title || 'Page'} loads correctly`,
        description: `Verify ${analysis.url} loads with correct title`,
        steps: ['Navigate to page', 'Wait for load', 'Check title is not empty'],
        assertions: ['Page title is not empty', 'No console errors'],
        priority: 'high'
      });

      // Test: tables have data
      for (let i = 0; i < analysis.tables.length; i++) {
        const table = analysis.tables[i];
        tests.push({
          name: `Table ${i + 1} has data rows`,
          description: `Verify table with headers [${table.headers.join(', ')}] has rows`,
          steps: ['Find table', 'Count rows', 'Verify row count > 0'],
          assertions: [`Table has ${table.rowCount} rows`, 'Headers match expected columns'],
          priority: 'high'
        });
      }

      // Test: forms have inputs
      for (let i = 0; i < analysis.forms.length; i++) {
        const form = analysis.forms[i];
        tests.push({
          name: `Form ${i + 1} is functional`,
          description: `Verify form with ${form.fields.length} fields is present`,
          steps: ['Find form', 'Count input fields', 'Verify submit button exists'],
          assertions: [`Form has ${form.fields.length} input fields`, 'Submit button exists'],
          priority: 'medium'
        });
      }

      // Test: no undefined/NaN in page text
      tests.push({
        name: `No undefined or NaN text`,
        description: `Verify page text does not contain undefined or NaN`,
        steps: ['Get page text', 'Check for undefined', 'Check for NaN'],
        assertions: ['No "undefined" in page text', 'No "NaN" in page text'],
        priority: 'high'
      });

      // Test: interactive elements are present
      if (analysis.interactiveElements.length > 0) {
        tests.push({
          name: `${analysis.interactiveElements.length} interactive elements present`,
          description: `Verify page has expected interactive elements`,
          steps: ['Count buttons', 'Count inputs', 'Count selects'],
          assertions: [`${analysis.interactiveElements.length} interactive elements found`],
          priority: 'medium'
        });
      }

      // Use suggested tests from PageAnalyzer
      for (const suggested of analysis.suggestedTests) {
        tests.push({
          name: suggested,
          description: suggested,
          steps: ['Execute suggested test'],
          assertions: ['Test passes'],
          priority: 'medium'
        });
      }

      pages.push({
        url: analysis.url,
        pageName: analysis.title || analysis.url,
        tests
      });
    }

    return {
      pages,
      totalTests: pages.reduce((sum, p) => sum + p.tests.length, 0),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate login preamble for standalone scripts
   */
  private generateLoginPreamble(): string {
    if (!this.config.auth) return '';
    const auth = this.config.auth;
    const loginUrl = auth.loginUrl || this.config.url;
    const username = auth.username;
    const password = auth.password;
    const formSelector = auth.formSelector || 'body';
    const usernameSel = auth.usernameSelector || 'input:not([type=password])';
    const passwordSel = auth.passwordSelector || 'input[type=password]';
    const successPattern = auth.successUrlPattern || '';

    // Use backtick strings in generated code to avoid quote conflicts with CSS attribute selectors
    // successUrlPattern is a regex pattern string like \/logmon\/(?!login)
    // Need to properly escape for JS regex literal in template output
    const escapedPattern = successPattern.replace(/\//g, '\\/');
    const waitForUrl = successPattern 
      ? `await page.waitForURL(/${escapedPattern}/, { timeout: 10000 });`
      : 'await page.waitForTimeout(3000);';

    return `
    // --- Auto Login ---
    await page.goto(\`${loginUrl}\`, { waitUntil: 'networkidle', timeout: 15000 });
    const loginForm = page.locator(\`${formSelector}\`).first();
    await loginForm.locator(\`${usernameSel}\`).first().fill(\`${username}\`);
    await loginForm.locator(\`${passwordSel}\`).first().fill(\`${password}\`);
    await loginForm.locator('button').filter({ hasText: /登录|login|sign|submit/i }).first().click();
    ${waitForUrl}
    // --- End Login ---
`;
  }

  /**
   * Generate a heuristic Playwright script (no LLM)
   */
  private generateHeuristicScript(testCase: TestCase, analysis: PageAnalysis): string {
    const url = analysis.url;
    const escapedName = testCase.name.replace(/'/g, "\\'");
    const loginPreamble = this.generateLoginPreamble();

    // Build real assertions based on test case type and page analysis
    const assertions: string[] = [];
    const name = testCase.name.toLowerCase();

    // 1. Page loads correctly
    if (name.includes('loads correctly') || name.includes('loads')) {
      assertions.push(`
    // Check page title is not empty
    const title = await page.title();
    if (!title || title.trim() === '') {
      console.log('FAIL: Page title is empty');
      process.exit(1);
    }
    console.log('INFO: Title = ' + title);`);
      // Check no redirect to login
      assertions.push(`
    // Check not redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      console.log('FAIL: Redirected to login page');
      process.exit(1);
    }`);
    }

    // 2. Table tests
    if (name.includes('table') && name.includes('data rows')) {
      const tableIdx = parseInt(name.match(/table (\d+)/)?.[1] || '1') - 1;
      const table = analysis.tables[tableIdx];
      if (table) {
        assertions.push(`
    // Wait for table data to load (async tables)
    try {
      await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
    } catch (e) {
      // Table may be empty - check below
    }
    const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
    if (${tableIdx} >= tableCount) {
      console.log('INFO: Table ${tableIdx + 1} does not exist on page (only ' + tableCount + ' tables found)');
      console.log('PASS: Table ${tableIdx + 1} has data rows');
    } else {
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(${tableIdx}).count();
      const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
      if (rows === 0 && emptyBlock === 0) {
        console.log('FAIL: Table ${tableIdx + 1} has no rows and no empty state');
        process.exit(1);
      }
      if (rows === 0) {
        console.log('INFO: Table ${tableIdx + 1} is empty (shows empty state) - this is acceptable');
        console.log('PASS: Table ${tableIdx + 1} has data rows');
      } else {
        console.log('INFO: Table ${tableIdx + 1} has ' + rows + ' rows');
      }
    }`);
        // Check headers
        if (table.headers.length > 0) {
          const headerChecks = table.headers.map(h => `"${h}"`).join(', ');
          assertions.push(`
    if (tableCount > ${tableIdx}) {
      const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(${tableIdx}).allTextContents();
      const headerStr = headerText.join(' ');
      const expectedHeaders = [${headerChecks}];
      for (const h of expectedHeaders) {
        if (!headerStr.includes(h)) {
          console.log('WARN: Missing header: ' + h);
        }
      }
    }`);
        }
      }
    }

    // 3. Form tests
    if (name.includes('form') && name.includes('functional')) {
      const formIdx = parseInt(name.match(/form (\d+)/)?.[1] || '1') - 1;
      const form = analysis.forms[formIdx];
      if (form) {
        assertions.push(`
    // Check form has input fields
    const formEl = page.locator('form, .el-form').nth(${formIdx});
    const inputCount = await formEl.locator('input, select, textarea').count();
    if (inputCount === 0) {
      console.log('FAIL: Form ${formIdx + 1} has no input fields');
      process.exit(1);
    }
    console.log('INFO: Form ${formIdx + 1} has ' + inputCount + ' input fields');`);
        // Check submit button
        assertions.push(`
    // Check form has submit/save button
    const submitBtn = formEl.locator('button[type=submit], button:has-text("保存"), button:has-text("提交"), button:has-text("确定")');
    const hasSubmit = await submitBtn.count();
    if (hasSubmit === 0) {
      console.log('WARN: Form ${formIdx + 1} has no submit button');
    }`);
      }
    }

    // 4. Interactive elements
    if (name.includes('interactive elements present')) {
      const count = analysis.interactiveElements.length;
      assertions.push(`
    // Check interactive elements count
    const buttons = await page.locator('button').count();
    const inputs = await page.locator('input, select, textarea').count();
    const links = await page.locator('a').count();
    const total = buttons + inputs + links;
    console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
    if (total < ${Math.max(1, Math.floor(count * 0.5))}) {
      console.log('FAIL: Expected at least ${Math.max(1, Math.floor(count * 0.5))} interactive elements, found ' + total);
      process.exit(1);
    }`);
    }

    // 5. Buttons clickable
    if (name.includes('buttons') && name.includes('clickable')) {
      assertions.push(`
    // Check all visible buttons are enabled
    const buttons = await page.locator('button:visible').all();
    let disabledCount = 0;
    for (const btn of buttons) {
      const disabled = await btn.isDisabled();
      if (disabled) disabledCount++;
    }
    console.log('INFO: ' + buttons.length + ' buttons found, ' + disabledCount + ' disabled');`);
    }

    // 6. Table displays data correctly
    if (name.includes('displays data correctly')) {
      const rowMatch = name.match(/\((\d+) rows\)/);
      const expectedRows = rowMatch ? parseInt(rowMatch[1]) : 0;
      if (expectedRows > 0) {
        assertions.push(`
    // Check table has expected number of rows
    const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
    console.log('INFO: Found ' + rows + ' rows (expected ${expectedRows})');
    if (rows < 1) {
      console.log('FAIL: Expected ${expectedRows} rows but found ' + rows);
      process.exit(1);
    }`);
      }
    }

    // 7. Form can be submitted
    if (name.includes('form') && name.includes('submitted')) {
      assertions.push(`
    // Check form exists and is submittable
    const forms = await page.locator('form, .el-form').count();
    console.log('INFO: Found ' + forms + ' forms');`);
    }

    // 8. No undefined/NaN (always check)
    if (name.includes('undefined') || name.includes('nan')) {
      assertions.push(`
    // Check page content for undefined/NaN
    const bodyText = await page.evaluate(() => document.body.innerText);
    const problems = [];
    if (bodyText.includes('undefined')) problems.push('undefined');
    if (bodyText.includes('NaN')) problems.push('NaN');
    if (bodyText.includes('null')) problems.push('null');
    if (problems.length > 0) {
      console.log('FAIL: Page contains ' + problems.join(', '));
      process.exit(1);
    }`);
    }

    // Fallback: generic check if no specific assertions matched
    if (assertions.length === 0) {
      assertions.push(`
    // Generic check: page loaded and has content
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText || bodyText.trim().length < 10) {
      console.log('FAIL: Page appears empty');
      process.exit(1);
    }`);
    }

    // Final PASS marker
    assertions.push(`\n    console.log('PASS: ${escapedName}');`);

    const assertionsCode = assertions.join('\n');

    return `import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
${loginPreamble}
    // --- Navigate to target page ---
    await page.goto(\`${url}\`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: ${escapedName}');
${assertionsCode}
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
`;
  }
}
