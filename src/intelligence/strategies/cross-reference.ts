/**
 * Cross Reference Strategy — Cross-Validation Verification
 *
 * Performs cross-validation between different metrics and results:
 * - Performance metrics vs functional results
 * - Console errors vs failed steps
 * - Network requests vs assertions
 * - Patterns across multiple results
 */

import { VerificationStrategy, StrategyVerdict, StrategyIssue, VerificationContext } from '../verification-types';
import { ScenarioResult } from '../types';

export class CrossReferenceStrategy implements VerificationStrategy {
  name = 'cross-reference';

  async verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict> {
    const issues: StrategyIssue[] = [];
    const evidence: string[] = [];

    // Cross-validate performance with functional results
    const perfIssues = this.crossValidatePerformance(result);
    issues.push(...perfIssues);

    // Cross-validate console errors with failed steps
    const consoleIssues = this.crossValidateConsoleErrors(result);
    issues.push(...consoleIssues);

    // Cross-validate network with assertions
    const networkIssues = this.crossValidateNetworkRequests(result);
    issues.push(...networkIssues);

    // Check for patterns across multiple results
    const patternIssues = this.checkPatternsAcrossResults(result, context);
    issues.push(...patternIssues);

    // Cross-validate timing with complexity
    const timingIssues = this.crossValidateTiming(result);
    issues.push(...timingIssues);

    // Generate evidence
    if (issues.length === 0) {
      evidence.push('Performance metrics align with functional results');
      evidence.push('Console errors correlate with failed steps');
      evidence.push('Network requests match expectations');
    } else {
      evidence.push(`Found ${issues.length} cross-validation issue(s)`);
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(result, issues);

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      confidence,
      evidence,
      issues,
      metadata: {
        crossValidationsPerformed: 5,
        inconsistenciesFound: issues.length,
      },
    };
  }

  /**
   * Cross-validate performance metrics with functional results
   */
  private crossValidatePerformance(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Extract performance metrics
    const perfArtifacts = result.artifacts.filter(a => a.type === 'performance-metrics');
    const perfAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'performance');

    // Check if performance issues correlate with functional failures
    const functionalFailures = result.stepResults.filter(sr => !sr.passed).length;
    const performanceFailures = perfAssertions.filter(ar => !ar.passed).length;

    if (performanceFailures > 0 && functionalFailures === 0) {
      issues.push({
        severity: 'medium',
        category: 'performance-functional-mismatch',
        description: `Performance metrics show issues (${performanceFailures} failures) but functional steps all passed - might indicate non-critical performance degradation`,
        evidence: perfAssertions.filter(ar => !ar.passed).map(ar =>
          `Performance assertion "${ar.assertion.description}" failed`
        ),
      });
    }

    // Check for extreme performance without functional issues
    perfArtifacts.forEach(artifact => {
      if (artifact.metadata && typeof artifact.metadata === 'object') {
        const duration = (artifact.metadata as any).duration || (artifact.metadata as any).loadTime;
        if (typeof duration === 'number') {
          if (duration > 10000) { // 10 seconds
            issues.push({
              severity: 'low',
              category: 'performance-extreme',
              description: `Extremely slow performance detected (${duration}ms) but no functional failures - consider performance optimization`,
              evidence: [`Duration: ${duration}ms`],
            });
          }
        }
      }
    });

    // Check performance assertion consistency
    perfAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        const threshold = assertionResult.assertion.expected;
        const actual = assertionResult.actual;

