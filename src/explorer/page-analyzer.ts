/**
 * Page Analyzer - Pure DOM Analysis (No LLM)
 * Analyzes page structure using Playwright API only
 */

import { Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import {
  PageAnalysis,
  NavItem,
  InteractiveElement,
  FormAnalysis,
  TableAnalysis,
  FormField
} from './types';
import { Logger } from '../utils/logger';

export class PageAnalyzer {
  private logger: Logger;
  private screenshotDir: string;
  private visitedUrls: Set<string>;

  constructor(screenshotDir: string = 'explorer-screenshots') {
    this.logger = new Logger({ prefix: 'PageAnalyzer' });
    this.screenshotDir = screenshotDir;
    this.visitedUrls = new Set();
    this.ensureScreenshotDir();
  }

  private ensureScreenshotDir(): void {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Main analysis method - analyzes a page and returns comprehensive results
   */
  async analyze(page: Page, depth: number = 0): Promise<PageAnalysis> {
    const url = page.url();
    this.logger.info(`Analyzing page: ${url} (depth: ${depth})`);

    // Mark as visited
    this.visitedUrls.add(url);

    // Take screenshot
    const screenshotPath = await this.takeScreenshot(page, url);

    // Extract basic info
    const title = await page.title();

    // Run all extractions in parallel for efficiency
    const [domSummary, navigation, interactiveElements, forms, tables] = await Promise.all([
      this.extractDomSummary(page),
      this.extractNavigation(page, url, depth),
      this.extractInteractiveElements(page),
      this.extractForms(page),
      this.extractTables(page)
    ]);

    // Generate suggested tests based on heuristics
    const suggestedTests = this.generateSuggestedTests(interactiveElements, forms, tables);

    const analysis: PageAnalysis = {
      url,
      title,
      screenshot: screenshotPath,
      domSummary,
      navigation,
      interactiveElements,
      forms,
      tables,
      suggestedTests,
      depth,
      timestamp: new Date().toISOString()
    };

    this.logger.info(`Analysis complete: ${navigation.length} nav items, ${interactiveElements.length} interactive elements, ${forms.length} forms, ${tables.length} tables`);

    return analysis;
  }

  /**
   * Take a screenshot of the current page
   */
  private async takeScreenshot(page: Page, url: string): Promise<string> {
    try {
      const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
      const filename = `${sanitizedUrl}-${Date.now()}.png`;
      const filepath = path.join(this.screenshotDir, filename);
      await page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch (error) {
      this.logger.warn(`Failed to take screenshot: ${error}`);
      return '';
    }
  }

  /**
   * Extract a summary of the DOM structure
   */
  async extractDomSummary(page: Page): Promise<string> {
    try {
      const summary = await page.evaluate(() => {
        const body = document.body;
        if (!body) return 'No body found';

        // Count elements
        const elementCounts: Record<string, number> = {};
        const allElements = body.querySelectorAll('*');
        for (const el of allElements) {
          const tagName = el.tagName.toLowerCase();
          elementCounts[tagName] = (elementCounts[tagName] || 0) + 1;
        }

        // Get main sections
        const sections = Array.from(body.querySelectorAll('header, nav, main, footer, aside, section, article'))
          .map(el => el.tagName.toLowerCase());

        // Count inputs and forms
        const forms = body.querySelectorAll('form').length;
        const inputs = body.querySelectorAll('input, textarea, select').length;
        const buttons = body.querySelectorAll('button, input[type="submit"], input[type="button"]').length;
        const links = body.querySelectorAll('a[href]').length;
        const images = body.querySelectorAll('img').length;
        const tables = body.querySelectorAll('table').length;

        // Get page description
        const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const h1 = document.querySelector('h1')?.textContent || '';

        return JSON.stringify({
          totalElements: allElements.length,
          elementCounts: Object.fromEntries(
            Object.entries(elementCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
          ),
          sections: [...new Set(sections)],
          forms,
          inputs,
          buttons,
          links,
          images,
          tables,
          metaDescription,
          h1
        });
      });

      // Format as readable summary
      const data = JSON.parse(summary);
      return [
        `Total elements: ${data.totalElements}`,
        `Top elements: ${Object.entries(data.elementCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`,
        `Sections: ${data.sections.join(', ') || 'none'}`,
        `Forms: ${data.forms}, Inputs: ${data.inputs}, Buttons: ${data.buttons}`,
        `Links: ${data.links}, Images: ${data.images}, Tables: ${data.tables}`,
        data.h1 ? `H1: ${data.h1}` : '',
        data.metaDescription ? `Description: ${data.metaDescription.substring(0, 100)}...` : ''
      ].filter(Boolean).join('\n');
    } catch (error) {
      this.logger.warn(`Failed to extract DOM summary: ${error}`);
      return 'DOM summary extraction failed';
    }
  }

  /**
   * Extract navigation items from the page
   */
  async extractNavigation(page: Page, currentUrl: string, depth: number = 0): Promise<NavItem[]> {
    try {
      const baseUrl = new URL(currentUrl);

      // Part 1: Extract traditional <a href> links (always fast)
      const navItems = await page.evaluate((baseOrigin) => {
        const items: NavItem[] = [];

        // Look for links in common navigation containers
        const navSelectors = [
          'nav a[href]',
          '[role="navigation"] a[href]',
          '.nav a[href]',
          '.navigation a[href]',
          '.menu a[href]',
          '[class*="menu"] a[href]',
          'header a[href]',
          '.sidebar a[href]',
          'aside a[href]'
        ];

        const selectors = navSelectors.join(', ');

        // Get all unique links
        const links = Array.from(document.querySelectorAll(selectors)) as HTMLAnchorElement[];
        const seenHrefs = new Set<string>();

        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href || seenHrefs.has(href)) continue;

          // Skip anchors, javascript, and mailto
          if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

          seenHrefs.add(href);

          // Generate a CSS selector for this link
          let selector = this.getSelectorForElement(link);

          items.push({
            text: link.textContent?.trim() || link.getAttribute('title') || '',
            href: href,
            selector: selector,
            isInternal: false // Will be determined in context
          });
        }

        return items;
      }, baseUrl.origin);

      // Part 2: Detect and navigate Element Plus / Vue Router menu items
      // Only do click-based navigation testing on the first page (depth=0)
      const routerNavItems: NavItem[] = [];
      
      // Find .el-menu-item elements
      const menuItemsCount = await page.locator('.el-menu-item').count();
      if (menuItemsCount > 0 && depth === 0) {
        this.logger.info(`Found ${menuItemsCount} Element Plus menu items, testing for router navigation...`);
        
        const menuItems = await page.locator('.el-menu-item').all();
        const startUrl = page.url();
        
        for (let i = 0; i < menuItemsCount; i++) {
          try {
            const item = menuItems[i];
            const text = await item.textContent() || `Menu Item ${i}`;
            const isActive = await item.evaluate(el => el.classList.contains('is-active'));
            
            // Skip already active menu (current page)
            if (isActive) {
              routerNavItems.push({
                text,
                href: startUrl,
                selector: `.el-menu-item:nth-child(${i + 1})`,
                isInternal: true
              });
              continue;
            }
            
            // Click and capture navigation
            await item.click();
            await page.waitForTimeout(1000); // Wait for Vue Router navigation
            
            const newUrl = page.url();
            if (newUrl !== startUrl) {
              routerNavItems.push({
                text,
                href: newUrl,
                selector: `.el-menu-item:nth-child(${i + 1})`,
                isInternal: true
              });
              this.logger.debug(`Menu "${text}" navigated to: ${newUrl}`);
            }
            
            // Navigate back to start for next test
            await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
          } catch (error) {
            this.logger.debug(`Failed to test menu item ${i}: ${error}`);
          }
        }
      }

      // Part 3: Detect generic tab navigation (single-page tab panels like Depth3D)
      const tabNavItems: NavItem[] = [];
      if (depth === 0) {
        const tabSelector = '.tab:not(.active), [role=tab]:not([aria-selected="true"])';
        const tabCount = await page.locator(tabSelector).count();
        if (tabCount > 0) {
          this.logger.info(`Found ${tabCount} generic tab elements, testing for content changes...`);
          const tabs = await page.locator(tabSelector).all();
          const startUrl = page.url();
          for (const tab of tabs) {
            try {
              const text = (await tab.textContent() || '').trim();
              await tab.click();
              await page.waitForTimeout(500);
              // Tab clicks don't change URL but change content — record as hash URL
              const hashUrl = `${startUrl}#tab-${text.replace(/[^a-zA-Z0-9]/g, '')}`;
              tabNavItems.push({
                text,
                href: hashUrl,
                selector: tabSelector,
                isInternal: true
              });
              this.logger.debug(`Tab "${text}" found`);
            } catch (e) {
              this.logger.debug(`Tab click failed: ${e}`);
            }
          }
        }
      }

      // Merge all sets
      const allItems = [...navItems, ...routerNavItems, ...tabNavItems];
      
      // Deduplicate by href
      const uniqueItems = allItems.filter((item, index, self) => 
        index === self.findIndex(i => i.href === item.href)
      );

      // Determine if links are internal
      return uniqueItems.map(item => ({
        ...item,
        isInternal: this.isInternalLink(item.href, baseUrl)
      }));
    } catch (error) {
      this.logger.warn(`Failed to extract navigation: ${error}`);
      return [];
    }
  }

  /**
   * Extract all interactive elements from the page
   */
  async extractInteractiveElements(page: Page): Promise<InteractiveElement[]> {
    try {
      const elements = await page.evaluate(() => {
        const items: InteractiveElement[] = [];

        // Helper to get a usable selector for an element
        const getSelector = (el: Element): string => {
          if (el.id) return `#${el.id}`;
          if (el.className) {
            const classes = el.className.split(' ').filter((c: string) => c);
            if (classes.length > 0) {
              return `${el.tagName.toLowerCase()}.${classes[0]}`;
            }
          }
          return el.tagName.toLowerCase();
        };

        const getText = (el: Element): string => {
          return el.textContent?.trim() ||
            (el as HTMLInputElement).placeholder ||
            (el as HTMLInputElement).title ||
            el.getAttribute('aria-label') ||
            '';
        };

        // Find all buttons
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(btn => {
          items.push({
            type: 'button',
            selector: getSelector(btn),
            text: getText(btn),
            action: `Click button: ${getText(btn)}`,
            attributes: {
              id: btn.id,
              className: btn.className,
              type: (btn as HTMLInputElement).type || 'button'
            }
          });
        });

        // Find all inputs
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').forEach(input => {
          const inputType = (input as HTMLInputElement).type || 'text';
          items.push({
            type: 'input',
            selector: getSelector(input),
            text: getText(input),
            action: `Input field: ${inputType}`,
            attributes: {
              type: inputType,
              name: (input as HTMLInputElement).name,
              placeholder: (input as HTMLInputElement).placeholder,
              required: (input as HTMLInputElement).required.toString()
            }
          });
        });

        // Find textareas
        document.querySelectorAll('textarea').forEach(textarea => {
          items.push({
            type: 'textarea',
            selector: getSelector(textarea),
            text: getText(textarea),
            action: 'Text input area',
            attributes: {
              name: (textarea as HTMLTextAreaElement).name,
              placeholder: (textarea as HTMLTextAreaElement).placeholder
            }
          });
        });

        // Find selects
        document.querySelectorAll('select').forEach(select => {
          items.push({
            type: 'select',
            selector: getSelector(select),
            text: getText(select),
            action: 'Dropdown selection',
            attributes: {
              name: (select as HTMLSelectElement).name
            }
          });
        });

        // Find checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
          items.push({
            type: 'checkbox',
            selector: getSelector(checkbox),
            text: getText(checkbox),
            action: `Checkbox: ${getText(checkbox)}`,
            attributes: {
              name: (checkbox as HTMLInputElement).name,
              checked: (checkbox as HTMLInputElement).checked.toString()
            }
          });
        });

        // Find radio buttons
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
          items.push({
            type: 'radio',
            selector: getSelector(radio),
            text: getText(radio),
            action: `Radio option: ${getText(radio)}`,
            attributes: {
              name: (radio as HTMLInputElement).name,
              value: (radio as HTMLInputElement).value
            }
          });
        });

        // Find important links (not in navigation)
        document.querySelectorAll('a[href]:not(nav a):not([role="navigation"] a)').forEach(link => {
          const text = getText(link);
          if (text.length > 0) {
            items.push({
              type: 'link',
              selector: getSelector(link),
              text: text,
              action: `Navigate to: ${text}`
            });
          }
        });

        return items;
      });

      return elements;
    } catch (error) {
      this.logger.warn(`Failed to extract interactive elements: ${error}`);
      return [];
    }
  }

  /**
   * Extract all forms from the page
   */
  async extractForms(page: Page): Promise<FormAnalysis[]> {
    try {
      const forms = await page.evaluate(() => {
        const formList: FormAnalysis[] = [];

        document.querySelectorAll('form').forEach(form => {
          const fields: FormField[] = [];

          // Get all input-like elements within the form
          form.querySelectorAll('input, select, textarea').forEach(field => {
            const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            const type = el.getAttribute('type') || el.tagName.toLowerCase();

            // Skip hidden fields
            if (type === 'hidden') return;

            // Find associated label
            let label = '';
            const id = el.id;
            if (id) {
              const labelEl = document.querySelector(`label[for="${id}"]`);
              if (labelEl) {
                label = labelEl.textContent?.trim() || '';
              }
            }

            // Check if wrapped in label
            if (!label) {
              const parentLabel = el.closest('label');
              if (parentLabel) {
                label = parentLabel.textContent?.trim().replace(el.value, '').trim() || '';
              }
            }

            // Use placeholder as fallback
            if (!label) {
              label = (el as HTMLInputElement).placeholder || '';
            }

            fields.push({
              type,
              selector: `[name="${el.name}"]`,
              label: label || undefined,
              name: el.name,
              placeholder: (el as HTMLInputElement).placeholder || undefined,
              required: el.required || undefined
            });
          });

          // Find submit button
          let submitButton = '';
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            submitButton = submitBtn.tagName.toLowerCase() +
              (submitBtn.id ? `#${submitBtn.id}` : '') +
              (submitBtn.className && typeof submitBtn.className === 'string' ? `.${submitBtn.className.split(' ')[0]}` : '');
          }

          formList.push({
            selector: form.id ? `#${form.id}` : 'form',
            fields,
            submitButton: submitButton || undefined,
            action: form.action || undefined,
            method: form.method || undefined
          });
        });

        return formList;
      });

      return forms;
    } catch (error) {
      this.logger.warn(`Failed to extract forms: ${error}`);
      return [];
    }
  }

  /**
   * Extract all tables from the page
   */
  async extractTables(page: Page): Promise<TableAnalysis[]> {
    try {
      const tables = await page.evaluate(() => {
        const tableList: TableAnalysis[] = [];

        document.querySelectorAll('table').forEach(table => {
          // Get headers
          const headers: string[] = [];
          const headerRow = table.querySelector('thead tr, tr:first-child');
          if (headerRow) {
            headerRow.querySelectorAll('th, td').forEach(cell => {
              headers.push(cell.textContent?.trim() || '');
            });
          }

          // Get data rows
          const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
          const dataRows = rows.filter(row => {
            const tr = row as HTMLTableRowElement;
            return !row.closest('thead') &&
              row !== headerRow &&
              tr.cells && tr.cells.length > 1;
          });

          const sampleData: string[][] = [];
          dataRows.slice(0, 3).forEach(row => {
            const rowData: string[] = [];
            row.querySelectorAll('td').forEach(cell => {
              rowData.push(cell.textContent?.trim() || '');
            });
            if (rowData.length > 0) {
              sampleData.push(rowData);
            }
          });

          // Check if table is sortable
          const sortable = table.querySelector('[data-sort], .sort, [class*="sort"]') !== null;

          // Check if table is paginated
          const paginated = table.closest('[class*="pagination"]') !== null ||
            table.parentElement?.querySelector('[class*="pagination"]') !== null;

          tableList.push({
            selector: table.id ? `table#${table.id}` : 'table',
            headers: headers.filter(h => h),
            rowCount: dataRows.length,
            sampleData,
            sortable,
            paginated
          });
        });

        return tableList;
      });

      return tables;
    } catch (error) {
      this.logger.warn(`Failed to extract tables: ${error}`);
      return [];
    }
  }

  /**
   * Generate suggested tests based on heuristics (no LLM)
   */
  private generateSuggestedTests(
    interactiveElements: InteractiveElement[],
    forms: FormAnalysis[],
    tables: TableAnalysis[]
  ): string[] {
    const suggestions: string[] = [];

    // Form-related tests
    for (const form of forms) {
      suggestions.push(`Verify form "${form.selector}" can be submitted`);
      for (const field of form.fields) {
        if (field.required) {
          suggestions.push(`Verify required field "${field.label || field.name}" shows validation error when empty`);
        }
      }
    }

    // Button tests
    const buttons = interactiveElements.filter(e => e.type === 'button');
    if (buttons.length > 0) {
      suggestions.push(`Verify all buttons are clickable and trigger expected actions`);
    }

    // Table tests
    for (const table of tables) {
      suggestions.push(`Verify table displays data correctly (${table.rowCount} rows)`);
      if (table.sortable) {
        suggestions.push(`Verify table can be sorted by columns`);
      }
      if (table.paginated) {
        suggestions.push(`Verify table pagination works correctly`);
      }
    }

    // Link tests
    const links = interactiveElements.filter(e => e.type === 'link');
    if (links.length > 5) {
      suggestions.push(`Verify navigation links work correctly`);
    }

    // Input validation tests
    const inputs = interactiveElements.filter(e => e.type === 'input' || e.type === 'textarea');
    const emailInputs = inputs.filter(i => i.attributes?.type === 'email');
    if (emailInputs.length > 0) {
      suggestions.push(`Verify email validation works correctly`);
    }

    return suggestions;
  }

  /**
   * Check if a link is internal to the site
   */
  private isInternalLink(href: string, baseUrl: URL): boolean {
    try {
      const linkUrl = new URL(href, baseUrl);
      return linkUrl.origin === baseUrl.origin;
    } catch {
      return false;
    }
  }

  /**
   * Get a CSS selector for an element (in-page context)
   */
  private getSelectorForElement(element: { id?: string; className?: string | string[]; tagName: string }): string {
    if (element.id) {
      return `#${element.id}`;
    }
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter((c: string) => c);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes[0]}`;
      }
    }
    return element.tagName.toLowerCase();
  }

  /**
   * Check if a URL has been visited
   */
  isVisited(url: string): boolean {
    return this.visitedUrls.has(url);
  }

  /**
   * Get count of visited URLs
   */
  getVisitedCount(): number {
    return this.visitedUrls.size;
  }

  /**
   * Clear visited URLs tracking
   */
  clearVisited(): void {
    this.visitedUrls.clear();
  }
}
