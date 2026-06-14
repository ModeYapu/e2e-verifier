/**
 * Example Plugin: Accessibility Check
 *
 * Enforces a configurable accessibility policy on verification results.
 *
 * The plugin reads accessibility findings from the shared metadata channel
 * (`ctx.metadata.a11y`), which the verifier (or a user-supplied adapter)
 * populates with WCAG-style issues. It then appends a CheckResult reflecting
 * whether the page meets the configured policy.
 *
 * Configuration:
 *   - maxIssues:        fail if there are more than this many issues (default 0)
 *   - failOnSeverities: fail if any issue matches one of these severities
 *                       (default ['error'])
 */

import type { Plugin, BeforeVerifyContext, AfterVerifyContext } from '../types';
import type { AccessibilityIssue } from '../../types';

export interface AccessibilityCheckOptions {
  /** Maximum number of allowed issues before the check fails. Default 0. */
  maxIssues?: number;
  /** Issue severities that fail the check outright. Default ['error']. */
  failOnSeverities?: Array<AccessibilityIssue['severity']>;
}

export function createAccessibilityCheckPlugin(options: AccessibilityCheckOptions = {}): Plugin {
  const maxIssues = options.maxIssues ?? 0;
  const failOnSeverities = options.failOnSeverities ?? ['error'];

  return {
    name: 'accessibility-check',
    version: '1.0.0',
    description: 'Enforces an accessibility policy based on WCAG-style findings.',

    beforeVerify(ctx: BeforeVerifyContext): void {
      // Advertise the policy so other plugins / the run can pre-emptively
      // collect a11y data into metadata.
      ctx.metadata.a11yPolicy = { maxIssues, failOnSeverities };
    },

    afterVerify(ctx: AfterVerifyContext): void {
      const issues = (ctx.metadata.a11y as AccessibilityIssue[] | undefined) ?? [];

      const failingSeverityHits = issues.filter(i => failOnSeverities.includes(i.severity));
      const overBudget = issues.length > maxIssues;
      const passed = failingSeverityHits.length === 0 && !overBudget;

      const detail = {
        totalIssues: issues.length,
        maxIssues,
        failingSeverityHits: failingSeverityHits.length,
        failOnSeverities,
      };

      const message = passed
        ? `Accessibility OK: ${issues.length} issue(s) within policy (max ${maxIssues})`
        : `Accessibility failed: ${issues.length} issue(s) ` +
          `(max ${maxIssues}` +
          (failingSeverityHits.length ? `, ${failingSeverityHits.length} at failing severity` : '') +
          `)`;

      ctx.additionalChecks.push({
        name: 'Accessibility Policy',
        type: 'accessibility',
        passed,
        severity: passed ? 'warning' : 'critical',
        message,
        details: detail,
      });
    },
  };
}
