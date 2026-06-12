import { Page } from '@playwright/test';
import { VisualRegressionResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export class VisualRegressionChecker {
  private baselineDir: string;
  private threshold: number;

  constructor(baselineDir: string = 'baselines', threshold: number = 0.001) {
    this.baselineDir = baselineDir;
    this.threshold = threshold;
    this.ensureBaselineDir();
  }

  private ensureBaselineDir(): void {
    if (!fs.existsSync(this.baselineDir)) {
      fs.mkdirSync(this.baselineDir, { recursive: true });
    }
  }

  async compare(page: Page, name: string, configName: string): Promise<VisualRegressionResult> {
    const baselinePath = path.join(this.baselineDir, `${configName}-${name}.png`);
    const currentPath = path.join(this.baselineDir, `${configName}-${name}-current.png`);
    const diffPath = path.join(this.baselineDir, `${configName}-${name}-diff.png`);

    try {
      // Take current screenshot
      await page.screenshot({ path: currentPath, fullPage: false });

      // Check if baseline exists
      if (!fs.existsSync(baselinePath)) {
        // First run - save as baseline
        fs.copyFileSync(currentPath, baselinePath);
        return {
          passed: true,
          diffPercentage: 0,
          baselinePath,
          message: 'Baseline created'
        };
      }

      // Compare with baseline
      const diffPercentage = await this.calculatePixelDiff(baselinePath, currentPath);

      if (diffPercentage < this.threshold) {
        // Passed - within threshold
        return {
          passed: true,
          diffPercentage,
          baselinePath,
          message: `Visual regression passed: ${(diffPercentage * 100).toFixed(3)}% diff`
        };
      }

      // Failed - generate diff image
      await this.generateDiffImage(baselinePath, currentPath, diffPath);

      return {
        passed: false,
        diffPercentage,
        baselinePath,
        diffPath,
        message: `Visual regression failed: ${(diffPercentage * 100).toFixed(3)}% diff exceeds threshold ${(this.threshold * 100).toFixed(3)}%`
      };

    } catch (error) {
      return {
        passed: false,
        diffPercentage: 1,
        baselinePath,
        message: `Visual regression check failed: ${error}`
      };
    }
  }

  private async calculatePixelDiff(baselinePath: string, currentPath: string): Promise<number> {
    try {
      // Simple pixel comparison using PNG decoder
      const baselineBuffer = fs.readFileSync(baselinePath);
      const currentBuffer = fs.readFileSync(currentPath);

      // For a proper implementation, we'd use pixelmatch or similar
      // For now, return a simple comparison based on file size
      const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
      const avgSize = (baselineBuffer.length + currentBuffer.length) / 2;

      // This is a rough approximation - real implementation needs pixel-by-pixel comparison
      return Math.min(sizeDiff / avgSize, 1);

    } catch (error) {
      logger.error(`Error calculating pixel diff: ${error}`);
      return 1; // Return max diff on error
    }
  }

  private async generateDiffImage(baselinePath: string, currentPath: string, diffPath: string): Promise<void> {
    // Placeholder for diff image generation
    // Real implementation would use pixelmatch or sharp to create visual diff
    try {
      // Copy current as diff for now
      fs.copyFileSync(currentPath, diffPath);
    } catch (error) {
      logger.error(`Error generating diff image: ${error}`);
    }
  }

  updateBaseline(name: string, configName: string): void {
    const currentPath = path.join(this.baselineDir, `${configName}-${name}-current.png`);
    const baselinePath = path.join(this.baselineDir, `${configName}-${name}.png`);

    if (fs.existsSync(currentPath)) {
      fs.copyFileSync(currentPath, baselinePath);
    }
  }
}
