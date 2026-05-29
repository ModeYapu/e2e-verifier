import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {

    // --- Navigate to target page ---
    await page.goto(`http://127.0.0.1/webgpu/`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Testing: No undefined or NaN text');

    // Check page content for undefined/NaN
    const bodyText = await page.evaluate(() => document.body.innerText);
    const problems = [];
    if (bodyText.includes('undefined')) problems.push('undefined');
    if (bodyText.includes('NaN')) problems.push('NaN');
    if (bodyText.includes('null')) problems.push('null');
    if (problems.length > 0) {
      console.log('FAIL: Page contains ' + problems.join(', '));
      process.exit(1);
    }

    console.log('PASS: No undefined or NaN text');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });