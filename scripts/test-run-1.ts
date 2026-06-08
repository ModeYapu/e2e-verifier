import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
        console.log("hello")
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
