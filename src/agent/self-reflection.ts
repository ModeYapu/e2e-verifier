/**
 * Self-Reflection Gate for Agent Loop
 * Implements Webwright's key mechanism to prevent false "done" declarations
 */

import { ScriptEngine } from './script-engine';
import { ReflectionResult, ScriptExecutionResult } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Raw shape of a single assertion entry as emitted by an agent script inside
 * the `__assertions__.results` array. Fields are all optional because the
 * script output is untrusted.
 */
interface RawAssertionResult {
  readonly name?: string;
  readonly passed?: unknown;
  readonly message?: unknown;
}

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
    logger.info('=== Starting Self-Reflection Validation ===');
    logger.info(`Target URL: ${url}`);
    logger.info(`Script length: ${script.length} characters`);

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
      logger.info('Executing script for reflection...');
      const result = await this.scriptEngine.executeScript(scriptPath, {
        timeout: 30000
      });

      // Analyze execution results
      logger.info('Analyzing execution results...');

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

      // Parse STRUCTURED assertion results from stdout instead of guessing
      // from keywords like "passed"/"OK"/"✓". Scripts emit a JSON line with
      // an `__assertions__` marker to report their outcome deterministically.
      const assertions = result.stdout ? this.parseStructuredAssertions(result.stdout) : null;

      if (assertions) {
        evidence.push(
          `Structured assertions: ${assertions.passed} passed / ${assertions.failed} failed` +
          (assertions.results ? ` (${assertions.results.length} recorded)` : '')
        );
        for (const r of assertions.results || []) {
          if (!r.passed) {
            evidence.push(`Failed assertion: ${r.name}${r.message ? ` — ${r.message}` : ''}`);
          }
        }
      } else if (result.success) {
        evidence.push('No structured assertions emitted (script did not report a JSON `__assertions__` result)');
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
            logger.warn(`Failed to analyze screenshot ${screenshotPath}: ${error}`);
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
      const passed = this.determinePassStatus(result, assertions, consoleAnalysis);

      logger.info(`=== Reflection Result: ${passed ? 'PASSED' : 'FAILED'} ===`);
      logger.info(`Evidence collected: ${evidence.length} items`);
      logger.info(`Screenshots: ${screenshotAnalysis.totalScreenshots}`);
      logger.info(`Console errors: ${consoleAnalysis.totalErrors}`);

      return {
        passed,
        evidence,
        screenshotAnalysis,
        consoleAnalysis,
        assertions: assertions || undefined,
        failureReason: passed ? undefined : this.generateFailureReason(result, assertions, consoleAnalysis)
      };

    } catch (error) {
      const errorMessage = `Reflection validation error: ${error}`;
      logger.error(errorMessage);
      
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
   * Parse a structured assertion summary from script stdout.
   *
   * Agent scripts report their outcome deterministically by printing a JSON
   * line tagged with an `__assertions__` key, e.g.:
   *   {"__assertions__":{"passed":3,"failed":0,"results":[...]}}
   *
   * Returns the normalised summary, or null if the script emitted no such
   * marker (in which case we cannot confirm success and must fail-closed).
   */
  private parseStructuredAssertions(
    stdout: string
  ): { total: number; passed: number; failed: number; results?: Array<{ name: string; passed: boolean; message?: string }> } | null {
    const lines = stdout.split('\n');
    // Scan from the end: the final structured report is the authoritative one.
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith('{') || !trimmed.includes('__assertions__')) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed);
        const a = parsed && typeof parsed === 'object' && parsed.__assertions__;
        if (!a || typeof a !== 'object') continue;

        const passed = Number(a.passed) || 0;
        const failed = Number(a.failed) || 0;
        const results = Array.isArray(a.results)
          ? (a.results as RawAssertionResult[])
              .map((r) => ({
                name: typeof (r && r.name) === 'string' ? r.name : 'unnamed',
                passed: !!((r && r.passed)),
                message: r && typeof r.message === 'string' ? r.message : undefined,
              }))
              .filter((r) => r)
          : undefined;

        return {
          total: results ? results.length : passed + failed,
          passed,
          failed,
          results,
        };
      } catch {
        // Not valid JSON / wrong shape — keep scanning.
      }
    }
    return null;
  }

  /**
   * Determine if reflection passed.
   *
   * Pass requires: successful execution, a structured assertion report with
   * zero failures, and no console errors. Free-form stdout keyword matching
   * was removed — it could not be trusted to reflect real assertion outcomes.
   */
  private determinePassStatus(
    result: ScriptExecutionResult,
    assertions: { passed: number; failed: number } | null,
    consoleAnalysis: ReflectionResult['consoleAnalysis']
  ): boolean {
    // Must have successful execution
    if (result.exitCode !== 0 || !result.success) {
      return false;
    }

    // Must have a structured assertion report with no failures. Absence of a
    // report means we cannot confirm success → fail closed.
    if (!assertions || assertions.failed > 0) {
      return false;
    }

    // Should not have console errors
    if (consoleAnalysis.totalErrors > 0) {
      return false;
    }

    return true;
  }

  /**
   * Generate human-readable failure reason
   */
  private generateFailureReason(
    result: ScriptExecutionResult,
    assertions: { passed: number; failed: number } | null,
    consoleAnalysis: ReflectionResult['consoleAnalysis']
  ): string {
    const reasons: string[] = [];

    if (result.exitCode !== 0) {
      reasons.push(`Script failed with exit code ${result.exitCode}`);
    }

    if (!result.success) {
      reasons.push('Script execution reported failure');
    }

    if (!assertions) {
      reasons.push('No structured assertion report emitted (script must print a JSON `__assertions__` line)');
    } else if (assertions.failed > 0) {
      reasons.push(`${assertions.failed} assertion(s) failed`);
    }

    if (consoleAnalysis.totalErrors > 0) {
      reasons.push(`Console errors detected (${consoleAnalysis.totalErrors} total)`);
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
      logger.error(`Quick validation failed: ${error}`);
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
