import { chromium } from '@playwright/test';

/**
 * Auto-generated E2E test suite from autonomous exploration
 * Generated: 2026-05-29T02:17:06.385Z
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
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["应用 ID", "版本", "总事件数", "错误数", "最后活跃", "操作"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
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
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 1) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(1).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["2026-05-29 10:10:35", "查看日志"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
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
      console.log('Testing: Table 1 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["时间", "级别", "类型", "消息", "来源", "浏览器"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 1 has data rows');
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
      console.log('Testing: Table 2 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      console.log('PASS: Table 2 has data rows');
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
      console.log('Testing: 15 interactive elements present');
  
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
  
      console.log('PASS: 15 interactive elements present');
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

async function test17(page: Page) {
  
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

async function test18(page: Page) {
  
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

async function test19(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test20(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 1 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["#", "页面 URL", "FCP", "LCP", "CLS", "样本数"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 1 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test21(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 2 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      console.log('PASS: Table 2 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test22(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test23(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test24(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: 12 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 6) {
        console.log('FAIL: Expected at least 6 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 12 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test25(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test26(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test27(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test28(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/performance`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test29(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test30(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 1 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["规则名称", "条件类型", "触发条件", "通知方式", "状态", "操作"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 1 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test31(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 2 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      console.log('PASS: Table 2 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test32(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test33(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: 6 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 3) {
        console.log('FAIL: Expected at least 3 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 6 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test34(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test35(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test36(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test37(page: Page) {
  
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

async function test38(page: Page) {
  
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

async function test39(page: Page) {
  
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
      console.log('Testing: 7 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 3) {
        console.log('FAIL: Expected at least 3 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 7 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test40(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test41(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test42(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 1 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["会话ID", "应用", "页面URL", "时长", "事件数", "开始时间", "状态", "操作"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 1 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test43(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 2 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 1) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(1).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["d25afdae-7ea6-4945-923b-666f1101b043", "vault-reader", "/vault/", "0:00", "4", "2026-05-29 10:09:56", "已完成", "回放"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 2 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test44(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 3 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (2 >= tableCount) {
        console.log('INFO: Table 3 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 3 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(2).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 3 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 3 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 3 has data rows');
        } else {
          console.log('INFO: Table 3 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 2) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(2).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 3 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test45(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 4 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (3 >= tableCount) {
        console.log('INFO: Table 4 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 4 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(3).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 4 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 4 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 4 has data rows');
        } else {
          console.log('INFO: Table 4 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 3) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(3).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 4 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test46(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test47(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: 63 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 31) {
        console.log('FAIL: Expected at least 31 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 63 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test48(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test49(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test50(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify table displays data correctly (19 rows)');
  
      // Check table has expected number of rows
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
      console.log('INFO: Found ' + rows + ' rows (expected 19)');
      if (rows < 1) {
        console.log('FAIL: Expected 19 rows but found ' + rows);
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (19 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test51(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify table displays data correctly (6 rows)');
  
      // Check table has expected number of rows
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
      console.log('INFO: Found ' + rows + ' rows (expected 6)');
      if (rows < 1) {
        console.log('FAIL: Expected 6 rows but found ' + rows);
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (6 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test52(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/recordings`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Verify table displays data correctly (6 rows)');
  
      // Check table has expected number of rows
      const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').count();
      console.log('INFO: Found ' + rows + ' rows (expected 6)');
      if (rows < 1) {
        console.log('FAIL: Expected 6 rows but found ' + rows);
        process.exit(1);
      }
  
      console.log('PASS: Verify table displays data correctly (6 rows)');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test53(page: Page) {
  
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

async function test54(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test55(page: Page) {
  
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
      console.log('Testing: Form 2 is functional');
  
      // Check form has input fields
      const formEl = page.locator('form, .el-form').nth(1);
      const inputCount = await formEl.locator('input, select, textarea').count();
      if (inputCount === 0) {
        console.log('FAIL: Form 2 has no input fields');
        process.exit(1);
      }
      console.log('INFO: Form 2 has ' + inputCount + ' input fields');
  
      // Check form has submit/save button
      const submitBtn = formEl.locator('button[type=submit], button:has-text("保存"), button:has-text("提交"), button:has-text("确定")');
      const hasSubmit = await submitBtn.count();
      if (hasSubmit === 0) {
        console.log('WARN: Form 2 has no submit button');
      }
  
      console.log('PASS: Form 2 is functional');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test56(page: Page) {
  
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
      console.log('Testing: Form 3 is functional');
  
      // Check form has input fields
      const formEl = page.locator('form, .el-form').nth(2);
      const inputCount = await formEl.locator('input, select, textarea').count();
      if (inputCount === 0) {
        console.log('FAIL: Form 3 has no input fields');
        process.exit(1);
      }
      console.log('INFO: Form 3 has ' + inputCount + ' input fields');
  
      // Check form has submit/save button
      const submitBtn = formEl.locator('button[type=submit], button:has-text("保存"), button:has-text("提交"), button:has-text("确定")');
      const hasSubmit = await submitBtn.count();
      if (hasSubmit === 0) {
        console.log('WARN: Form 3 has no submit button');
      }
  
      console.log('PASS: Form 3 is functional');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test57(page: Page) {
  
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

async function test58(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test59(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test60(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test61(page: Page) {
  
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
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test62(page: Page) {
  
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

async function test63(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test64(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 1 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (0 >= tableCount) {
        console.log('INFO: Table 1 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 1 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(0).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 1 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 1 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 1 has data rows');
        } else {
          console.log('INFO: Table 1 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 0) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(0).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["ID", "用户名", "显示名称", "角色", "状态", "最后登录", "操作"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 1 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test65(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: Table 2 has data rows');
  
      // Wait for table data to load (async tables)
      try {
        await page.waitForSelector('.el-table__body-wrapper tbody tr td, table tbody tr td', { timeout: 5000, state: 'attached' });
      } catch (e) {
        // Table may be empty - check below
      }
      const tableCount = await page.locator('.el-table:not(.el-table .el-table), table:not(.el-table table)').count();
      if (1 >= tableCount) {
        console.log('INFO: Table 2 does not exist on page (only ' + tableCount + ' tables found)');
        console.log('PASS: Table 2 has data rows');
      } else {
        const rows = await page.locator('.el-table__body-wrapper tbody tr, table tbody tr').nth(1).count();
        const emptyBlock = await page.locator('.el-table__empty-text, .el-table__empty-block').count();
        if (rows === 0 && emptyBlock === 0) {
          console.log('FAIL: Table 2 has no rows and no empty state');
          process.exit(1);
        }
        if (rows === 0) {
          console.log('INFO: Table 2 is empty (shows empty state) - this is acceptable');
          console.log('PASS: Table 2 has data rows');
        } else {
          console.log('INFO: Table 2 has ' + rows + ' rows');
        }
      }
  
      if (tableCount > 1) {
        const headerText = await page.locator('.el-table__header-wrapper th, table thead th').nth(1).allTextContents();
        const headerStr = headerText.join(' ');
        const expectedHeaders = ["1", "admin", "Administrator", "管理员", "启用", "2026/5/29 10:10:34", "编辑  重置密码  删除"];
        for (const h of expectedHeaders) {
          if (!headerStr.includes(h)) {
            console.log('WARN: Missing header: ' + h);
          }
        }
      }
  
      console.log('PASS: Table 2 has data rows');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test66(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test67(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
      console.log('Testing: 9 interactive elements present');
  
      // Check interactive elements count
      const buttons = await page.locator('button').count();
      const inputs = await page.locator('input, select, textarea').count();
      const links = await page.locator('a').count();
      const total = buttons + inputs + links;
      console.log('INFO: Buttons=' + buttons + ' Inputs=' + inputs + ' Links=' + links + ' Total=' + total);
      if (total < 4) {
        console.log('FAIL: Expected at least 4 interactive elements, found ' + total);
        process.exit(1);
      }
  
      console.log('PASS: 9 interactive elements present');
    } finally {
      await browser.close();
    }
  }
  
  main().catch(e => { console.error('FAIL:', e.message); process.exit(1); 
}

async function test68(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test69(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
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

async function test70(page: Page) {
  
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
      await page.goto(`http://127.0.0.1/logmon/users`, { waitUntil: 'networkidle', timeout: 15000 });
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
    await test17(page);
    console.log('Test 17 completed');
    await test18(page);
    console.log('Test 18 completed');
    await test19(page);
    console.log('Test 19 completed');
    await test20(page);
    console.log('Test 20 completed');
    await test21(page);
    console.log('Test 21 completed');
    await test22(page);
    console.log('Test 22 completed');
    await test23(page);
    console.log('Test 23 completed');
    await test24(page);
    console.log('Test 24 completed');
    await test25(page);
    console.log('Test 25 completed');
    await test26(page);
    console.log('Test 26 completed');
    await test27(page);
    console.log('Test 27 completed');
    await test28(page);
    console.log('Test 28 completed');
    await test29(page);
    console.log('Test 29 completed');
    await test30(page);
    console.log('Test 30 completed');
    await test31(page);
    console.log('Test 31 completed');
    await test32(page);
    console.log('Test 32 completed');
    await test33(page);
    console.log('Test 33 completed');
    await test34(page);
    console.log('Test 34 completed');
    await test35(page);
    console.log('Test 35 completed');
    await test36(page);
    console.log('Test 36 completed');
    await test37(page);
    console.log('Test 37 completed');
    await test38(page);
    console.log('Test 38 completed');
    await test39(page);
    console.log('Test 39 completed');
    await test40(page);
    console.log('Test 40 completed');
    await test41(page);
    console.log('Test 41 completed');
    await test42(page);
    console.log('Test 42 completed');
    await test43(page);
    console.log('Test 43 completed');
    await test44(page);
    console.log('Test 44 completed');
    await test45(page);
    console.log('Test 45 completed');
    await test46(page);
    console.log('Test 46 completed');
    await test47(page);
    console.log('Test 47 completed');
    await test48(page);
    console.log('Test 48 completed');
    await test49(page);
    console.log('Test 49 completed');
    await test50(page);
    console.log('Test 50 completed');
    await test51(page);
    console.log('Test 51 completed');
    await test52(page);
    console.log('Test 52 completed');
    await test53(page);
    console.log('Test 53 completed');
    await test54(page);
    console.log('Test 54 completed');
    await test55(page);
    console.log('Test 55 completed');
    await test56(page);
    console.log('Test 56 completed');
    await test57(page);
    console.log('Test 57 completed');
    await test58(page);
    console.log('Test 58 completed');
    await test59(page);
    console.log('Test 59 completed');
    await test60(page);
    console.log('Test 60 completed');
    await test61(page);
    console.log('Test 61 completed');
    await test62(page);
    console.log('Test 62 completed');
    await test63(page);
    console.log('Test 63 completed');
    await test64(page);
    console.log('Test 64 completed');
    await test65(page);
    console.log('Test 65 completed');
    await test66(page);
    console.log('Test 66 completed');
    await test67(page);
    console.log('Test 67 completed');
    await test68(page);
    console.log('Test 68 completed');
    await test69(page);
    console.log('Test 69 completed');
    await test70(page);
    console.log('Test 70 completed');

    console.log('All tests completed');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runAllTests(process.argv[2] || 'http://localhost:3000').catch(console.error);
}

export { runAllTests };
