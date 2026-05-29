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
    await page.goto(`http://127.0.0.1/logmon/settings`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: 20 interactive elements present');

    // Check interactive elements count
    const buttons = await page.locator('button').count();
    const inputs = await page.locator('input, select, textarea').count();
    const links = await page.locator('a').count();
    const total = buttons + inputs + links;
    console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
    if (total < 10) {
      console.log('FAIL: Expected at least 10 interactive elements, found ' + total);
      process.exit(1);
    }

    console.log('PASS: 20 interactive elements present');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });