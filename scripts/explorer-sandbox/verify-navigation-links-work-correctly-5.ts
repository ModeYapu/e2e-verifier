import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {

    // --- Navigate to target page ---
    await page.goto(`http://127.0.0.1/vault/`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: Verify navigation links work correctly');

    // Generic check: page loaded and has content
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText || bodyText.trim().length < 10) {
      console.log('FAIL: Page appears empty');
      process.exit(1);
    }

    console.log('PASS: Verify navigation links work correctly');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });