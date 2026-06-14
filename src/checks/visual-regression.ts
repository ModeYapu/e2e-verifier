import { Page } from '@playwright/test';
import { VisualRegressionResult } from '../types';
import { VisualComparator } from '../services/visual-comparator';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export class VisualRegressionChecker {
  private baselineDir: string;
  private threshold: number;
  private comparator: VisualComparator;

  constructor(baselineDir: string = 'baselines', threshold: number = 0.001) {
    this.baselineDir = baselineDir;
    this.threshold = threshold;
    this.comparator = new VisualComparator();
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

      // Compare with baseline (real pixel diff via VisualComparator)
      const diff = await this.calculatePixelDiff(baselinePath, currentPath, diffPath);

      if (diff.diffPercentage < this.threshold) {
        // Passed - within threshold
        return {
          passed: true,
          diffPercentage: diff.diffPercentage,
          baselinePath,
          message: `Visual regression passed: ${(diff.diffPercentage * 100).toFixed(3)}% diff`
        };
      }

      return {
        passed: false,
        diffPercentage: diff.diffPercentage,
        baselinePath,
        diffPath: diff.heatmapWritten ? diffPath : undefined,
        message: `Visual regression failed: ${(diff.diffPercentage * 100).toFixed(3)}% diff exceeds threshold ${(this.threshold * 100).toFixed(3)}%`
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

  /**
   * Real pixel-level diff using {@link VisualComparator}, which inflates the
   * PNG IDAT and compares RGBA pixels. Writes a heatmap PNG to `diffPath`
   * when differences are detected. Replaces the old file-size heuristic that
   * reported identical images as "different" (and vice-versa).
   */
  private async calculatePixelDiff(
    baselinePath: string,
    currentPath: string,
    diffPath: string
  ): Promise<{ diffPercentage: number; heatmapWritten: boolean }> {
    try {
      const baselineBuffer = fs.readFileSync(baselinePath);
      const currentBuffer = fs.readFileSync(currentPath);

      const result = this.comparator.compare(baselineBuffer, currentBuffer, {
        // diffPercentage is returned on a 0-100 scale; the caller's threshold
        // is a 0-1 fraction, so we keep this on 0-1 to match.
      });

      const diffPercentage = result.diffPercentage / 100;

      // Persist the comparator's heatmap when there's something to show.
      let heatmapWritten = false;
      if (result.diffPixels > 0 && result.heatmapBase64) {
        try {
          fs.writeFileSync(diffPath, Buffer.from(result.heatmapBase64, 'base64'));
          heatmapWritten = true;
        } catch (writeErr) {
          logger.warn(`Failed to write diff heatmap: ${writeErr}`);
        }
      }

      return { diffPercentage, heatmapWritten };
    } catch (error) {
      logger.error(`Error calculating pixel diff: ${error}`);
      return { diffPercentage: 1, heatmapWritten: false };
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
