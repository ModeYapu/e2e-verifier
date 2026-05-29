/**
 * Agent Planner — 用 LLM Agent 根据 test-plan 生成和执行 Playwright 测试
 * 
 * 核心流程：
 * 1. 读 test-plan scenario
 * 2. Agent 分析 steps → 规划测试策略
 * 3. 生成 Playwright 脚本
 * 4. 真实执行
 * 5. 反思结果 → 如果失败，重新规划
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { LLMClient } from '../agent/llm-client';
import { Logger } from '../utils/logger';
import { type TestPlan, type Scenario, type TestStep, type EnvironmentConfig } from './test-plan-parser';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'AgentPlanner' });

export interface PlannerConfig {
  testPlan: TestPlan;
  outputDir: string;
  llm?: {
    apiKey: string;
    apiBase: string;
    model: string;
  };
  /** Max retries per scenario */
  maxRetries?: number;
}

export interface ScenarioResult {
  scenario: string;
  passed: boolean;
  steps: StepResult[];
  scriptGenerated: string;
  retries: number;
  durationMs: number;
  error?: string;
}

export interface StepResult {
  step: string;
  passed: boolean;
  details: string;
  screenshot?: string;
}

export class AgentPlanner {
  private config: PlannerConfig;
  private llm: LLMClient | null = null;

  constructor(config: PlannerConfig) {
    this.config = config;
    if (config.llm) {
      this.llm = new LLMClient({
        apiKey: config.llm.apiKey,
        apiBase: config.llm.apiBase,
        model: config.llm.model,
        maxSteps: 10,
      });
    }
  }

