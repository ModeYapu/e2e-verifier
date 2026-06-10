/**
 * Smart Test Generator - AI-powered automatic test generation from URLs
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from '@playwright/test';
import { AIProvider, ProviderFactory } from './provider';
import { SiteConfig } from '../types';

/**
 * Feature detection result
 */
interface DetectedFeature {
  type: 'form' | 'button' | 'link' | 'input' | 'table' | 'navigation' | 'content';
  selector: string;
  description: string;
  testable: boolean;
  suggestedChecks: string[];
}

/**
 * Page analysis result
 */
interface PageAnalysis {
  url: string;
  title: string;
  features: DetectedFeature[];
  suggestedSiteName: string;
  recommendedChecks: string[];
  testScenarios: string[];
}

/**
 * Generated test configuration
 */
interface GeneratedConfig {
  siteConfig: SiteConfig;
  customScripts: string[];
  metadata: {
    generatedAt: string;
    aiConfidence: number;
    featuresDetected: number;
  };
}

/**
 * Smart Test Generator class
 */
export class SmartTestGenerator {
  private aiProvider: AIProvider;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(aiProvider?: AIProvider) {
    this.aiProvider = aiProvider || ProviderFactory.createFromEnv();
  }

  /**
   * Initialize browser
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }
  }

  /**
   * Analyze URL and generate test configuration
   */
  async generateFromUrl(url: string, options: any = {}): Promise<GeneratedConfig> {
    await this.initBrowser();

    console.log(`[SmartTestGenerator] Analyzing URL: ${url}`);

    // Navigate to URL
    try {
      await this.page!.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (error) {
      console.error(`[SmartTestGenerator] Error navigating to URL:`, error);
      throw new Error(`Failed to navigate to URL: ${url}`);
    }

    // Analyze page structure
    const analysis = await this.analyzePage(this.page!, url);

    console.log(`[SmartTestGenerator] Detected ${analysis.features.length} features`);

    // Generate site configuration
    const siteConfig = this.generateSiteConfig(analysis, options);

    // Generate custom test scripts
    const customScripts = this.generateCustomScripts(analysis);

    const metadata = {
      generatedAt: new Date().toISOString(),
      aiConfidence: this.calculateConfidence(analysis),
      featuresDetected: analysis.features.length
    };

    return {
      siteConfig,
      customScripts,
      metadata
    };
  }

  /**
   * Analyze page structure and features
   */
  private async analyzePage(page: Page, url: string): Promise<PageAnalysis> {
    try {
      // Get page title
      const title = await page.title();

      // Take screenshot for AI analysis
      const screenshotBuffer = await page.screenshot();
      const screenshot = screenshotBuffer.toString('base64');
      const imageUrl = `data:image/png;base64,${screenshot}`;

      // Get page structure
      const pageStructure = await this.getPageStructure(page);

      // Get interactive elements
      const interactiveElements = await this.getInteractiveElements(page);

      // Create AI prompt for page analysis
      const prompt = `
Analyze this web page and identify testable features.

Page URL: ${url}
Page Title: ${title}

Page Structure:
${pageStructure}

Interactive Elements Found:
${JSON.stringify(interactiveElements, null, 2)}

Please identify:
1. What type of page this is (landing page, dashboard, form, etc.)
2. Key interactive elements (forms, buttons, links, inputs, tables, etc.)
3. What should be tested on this page
4. Suggested site name for this configuration
5. Recommended standard checks
6. Test scenarios to implement

Respond in JSON format:
{
  "suggestedSiteName": "descriptive-site-name",
  "pageType": "landing|dashboard|form|etc",
  "features": [
    {
      "type": "form|button|link|input|table|navigation|content",
      "selector": "css selector",
      "description": "what this element is",
      "testable": true,
      "suggestedChecks": ["check1", "check2"]
    }
  ],
  "recommendedChecks": ["accessibility", "performance", "seo", "console"],
  "testScenarios": ["scenario 1", "scenario 2", "scenario 3"]
}
`;

      // Use AI to analyze the page
      const response = await this.aiProvider.analyzeImage(imageUrl, prompt);
      const aiAnalysis = JSON.parse(response);

      return {
        url,
        title,
        suggestedSiteName: aiAnalysis.suggestedSiteName || this.generateSiteName(url, title),
        features: aiAnalysis.features || [],
        recommendedChecks: aiAnalysis.recommendedChecks || ['accessibility', 'console'],
        testScenarios: aiAnalysis.testScenarios || []
      };
    } catch (error) {
      console.error('[SmartTestGenerator] Error analyzing page:', error);

      // Return fallback analysis
      return this.getFallbackAnalysis(page, url);
    }
  }

  /**
   * Get page structure for analysis
   */
  private async getPageStructure(page: Page): Promise<string> {
    try {
      const structure = await page.evaluate(() => {
        const getStructure = (element: Element, maxDepth: number = 2, currentDepth: number = 0): string => {
          if (currentDepth >= maxDepth) return '';

          let result = '';
          const indent = '  '.repeat(currentDepth);

          for (const child of Array.from(element.children)) {
            const tagName = child.tagName.toLowerCase();
            const id = child.id ? `#${child.id}` : '';
            const classes = child.className ? `.${child.className.split(' ').join('.')}` : '';
            const text = child.textContent?.trim().substring(0, 20) || '';
            const role = child.getAttribute('role') ? `[role="${child.getAttribute('role')}"]` : '';

            result += `${indent}${tagName}${id}${classes}${role}${text ? ` [${text}]` : ''}\n`;

            if (child.children.length > 0 && currentDepth < maxDepth) {
              result += getStructure(child, maxDepth, currentDepth + 1);
            }
          }

          return result;
        };

        return getStructure(document.body, 2, 0);
      });

      return structure;
    } catch (error) {
      console.error('[SmartTestGenerator] Error getting page structure:', error);
      return 'Unable to retrieve page structure';
    }
  }

  /**
   * Get interactive elements from page
   */
  private async getInteractiveElements(page: Page): Promise<any[]> {
    try {
      const elements = await page.evaluate(() => {
        const interactive: any[] = [];

        // Find forms
        document.querySelectorAll('form').forEach(form => {
          interactive.push({
            type: 'form',
            selector: `form[action="${form.getAttribute('action')}"]`,
            id: form.id,
            action: form.action,
            method: form.method
          });
        });

        // Find buttons
        document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(btn => {
          interactive.push({
            type: 'button',
            selector: btn.tagName.toLowerCase() + (btn.id ? `#${btn.id}` : ''),
            text: btn.textContent?.trim().substring(0, 30) || '',
            buttonType: btn.getAttribute('type') || 'button'
          });
        });

        // Find links
        document.querySelectorAll('a[href]').forEach(link => {
          interactive.push({
            type: 'link',
            selector: `a[href="${link.getAttribute('href')}"]`,
            text: link.textContent?.trim().substring(0, 30) || '',
            href: link.getAttribute('href')
          });
        });

        // Find inputs
        document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(input => {
          const inputElem = input as any;
          interactive.push({
            type: 'input',
            selector: inputElem.tagName.toLowerCase() + (inputElem.id ? `#${inputElem.id}` : ''),
            name: inputElem.name || '',
            inputType: inputElem.getAttribute('type') || 'text',
            required: inputElem.required || false
          });
        });

        // Find tables
        document.querySelectorAll('table').forEach(table => {
          interactive.push({
            type: 'table',
            selector: table.id ? `table#${table.id}` : 'table',
            rows: table.querySelectorAll('tr').length
          });
        });

        return interactive;
      });

      return elements;
    } catch (error) {
      console.error('[SmartTestGenerator] Error getting interactive elements:', error);
      return [];
    }
  }

  /**
   * Generate site configuration from analysis
   */
  private generateSiteConfig(analysis: PageAnalysis, options: any = {}): SiteConfig {
    return {
      name: analysis.suggestedSiteName,
      url: analysis.url,
      expectedStatusCode: options.expectedStatusCode || 200,
      timeout: options.timeout || 30000,
      checks: analysis.recommendedChecks,
      screenshots: options.screenshots || ['hero', 'above-fold'],
      customChecks: this.generateCustomChecks(analysis)
    };
  }

  /**
   * Generate custom checks from analysis
   */
  private generateCustomChecks(analysis: PageAnalysis): Array<{
    name: string;
    type: 'element' | 'text' | 'attribute' | 'javascript';
    selector?: string;
    expected?: string | boolean;
    script?: string;
  }> {
    const customChecks: Array<any> = [];

    for (const feature of analysis.features) {
      if (feature.testable && feature.selector) {
        for (const check of feature.suggestedChecks) {
          customChecks.push({
            name: `${feature.type}-${check}`,
            type: 'element',
            selector: feature.selector,
            expected: true
          });
        }
      }
    }

    return customChecks;
  }

  /**
   * Generate custom test scripts
   */
  private generateCustomScripts(analysis: PageAnalysis): string[] {
    const scripts: string[] = [];

    // Generate script for each test scenario
    for (const scenario of analysis.testScenarios) {
      const script = this.generateScenarioScript(scenario, analysis);
      scripts.push(script);
    }

    return scripts;
  }

  /**
   * Generate script for a specific scenario
   */
  private generateScenarioScript(scenario: string, analysis: PageAnalysis): string {
    return `
// Generated test scenario: ${scenario}
// Page: ${analysis.url}
// Generated at: ${new Date().toISOString()}

const { test, expect } = require('@playwright/test');

test('${scenario.replace(/\s+/g, '-').toLowerCase()}', async ({ page }) => {
  await page.goto('${analysis.url}');

  // TODO: Implement scenario logic
  // This is a placeholder - modify based on actual requirements

  // Example: Wait for page to load
  await page.waitForLoadState('networkidle');

  // Example: Check page title
  await expect(page).toHaveTitle(/.*/);

  // Add your specific test logic here based on: ${scenario}
});
`;
  }

  /**
   * Calculate confidence score for generated tests
   */
  private calculateConfidence(analysis: PageAnalysis): number {
    let confidence = 50; // Base confidence

    // Increase confidence based on features detected
    confidence += Math.min(analysis.features.length * 5, 30);

    // Increase confidence if we have test scenarios
    confidence += Math.min(analysis.testScenarios.length * 5, 20);

    return Math.min(confidence, 100);
  }

  /**
   * Generate site name from URL and title
   */
  private generateSiteName(url: string, title: string): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

      if (pathParts.length > 0) {
        return `${domain}-${pathParts.join('-')}`;
      }

      return domain;
    } catch (error) {
      return title.toLowerCase().replace(/\s+/g, '-').substring(0, 30);
    }
  }

  /**
   * Get fallback analysis when AI fails
   */
  private async getFallbackAnalysis(page: Page, url: string): Promise<PageAnalysis> {
    const title = await page.title();
    const interactiveElements = await this.getInteractiveElements(page);

    const features: DetectedFeature[] = interactiveElements.map(el => ({
      type: el.type,
      selector: el.selector,
      description: `${el.type} element`,
      testable: true,
      suggestedChecks: ['visible', 'enabled']
    }));

    return {
      url,
      title,
      suggestedSiteName: this.generateSiteName(url, title),
      features,
      recommendedChecks: ['accessibility', 'console'],
      testScenarios: ['page-loads', 'interactive-elements-work']
    };
  }

  /**
   * Save generated configuration to file
   */
  saveToFile(generatedConfig: GeneratedConfig, filename?: string): string {
    const siteName = generatedConfig.siteConfig.name;
    const defaultFilename = `auto-generated-${siteName}-${Date.now()}.json`;
    const outputFilename = filename || defaultFilename;

    // Save site config
    const configPath = path.join(process.cwd(), 'sites', outputFilename);
    const sitesDir = path.dirname(configPath);

    if (!fs.existsSync(sitesDir)) {
      fs.mkdirSync(sitesDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(generatedConfig.siteConfig, null, 2));
    console.log(`[SmartTestGenerator] Saved site config to: ${configPath}`);

    // Save custom scripts
    if (generatedConfig.customScripts.length > 0) {
      const scriptsDir = path.join(process.cwd(), 'scripts', 'auto-generated');
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      generatedConfig.customScripts.forEach((script, index) => {
        const scriptPath = path.join(scriptsDir, `${siteName}-scenario-${index + 1}.test.ts`);
        fs.writeFileSync(scriptPath, script);
        console.log(`[SmartTestGenerator] Saved script to: ${scriptPath}`);
      });
    }

    return configPath;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Singleton instance
 */
let singletonInstance: SmartTestGenerator | null = null;

export function getSmartTestGenerator(aiProvider?: AIProvider): SmartTestGenerator {
  if (!singletonInstance) {
    singletonInstance = new SmartTestGenerator(aiProvider);
  }
  return singletonInstance;
}
