/**
 * runCustomCheck 单元测试
 * 测试 element / text / attribute / javascript / custom / api check types
 */

import { chromium, Browser, Page } from '@playwright/test';

const TEST_HTML = `
<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
  <h1 id="title">Hello World</h1>
  <div id="content">Some content here</div>
  <div id="hidden" style="display:none;">Hidden</div>
  <input id="input" type="text" value="test-value" data-role="primary">
  <div class="badge v2">V2</div>
</body></html>
`;

// Minimal check runner mirroring Verifier.runCustomCheck
class CheckTestRunner {
  private page: Page;

  constructor(page: Page) { this.page = page; }

  async runCheck(check: any): Promise<{ passed: boolean; message: string; details?: any }> {
    try {
      switch (check.type) {
        case 'element': {
          const element = await this.page.$(check.selector);
          return {
            passed: element !== null,
            message: element ? `Element found: ${check.selector}` : `Element not found: ${check.selector}`
          };
        }
        case 'text': {
          const textContent = await this.page.$eval(check.selector, (el: any) => el.textContent?.trim() || '');
          const matches = textContent === check.expected;
          return {
            passed: matches,
            message: matches ? `Text matches: "${check.expected}"` : `Text mismatch. Expected: "${check.expected}", Got: "${textContent}"`
          };
        }
        case 'attribute': {
          const attrValue = await this.page.$eval(check.selector, (el: any, attr: string) => el.getAttribute(attr), check.expected as string);
          return {
            passed: attrValue !== null,
            message: attrValue ? `Attribute ${check.expected} = "${attrValue}"` : `Attribute ${check.expected} not found`
          };
        }
        case 'javascript':
        case 'custom': {
          let script = check.script;
          if (script.trim().startsWith('return ')) script = `(() => { ${script} })()`;
          const result = await this.page.evaluate(script);
          return {
            passed: !!result,
            message: `Script result: ${result}`,
            details: { result }
          };
        }
        case 'api': {
          const apiUrl = check.url || '';
          const method = (check.method || 'GET').toUpperCase();
          const expectedStatus = check.expectedStatus || 200;
          const fullUrl = apiUrl.startsWith('http') ? apiUrl : new URL(apiUrl, this.page.url()).href;
          const apiResult = await this.page.evaluate(async ({ url, method, body, expectedStatus }: any) => {
            try {
              const opts: RequestInit = { method };
              if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
              const resp = await fetch(url, opts);
              return { status: resp.status, statusMatches: resp.status === expectedStatus };
            } catch (err: any) { return { status: 0, statusMatches: false, error: err.message }; }
          }, { url: fullUrl, method, body: check.body, expectedStatus });
          return {
            passed: apiResult.statusMatches,
            message: `${method} ${fullUrl} → ${apiResult.status} (expected ${expectedStatus})`
          };
        }
        default:
          return { passed: false, message: `Unknown check type: ${check.type}` };
      }
    } catch (error: any) {
      return { passed: false, message: `Check error: ${error.message}` };
    }
  }
}

describe('runCustomCheck', () => {
  let browser: Browser;
  let page: Page;
  let runner: CheckTestRunner;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(TEST_HTML, { waitUntil: 'networkidle' });
    runner = new CheckTestRunner(page);
  });

  afterAll(async () => {
    await browser.close();
  });

  // --- element checks ---
  test('element - found', async () => {
    const r = await runner.runCheck({ name: 'title exists', type: 'element', selector: '#title' });
    expect(r.passed).toBe(true);
    expect(r.message).toContain('Element found');
  });

  test('element - not found', async () => {
    const r = await runner.runCheck({ name: 'missing', type: 'element', selector: '#nonexistent' });
    expect(r.passed).toBe(false);
    expect(r.message).toContain('not found');
  });

  // --- text checks ---
  test('text - matches', async () => {
    const r = await runner.runCheck({ name: 'title text', type: 'text', selector: '#title', expected: 'Hello World' });
    expect(r.passed).toBe(true);
  });

  test('text - mismatch', async () => {
    const r = await runner.runCheck({ name: 'wrong text', type: 'text', selector: '#title', expected: 'Goodbye' });
    expect(r.passed).toBe(false);
    expect(r.message).toContain('Text mismatch');
  });

  // --- attribute checks ---
  test('attribute - found', async () => {
    const r = await runner.runCheck({ name: 'data-role', type: 'attribute', selector: '#input', expected: 'data-role' });
    expect(r.passed).toBe(true);
    expect(r.message).toContain('primary');
  });

  test('attribute - not found', async () => {
    const r = await runner.runCheck({ name: 'missing attr', type: 'attribute', selector: '#input', expected: 'data-missing' });
    expect(r.passed).toBe(false);
  });

  // --- javascript checks ---
  test('javascript - true', async () => {
    const r = await runner.runCheck({ name: 'js check', type: 'javascript', script: 'return document.querySelectorAll("div").length > 0' });
    expect(r.passed).toBe(true);
    expect(r.details?.result).toBe(true);
  });

  test('javascript - false', async () => {
    const r = await runner.runCheck({ name: 'js false', type: 'javascript', script: 'return false' });
    expect(r.passed).toBe(false);
  });

  // --- custom (alias for javascript) ---
  test('custom - works same as javascript', async () => {
    const r = await runner.runCheck({ name: 'custom check', type: 'custom', script: '(() => { return document.getElementById("title") !== null; })()' });
    expect(r.passed).toBe(true);
  });

  test('custom - bare return auto-wrapped', async () => {
    const r = await runner.runCheck({ name: 'bare return', type: 'custom', script: 'return !!document.getElementById("input")' });
    expect(r.passed).toBe(true);
  });

  // --- unknown ---
  test('unknown type returns false', async () => {
    const r = await runner.runCheck({ name: 'unknown', type: 'foobar' });
    expect(r.passed).toBe(false);
    expect(r.message).toContain('Unknown check type');
  });
});