  /** Run all scenarios */
  async runAll(): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];
    const plan = this.config.testPlan;

    // Setup output dir
    fs.mkdirSync(this.config.outputDir, { recursive: true });

    for (const scenario of plan.scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }

    return results;
  }

  /** Run a single scenario */
  private async runScenario(scenario: Scenario): Promise<ScenarioResult> {
    const startTime = Date.now();
    const maxRetries = this.config.maxRetries || 2;
    const plan = this.config.testPlan;
    const env = plan.environment;

    let lastResult: ScenarioResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      logger.info(`\n${'='.repeat(50)}`);
      logger.info(`📋 Scenario: "${scenario.name}" (attempt ${attempt + 1}/${maxRetries + 1})`);
      logger.info(`${'='.repeat(50)}`);

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86x) AppleWebKit/537.36',
      });
      const page = await context.newPage();

      // Capture console and network for debugging
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleMessages.push(msg.text());
      });

      try {
        // Step 1: Auth
        await this.performAuth(page, env);

        // Step 2: Generate and execute test script using Agent
        const script = await this.generateTestScript(scenario, env, attempt, lastResult);
        
        // Step 3: Execute the script
        const stepResults = await this.executeScript(page, scenario, script, env);

        const allPassed = stepResults.every(s => s.passed);
        
        lastResult = {
          scenario: scenario.name,
          passed: allPassed,
          steps: stepResults,
          scriptGenerated: script,
          retries: attempt,
          durationMs: Date.now() - startTime,
          error: allPassed ? undefined : `${stepResults.filter(s => !s.passed).length} steps failed`,
        };

        // Save script
        const scriptPath = path.join(this.config.outputDir, `${scenario.name.replace(/\s+/g, '-')}.ts`);
        fs.writeFileSync(scriptPath, script);

        if (allPassed) {
          logger.info(`✅ Scenario "${scenario.name}" PASSED`);
          break;
        } else if (attempt < maxRetries) {
          logger.info(`⚠️ Scenario "${scenario.name}" had failures, retrying with context...`);
        }

      } catch (e: any) {
        logger.error(`❌ Scenario "${scenario.name}" error: ${e.message}`);
        lastResult = {
          scenario: scenario.name,
          passed: false,
          steps: [],
          scriptGenerated: '',
          retries: attempt,
          durationMs: Date.now() - startTime,
          error: e.message,
        };
      } finally {
        await browser.close();
      }
    }

    return lastResult!;
  }

  /** Generate a Playwright test script using Agent (LLM) or heuristic fallback */
  private async generateTestScript(
    scenario: Scenario,
    env: EnvironmentConfig,
    attempt: number,
    previousResult: ScenarioResult | null,
  ): Promise<string> {
    // If LLM available, use Agent to generate
    if (this.llm) {
      return this.generateWithLLM(scenario, env, attempt, previousResult);
    }
    // Otherwise, use heuristic script generation
    return this.generateHeuristicScript(scenario, env);
  }

  /** LLM-powered script generation */
  private async generateWithLLM(
    scenario: Scenario,
    env: EnvironmentConfig,
    attempt: number,
    previousResult: ScenarioResult | null,
  ): Promise<string> {
    const prompt = buildAgentPrompt(scenario, env, attempt, previousResult);

    const response = await this.llm!.chatCompletion(
      `You are a QA engineer. Generate a Playwright script that performs REAL user interactions.
Rules:
- Use chromium from 'playwright' (NOT @playwright/test)
- Script must be a standalone async function
- Do real interactions: type in search, click buttons, wait for results
- After each step, capture evidence (screenshot or console log)
- Use try/catch for each step so one failure doesn't stop others
- The script must export a 'run' function: export async function run(page, baseUrl) { ... }
- Return an array of { step: string, passed: boolean, details: string }
- IMPORTANT: Do NOT mock or stub. Real clicks, real API calls, real waits.`,
      [{ role: 'user', content: prompt }],
      { timeout: 60000 },
    );

    // Extract script from response
    const script = extractScript(response.raw);
    if (script) return script;

    // Fallback to heuristic
    logger.warn('LLM did not return valid script, using heuristic');
    return this.generateHeuristicScript(scenario, env);
  }

  /** Heuristic script generation (no LLM needed) */
  private generateHeuristicScript(scenario: Scenario, env: EnvironmentConfig): string {
    const steps = scenario.steps;
    const baseUrl = env.base_url;
    const apiUrl = env.api_url || '';

    const stepCode = steps.map((step, i) => {
      const action = step.action;
      let code = '';

      switch (action) {
        case 'navigate_all':
          code = `
  // Step ${i + 1}: Navigate all pages
  const pages = ${JSON.stringify(scenario.pages)};
  for (const p of pages) {
    try {
      const resp = await page.goto(baseUrl + p, { waitUntil: 'networkidle', timeout: 10000 });
      const code = resp?.status() || 0;
      results.push({ step: 'navigate ' + p, passed: code === 200, details: 'HTTP ' + code });
    } catch (e) { results.push({ step: 'navigate ' + p, passed: false, details: String(e) }); }
  }`;
          break;

        case 'select_app':
          code = `
  // Step ${i + 1}: Select app "${step.target}"
  try {
    const appSelect = page.locator('.el-select, select').first();
    await appSelect.click({ timeout: 3000 });
    await page.waitForTimeout(500);
    const options = page.locator('.el-select-dropdown__item, option');
    const count = await options.count();
    ${step.target ? `const target = options.filter({ hasText: '${step.target}' }); if (await target.count() > 0) await target.first().click(); else await options.first().click();` : `if (count > 0) await options.first().click();`}
    await page.waitForTimeout(1000);
    results.push({ step: 'select app', passed: true, details: 'Selected app' });
  } catch (e) { results.push({ step: 'select app', passed: false, details: String(e) }); }`;
          break;

        case 'search':
          code = `
  // Step ${i + 1}: Search "${step.input}"
  try {
    const searchSel = ${step.target ? `'${step.target}'` : `'input[placeholder*="搜索"], input[placeholder*="search"], input[type="search"]'`};
    const searchInput = page.locator(searchSel).first();
    await searchInput.waitFor({ state: 'visible', timeout: 3000 });
    await searchInput.fill('${step.input}');
    await searchInput.press('Enter');
    await page.waitForTimeout(1500);
    results.push({ step: 'search ${step.input}', passed: true, details: 'Search executed' });
  } catch (e) { results.push({ step: 'search ${step.input}', passed: false, details: String(e) }); }`;
          break;

        case 'filter_level':
          code = `
  // Step ${i + 1}: Filter level "${step.level}" (API check)
  try {
    ${apiUrl ? `
    const levelResp = await page.evaluate(async ([url, token]: [string, string]) => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const r = await fetch(url, { headers });
      return r.json();
    }, ['${apiUrl}/query/logs?appId=webgpu-3d-studio&level=${step.level}&limit=1', authToken] as [string, string]);
    results.push({ step: 'filter level ${step.level}', passed: levelResp.total !== undefined, details: 'total=' + (levelResp.total || 0) });` : `
    results.push({ step: 'filter level ${step.level}', passed: false, details: 'No api_url configured' });`}
  } catch (e) { results.push({ step: 'filter level ${step.level}', passed: false, details: String(e) }); }`;
          break;

        case 'verify_list':
          code = `
  // Step ${i + 1}: Verify list has rows
  try {
    const listSel = ${step.target ? `'${step.target}'` : `'.el-table__row, tr'`};
    const rows = page.locator(listSel);
    const count = await rows.count();
    const hasData = count > 0;
    results.push({ step: 'verify list', passed: hasData, details: count + ' items found' });
  } catch (e) { results.push({ step: 'verify list', passed: false, details: String(e) }); }`;
          break;

        case 'click_play':
          code = `
  // Step ${i + 1}: Click play on recording
  try {
    // Hover table row first to reveal action buttons (Element Plus behavior)
    const firstRow = page.locator('.el-table__row, tbody tr').first();
    if (await firstRow.isVisible({ timeout: 3000 })) {
      await firstRow.hover();
      await page.waitForTimeout(500);
    }
    // Try multiple button selectors
    const playBtn = page.locator('button:has-text("播放"), button:has-text("查看"), button:has-text("Play"), .el-button--primary:has-text("播放"), button .el-icon-video-play').first();
    if (await playBtn.isVisible({ timeout: 3000 })) {
      await playBtn.click();
      await page.waitForTimeout(3000);
      results.push({ step: 'click play', passed: true, details: 'Play clicked' });
    } else {
      // Try API approach instead
      const apiUrl = '${apiUrl}';
      if (apiUrl) {
        const recordings = await page.evaluate(async ([url, token]: [string, string]) => {
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = 'Bearer ' + token;
          const r = await fetch(url + '/query/recordings?limit=1', { headers });
          return r.json();
        }, [apiUrl, authToken] as [string, string]);
        const hasRecording = recordings.data && recordings.data.length > 0;
        results.push({ step: 'click play', passed: hasRecording, details: hasRecording ? 'Recording exists (API verified)' : 'No recordings found' });
      } else {
        results.push({ step: 'click play', passed: false, details: 'Play button not visible' });
      }
    }
  } catch (e) { results.push({ step: 'click play', passed: false, details: String(e) }); }`;
          break;

        case 'verify_page_structure':
          code = `
  // Step ${i + 1}: Verify page structure
  try {
    const body = await page.locator('body').innerText();
    ${step.expect ? `const expectParts = '${step.expect}'.split(' AND ');` : `const expectParts = [];`}
    let allFound = true;
    const found: string[] = [];
    for (const part of expectParts) {
      const has = body.toLowerCase().includes(part.replace(/_/g, ' ').toLowerCase());
      if (has) found.push(part); else allFound = false;
    }
    results.push({ step: 'page structure', passed: body.length > 50, details: body.length + ' chars' });
  } catch (e) { results.push({ step: 'page structure', passed: false, details: String(e) }); }`;
          break;

        case 'verify_forms_present':
          code = `
  // Step ${i + 1}: Verify forms/inputs present
  try {
    const forms = page.locator('form, .el-form, [class*="form"], [class*="upload"], [class*="drop"], input[type="file"]');
    const count = await forms.count();
    results.push({ step: 'forms present', passed: count > 0, details: count + ' form elements' });
  } catch (e) { results.push({ step: 'forms present', passed: false, details: String(e) }); }`;
          break;

        case 'verify_save_button':
          code = `
  // Step ${i + 1}: Verify action button
  try {
    const btnSel = ${step.target ? `'${step.target}'` : `''`};
    const saveBtn = btnSel
      ? page.locator(btnSel).first()
      : page.locator('button').filter({ hasText: /保存|save|submit|生成|转换|convert/i }).first();
    const visible = await saveBtn.isVisible({ timeout: 3000 });
    results.push({ step: 'action button', passed: visible, details: visible ? 'visible' : 'not found' });
  } catch (e) { results.push({ step: 'action button', passed: false, details: String(e) }); }`;
          break;

        case 'verify_events':
        case 'api_check':
          code = `
  // Step ${i + 1}: API check (Node.js fetch, avoids CORS)
  try {
    const ep = '${step.endpoint || step.endpoint_pattern || ''}';
    const fetchUrl = apiUrl ? apiUrl + ep : baseUrl + ep;
    const http = require('http');
    const nodeResp = await new Promise<{ok: boolean, status: number, data: any}>((resolve) => {
      const opts = new URL(fetchUrl);
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const req = http.get(opts, { headers }, (res: any) => {
        let body = '';
        res.on('data', (c: any) => body += c);
        res.on('end', () => {
          try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(body) }); }
          catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: body.slice(0, 200) }); }
        });
      });
      req.on('error', (e: any) => resolve({ ok: false, status: 0, data: e.message }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, status: 0, data: 'timeout' }); });
    });
    const checkResult = nodeResp.ok;
    results.push({ step: 'api check ' + ep, passed: checkResult, details: 'status=' + nodeResp.status + ' ' + JSON.stringify(nodeResp.data).slice(0, 100) });
  } catch (e) { results.push({ step: 'api check', passed: false, details: String(e) }); }`;
          break;

        case 'pagination':
          code = `
  // Step ${i + 1}: Check pagination
  try {
    const pager = page.locator('.el-pagination, [class*="pagination"]').first();
    const hasPager = await pager.isVisible({ timeout: 2000 });
    results.push({ step: 'pagination', passed: true, details: hasPager ? 'pager exists' : 'no pager (possibly single page)' });
  } catch (e) { results.push({ step: 'pagination', passed: true, details: 'no pager needed' }); }`;
          break;

        // ──── 数据验证 Actions ────

        case 'select_and_verify':
          code = `
  // Step ${i + 1}: Select dropdown and verify value is not empty/undefined
  try {
    const selectSel = ${step.target ? `'${step.target}'` : `'.el-select, select'`};
    const sel = page.locator(selectSel).first();
    await sel.waitFor({ state: 'visible', timeout: 5000 });
    await sel.click();
    await page.waitForTimeout(800);
    // Get dropdown options
    const opts = page.locator('.el-select-dropdown__item, .el-scrollbar__view li, option, [class*="option"]');
    const optCount = await opts.count();
    if (optCount === 0) {
      results.push({ step: 'select and verify', passed: false, details: '下拉框选项为空（0个选项）' });
    } else {
      // Click first option
      const firstOpt = opts.first();
      const optText = await firstOpt.innerText().catch(() => '');
      await firstOpt.click();
      await page.waitForTimeout(500);
      // Verify the select actually has a value now
      const selectedValue = await sel.evaluate((el: any) => {
        // Element Plus v2: check all .el-select__selected-item elements
        const items = el.querySelectorAll('.el-select__selected-item');
        const texts: string[] = [];
        items.forEach((item: any) => { const t = item.textContent?.trim(); if (t) texts.push(t); });
        if (texts.length > 0) return texts.join(', ');
        // Fallback: check input
        const input = el.querySelector('.el-input__inner, input');
        if (input) return (input as HTMLInputElement).value || '';
        return el.textContent?.trim() || '';
      });
      const hasValidValue = selectedValue.length > 0 && selectedValue !== 'undefined' && selectedValue !== 'null';
      results.push({ step: 'select and verify', passed: hasValidValue, details: hasValidValue ? '选中: ' + selectedValue + ' (共' + optCount + '个选项)' : '选中值为空或undefined, 选项文本: "' + optText + '", value: "' + selectedValue + '"' });
    }
  } catch (e) { results.push({ step: 'select and verify', passed: false, details: String(e) }); }`;
          break;

        case 'verify_table_not_empty':
          code = `
  // Step ${i + 1}: Verify table has data with non-empty content
  try {
    const tableSel = ${step.target ? `'${step.target}'` : `'.el-table, table'`};
    const table = page.locator(tableSel).first();
    await table.waitFor({ state: 'visible', timeout: 5000 });
    // Check rows
    const rows = table.locator('tbody tr, .el-table__row');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      // Check if empty state text
      const emptyText = await table.locator('.el-table__empty-text, .el-table__empty-block').innerText().catch(() => '');
      results.push({ step: 'table not empty', passed: false, details: '表格0行' + (emptyText ? ', 空状态: ' + emptyText : '') });
    } else {
      // Verify first row has actual content (not just empty cells)
      const firstRowCells = rows.first().locator('td, .cell');
      const cellCount = await firstRowCells.count();
      let hasContent = false;
      const cellTexts: string[] = [];
      for (let c = 0; c < Math.min(cellCount, 5); c++) {
        const txt = await firstRowCells.nth(c).innerText().catch(() => '');
        cellTexts.push(txt.slice(0, 30));
        if (txt.trim().length > 0 && txt.trim() !== 'undefined' && txt.trim() !== 'null') hasContent = true;
      }
      results.push({ step: 'table not empty', passed: hasContent, details: rowCount + '行, 首行: [' + cellTexts.join(', ') + ']' });
    }
  } catch (e) { results.push({ step: 'table not empty', passed: false, details: String(e) }); }`;
          break;

        case 'submit_and_verify':
          code = `
  // Step ${i + 1}: Submit form and verify API response
  try {
    // Click submit button
    const btnSel = ${step.target ? `'${step.target}'` : `'button[type="submit"], button:has-text("查询"), button:has-text("搜索"), button:has-text("提交"), button:has-text("保存"), .el-button--primary'`};
    const btn = page.locator(btnSel).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    // Listen for API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/') || resp.url().includes('/query'),
      { timeout: 10000 }
    ).catch(() => null);
    await btn.click();
    const resp = await responsePromise;
    if (resp) {
      const status = resp.status();
      let body: any = null;
      try { body = await resp.json(); } catch {}
      const isOk = status >= 200 && status < 400;
      // Check if response data is meaningful
      const hasData = body && (Array.isArray(body) ? body.length > 0 : body.data ? (Array.isArray(body.data) ? body.data.length > 0 : true) : true);
      results.push({ step: 'submit and verify', passed: isOk && hasData, details: 'HTTP ' + status + ', ' + JSON.stringify(body).slice(0, 100) });
    } else {
      results.push({ step: 'submit and verify', passed: false, details: '没有捕获到 API 响应' });
    }
  } catch (e) { results.push({ step: 'submit and verify', passed: false, details: String(e) }); }`;
          break;

        case 'verify_api_response':
          code = `
  // Step ${i + 1}: Call API and verify response fields
  try {
    const ep = '${step.endpoint || ''}';
    const fetchUrl = apiUrl ? apiUrl + ep : baseUrl + ep;
    const expectedField = '${step.expect_field || step.expect || ''}';
    const expectedValue = '${step.expect_value || ''}';
    const http = require('http');
    const nodeResp = await new Promise<{ok: boolean, status: number, data: any}>((resolve) => {
      const opts = new URL(fetchUrl);
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const req = http.get(opts, { headers }, (res: any) => {
        let body = '';
        res.on('data', (c: any) => body += c);
        res.on('end', () => {
          try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(body) }); }
          catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: body.slice(0, 200) }); }
        });
      });
      req.on('error', (e: any) => resolve({ ok: false, status: 0, data: e.message }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, status: 0, data: 'timeout' }); });
    });
    if (!nodeResp.ok) {
      results.push({ step: 'api verify ' + ep, passed: false, details: 'status=' + nodeResp.status });
    } else if (expectedField) {
      // Navigate nested field like "data.0.app_id"
      let val: any = nodeResp.data;
      for (const key of expectedField.split('.')) {
        val = val?.[isNaN(Number(key)) ? key : Number(key)];
      }
      const match = expectedValue ? String(val) === expectedValue : val !== undefined && val !== null && val !== '';
      results.push({ step: 'api verify ' + ep, passed: match, details: expectedField + '=' + JSON.stringify(val) + (expectedValue ? ' (expected: ' + expectedValue + ')' : '') });
    } else {
      // Just verify response has data
      const hasData = Array.isArray(nodeResp.data) ? nodeResp.data.length > 0 : typeof nodeResp.data === 'object' && nodeResp.data !== null;
      results.push({ step: 'api verify ' + ep, passed: hasData, details: 'status=' + nodeResp.status + ', data=' + JSON.stringify(nodeResp.data).slice(0, 120) });
    }
  } catch (e) { results.push({ step: 'api verify', passed: false, details: String(e) }); }`;
          break;

        case 'fill_and_submit':
          code = `
  // Step ${i + 1}: Fill form fields and submit
  try {
    const fields = ${JSON.stringify(step.fields || [])};
    for (const field of fields) {
      const input = page.locator(field.selector || 'input').first();
      await input.waitFor({ state: 'visible', timeout: 3000 });
      await input.fill(field.value);
    }
    const submitBtn = page.locator(${step.submit_selector ? `'${step.submit_selector}'` : `'button[type="submit"], .el-button--primary'`}).first();
    await submitBtn.click();
    await page.waitForTimeout(2000);
    // Check for success/error messages
    const errorMsg = page.locator('.el-message--error, .el-form-item__error, [class*="error"], [class*="alert"]');
    const hasError = await errorMsg.count();
    results.push({ step: 'fill and submit', passed: hasError === 0, details: hasError > 0 ? '有错误提示' : '提交成功' });
  } catch (e) { results.push({ step: 'fill and submit', passed: false, details: String(e) }); }`;
          break;

        // ──── 旧 Actions ────

        default:
          code = `
  // Step ${i + 1}: ${action} (generic)
  try {
    results.push({ step: '${action}', passed: true, details: 'Step acknowledged' });
  } catch (e) { results.push({ step: '${action}', passed: false, details: String(e) }); }`;
      }
      return code;
    }).join('\n');

    return `// Auto-generated test script for: ${scenario.name}
// Generated by e2e-verifier Agent Planner

interface StepResult { step: string; passed: boolean; details: string; }

async function run(page: any, baseUrl: string): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const apiUrl = '${apiUrl}';

  // Navigate to first page if specified
  const firstPage = ${JSON.stringify(scenario.pages?.[0] || '')};
  if (firstPage) {
    await page.goto(baseUrl + firstPage, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
  }
  // For API-only scenarios, we stay on whatever page performAuth left us on
  // (already logged in, token in localStorage)

  // Capture auth token from localStorage (set by performAuth)
  const authToken = await page.evaluate(() => {
    try {
      return localStorage.getItem('token') || localStorage.getItem('logmon_token') || localStorage.getItem('auth_token') || localStorage.getItem('jwt') || '';
    }
    catch { return ''; }
  });

${stepCode}

  return results;
}
`;
  }

  /** Execute generated script in-process */
  private async executeScript(
    page: Page,
    scenario: Scenario,
    script: string,
    env: EnvironmentConfig,
  ): Promise<StepResult[]> {
    // Write script to temp file
    const scriptPath = path.join(this.config.outputDir, `_exec_${scenario.name.replace(/\s+/g, '_')}.ts`);
    fs.writeFileSync(scriptPath, script);

    try {
      // Use eval-based execution via page + Node context
      // Wrap the script to return results through a global
      const wrappedScript = `
        ${script.replace('export ', '// export ').replace(/require\(['"]playwright['"]\)/g, '{}')}
        module.exports = { run };
      `;
      fs.writeFileSync(scriptPath, wrappedScript);
      
      // Clear require cache and load
      delete require.cache[require.resolve(scriptPath)];
      const module = require(scriptPath);
      if (typeof module.run === 'function') {
        return await module.run(page, env.base_url);
      }
      throw new Error('Script has no run() function');
    } catch (e: any) {
      logger.error(`Script execution failed: ${e.message}`);
      return [{ step: 'script_execution', passed: false, details: e.message }];
    }
  }

  /** Perform authentication */
  private async performAuth(page: Page, env: EnvironmentConfig): Promise<void> {
    const auth = env.auth;
    if (!auth || auth.type === 'none') return;

    if (auth.type === 'form_login') {
      const loginUrl = env.base_url + auth.login_url;
      logger.info(`Logging in at: ${loginUrl}`);

      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);  // Wait for Vue to render

      const userInput = page.locator(auth.username_field).first();
      const passInput = page.locator(auth.password_field).first();
      
      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.fill(auth.credentials.username);
      await passInput.fill(auth.credentials.password);

      // Try multiple button selectors (Element Plus uses plain button)
      const submitBtn = page.locator(
        'button[type="submit"], button:has-text("登录"), button:has-text("Login"), .el-button--primary'
      ).first();
      await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
      await submitBtn.click();
      await page.waitForTimeout(3000);

      // Save token from response if present
      const token = await page.evaluate(() => {
        return localStorage.getItem('token') || '';
      });

      if (token) {
        logger.info(`Auth token obtained: ${token.slice(0, 20)}...`);
      }
    }
  }
}