        if (typeof actual === 'number' && typeof threshold === 'number') {
          const ratio = actual / threshold;
          if (ratio > 10) {
            issues.push({
              severity: 'high',
              category: 'performance-extreme-violation',
              description: `Performance threshold exceeded by factor of ${ratio.toFixed(1)}: ${actual}ms vs ${threshold}ms`,
              evidence: [`Actual: ${actual}ms, Threshold: ${threshold}ms, Ratio: ${ratio.toFixed(1)}`],
            });
          }
        }
      }
    });

    return issues;
  }

  /**
   * Cross-validate console errors with failed steps
   */
  private crossValidateConsoleErrors(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Extract console errors
    const consoleErrors: Array<{ step: string; errors: string[] }> = [];

    result.stepResults.forEach(stepResult => {
      if (stepResult.consoleLogs) {
        const errors = stepResult.consoleLogs
          .filter(log => log.level === 'error')
          .map(log => log.message);

        if (errors.length > 0) {
          consoleErrors.push({
            step: stepResult.step.id,
            errors,
          });
        }
      }
    });

    // Check if console errors correlate with step failures
    const stepsWithConsoleErrors = new Set(consoleErrors.map(ce => ce.step));
    const failedSteps = result.stepResults.filter(sr => !sr.passed).map(sr => sr.step.id);

    let consoleErrorsWithoutFailure = 0;
    let failuresWithoutConsoleErrors = 0;

    consoleErrors.forEach(({ step, errors }) => {
      if (!failedSteps.includes(step)) {
        consoleErrorsWithoutFailure += errors.length;
      }
    });

    failedSteps.forEach(stepId => {
      if (!stepsWithConsoleErrors.has(stepId)) {
        failuresWithoutConsoleErrors++;
      }
    });

    // Report console errors without step failures
    if (consoleErrorsWithoutFailure > 0) {
      issues.push({
        severity: 'low',
        category: 'console-error-mismatch',
        description: `Found ${consoleErrorsWithoutFailure} console error(s) in steps that passed - might indicate hidden issues`,
        evidence: consoleErrors
          .filter(({ step }) => !failedSteps.includes(step))
          .map(({ errors }) => errors[0])
          .slice(0, 3),
      });
    }

    // Report step failures without console errors
    if (failuresWithoutConsoleErrors > 0) {
      // Not necessarily an issue, but worth noting
      if (failuresWithoutConsoleErrors > failedSteps.length * 0.5) {
        issues.push({
          severity: 'low',
          category: 'failure-console-mismatch',
          description: `Most step failures (${failuresWithoutConsoleErrors}/${failedSteps.length}) have no console errors - might be selector/timing issues`,
          evidence: [`Failed steps without console errors: ${failuresWithoutConsoleErrors}`],
        });
      }
    }

    // Check for critical console errors
    const criticalErrors = consoleErrors.flatMap(({ errors }) =>
      errors.filter(err =>
        err.toLowerCase().includes('uncaught') ||
        err.toLowerCase().includes('typeerror') ||
        err.toLowerCase().includes('referenceerror')
      )
    );

    if (criticalErrors.length > 0) {
      const hasCriticalFailures = result.stepResults.some(sr =>
        !sr.passed && sr.step.critical !== false
      );

      if (!hasCriticalFailures) {
        issues.push({
          severity: 'high',
          category: 'console-critical-no-failure',
          description: `Critical console error(s) found but no critical step failures - test might be missing error detection`,
          evidence: criticalErrors.slice(0, 3),
        });
      }
    }

    return issues;
  }

  /**
   * Cross-validate network requests with assertions
   */
  private crossValidateNetworkRequests(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Extract network artifacts
    const networkArtifacts = result.artifacts.filter(a => a.type === 'network-log' || a.type === 'har');
    const networkAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'network');

    // Check if network assertions correlate with actual network issues
    if (networkArtifacts.length === 0 && networkAssertions.length > 0) {
      issues.push({
        severity: 'medium',
        category: 'network-missing-artifacts',
        description: `Network assertions defined (${networkAssertions.length}) but no network artifacts collected`,
        evidence: networkAssertions.map(ar => `Assertion: "${ar.assertion.description}"`),
      });
    }

    // Check network assertion results
    networkAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        // Check if there are corresponding step failures
        const networkRelatedStepFailures = result.stepResults.filter(sr =>
          !sr.passed && sr.error && sr.error.toLowerCase().includes('network')
        );

        if (networkRelatedStepFailures.length === 0) {
          issues.push({
            severity: 'medium',
            category: 'network-assertion-mismatch',
            description: `Network assertion failed but no network-related step failures detected`,
            evidence: [`Failed assertion: "${assertionResult.assertion.description}"`],
          });
        }
      }
    });

    // Check for network errors in console
    const networkErrorsInConsole: string[] = [];
    result.stepResults.forEach(stepResult => {
      if (stepResult.consoleLogs) {
        stepResult.consoleLogs.forEach(log => {
          if (log.level === 'error' && log.message.toLowerCase().includes('network')) {
            networkErrorsInConsole.push(log.message);
          }
        });
      }
    });

    if (networkErrorsInConsole.length > 0) {
      const hasNetworkAssertions = networkAssertions.length > 0;
      if (!hasNetworkAssertions) {
        issues.push({
          severity: 'low',
          category: 'network-error-no-assertion',
          description: `Network errors detected in console but no network assertions defined`,
          evidence: networkErrorsInConsole.slice(0, 3),
        });
      }
    }

    return issues;
  }

  /**
   * Check for patterns across multiple results
   */
  private checkPatternsAcrossResults(result: ScenarioResult, context: VerificationContext): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check if we have previous results for comparison
    if (!context.previousResults || context.previousResults.length === 0) {
      return issues;
    }

    // Compare with previous results
    const previousResults = context.previousResults.filter(pr => pr.scenarioId === result.scenarioId);

    if (previousResults.length === 0) {
      return issues;
    }

    // Check for flakiness patterns
    const passedCount = previousResults.filter(pr => pr.passed).length;
    const totalCount = previousResults.length;
    const passRate = passedCount / totalCount;

    if (passRate < 1.0 && passRate > 0.0) {
      issues.push({
        severity: 'medium',
        category: 'flaky-pattern',
        description: `Scenario shows flaky behavior across runs (${passedCount}/${totalCount} passed, ${(passRate * 100).toFixed(1)}% pass rate)`,
        evidence: [
          `Previous results: ${passedCount} passed, ${totalCount - passedCount} failed`,
          `Current result: ${result.passed ? 'passed' : 'failed'}`,
        ],
      });
    }

    // Check for performance degradation
    const currentDuration = result.duration;
    const avgPreviousDuration = previousResults.reduce((sum, pr) => sum + pr.duration, 0) / previousResults.length;

    if (currentDuration > avgPreviousDuration * 1.5) {
      issues.push({
        severity: 'medium',
        category: 'performance-degradation',
        description: `Execution time degraded significantly: ${currentDuration}ms vs average ${avgPreviousDuration.toFixed(0)}ms`,
        evidence: [
          `Current: ${currentDuration}ms`,
          `Average previous: ${avgPreviousDuration.toFixed(0)}ms`,
          `Degradation: ${((currentDuration / avgPreviousDuration - 1) * 100).toFixed(1)}%`,
        ],
      });
    }

    // Check for consistent failure points
    const currentFailures = result.stepResults.filter(sr => !sr.passed).map(sr => sr.step.id);
    const commonFailurePoints = new Set<string>();

    previousResults.forEach(previousResult => {
      const previousFailures = previousResult.stepResults.filter(sr => !sr.passed).map(sr => sr.step.id);
      currentFailures.forEach(failureId => {
        if (previousFailures.includes(failureId)) {
          commonFailurePoints.add(failureId);
        }
      });
    });

    if (commonFailurePoints.size > 0) {
      issues.push({
        severity: 'high',
        category: 'consistent-failure',
        description: `Same step(s) consistently failing across multiple runs: ${Array.from(commonFailurePoints).join(', ')}`,
        evidence: Array.from(commonFailurePoints).map(id => `Step ${id}`),
      });
    }

    return issues;
  }

  /**
   * Cross-validate timing with complexity
   */
  private crossValidateTiming(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Calculate expected duration based on step count
    const stepCount = result.stepResults.length;
    const avgStepDuration = result.duration / stepCount;

    // Check for unusually slow steps
    result.stepResults.forEach(stepResult => {
      if (stepResult.duration > avgStepDuration * 3) {
        issues.push({
          severity: 'low',
          category: 'timing-outlier',
          description: `Step "${stepResult.step.description}" took ${stepResult.duration}ms (${(stepResult.duration / avgStepDuration).toFixed(1)}x average)`,
          evidence: [
            `Step duration: ${stepResult.duration}ms`,
            `Average step duration: ${avgStepDuration.toFixed(0)}ms`,
          ],
        });
      }
    });

    // Check total duration vs step count
    const expectedDuration = stepCount * 1000; // Assume 1 second per step
    if (result.duration > expectedDuration * 2) {
      issues.push({
        severity: 'medium',
        category: 'timing-excessive',
        description: `Total execution time ${result.duration}ms seems excessive for ${stepCount} steps`,
        evidence: [
          `Total steps: ${stepCount}`,
          `Expected duration: ~${expectedDuration}ms`,
          `Actual duration: ${result.duration}ms`,
        ],
      });
    }

    // Check for rapid retries
    if (result.retryCount && result.retryCount > 0) {
      const avgRetryDuration = result.duration / (result.retryCount + 1);
      if (avgRetryDuration < 5000) { // Less than 5 seconds per attempt
        issues.push({
          severity: 'low',
          category: 'timing-rapid-retry',
          description: `Rapid retries detected (${result.retryCount} retries in ${result.duration}ms) - might not be addressing root cause`,
          evidence: [
            `Retries: ${result.retryCount}`,
            `Total duration: ${result.duration}ms`,
            `Average per attempt: ${avgRetryDuration.toFixed(0)}ms`,
          ],
        });
      }
    }

    return issues;
  }

  /**
   * Calculate confidence based on issues
   */
  private calculateConfidence(result: ScenarioResult, issues: StrategyIssue[]): number {
    let confidence = 1.0;

    // Reduce confidence based on issue severity
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const mediumIssues = issues.filter(i => i.severity === 'medium').length;
    const lowIssues = issues.filter(i => i.severity === 'low').length;

    confidence -= criticalIssues * 0.3;
    confidence -= highIssues * 0.2;
    confidence -= mediumIssues * 0.1;
    confidence -= lowIssues * 0.05;

    return Math.max(0, Math.min(1, confidence));
  }
}