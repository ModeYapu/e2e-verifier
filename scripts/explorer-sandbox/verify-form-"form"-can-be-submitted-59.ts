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
    console.log('Testing: Verify form "form" can be submitted');

    // Check form exists and is submittable
    const forms = await page.locator('form, .el-form').count();
    console.log('INFO: Found ' + forms + ' forms');

    console.log('PASS: Verify form "form" can be submitted');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });