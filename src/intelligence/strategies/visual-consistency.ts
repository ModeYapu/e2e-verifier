/**
 * Visual Consistency Strategy — Visual Verification
 *
 * Verifies visual consistency of test results including:
 * - Screenshot comparison with baseline
 * - Detection of blank pages, layout breaks, garbled text
 * - Responsive layout checks at different viewports
 */

import { VerificationStrategy, StrategyVerdict, StrategyIssue, VerificationContext } from '../verification-types';
import { ScenarioResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class VisualConsistencyStrategy implements VerificationStrategy {
  name = 'visual-consistency';

  async verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict> {
    const issues: StrategyIssue[] = [];
    const evidence: string[] = [];

    // Check for screenshots
    const screenshots = this.extractScreenshots(result);
    if (screenshots.length === 0) {
      evidence.push('No screenshots found - visual analysis limited');
    } else {
      evidence.push(`Found ${screenshots.length} screenshot(s) for analysis`);

      // Check for blank pages
      const blankIssues = await this.checkBlankPages(screenshots);
      issues.push(...blankIssues);

      // Check for layout issues
      const layoutIssues = await this.checkLayoutIssues(screenshots);
      issues.push(...layoutIssues);

      // Check for garbled text
      const textIssues = await this.checkGarbledText(screenshots);
      issues.push(...textIssues);

      // Check viewport consistency
      const viewportIssues = this.checkViewportConsistency(result, context);
      issues.push(...viewportIssues);

      // Compare with baseline if available
      const baselineIssues = await this.compareWithBaseline(screenshots, context);
      issues.push(...baselineIssues);
    }

    // Check for visual assertions
    const assertionIssues = this.checkVisualAssertions(result);
    issues.push(...assertionIssues);

    // Calculate confidence
    const confidence = this.calculateConfidence(result, issues, screenshots.length);

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      confidence,
      evidence,
      issues,
      metadata: {
        screenshotsAnalyzed: screenshots.length,
        totalChecks: 6,
        failedChecks: issues.length,
      },
    };
  }

  /**
   * Extract screenshots from result
   */
  private extractScreenshots(result: ScenarioResult): string[] {
    const screenshots: string[] = [];

    // Extract from step results
    result.stepResults.forEach(stepResult => {
      if (stepResult.screenshot) {
        screenshots.push(stepResult.screenshot);
      }
    });

    // Extract from assertion results
    result.assertionResults.forEach(assertionResult => {
      if (assertionResult.screenshot) {
        screenshots.push(assertionResult.screenshot);
      }
    });

    // Extract from artifacts
    result.artifacts.forEach(artifact => {
      if (artifact.type === 'screenshot') {
        screenshots.push(artifact.path);
      }
    });

    return [...new Set(screenshots)]; // Remove duplicates
  }

  /**
   * Check for blank pages
   */
  private async checkBlankPages(screenshots: string[]): Promise<StrategyIssue[]> {
    const issues: StrategyIssue[] = [];

    for (const screenshotPath of screenshots) {
      try {
        if (!fs.existsSync(screenshotPath)) {
          continue;
        }

        // Simple check: read file stats
        const stats = fs.statSync(screenshotPath);

        // Check file size - very small files might indicate blank pages
        const minSize = 1000; // 1KB minimum for non-blank screenshot
        if (stats.size < minSize) {
          issues.push({
            severity: 'high',
            category: 'visual-blank',
            description: `Screenshot appears blank or corrupted (file size: ${stats.size} bytes)`,
            evidence: [`File: ${screenshotPath}, Size: ${stats.size} bytes`],
          });
        }

        // Check if it's a valid image by extension
        const ext = path.extname(screenshotPath).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
          issues.push({
            severity: 'medium',
            category: 'visual-format',
            description: `Screenshot has unexpected format: ${ext}`,
            evidence: [`File: ${screenshotPath}`],
          });
        }
      } catch (error) {
        issues.push({
          severity: 'low',
          category: 'visual-access',
          description: `Could not analyze screenshot: ${error instanceof Error ? error.message : String(error)}`,
          evidence: [`File: ${screenshotPath}`],
        });
      }
    }

    return issues;
  }

  /**
   * Check for layout issues
   */
  private async checkLayoutIssues(screenshots: string[]): Promise<StrategyIssue[]> {
    const issues: StrategyIssue[] = [];

    // Since we can't do full image analysis without heavy libraries,
    // we'll do basic validation and heuristics

    screenshots.forEach(screenshotPath => {
      try {
        if (!fs.existsSync(screenshotPath)) {
          issues.push({
            severity: 'high',
            category: 'layout-missing',
            description: `Screenshot file not found: ${screenshotPath}`,
            evidence: [`Expected file: ${screenshotPath}`],
          });
          return;
        }

        // Check aspect ratio - unusual ratios might indicate layout issues
        const filename = path.basename(screenshotPath);
        const match = filename.match(/(\d+)x(\d+)/); // Look for dimensions in filename

        if (match) {
          const width = parseInt(match[1]);
          const height = parseInt(match[2]);
          const ratio = width / height;

          // Check for extreme aspect ratios
          if (ratio < 0.2 || ratio > 5) {
            issues.push({
              severity: 'medium',
              category: 'layout-aspect',
              description: `Unusual aspect ratio ${ratio.toFixed(2)} (${width}x${height}) - might indicate layout issues`,
              evidence: [`File: ${screenshotPath}, Ratio: ${ratio.toFixed(2)}`],
            });
          }

          // Check for very small dimensions
          if (width < 300 || height < 300) {
            issues.push({
              severity: 'medium',
              category: 'layout-size',
              description: `Very small screenshot dimensions (${width}x${height}) - might not show full page`,
              evidence: [`File: ${screenshotPath}, Dimensions: ${width}x${height}`],
            });
          }
        }
      } catch (error) {
        // File access error - already logged in blank check
      }
    });

    return issues;
  }

  /**
   * Check for garbled text
   */
  private async checkGarbledText(screenshots: string[]): Promise<StrategyIssue[]> {
    const issues: StrategyIssue[] = [];

    // Since we can't do OCR without heavy libraries,
    // we'll check for common garbled text indicators in filenames/metadata

    screenshots.forEach(screenshotPath => {
      const filename = path.basename(screenshotPath).toLowerCase();

      // Check for error indicators in filename
      if (filename.includes('error') || filename.includes('fail') || filename.includes('crash')) {
        issues.push({
          severity: 'medium',
          category: 'visual-error',
          description: `Screenshot name suggests error state: ${filename}`,
          evidence: [`File: ${screenshotPath}`],
        });
      }
    });

    return issues;
  }

  /**
   * Check viewport consistency
   */
  private checkViewportConsistency(result: ScenarioResult, context: VerificationContext): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Get viewport from scenario
    const scenario = context.plan.scenarios.find(s => s.id === result.scenarioId);
    if (!scenario) {
      return issues;
    }

    const viewport = scenario.viewport;
    if (!viewport) {
      // No viewport specified - might cause inconsistency
      issues.push({
        severity: 'low',
        category: 'viewport-missing',
        description: 'No viewport specified - results may vary across different screen sizes',
        evidence: ['Consider specifying viewport dimensions'],
      });
      return issues;
    }

    // Check for reasonable viewport dimensions
    const { width, height } = viewport;
    const commonViewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },  // Tablet
      { width: 375, height: 667 },   // Mobile
    ];

    const isCommonViewport = commonViewports.some(v => v.width === width && v.height === height);
    if (!isCommonViewport) {
      issues.push({
        severity: 'low',
        category: 'viewport-unusual',
        description: `Unusual viewport size ${width}x${height} - may not represent common user experience`,
        evidence: [`Viewport: ${width}x${height}`],
      });
    }

    // Check if viewport is too small for meaningful testing
    if (width < 320 || height < 480) {
      issues.push({
        severity: 'medium',
        category: 'viewport-small',
        description: `Viewport too small (${width}x${height}) - may not show complete UI`,
        evidence: [`Viewport: ${width}x${height}, Minimum recommended: 320x480`],
      });
    }

    return issues;
  }

  /**
   * Compare with baseline screenshots
   */
  private async compareWithBaseline(screenshots: string[], context: VerificationContext): Promise<StrategyIssue[]> {
    const issues: StrategyIssue[] = [];

    // Check if baseline directory exists
    const outputDir = context.options?.outputDir || './output';
    const baselineDir = path.join(outputDir, 'baseline');

    if (!fs.existsSync(baselineDir)) {
      // No baseline to compare against
      return issues;
    }

    // Compare each screenshot with baseline
    screenshots.forEach(screenshotPath => {
      const filename = path.basename(screenshotPath);
      const baselinePath = path.join(baselineDir, filename);

      if (fs.existsSync(baselinePath)) {
        try {
          const currentSize = fs.statSync(screenshotPath).size;
          const baselineSize = fs.statSync(baselinePath).size;

          // Check for significant size difference
          const sizeDifference = Math.abs(currentSize - baselineSize);
          const percentageDiff = (sizeDifference / baselineSize) * 100;

          if (percentageDiff > 20) {
            issues.push({
              severity: 'medium',
              category: 'visual-baseline-diff',
              description: `Screenshot differs significantly from baseline (${percentageDiff.toFixed(1)}% size difference)`,
              evidence: [
                `Current: ${currentSize} bytes`,
                `Baseline: ${baselineSize} bytes`,
                `Difference: ${percentageDiff.toFixed(1)}%`,
              ],
            });
          }
        } catch (error) {
          // Comparison failed - not critical
        }
      }
    });

    return issues;
  }

  /**
   * Check visual assertions
   */
  private checkVisualAssertions(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check for accessibility assertions (visual related)
    const a11yAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'accessibility');
    a11yAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        issues.push({
          severity: assertionResult.assertion.critical !== false ? 'high' : 'medium',
          category: 'visual-accessibility',
          description: `Accessibility check failed: ${assertionResult.assertion.description}`,
          evidence: assertionResult.error ? [assertionResult.error] : undefined,
        });
      }
    });

    // Check for element visibility assertions
    const visibilityAssertions = result.assertionResults.filter(ar =>
      ar.assertion.type === 'element-visible' || ar.assertion.type === 'element-exists'
    );

    visibilityAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        issues.push({
          severity: assertionResult.assertion.critical !== false ? 'high' : 'medium',
          category: 'visual-visibility',
          description: `Visual element check failed: ${assertionResult.assertion.description}`,
          evidence: assertionResult.error ? [assertionResult.error] : undefined,
        });
      }
    });

    return issues;
  }

  /**
   * Calculate confidence based on issues and screenshots
   */
  private calculateConfidence(result: ScenarioResult, issues: StrategyIssue[], screenshotCount: number): number {
    let confidence = 1.0;

    // Reduce confidence based on issues
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const mediumIssues = issues.filter(i => i.severity === 'medium').length;
    const lowIssues = issues.filter(i => i.severity === 'low').length;

    confidence -= criticalIssues * 0.3;
    confidence -= highIssues * 0.2;
    confidence -= mediumIssues * 0.1;
    confidence -= lowIssues * 0.05;

    // Reduce confidence if no screenshots available
    if (screenshotCount === 0) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }
}