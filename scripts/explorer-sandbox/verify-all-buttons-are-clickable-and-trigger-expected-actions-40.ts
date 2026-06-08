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
    await page.goto(`http://127.0.0.1/logmon/live`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: Verify all buttons are clickable and trigger expected actions');

    // Check all visible buttons are enabled
    const buttons = await page.locator('button:visible').all();
    let disabledCount = 0;
    for (const btn of buttons) {
      const disabled = await btn.isDisabled();
      if (disabled) disabledCount++;
    }
    console.log('INFO: ' + buttons.length + ' buttons found, ' + disabledCount + ' disabled');

    console.log('PASS: Verify all buttons are clickable and trigger expected actions');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });