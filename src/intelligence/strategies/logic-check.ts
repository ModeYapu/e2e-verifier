/**
 * Logic Check Strategy — Logic Consistency Verification
 *
 * Verifies logical consistency of test results including:
 * - Assertion contradictions
 * - Step ordering consistency
 * - Data consistency (sums, counts match)
 */

import { VerificationStrategy, StrategyVerdict, StrategyIssue, VerificationContext } from '../verification-types';
import { ScenarioResult } from '../types';

export class LogicCheckStrategy implements VerificationStrategy {
  name = 'logic-check';

  async verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict> {
    const issues: StrategyIssue[] = [];
    const evidence: string[] = [];

    // Check for assertion contradictions
    const contradictionIssues = this.checkAssertionContradictions(result);
    issues.push(...contradictionIssues);

    // Check step ordering
    const orderingIssues = this.checkStepOrdering(result);
    issues.push(...orderingIssues);

    // Check data consistency
    const consistencyIssues = this.checkDataConsistency(result, context);
    issues.push(...consistencyIssues);

    // Check for logical inconsistencies
    const logicalIssues = this.checkLogicalConsistency(result);
    issues.push(...logicalIssues);

    // Generate evidence
    if (issues.length === 0) {
      evidence.push('No logical contradictions found');
      evidence.push('Step ordering is consistent');
      evidence.push('Data consistency checks passed');
    } else {
      evidence.push(`Found ${issues.length} logical issue(s)`);
    }

    // Calculate confidence based on issues found
    const confidence = this.calculateConfidence(result, issues);

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      confidence,
      evidence,
      issues,
      metadata: {
        totalChecks: 4,
        failedChecks: issues.length,
      },
    };
  }

  /**
   * Check for assertion contradictions
   */
  private checkAssertionContradictions(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];
    const assertionResults = result.assertionResults;

    // Check for contradictory element existence assertions
    const existenceChecks = assertionResults.filter(ar =>
      ar.assertion.type === 'element-exists' || ar.assertion.type === 'element-visible'
    );

    if (existenceChecks.length >= 2) {
      const hasPassed = existenceChecks.some(ar => ar.passed);
      const hasFailed = existenceChecks.some(ar => !ar.passed);

      if (hasPassed && hasFailed) {
        issues.push({
          severity: 'high',
          category: 'contradiction',
          description: 'Contradictory element existence results found - some elements exist but others do not',
          evidence: existenceChecks.filter(ar => !ar.passed).map(ar =>
            `Assertion "${ar.assertion.description}" failed`
          ),
        });
      }
    }

    // Check for contradictory text assertions
    const textAssertions = assertionResults.filter(ar =>
      ar.assertion.type === 'text-contains' || ar.assertion.type === 'text-equals'
    );

    textAssertions.forEach(assertionResult => {
      if (!assertionResult.passed && assertionResult.actual) {
        // Check if the actual text is the opposite of expected
        const expected = assertionResult.assertion.expected as string;
        const actual = assertionResult.actual as string;

        if (actual.includes('not') && !actual.includes(expected)) {
          issues.push({
            severity: 'medium',
            category: 'contradiction',
            description: `Text assertion "${assertionResult.assertion.description}" failed with negation result`,
            stepId: assertionResult.assertion.selector,
            evidence: [`Expected: "${expected}", Actual: "${actual}"`],
          });
        }
      }
    });

    return issues;
  }

  /**
   * Check step ordering consistency
   */
  private checkStepOrdering(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];
    const stepResults = result.stepResults;

    // Check if earlier steps failed but later steps passed
    for (let i = 0; i < stepResults.length; i++) {
      const currentStep = stepResults[i];

      if (!currentStep.passed && currentStep.step.critical !== false) {
        // Check if any subsequent steps passed
        for (let j = i + 1; j < stepResults.length; j++) {
          const subsequentStep = stepResults[j];
          if (subsequentStep.passed) {
            issues.push({
              severity: 'high',
              category: 'ordering',
              description: `Step "${currentStep.step.description}" failed but subsequent step "${subsequentStep.step.description}" passed - inconsistent execution flow`,
              stepId: currentStep.step.id,
              evidence: [
                `Failed step ${i}: ${currentStep.step.description}`,
                `Passed step ${j}: ${subsequentStep.step.description}`,
              ],
            });
            break;
          }
        }
      }
    }

    // Check navigation timing
    const navigationSteps = stepResults.filter(sr => sr.step.action === 'navigate' || sr.step.action === 'goto');
    navigationSteps.forEach((navStep, index) => {
      if (navStep.passed && navStep.duration > 5000) {
        // Very slow navigation might indicate issues
        issues.push({
          severity: 'low',
          category: 'timing',
          description: `Navigation step "${navStep.step.description}" took ${navStep.duration}ms - unusually slow`,
          stepId: navStep.step.id,
          evidence: [`Duration: ${navStep.duration}ms`],
        });
      }
    });

    return issues;
  }

  /**
   * Check data consistency
   */
  private checkDataConsistency(result: ScenarioResult, context: VerificationContext): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check element count assertions
    const countAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'element-count');
    countAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        const expected = assertionResult.assertion.expected as number;
        const actual = assertionResult.actual as number;

        if (typeof actual === 'number') {
          const difference = Math.abs(expected - actual);
          const percentage = (difference / expected) * 100;

          if (percentage > 50) {
            issues.push({
              severity: 'high',
              category: 'data-consistency',
              description: `Element count mismatch is large: expected ${expected}, got ${actual} (${percentage.toFixed(1)}% difference)`,
              evidence: [`Expected: ${expected}, Actual: ${actual}`],
            });
          } else if (percentage > 10) {
            issues.push({
              severity: 'medium',
              category: 'data-consistency',
              description: `Element count mismatch: expected ${expected}, got ${actual} (${percentage.toFixed(1)}% difference)`,
              evidence: [`Expected: ${expected}, Actual: ${actual}`],
            });
          }
        }
      }
    });

    // Check URL consistency
    const urlAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'url-matches');
    urlAssertions.forEach(assertionResult => {
      if (!assertionResult.passed && assertionResult.actual) {
        const expected = assertionResult.assertion.expected as string;
        const actual = assertionResult.actual as string;

        issues.push({
          severity: 'medium',
          category: 'url-consistency',
          description: `URL pattern mismatch: expected "${expected}", got "${actual}"`,
          evidence: [`Expected: ${expected}, Actual: ${actual}`],
        });
      }
    });

    // Check performance data consistency
    const performanceAssertions = result.assertionResults.filter(ar => ar.assertion.type === 'performance');
    performanceAssertions.forEach(assertionResult => {
      if (!assertionResult.passed) {
        const threshold = assertionResult.assertion.expected;
        const actual = assertionResult.actual;

        if (typeof actual === 'object' && actual !== null && typeof threshold === 'number') {
          const metricValue = (actual as Record<string, unknown>).value || (actual as Record<string, unknown>).duration;
          if (typeof metricValue === 'number') {
            const ratio = metricValue / threshold;
            if (ratio > 2) {
              issues.push({
                severity: 'medium',
                category: 'performance-consistency',
                description: `Performance threshold exceeded significantly: ${metricValue}ms vs threshold ${threshold}ms`,
                evidence: [`Actual: ${metricValue}ms, Threshold: ${threshold}ms`],
              });
            }
          }
        }
      }
    });

    return issues;
  }

  /**
   * Check logical consistency
   */
  private checkLogicalConsistency(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check if result shows passed but has critical assertion failures
    const criticalFailures = result.assertionResults.filter(ar =>
      !ar.passed && ar.assertion.critical !== false
    );

    if (result.passed && criticalFailures.length > 0) {
      issues.push({
        severity: 'critical',
        category: 'logical-inconsistency',
        description: `Result marked as passed but ${criticalFailures.length} critical assertion(s) failed - logical inconsistency`,
        evidence: criticalFailures.map(ar => `Failed: "${ar.assertion.description}"`),
      });
    }

    // Check if result shows failed but no clear failures
    if (!result.passed) {
      const failedSteps = result.stepResults.filter(sr => !sr.passed && sr.step.critical !== false);
      const failedAssertions = result.assertionResults.filter(ar => !ar.passed && ar.assertion.critical !== false);

      if (failedSteps.length === 0 && failedAssertions.length === 0) {
        issues.push({
          severity: 'high',
          category: 'logical-inconsistency',
          description: 'Result marked as failed but no critical failures found - unclear failure reason',
        });
      }
    }

    // Check console error consistency
    const consoleErrors = this.extractConsoleErrors(result);
    const hasErrorAssertions = result.assertionResults.some(ar => ar.assertion.type === 'console');

    if (consoleErrors.length > 0 && !hasErrorAssertions) {
      issues.push({
        severity: 'low',
        category: 'consistency',
        description: `Found ${consoleErrors.length} console error(s) but no console assertions - consider adding console checks`,
        evidence: consoleErrors.slice(0, 3), // First 3 errors
      });
    }

    return issues;
  }

  /**
   * Extract console errors from result
   */
  private extractConsoleErrors(result: ScenarioResult): string[] {
    const errors: string[] = [];

    result.stepResults.forEach(stepResult => {
      if (stepResult.consoleLogs) {
        stepResult.consoleLogs.forEach(log => {
          if (log.level === 'error') {
            errors.push(log.message);
          }
        });
      }
    });

    return errors;
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