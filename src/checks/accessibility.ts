import { Page } from '@playwright/test';
import { AccessibilityResult, AccessibilityIssue } from '../types';
import { logger } from '../utils/logger';

export class AccessibilityChecker {
  constructor(private page: Page) {}

  async runChecks(): Promise<AccessibilityResult> {
    const issues: AccessibilityIssue[] = [];

    try {
      // Check for images without alt text
      const imagesWithoutAlt = await this.page.$$eval('img:not([alt]), img[alt=""]', (imgs) => {
        return imgs.map(img => ({
          type: 'missing-alt',
          element: `<img>`,
          message: 'Image missing alt attribute',
          severity: 'error' as const
        }));
      });
      issues.push(...imagesWithoutAlt);

      // Check for links without accessible names
      const linksWithoutText = await this.page.$$eval('a:not([aria-label])', (links) => {
        return links
          .filter(link => !link.textContent?.trim())
          .map(link => ({
            type: 'missing-link-text',
            element: '<a>',
            message: 'Link missing accessible text or aria-label',
            severity: 'error' as const
          }));
      });
      issues.push(...linksWithoutText);

      // Check for proper heading structure (skipped levels)
      const headingStructure = await this.page.evaluate(() => {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const structure: string[] = [];
        headings.forEach(h => structure.push(h.tagName));
        return structure;
      });

      for (let i = 1; i < headingStructure.length; i++) {
        const currentLevel = parseInt(headingStructure[i].substring(1));
        const prevLevel = parseInt(headingStructure[i - 1].substring(1));
        if (currentLevel > prevLevel + 1) {
          issues.push({
            type: 'heading-skip',
            element: headingStructure[i],
            message: `Heading level skipped (from ${headingStructure[i - 1]} to ${headingStructure[i]})`,
            severity: 'warning' as const
          });
        }
      }

      // Check for form labels
      const inputsWithoutLabels = await this.page.$$eval(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
        (inputs) => {
          return inputs
            .filter(input => {
              const id = input.id;
              const ariaLabel = input.getAttribute('aria-label');
              const ariaLabelledBy = input.getAttribute('aria-labelledby');
              const hasLabel = document.querySelector(`label[for="${id}"]`);
              return !hasLabel && !ariaLabel && !ariaLabelledBy;
            })
            .map(input => ({
              type: 'missing-label',
              element: `<${input.tagName.toLowerCase()}>`,
              message: 'Form input missing label or aria-label',
              severity: 'error' as const
            }));
        }
      );
      issues.push(...inputsWithoutLabels);

      // Check for ARIA attributes with invalid values
      const ariaIssues = await this.page.evaluate(() => {
        const issues: { type: string; element: string; message: string; severity: string }[] = [];
        
        // Check for aria-hidden on focusable elements
        const hiddenFocusable = document.querySelectorAll('[aria-hidden="true"]:is(a, button, input, select, textarea)');
        hiddenFocusable.forEach(el => {
          issues.push({
            type: 'aria-hidden-focusable',
            element: `<${el.tagName.toLowerCase()}>`,
            message: 'aria-hidden="true" on focusable element',
            severity: 'warning'
          });
        });

        return issues;
      });
      issues.push(...ariaIssues.map(issue => ({ ...issue, severity: issue.severity as 'error' | 'warning' | 'info' })));

    } catch (error) {
      logger.error(`Error running accessibility checks: ${error}`);
    }

    const passed = issues.filter(i => i.severity === 'error').length === 0;

    return { passed, issues };
  }

  formatResults(result: AccessibilityResult): string {
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    const warningCount = result.issues.filter(i => i.severity === 'warning').length;
    const infoCount = result.issues.filter(i => i.severity === 'info').length;

    const parts: string[] = [];
    if (errorCount > 0) parts.push(`${errorCount} errors`);
    if (warningCount > 0) parts.push(`${warningCount} warnings`);
    if (infoCount > 0) parts.push(`${infoCount} info`);

    return parts.length > 0 ? parts.join(', ') : 'All checks passed';
  }
}
