import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {

    // --- Navigate to target page ---
    await page.goto(`http://127.0.0.1/vault/`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: Vault Reader loads correctly');

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

    console.log('PASS: Vault Reader loads correctly');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });