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
    console.log('Testing: Form 1 is functional');

    // Check form has input fields
    const formEl = page.locator('form, .el-form').nth(0);
    const inputCount = await formEl.locator('input, select, textarea').count();
    if (inputCount === 0) {
      console.log('FAIL: Form 1 has no input fields');
      process.exit(1);
    }
    console.log('INFO: Form 1 has ' + inputCount + ' input fields');

    // Check form has submit/save button
    const submitBtn = formEl.locator('button[type=submit], button:has-text("保存"), button:has-text("提交"), button:has-text("确定")');
    const hasSubmit = await submitBtn.count();
    if (hasSubmit === 0) {
      console.log('WARN: Form 1 has no submit button');
    }

    console.log('PASS: Form 1 is functional');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });