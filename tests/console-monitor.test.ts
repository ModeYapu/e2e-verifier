/**
 * ConsoleMonitor 单元测试
 * 测试 pause/resume/whilePaused/ignorePatterns
 */

import { chromium, Browser, Page } from '@playwright/test';
import { ConsoleMonitor } from '../src/checks/console';

const TEST_HTML = `
<!DOCTYPE html>
<html><head><title>Console Test</title></head>
<body>
  <button id="errBtn" onclick="console.error('intentional error')">Error</button>
  <button id="warnBtn" onclick="console.warn('warning')">Warn</button>
</body></html>
`;

describe('ConsoleMonitor', () => {
  let browser: Browser;
  let page: Page;
  let monitor: ConsoleMonitor;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(TEST_HTML, { waitUntil: 'networkidle' });
    monitor = new ConsoleMonitor(page);
  });

  afterAll(async () => {
    await browser.close();
  });

  test('collects console errors', async () => {
    await page.click('#errBtn');
    expect(monitor.hasErrors()).toBe(true);
    const errors = monitor.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('intentional error');
    monitor.clearErrors();
  });

  test('ignores warnings', async () => {
    await page.click('#warnBtn');
    expect(monitor.hasErrors()).toBe(false);
  });

  test('pause suppresses errors', async () => {
    monitor.pause();
    await page.click('#errBtn');
    expect(monitor.hasErrors()).toBe(false);
    monitor.resume();
    monitor.clearErrors();
  });

  test('resume resumes collection', async () => {
    monitor.pause();
    monitor.resume();
    await page.click('#errBtn');
    expect(monitor.hasErrors()).toBe(true);
    monitor.clearErrors();
  });

  test('whilePaused suppresses errors during callback', async () => {
    await monitor.whilePaused(async () => {
      await page.click('#errBtn');
    });
    expect(monitor.hasErrors()).toBe(false);
  });

  test('whilePaused restores monitoring even on error', async () => {
    try {
      await monitor.whilePaused(async () => {
        await page.click('#errBtn');
        throw new Error('test error');
      });
    } catch {}
    // After whilePaused, monitoring should be active
    await page.click('#errBtn');
    expect(monitor.hasErrors()).toBe(true);
    monitor.clearErrors();
  });

  test('ignorePatterns filters matching errors', async () => {
    monitor.addIgnorePatterns([/intentional/]);
    await page.click('#errBtn');
    expect(monitor.hasErrors()).toBe(false);
    // Send a different error
    await page.evaluate(() => console.error('different error'));
    expect(monitor.hasErrors()).toBe(true);
    monitor.clearErrors();
  });

  test('formatErrors returns readable string', async () => {
    await page.evaluate(() => { console.error('fmt-test-1'); console.error('fmt-test-2'); });
    const formatted = monitor.formatErrors();
    expect(formatted).toContain('fmt-test-1');
    expect(formatted).toContain('error(s)');
    monitor.clearErrors();
  });

  test('clearErrors resets state', async () => {
    // Remove ignore patterns from previous test
    monitor.clearErrors();
    // Create a fresh monitor without patterns
    const freshMonitor = new ConsoleMonitor(page);
    await page.click('#errBtn');
    expect(freshMonitor.hasErrors()).toBe(true);
    freshMonitor.clearErrors();
    expect(freshMonitor.hasErrors()).toBe(false);
    expect(freshMonitor.getErrors()).toEqual([]);
  });
});
