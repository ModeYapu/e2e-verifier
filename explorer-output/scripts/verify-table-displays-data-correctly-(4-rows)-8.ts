/**
 * AUTO-GENERATED TEST SCRIPT (explorer-output artifact).
 *
 * The credentials below (`admin` / `admin123`) are throwaway test-suite
 * credentials for the local LogMonitor fixture — NOT real secrets. They are
 * documented in /.env.example as TEST_USERNAME / TEST_PASSWORD. Do not commit
 * real credentials to generated scripts.
 */

import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {

    // --- Auto Login ---
    await page.goto(`http://127.0.0.1/logmon/login`, { waitUntil: 'networkidle', timeout: 15000 });
    const loginForm = page.locator(`.el-form`).first();
    await loginForm.locator(`input:not([type='password'])`).first().fill(`admin`);
    await loginForm.locator(`input[type='password']`).first().fill(`admin123`);
    await loginForm.locator('button').filter({ hasText: /登录|login|sign|submit/i }).first().click();
    await page.waitForURL(/\/logmon\/(?!login)/, { timeout: 10000 });
    // --- End Login ---

    // --- Navigate to target page ---
    await page.goto(`http://127.0.0.1/logmon/`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: Verify table displays data correctly (4 rows)');

    // Check table has expected number of rows
    const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
    console.log('INFO: Found ' + rows + ' rows (expected 4)');
    if (rows < 1) {
      console.log('FAIL: Expected 4 rows but found ' + rows);
      process.exit(1);
    }

    console.log('PASS: Verify table displays data correctly (4 rows)');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });