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
    await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: Table 2 has data rows');

    // Check table has data rows
    const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
    if (rows === 0) {
      console.log('FAIL: Table 2 has no rows');
      process.exit(1);
    }
    console.log('INFO: Table 2 has ' + rows + ' rows');

    console.log('PASS: Table 2 has data rows');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });