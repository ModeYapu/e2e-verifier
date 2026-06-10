/**
 * Matrix Runner for Device Matrix Testing
 * Executes tests across browser × viewport × locale combinations
 */

import { SiteConfig, DeviceMatrixConfig, CombinationConfig, CombinationResult, MatrixResult, BrowserType, ViewportConfig, TestResult } from '../types';
import { Verifier } from '../verifier';
import { BrowserManager } from './browser-manager';
import { Logger } from '../utils/logger';

/**
 * Matrix Runner class
 * Generates and executes all combinations
 */
export class MatrixRunner {
  private browserManager: BrowserManager;
  private logger: Logger;

  constructor() {
    this.browserManager = new BrowserManager();
    this.logger = new Logger({ prefix: 'MatrixRunner' });
  }

  /**
   * Run matrix tests for a site config
   */
  async run(siteConfig: SiteConfig, matrixConfig: DeviceMatrixConfig): Promise<MatrixResult> {
    const startTime = Date.now();
    this.logger.info(`Starting matrix run for ${siteConfig.name}`);

    // Generate all combinations
    const combinations = this.generateCombinations(matrixConfig);
    this.logger.info(`Generated ${combinations.length} combinations`);

    // Execute each combination
    const results: CombinationResult[] = [];

    for (const combination of combinations) {
      this.logger.info(
        `Executing combination: ${combination.browser} × ${combination.viewport.name} × ${combination.locale}`
      );

      try {
        const result = await this.executeCombination(siteConfig, combination);
        results.push(result);
      } catch (error) {
        this.logger.error(`Combination failed: ${error}`);
        results.push({
          combination,
          result: this.createErrorResult(siteConfig, combination, String(error)),
          passed: false,
          duration: 0,
          errors: [String(error)]
        });
      }
    }

    // Build matrix result
    const matrixResult = this.buildMatrixResult(siteConfig, results, startTime);

    // Cleanup
    await this.browserManager.closeAll();

    this.logger.info(`Matrix run completed: ${matrixResult.summary.passed}/${matrixResult.summary.total} passed`);
    return matrixResult;
  }

  /**
   * Generate all combinations from matrix config
   */
  private generateCombinations(matrixConfig: DeviceMatrixConfig): CombinationConfig[] {
    const combinations: CombinationConfig[] = [];

    // Default values
    const browsers = matrixConfig.browsers || ['chromium'];
    const viewports = matrixConfig.viewports || [
      { name: 'desktop', width: 1920, height: 1080 }
    ];
    const locales = matrixConfig.locales || ['en-US'];

    // Generate Cartesian product
    for (const browser of browsers) {
      for (const viewport of viewports) {
        for (const locale of locales) {
          combinations.push({
            browser: browser as BrowserType,
            viewport,
            locale
          });
        }
      }
    }

    return combinations;
  }

  /**
   * Execute a single combination
   */
  private async executeCombination(
    siteConfig: SiteConfig,
    combination: CombinationConfig
  ): Promise<CombinationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Get browser for this combination
      const browser = await this.browserManager.getBrowser(combination.browser);

      // Create modified site config for this combination
      const modifiedConfig: SiteConfig = {
        ...siteConfig,
        viewport: {
          width: combination.viewport.width,
          height: combination.viewport.height
        }
      };

      // Create a new verifier instance with the shared browser
      const verifier = new Verifier(modifiedConfig, browser);

      // Execute verification
      const result = await verifier.verify();

      // Release browser reference
      this.browserManager.releaseBrowser(combination.browser);

      return {
        combination,
        result,
        passed: result.passed,
        duration: Date.now() - startTime,
        errors: result.errors || []
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      // Release browser reference if we got one
      if (this.browserManager.hasBrowser(combination.browser)) {
        this.browserManager.releaseBrowser(combination.browser);
      }

      return {
        combination,
        result: this.createErrorResult(siteConfig, combination, errorMessage),
        passed: false,
        duration: Date.now() - startTime,
        errors
      };
    }
  }

  /**
   * Create error result for failed combinations
   */
  private createErrorResult(siteConfig: SiteConfig, combination: CombinationConfig, error: string): TestResult {
    return {
      siteName: siteConfig.name,
      url: siteConfig.url,
      timestamp: new Date().toISOString(),
      passed: false,
      duration: 0,
      checks: [{
        name: 'Matrix Combination',
        type: 'error',
        passed: false,
        message: `Failed for ${combination.browser} × ${combination.viewport.name}: ${error}`
      }],
      screenshots: [],
      errors: [error]
    };
  }

  /**
   * Build matrix result from combination results
   */
  private buildMatrixResult(siteConfig: SiteConfig, results: CombinationResult[], startTime: number): MatrixResult {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    // Group by browser
    const byBrowser: { [browser: string]: { total: number; passed: number; failed: number } } = {};

    for (const result of results) {
      const browser = result.combination.browser;

      if (!byBrowser[browser]) {
        byBrowser[browser] = { total: 0, passed: 0, failed: 0 };
      }

      byBrowser[browser].total++;
      if (result.passed) {
        byBrowser[browser].passed++;
      } else {
        byBrowser[browser].failed++;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      siteName: siteConfig.name,
      url: siteConfig.url,
      combinations: results,
      summary: {
        total: results.length,
        passed,
        failed,
        totalDuration: Date.now() - startTime
      },
      byBrowser
    };
  }

  /**
   * Validate matrix configuration
   */
  static validateMatrixConfig(matrixConfig: DeviceMatrixConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate browsers
    if (matrixConfig.browsers) {
      const validBrowsers: BrowserType[] = ['chromium', 'webkit', 'firefox'];
      for (const browser of matrixConfig.browsers) {
        if (!validBrowsers.includes(browser)) {
          errors.push(`Invalid browser type: ${browser}`);
        }
      }
    }

    // Validate viewports
    if (matrixConfig.viewports) {
      for (const viewport of matrixConfig.viewports) {
        if (!viewport.name || viewport.width <= 0 || viewport.height <= 0) {
          errors.push(`Invalid viewport configuration: ${JSON.stringify(viewport)}`);
        }
      }
    }

    // Validate locales
    if (matrixConfig.locales) {
      for (const locale of matrixConfig.locales) {
        if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
          errors.push(`Invalid locale format: ${locale} (expected xx-XX)`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}