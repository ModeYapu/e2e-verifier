import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    console.log("=== Step 1: Navigate to LogMonitor dashboard ===");
    await page.goto("https://sanfacheng.cyou/logmon");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "evidence_01_initial.png" });
    console.log("✓ Page loaded successfully");

    // Step 2: Page title
    console.log("\n=== Step 2: Page title ===");
    const title = await page.title();
    console.log("✓ Title:", title);

    // Step 3: Inspect page structure in detail
    console.log("\n=== Step 3: Inspecting page structure ===");
    
    // Check for any grid/table-like structures (could be div-based)
    const gridSelectors = [
      'table', 
      '[role="grid"]', 
      '[role="table"]', 
      '.MuiTable-root',
      '.ant-table',
      '.el-table',
      '.data-table',
      '.grid-container',
      '.ag-theme-*',
      '.rt-table',
      'div[class*="table"]',
      'div[class*="grid"]'
    ];
    
    for (const sel of gridSelectors) {
      const els = await page.$$(sel);
      if (els.length > 0) {
        console.log(`Found ${els.length} element(s) with selector: ${sel}`);
      }
    }

    // Check for div-based table structure (rows and cells)
    const rows = await page.$$('div[class*="row"], div[role="row"]');
    console.log(`Div-based rows found: ${rows.length}`);
    const cells = await page.$$('div[class*="cell"], div[role="gridcell"]');
    console.log(`Div-based cells found: ${cells.length}`);

    // Check for any list/grid data display
    const dataItems = await page.$$('li, [class*="item"], [class*="data"]');
    console.log(`Data items found: ${dataItems.length}`);

    // Step 4: Check for dropdown/filter controls
    console.log("\n=== Step 4: Dropdown and filter controls ===");
    const selectors = await page.$$('select');
    console.log(`<select> elements: ${selectors.length}`);
    
    // Check for custom dropdown implementations
    const customDropdowns = await page.$$('[class*="dropdown"], [class*="select"], [role="combobox"], [role="listbox"], [class*="picker"], [class*="filter"]');
    console.log(`Custom dropdown/filter elements: ${customDropdowns.length}`);
    
    // Check for input fields that might serve as filters
    const inputs = await page.$$('input:not([type="hidden"])');
    console.log(`Input fields: ${inputs.length}`);
    for (const inp of inputs) {
      const type = await inp.getAttribute('type');
      const placeholder = await inp.getAttribute('placeholder');
      const name = await inp.getAttribute('name');
      console.log(`  Input - type: ${type}, placeholder: ${placeholder}, name: ${name}`);
    }

    // Step 5: Check for refresh button
    console.log("\n=== Step 5: Refresh button ===");
    const allButtons = await page.$$('button, a[role="button"], [class*="btn"], [class*="button"]');
    console.log(`Total clickable elements: ${allButtons.length}`);
    
    let refreshFound = false;
    for (const btn of allButtons) {
      const text = await btn.textContent();
      const html = await btn.innerHTML();
      const cls = await btn.getAttribute('class');
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      
      const allText = `${text || ''} ${html || ''} ${cls || ''} ${ariaLabel || ''} ${title || ''}`.toLowerCase();
      
      if (allText.includes('refresh') || allText.includes('刷新') || allText.includes('reload') || 
          allText.includes('sync') || allText.includes('↻') || allText.includes('⟳') ||
          allText.includes('update')) {
        refreshFound = true;
        console.log(`✓ Refresh element found:`);
        console.log(`  Text: ${text?.trim()}`);
        console.log(`  Class: ${cls}`);
        console.log(`  aria-label: ${ariaLabel}`);
        console.log(`  title: ${title}`);
      }
    }
    
    if (!refreshFound) {
      // Check for icons
      const icons = await page.$$('i[class*="refresh"], svg[class*="refresh"], span[class*="refresh"]');
      console.log(`Refresh icon elements: ${icons.length}`);
      if (icons.length > 0) refreshFound = true;
    }

    // Step 6: Get all visible text content for context
    console.log("\n=== Step 6: Page content overview ===");
    const bodyText = await page.evaluate(() => {
      const el = document.querySelector('body');
      return el ? el.innerText.substring(0, 500) : '';
    });
    console.log("Visible text content (first 500 chars):");
    console.log(bodyText);

    // Step 7: Summary
    console.log("\n=== VERIFICATION SUMMARY ===");
    console.log(`✓ Page title: "${title}"`);
    
    const hasTable = rows.length > 0 || cells.length > 0 || dataItems.length > 0;
    console.log(`${hasTable ? '✓' : '✗'} Table/grid data display: ${hasTable ? 'Found' : 'Not found'}`);
    
    const hasDropdown = selectors.length > 0 || customDropdowns.length > 0;
    console.log(`${hasDropdown ? '✓' : '✗'} Dropdown/filter controls: ${hasDropdown ? 'Found' : 'Not found'}`);
    
    console.log(`${refreshFound ? '✓' : '✗'} Refresh button: ${refreshFound ? 'Found' : 'Not found'}`);

    await page.screenshot({ path: "evidence_final.png" });
    console.log("\n✓ Final screenshot saved");

  } catch (error) {
    console.error("Error:", error);
    await page.screenshot({ path: "evidence_error.png" });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);