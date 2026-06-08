import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Step 1: Navigate to the URL
    console.log("=== Step 1: Navigating to LogMonitor dashboard ===");
    await page.goto("https://sanfacheng.cyou/logmon");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "evidence_01_initial.png" });
    console.log("Page loaded successfully");

    // Step 2: Check page title
    console.log("\n=== Step 2: Checking page title ===");
    const title = await page.title();
    console.log("Page title:", title);
    if (title && title.length > 0) {
      console.log("✓ Title exists:", title);
    } else {
      console.log("✗ Title is empty or missing");
    }

    // Step 3: Check for table element
    console.log("\n=== Step 3: Checking for table ===");
    const table = await page.$("table");
    console.log("Table element exists:", !!table);
    if (table) {
      const rows = await page.$$("table tr");
      console.log("Number of rows in table:", rows.length);
      const cols = await page.$$("table th");
      console.log("Number of columns (headers):", cols.length);
      if (cols.length > 0) {
        console.log("Table headers:");
        for (const col of cols) {
          const text = await col.textContent();
          console.log(" -", text?.trim());
        }
      }
    }
    await page.screenshot({ path: "evidence_02_table.png" });

    // Step 4: Check for dropdown/select elements
    console.log("\n=== Step 4: Checking for dropdown menus ===");
    const selects = await page.$$("select");
    console.log("Number of dropdown (select) elements:", selects.length);
    for (let i = 0; i < selects.length; i++) {
      const options = await selects[i].$$("option");
      console.log(`Dropdown ${i + 1} has ${options.length} options:`);
      for (const opt of options) {
        const text = await opt.textContent();
        console.log(" -", text?.trim());
      }
    }
    await page.screenshot({ path: "evidence_03_dropdown.png" });

    // Also check for custom dropdowns (div-based)
    const customDropdowns = await page.$$('[class*="dropdown"], [class*="select"], [role="listbox"]');
    console.log("Custom dropdown elements found:", customDropdowns.length);

    // Step 5: Check for refresh button
    console.log("\n=== Step 5: Checking for refresh button ===");
    const buttons = await page.$$("button");
    console.log("Total buttons found:", buttons.length);
    let refreshButtonFound = false;
    for (const btn of buttons) {
      const text = await btn.textContent();
      const textLower = text?.trim().toLowerCase() || "";
      if (textLower.includes("refresh") || textLower.includes("刷新") || textLower.includes("reload")) {
        refreshButtonFound = true;
        console.log("✓ Refresh button found:", text?.trim());
      }
    }
    if (!refreshButtonFound) {
      // Check for icons or aria-labels
      const refreshIcons = await page.$$('[class*="refresh"], [class*="reload"], [aria-label*="refresh"], [aria-label*="刷新"]');
      console.log("Refresh icon elements found:", refreshIcons.length);
      if (refreshIcons.length > 0) {
        refreshButtonFound = true;
        console.log("✓ Refresh button/icon found via class/aria-label");
      }
    }
    if (!refreshButtonFound) {
      console.log("✗ No refresh button found");
    }
    await page.screenshot({ path: "evidence_04_refresh.png" });

    // Step 6: Summary
    console.log("\n=== Verification Summary ===");
    console.log("Page title:", title);
    console.log("Table exists:", !!table);
    console.log("Dropdowns found:", selects.length + customDropdowns.length);
    console.log("Refresh button found:", refreshButtonFound);

    if (title && table && (selects.length > 0 || customDropdowns.length > 0) && refreshButtonFound) {
      console.log("\n✓ All checks passed - LogMonitor dashboard is functioning correctly");
    } else {
      console.log("\n✗ Some checks failed - see details above");
    }

  } catch (error) {
    console.error("Error during verification:", error);
    await page.screenshot({ path: "evidence_error.png" });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);