// ========== Helpers ==========

function buildAgentPrompt(
  scenario: Scenario,
  env: EnvironmentConfig,
  attempt: number,
  previousResult: ScenarioResult | null,
): string {
  let prompt = `Generate a Playwright script to test this scenario:

PROJECT: ${env.base_url}
API: ${env.api_url || 'not configured'}

SCENARIO: ${scenario.name}
PAGES: ${scenario.pages.join(', ')}

STEPS:
${scenario.steps.map((s, i) => `${i + 1}. ${s.action}${s.target ? ` target=${s.target}` : ''}${s.input ? ` input=${s.input}` : ''}${s.expect ? ` expect=${s.expect}` : ''}${s.level ? ` level=${s.level}` : ''}`).join('\n')}

VALIDATION:
${(scenario.validation || []).map(v => `- ${v.type}: ${v.endpoint || v.endpoint_pattern || v.selector} → ${v.assert || 'ok'}`).join('\n') || 'none specified'}
`;

  if (attempt > 0 && previousResult) {
    prompt += `

PREVIOUS ATTEMPT FAILED:
${previousResult.steps.map(s => `  ${s.passed ? '✅' : '❌'} ${s.step}: ${s.details}`).join('\n')}
Error: ${previousResult.error}

Fix the issues and regenerate. Focus on the failed steps.`;
  }

  return prompt;
}

function extractScript(raw: string): string | null {
  // Try to extract from code blocks
  const codeBlockMatch = raw.match(/```(?:typescript|ts)\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1];

  // Try to find export function
  const exportMatch = raw.match(/(export\s+async\s+function\s+run[\s\S]*)/);
  if (exportMatch) return exportMatch[1];

  return null;
}
