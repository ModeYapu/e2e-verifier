import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface ScreenshotOptions {
  name: string;
  path?: string;
  waitForSelector?: string;
  waitForTimeout?: number;
}

export class ScreenshotUtil {
  constructor(
    private page: Page,
    private siteName: string,
    private baseDir: string = 'screenshots'
  ) {}

  async takeScreenshot(options: ScreenshotOptions): Promise<string> {
    try {
      // Wait for selector if specified
      if (options.waitForSelector) {
        await this.page.waitForSelector(options.waitForSelector, { timeout: 5000 });
      }

      // Wait for timeout if specified
      if (options.waitForTimeout) {
        await this.page.waitForTimeout(options.waitForTimeout);
      }

      // Navigate to path if specified
      if (options.path) {
        const url = new URL(this.page.url());
        await this.page.goto(url.origin + options.path);
        await this.page.waitForLoadState('networkidle');
      }

      // Create directory structure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.join(this.baseDir, this.siteName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Generate filename
      const filename = `${options.name}-${timestamp}.png`;
      const filepath = path.join(dir, filename);

      // Take screenshot
      await this.page.screenshot({
        path: filepath,
        fullPage: true
      });

      return filepath;
    } catch (error) {
      throw new Error(`Failed to take screenshot "${options.name}": ${error}`);
    }
  }

  async takeMultipleScreenshots(
    screenshotConfigs: ScreenshotOptions[],
    viewports?: Array<{ width: number; height: number }>
  ): Promise<Array<{ name: string; path: string; viewport: string; timestamp: string }>> {
    const results: Array<{ name: string; path: string; viewport: string; timestamp: string }> = [];
    const resolvedViewports = viewports && viewports.length > 0 ? viewports : [undefined];

    for (const viewport of resolvedViewports) {
      if (viewport) {
        await this.page.setViewportSize(viewport);
        await this.page.waitForTimeout(250);
      }

      for (const config of screenshotConfigs) {
        try {
          const viewportName = viewport
            ? `${viewport.width}x${viewport.height}`
            : 'default';
          const filepath = await this.takeScreenshot({
            ...config,
            name: viewport ? `${config.name}-${viewportName}` : config.name
          });
          results.push({
            name: config.name,
            path: filepath,
            viewport: viewportName,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error(`Error taking screenshot "${config.name}":`, error);
        }
      }
    }

    return results;
  }
}
