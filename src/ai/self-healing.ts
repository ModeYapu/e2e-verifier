/**
 * Self-Healing Locators - AI-powered element location recovery
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page, ElementHandle } from '@playwright/test';
import { AIProvider, ProviderFactory } from './provider';
import { logger } from '../utils/logger';

/**
 * Locator mapping for caching
 */
interface LocatorMapping {
  oldSelector: string;
  newSelector: string;
  pageUrl: string;
  timestamp: string;
  successCount: number;
}

/**
 * Element analysis result
 */
interface ElementAnalysis {
  suggestedSelector: string;
  confidence: number;
  reasoning: string;
  alternativeSelectors: string[];
}

/**
 * Self-healing locator cache
 */
const CACHE_FILE = path.join(process.cwd(), 'data', 'locator-cache.json');

/**
 * Self-Healing Locator Manager
 */
export class SelfHealingLocator {
  private aiProvider: AIProvider;
  private cache: Map<string, LocatorMapping> = new Map();
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(aiProvider?: AIProvider) {
    this.aiProvider = aiProvider || ProviderFactory.createFromEnv();
    this.loadCache();
  }

  /**
   * Load locator cache from disk
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        const mappings: LocatorMapping[] = data.mappings || [];

        for (const mapping of mappings) {
          const key = this.generateCacheKey(mapping.oldSelector, mapping.pageUrl);
          this.cache.set(key, mapping);
        }

        logger.info(`[SelfHealingLocator] Loaded ${mappings.length} locator mappings from cache`);
      }
    } catch (error) {
      logger.error(`[SelfHealingLocator] Error loading cache: ${error}`);
    }
  }

  /**
   * Save locator cache to disk
   */
  private saveCache(): void {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const mappings = Array.from(this.cache.values());
      const data = {
        lastUpdated: new Date().toISOString(),
        mappings: mappings
      };

      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
      logger.info(`[SelfHealingLocator] Saved ${mappings.length} locator mappings to cache`);
    } catch (error) {
      logger.error(`[SelfHealingLocator] Error saving cache: ${error}`);
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(selector: string, url: string): string {
    return `${url}::${selector}`;
  }

  /**
   * Find element with self-healing capability
   */
  async findElement(page: Page, selector: string, timeout: number = 5000): Promise<ElementHandle | null> {
    this.page = page;

    // Try original selector first
    try {
      const element = await page.waitForSelector(selector, { timeout });
      if (element) {
        return element;
      }
    } catch (error) {
      logger.info(`[SelfHealingLocator] Original selector failed: ${selector}`);
    }

    // Try to find cached mapping
    const url = page.url();
    const cacheKey = this.generateCacheKey(selector, url);
    const cachedMapping = this.cache.get(cacheKey);

    if (cachedMapping) {
      logger.info(`[SelfHealingLocator] Trying cached selector: ${cachedMapping.newSelector}`);
      try {
        const element = await page.waitForSelector(cachedMapping.newSelector, { timeout: 1000 });
        if (element) {
          // Update success count
          cachedMapping.successCount++;
          this.saveCache();
          return element;
        }
      } catch (error) {
        logger.info(`[SelfHealingLocator] Cached selector also failed: ${cachedMapping.newSelector}`);
      }
    }

    // Use AI to find new selector
    logger.info(`[SelfHealingLocator] Using AI to find new selector for: ${selector}`);
    const analysis = await this.analyzePageAndFindSelector(page, selector);

    if (analysis.suggestedSelector) {
      try {
        const element = await page.waitForSelector(analysis.suggestedSelector, { timeout: 1000 });
        if (element) {
          // Cache the successful mapping
          const mapping: LocatorMapping = {
            oldSelector: selector,
            newSelector: analysis.suggestedSelector,
            pageUrl: url,
            timestamp: new Date().toISOString(),
            successCount: 1
          };

          this.cache.set(cacheKey, mapping);
          this.saveCache();

          logger.info(`[SelfHealingLocator] AI found working selector: ${analysis.suggestedSelector}`);
          return element;
        }
      } catch (error) {
        logger.info(`[SelfHealingLocator] AI suggested selector also failed: ${analysis.suggestedSelector}`);
      }
    }

    // Try alternative selectors
    for (const altSelector of analysis.alternativeSelectors) {
      try {
        const element = await page.waitForSelector(altSelector, { timeout: 1000 });
        if (element) {
          // Cache the successful mapping
          const mapping: LocatorMapping = {
            oldSelector: selector,
            newSelector: altSelector,
            pageUrl: url,
            timestamp: new Date().toISOString(),
            successCount: 1
          };

          this.cache.set(cacheKey, mapping);
          this.saveCache();

          logger.info(`[SelfHealingLocator] Alternative selector worked: ${altSelector}`);
          return element;
        }
      } catch (error) {
        logger.info(`[SelfHealingLocator] Alternative selector failed: ${altSelector}`);
      }
    }

    return null;
  }

  /**
   * Analyze page and find selector using AI
   */
  private async analyzePageAndFindSelector(page: Page, failedSelector: string): Promise<ElementAnalysis> {
    try {
      // Take screenshot for AI analysis
      const screenshotBuffer = await page.screenshot();
      const screenshot = screenshotBuffer.toString('base64');
      const imageUrl = `data:image/png;base64,${screenshot}`;

      // Get page HTML structure
      const pageStructure = await this.getPageStructure(page);

      // Get current URL
      const url = page.url();

      // Create AI prompt for element analysis
      const prompt = `
I need to find an element on a web page that was previously located by this selector: "${failedSelector}"

Current page URL: ${url}

Page structure:
${pageStructure}

Please analyze this image and page structure to suggest:
1. The most likely new selector for this element
2. Your confidence level (0-100)
3. Your reasoning for this choice
4. 3-4 alternative selectors in case the first one doesn't work

The element might have changed due to:
- CSS class changes
- Structural changes in the DOM
- ID changes
- Attribute changes

Focus on finding stable selectors that are less likely to change (like data attributes, stable IDs, or structural relationships).

Respond in JSON format:
{
  "suggestedSelector": "css selector or xpath here",
  "confidence": 85,
  "reasoning": "explanation here",
  "alternativeSelectors": ["alt1", "alt2", "alt3"]
}
`;

      // Use AI to analyze
      const response = await this.aiProvider.analyzeImage(imageUrl, prompt);
      const analysis = JSON.parse(response);

      return {
        suggestedSelector: analysis.suggestedSelector || '',
        confidence: analysis.confidence || 0,
        reasoning: analysis.reasoning || '',
        alternativeSelectors: analysis.alternativeSelectors || []
      };
    } catch (error) {
      logger.error(`[SelfHealingLocator] Error analyzing page: ${error}`);

      // Return fallback analysis
      return {
        suggestedSelector: this.generateFallbackSelector(failedSelector),
        confidence: 20,
        reasoning: 'Fallback due to AI analysis failure',
        alternativeSelectors: this.generateAlternativeSelectors(failedSelector)
      };
    }
  }

  /**
   * Get page structure for AI analysis
   */
  private async getPageStructure(page: Page): Promise<string> {
    try {
      // Get a simplified version of the page structure
      const structure = await page.evaluate(() => {
        const getStructure = (element: Element, depth: number = 0): string => {
          if (depth > 3) return '';

          let result = '';
          const indent = '  '.repeat(depth);

          for (const child of Array.from(element.children)) {
            const tagName = child.tagName.toLowerCase();
            const id = child.id ? `#${child.id}` : '';
            const classes = child.className ? `.${child.className.split(' ').join('.')}` : '';
            const text = child.textContent?.trim().substring(0, 30) || '';

            result += `${indent}${tagName}${id}${classes}${text ? ` [${text}]` : ''}\n`;

            if (child.children.length > 0) {
              result += getStructure(child, depth + 1);
            }
          }

          return result;
        };

        return getStructure(document.body);
      });

      return structure;
    } catch (error) {
      logger.error(`[SelfHealingLocator] Error getting page structure: ${error}`);
      return 'Unable to retrieve page structure';
    }
  }

  /**
   * Generate fallback selector
   */
  private generateFallbackSelector(failedSelector: string): string {
    // Try to make the selector more robust
    if (failedSelector.includes('.')) {
      // Class-based selector - try making it more specific
      const parts = failedSelector.split(' ');
      return parts[parts.length - 1]; // Return the last part
    }

    if (failedSelector.includes('#')) {
      // ID-based selector - return as-is
      return failedSelector;
    }

    // Try to convert to contains text selector
    return `*:has-text(${failedSelector})`;
  }

  /**
   * Generate alternative selectors
   */
  private generateAlternativeSelectors(failedSelector: string): string[] {
    const alternatives: string[] = [];

    // Try XPath variations
    if (!failedSelector.startsWith('//')) {
      alternatives.push(`//${failedSelector.replace(/\s+/g, '//')}`);
    }

    // Try attribute selectors
    alternatives.push(`[${failedSelector.replace(/[.#]/g, '="').replace(/_/g, '-')}=""]`);

    // Try structural selectors
    alternatives.push(`body ${failedSelector}`);

    return alternatives;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.saveCache();
    logger.info('[SelfHealingLocator] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number; byUrl: Record<string, number> } {
    const byUrl: Record<string, number> = {};

    for (const mapping of this.cache.values()) {
      byUrl[mapping.pageUrl] = (byUrl[mapping.pageUrl] || 0) + 1;
    }

    return {
      total: this.cache.size,
      byUrl
    };
  }

  /**
   * Clean up
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
let singletonInstance: SelfHealingLocator | null = null;

export function getSelfHealingLocator(aiProvider?: AIProvider): SelfHealingLocator {
  if (!singletonInstance) {
    singletonInstance = new SelfHealingLocator(aiProvider);
  }
  return singletonInstance;
}
