/**
 * Self-Reflection Gate for Agent Loop
 * Implements Webwright's key mechanism to prevent false "done" declarations
 */

import { ScriptEngine } from './script-engine';
import { ReflectionResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Self-Reflection Gate to validate agent completion claims
 */
export class SelfReflectionGate {
  private scriptEngine: ScriptEngine;

  constructor(scriptEngine?: ScriptEngine) {
    this.scriptEngine = scriptEngine || new ScriptEngine();
  }

  /**
   * Validate a script by running it in a fresh sandbox and inspecting results
   * @param script The Playwright script to validate
   * @param url Target URL
   * @returns Reflection result with pass/fail and evidence
   */
  async validate(script: string, url: string): Promise<ReflectionResult> {
    console.log('\n=== Starting Self-Reflection Validation ===');
    console.log(`Target URL: ${url}`);
    console.log(`Script length: ${script.length} characters`);

    const evidence: string[] = [];
    const screenshotAnalysis: ReflectionResult['screenshotAnalysis'] = {
      totalScreenshots: 0,
      visibleElements: [],
      errors: []
    };

    const consoleAnalysis: ReflectionResult['consoleAnalysis'] = {
      totalErrors: 0,
      errorMessages: []
    };

    try {
      // Create fresh sandbox environment
      const sandboxDir = this.scriptEngine.createSandbox(url);
      
      // Write script to sandbox
      const scriptPath = this.scriptEngine.writeScript(script, 'reflection-test');
      
      // Execute the script
      console.log('Executing script for reflection...');
      const result = await this.scriptEngine.executeScript(scriptPath, {
        timeout: 30000
      });

      // Analyze execution results
      console.log('Analyzing execution results...');

      // Check exit code and success status
      if (result.exitCode !== 0 || !result.success) {
        evidence.push(`Script execution failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          evidence.push(`Error output: ${result.stderr}`);
          consoleAnalysis.errorMessages.push(result.stderr);
          consoleAnalysis.totalErrors += result.stderr.split('\n').length;
        }
      } else {
        evidence.push('Script executed successfully');
      }

      // Analyze stdout for test results
      if (result.stdout) {
        const stdoutLines = result.stdout.split('\n');
        const passedLines = stdoutLines.filter(line => 
          line.toLowerCase().includes('passed') && !line.toLowerCase().includes('failed')
        );
        
        if (passedLines.length > 0) {
          evidence.push(`Test assertions passed: ${passedLines.length} occurrences`);
        }

        // Look for specific verification patterns
        if (result.stdout.includes('OK') || result.stdout.includes('✓') || result.stdout.includes('✅')) {
          evidence.push('Positive verification markers found in output');
        }
      }

      // Analyze screenshots
      screenshotAnalysis.totalScreenshots = result.screenshots.length;
      if (result.screenshots.length > 0) {
        evidence.push(`Captured ${result.screenshots.length} screenshot(s)`);
        
        // Analyze each screenshot
        for (const screenshotPath of result.screenshots) {
          try {
            const analysis = this.analyzeScreenshot(screenshotPath);
            screenshotAnalysis.visibleElements.push(...analysis.elements);
            if (analysis.error) {
              screenshotAnalysis.errors.push(analysis.error);
            }
          } catch (error) {
            console.warn(`Failed to analyze screenshot ${screenshotPath}:`, error);
          }
        }

        if (screenshotAnalysis.visibleElements.length > 0) {
          evidence.push(`Detected elements: ${screenshotAnalysis.visibleElements.slice(0, 5).join(', ')}`);
        }
      }

      // Clean up sandbox
      if (!process.env.KEEP_SANDBOX) {
        this.scriptEngine.cleanup(scriptPath);
      }

      // Determine if validation passed
      const passed = this.determinePassStatus(result, evidence, consoleAnalysis);

      console.log(`=== Reflection Result: ${passed ? 'PASSED' : 'FAILED'} ===`);
      console.log(`Evidence collected: ${evidence.length} items`);
      console.log(`Screenshots: ${screenshotAnalysis.totalScreenshots}`);
      console.log(`Console errors: ${consoleAnalysis.totalErrors}`);

      return {
        passed,
        evidence,
        screenshotAnalysis,
        consoleAnalysis,
        failureReason: passed ? undefined : this.generateFailureReason(result, evidence, consoleAnalysis)
      };

    } catch (error) {
      const errorMessage = `Reflection validation error: ${error}`;
      console.error(errorMessage);
      
      return {
        passed: false,
        evidence: [...evidence, errorMessage],
        screenshotAnalysis,
        consoleAnalysis,
        failureReason: errorMessage
      };
    }
  }

  /**
   * Analyze a screenshot file for visual evidence
   * @param screenshotPath Path to screenshot file
   * @returns Analysis result with detected elements and errors
   */
  private analyzeScreenshot(screenshotPath: string): {
    elements: string[];
    error?: string;
  } {
    const elements: string[] = [];

    try {
      if (!fs.existsSync(screenshotPath)) {
        return { elements, error: `Screenshot file not found: ${screenshotPath}` };
      }

      const stats = fs.statSync(screenshotPath);
      const fileSize = stats.size;

      // Basic file validation
      if (fileSize < 100) {
        return { elements, error: `Screenshot appears empty or corrupted (${fileSize} bytes)` };
      }

      // In a real implementation, you would use image processing libraries
      // to detect specific elements, text, etc.
      // For now, we'll provide basic file-based analysis
      elements.push('valid_screenshot');
      elements.push(`size_${fileSize}_bytes`);

    } catch (error) {
      return { elements, error: `Screenshot analysis failed: ${error}` };
    }

    return { elements };
  }

  /**
   * Determine if reflection passed based on execution results and evidence
   */
  private determinePassStatus(
    result: any,
    evidence: string[],
    consoleAnalysis: ReflectionResult['consoleAnalysis']
  ): boolean {
    // Must have successful execution
    if (result.exitCode !== 0 || !result.success) {
      return false;
    }

    // Must have some positive evidence
    const hasPositiveEvidence = evidence.some(e => 
      e.includes('passed') || 
      e.includes('success') || 
      e.includes('verified') ||
      e.includes('detected')
    );

    if (!hasPositiveEvidence) {
      return false;
    }

    // Should not have console errors
    if (consoleAnalysis.totalErrors > 0) {
      return false;
    }

    // Should have captured screenshots (visual evidence)
    if (result.screenshots.length === 0) {
      console.warn('No screenshots captured - weak evidence');
      // Don't fail completely, but flag as weak
    }

    return true;
  }

  /**
   * Generate human-readable failure reason
   */
  private generateFailureReason(
    result: any,
    evidence: string[],
    consoleAnalysis: ReflectionResult['consoleAnalysis']
  ): string {
    const reasons: string[] = [];

    if (result.exitCode !== 0) {
      reasons.push(`Script failed with exit code ${result.exitCode}`);
    }

    if (!result.success) {
      reasons.push('Script execution reported failure');
    }

    if (consoleAnalysis.totalErrors > 0) {
      reasons.push(`Console errors detected (${consoleAnalysis.totalErrors} total)`);
    }

    if (result.screenshots.length === 0) {
      reasons.push('No visual evidence (screenshots) captured');
    }

    if (reasons.length === 0) {
      reasons.push('Insufficient positive evidence to confirm task completion');
    }

    return reasons.join('; ');
  }

  /**
   * Quick validation for incremental checks during agent loop
   * @param script Script to validate
   * @param url Target URL
   * @returns Promise<boolean> indicating if script appears valid
   */
  async quickValidate(script: string, url: string): Promise<boolean> {
    try {
      // Basic syntax check
      if (!script.includes('page.') && !script.includes('await')) {
        return false; // No actual Playwright commands
      }

      // Check for required imports or structure
      if (script.includes('error') || script.includes('undefined') || script.includes('null')) {
        return false; // Contains error indicators
      }

      // Very basic structural validation
      return true;
    } catch (error) {
      console.error('Quick validation failed:', error);
      return false;
    }
  }

  /**
   * Generate reflection report for debugging
   */
  generateReflectionReport(result: ReflectionResult): string {
    const lines: string[] = [
      '=== Self-Reflection Report ===',
      `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
      '',
      'Evidence Collected:',
      ...result.evidence.map(e => `  - ${e}`),
      ''
    ];

    if (result.screenshotAnalysis) {
      lines.push(
        'Screenshot Analysis:',
        `  Total: ${result.screenshotAnalysis.totalScreenshots}`,
        `  Elements: ${result.screenshotAnalysis.visibleElements.join(', ')}`,
        `  Errors: ${result.screenshotAnalysis.errors.join(', ')}`,
        ''
      );
    }

    if (result.consoleAnalysis) {
      lines.push(
        'Console Analysis:',
        `  Total Errors: ${result.consoleAnalysis.totalErrors}`,
        `  Messages: ${result.consoleAnalysis.errorMessages.join(', ')}`,
        ''
      );
    }

    if (result.failureReason) {
      lines.push(`Failure Reason: ${result.failureReason}`);
    }

    return lines.join('\n');
  }
}
