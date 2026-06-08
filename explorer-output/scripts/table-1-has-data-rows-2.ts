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
    console.log('Testing: Table 1 has data rows');

    // Check table has data rows
    const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
    if (rows === 0) {
      console.log('FAIL: Table 1 has no rows');
      process.exit(1);
    }
    console.log('INFO: Table 1 has ' + rows + ' rows');

    // Check table headers contain expected columns
    const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
    const headerStr = headerText.join(' ');
    const expectedHeaders = ["应用 ID", "版本", "总事件数", "错误数", "最后活跃", "操作"];
    for (const h of expectedHeaders) {
      if (!headerStr.includes(h)) {
        console.log('WARN: Missing header: ' + h);
      }
    }

    console.log('PASS: Table 1 has data rows');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });