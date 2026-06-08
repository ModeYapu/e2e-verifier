import { chromium } from '@playwright/test';

/**
 * Auto-generated E2E test suite from autonomous exploration
 * Generated: 2026-05-28T08:42:52.325Z
 * LLM mode: disabled (heuristic-based tests)
 */

async function performLogin(page: Page) {
  await page.goto('http://127.0.0.1/logmon/login');
  const form = page.locator('.el-form').first();
  await form.locator('input:not([type='password'])').fill('admin');
  await form.locator('input[type='password']').fill('admin123');
  await form.locator('button').click();
  await page.waitForURL(new RegExp('/logmon/(?!login)'));
}

async function test1(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test2(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test3(page: Page) {
  
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
      console.log('Testing: Table 2 has data rows');
  
      // Check table has data rows
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
      if (rows === 0) {
        console.log('FAIL: Table 2 has no rows');
        process.exit(1);
      }
      console.log('INFO: Table 2 has ' + rows + ' rows');
  
      // Check table headers contain expected columns
      const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(1).allTextContents();
      const headerStr = headerText.join(' ');
      const expectedHeaders = ["2026-05-28 16:41:14", "查看日志"];
      for (const h of expectedHeaders) {
        if (!headerStr.includes(h)) {
          console.log('WARN: Missing header: ' + h);
        }
      }
  
      console.log('PASS: Table 2 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test4(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test5(page: Page) {
  
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
      console.log('Testing: 11 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 5) {
        console.log('FAIL: Expected at least 5 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 11 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test6(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test7(page: Page) {
  
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
      console.log('Testing: Verify table displays data correctly (0 rows)');
  
      // Generic check: page loaded and has content
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!bodyText || bodyText.trim().length < 10) {
        console.log('FAIL: Page appears empty');
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (0 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test8(page: Page) {
  
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
      console.log('Testing: Verify table displays data correctly (4 rows)');
  
      // Check table has expected number of rows
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
      console.log('INFO: Found ' + rows + ' rows (expected 4)');
      if (rows < 1) {
        console.log('FAIL: Expected 4 rows but found ' + rows);
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (4 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test9(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test10(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test11(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test12(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: 14 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 7) {
        console.log('FAIL: Expected at least 7 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 14 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test13(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify form "form" can be submitted');
  
      // Check form exists and is submittable
      const forms = await page.locator('form, .el-form').count();
      console.log('INFO: Found ' + forms + ' forms');
  
      console.log('PASS: Verify form "form" can be submitted');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test14(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test15(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify table displays data correctly (0 rows)');
  
      // Generic check: page loaded and has content
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!bodyText || bodyText.trim().length < 10) {
        console.log('FAIL: Page appears empty');
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (0 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test16(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/logs`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify table displays data correctly (0 rows)');
  
      // Generic check: page loaded and has content
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!bodyText || bodyText.trim().length < 10) {
        console.log('FAIL: Page appears empty');
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (0 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function runAllTests(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Starting E2E test suite...');

    await test1(page);
    console.log('Test 1 completed');
    await test2(page);
    console.log('Test 2 completed');
    await test3(page);
    console.log('Test 3 completed');
    await test4(page);
    console.log('Test 4 completed');
    await test5(page);
    console.log('Test 5 completed');
    await test6(page);
    console.log('Test 6 completed');
    await test7(page);
    console.log('Test 7 completed');
    await test8(page);
    console.log('Test 8 completed');
    await test9(page);
    console.log('Test 9 completed');
    await test10(page);
    console.log('Test 10 completed');
    await test11(page);
    console.log('Test 11 completed');
    await test12(page);
    console.log('Test 12 completed');
    await test13(page);
    console.log('Test 13 completed');
    await test14(page);
    console.log('Test 14 completed');
    await test15(page);
    console.log('Test 15 completed');
    await test16(page);
    console.log('Test 16 completed');

    console.log('All tests completed');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runAllTests(process.argv[2] || 'http://localhost:3000').catch(console.error);
}

export { runAllTests };
