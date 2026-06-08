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
    console.log('Testing: LogMonitor Dashboard loads correctly');

    // Check page title is not empty
    const title = await page.title();
    if (!title || title.trim() === '') {
      console.log('FAIL: Page title is empty');
      process.exit(1);
    }
    console.log('INFO: Title = ' + title);

    // Check not redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      console.log('FAIL: Redirected to login page');
      process.exit(1);
    }

    console.log('PASS: LogMonitor Dashboard loads correctly');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });