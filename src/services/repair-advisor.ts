/**
 * AI Repair Advisor Service
 * Analyzes verification failures and generates actionable repair suggestions
 */

import { TestResult, CheckResult } from '../types';
import { logger } from '../utils/logger';

export interface RepairSuggestion {
  category: 'timeout' | 'element-not-found' | 'visual-diff' | 'assertion' | 'network' | 'auth' | 'general';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
  confidence: number;
  relatedCheck?: string;
}

export interface RepairAnalysis {
  suggestions: RepairSuggestion[];
  summary: string;
  analyzedAt: string;
}

/**
 * Failure patterns for categorization
 */
const FAILURE_PATTERNS = {
  timeout: [
    /timeout/i,
    /timed out/i,
    /waiting.*failed/i,
    /exceeded.*timeout/i,
    /element.*not visible/i,
  ],
  elementNotFound: [
    /not found/i,
    /no element matching/i,
    /failed to find/i,
    /selector.*did not match/i,
    /cannot find/i,
    /unable to locate/i,
  ],
  visualDiff: [
    /visual.*diff/i,
    /screenshot.*diff/i,
    /image.*comparison/i,
    /baseline.*mismatch/i,
    /pixel.*diff/i,
  ],
  assertion: [
    /assertion.*failed/i,
    /expected.*but got/i,
    /should be/i,
    /assert/i,
    /condition.*not met/i,
  ],
  network: [
    /network error/i,
    /failed to fetch/i,
    /connection/i,
    /request failed/i,
    /status code/i,
    /50\d/i,
    /40\d/i,
  ],
  auth: [
    /unauthorized/i,
    /authentication/i,
    /login.*failed/i,
    /401/i,
    /403/i,
    /forbidden/i,
    /session/i,
  ],
};

/**
 * Suggestion templates for each failure category
 */
const SUGGESTION_TEMPLATES: Record<string, { description: string; fixes: string[] }> = {
  timeout: {
    description: 'The operation exceeded the expected time limit',
    fixes: [
      'Increase the timeout for this check or the overall test',
      'Check if the page is loading slowly due to network issues',
      'Add a wait condition for specific elements before performing actions',
      'Consider using longer retry intervals for flaky networks',
    ],
  },
  'element-not-found': {
    description: 'Could not locate the specified element on the page',
    fixes: [
      'Verify the CSS selector is correct and matches the intended element',
      'Add a wait condition to ensure the element is present in the DOM',
      'Check if the element is inside an iframe or shadow DOM',
      'Consider using more robust selectors (data-testid, specific classes)',
      'Verify the page has fully loaded before checking for the element',
    ],
  },
  'visual-diff': {
    description: 'Visual comparison detected differences from the baseline',
    fixes: [
      'Review the screenshot differences to determine if they are expected',
      'Update the baseline if the changes are intentional',
      'Check for dynamic content that may cause visual variations',
      'Consider ignoring certain regions (dates, counters, timestamps)',
      'Verify the browser viewport dimensions match the baseline',
    ],
  },
  assertion: {
    description: 'An assertion or expectation was not met',
    fixes: [
      'Verify the expected value matches the actual behavior of the application',
      'Check if the application state has changed since the test was written',
      'Review the assertion logic for correct comparison operators',
      'Ensure the application is in the correct state before asserting',
    ],
  },
  network: {
    description: 'A network request failed or returned an unexpected status',
    fixes: [
      'Verify the server is running and accessible',
      'Check if the URL is correct and the service is available',
      'Review authentication headers and API tokens',
      'Consider adding retry logic for transient network failures',
      'Check for CORS or CSP issues that might block requests',
    ],
  },
  auth: {
    description: 'Authentication or authorization failed',
    fixes: [
      'Verify login credentials are correct and up to date',
      'Check if the authentication flow has changed',
      'Review session token handling and expiration',
      'Ensure the user has the required permissions for the resource',
      'Check for multi-factor authentication that may interrupt the flow',
    ],
  },
  general: {
    description: 'An unspecified error occurred during verification',
    fixes: [
      'Review the full error message and stack trace for details',
      'Check if all required dependencies and resources are available',
      'Verify the test environment is properly configured',
      'Consider enabling verbose logging for more debugging information',
    ],
  },
};

/**
 * AI Repair Advisor Service
 */
export class RepairAdvisor {
  constructor() {}

  /**
   * Categorize a failure based on its message and context
   */
  private categorizeFailure(check: CheckResult, result: TestResult): RepairSuggestion['category'] {
    const message = check.message.toLowerCase();
    const checkType = check.type.toLowerCase();

    // Check each category pattern
    for (const [category, patterns] of Object.entries(FAILURE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(message) || pattern.test(checkType)) {
          return category as RepairSuggestion['category'];
        }
      }
    }

    // Type-based fallback
    if (checkType.includes('auth') || checkType.includes('login')) {
      return 'auth';
    }
    if (checkType.includes('network') || checkType.includes('api')) {
      return 'network';
    }
    if (checkType.includes('visual') || checkType.includes('screenshot')) {
      return 'visual-diff';
    }

    return 'general';
  }

  /**
   * Determine severity based on check details
   */
  private determineSeverity(check: CheckResult): RepairSuggestion['severity'] {
    if (check.severity === 'critical') {
      return 'critical';
    }
    if (check.severity === 'warning') {
      return 'low';
    }

    // Infer severity from check type
    const checkType = check.type.toLowerCase();
    if (checkType.includes('auth') || checkType.includes('security')) {
      return 'critical';
    }
    if (checkType.includes('network') || checkType.includes('api')) {
      return 'high';
    }
    if (checkType.includes('timeout')) {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * Calculate confidence score for a suggestion
   */
  private calculateConfidence(check: CheckResult, category: RepairSuggestion['category']): number {
    let confidence = 0.5; // Base confidence

    const message = check.message.toLowerCase();

    // High confidence for explicit error messages
    if (category === 'timeout' && /timeout|timed out/i.test(message)) {
      confidence = 0.9;
    } else if (category === 'element-not-found' && /not found|selector/i.test(message)) {
      confidence = 0.85;
    } else if (category === 'network' && /network|connection|failed to fetch/i.test(message)) {
      confidence = 0.8;
    } else if (category === 'auth' && /unauthorized|401|403|authentication/i.test(message)) {
      confidence = 0.9;
    } else if (category === 'visual-diff' && /diff|baseline|comparison/i.test(message)) {
      confidence = 0.85;
    } else if (category === 'assertion' && /assertion|expected|should/i.test(message)) {
      confidence = 0.75;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate a suggested fix based on category and context
   */
  private generateSuggestedFix(check: CheckResult, category: RepairSuggestion['category']): string {
    const template = SUGGESTION_TEMPLATES[category] || SUGGESTION_TEMPLATES.general;

    // Select the most relevant fix based on check details
    let suggestedFix = template.fixes[0];

    const message = check.message.toLowerCase();

    // Customize based on message content
    if (category === 'timeout') {
      if (/waiting/i.test(message)) {
        suggestedFix = 'Add a waitFor or waitUntil condition before this action';
      } else if (/element.*not visible/i.test(message)) {
        suggestedFix = 'Use waitForSelector with { state: "visible" } option';
      } else {
        suggestedFix = `Increase timeout for "${check.name}" check`;
      }
    } else if (category === 'element-not-found') {
      if (/selector/i.test(message)) {
        suggestedFix = 'Verify and update the CSS selector - consider using data-testid attributes';
      } else if (/iframe/i.test(message)) {
        suggestedFix = 'Switch to the iframe context before locating the element';
      } else {
        suggestedFix = `Add await page.waitForSelector("${check.name}") before accessing`;
      }
    } else if (category === 'network') {
      if (/50\d/i.test(message)) {
        suggestedFix = 'Server error detected - verify backend service is running';
      } else if (/404/i.test(message)) {
        suggestedFix = 'Resource not found - check if URL or endpoint has changed';
      } else {
        suggestedFix = 'Verify network connectivity and API availability';
      }
    } else if (category === 'auth') {
      suggestedFix = 'Review authentication flow - check credentials and session handling';
    }

    return suggestedFix;
  }

  /**
   * Analyze a single failed check and generate a repair suggestion
   */
  private analyzeFailedCheck(check: CheckResult, result: TestResult): RepairSuggestion {
    const category = this.categorizeFailure(check, result);
    const severity = this.determineSeverity(check);
    const confidence = this.calculateConfidence(check, category);
    const suggestedFix = this.generateSuggestedFix(check, category);
    const template = SUGGESTION_TEMPLATES[category];

    return {
      category,
      severity,
      description: template.description,
      suggestedFix,
      confidence,
      relatedCheck: check.name,
    };
  }

  /**
   * Analyze failures from a test result
   */
  analyzeFailure(jobId: string, result: TestResult): RepairAnalysis {
    logger.info(`Analyzing failures for job ${jobId}`);

    const suggestions: RepairSuggestion[] = [];

    // Analyze each failed check
    for (const check of result.checks) {
      if (!check.passed) {
        const suggestion = this.analyzeFailedCheck(check, result);
        suggestions.push(suggestion);
      }
    }

    // Analyze global errors
    for (const error of result.errors) {
      suggestions.push({
        category: 'general',
        severity: 'high',
        description: 'Global error occurred during verification',
        suggestedFix: `Review error: ${error}. Check test configuration and environment.`,
        confidence: 0.7,
      });
    }

    // Sort by severity and confidence
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });

    // Generate summary
    const summary = this.generateSummary(suggestions, result);

    return {
      suggestions,
      summary,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a human-readable summary of the analysis
   */
  private generateSummary(suggestions: RepairSuggestion[], result: TestResult): string {
    if (suggestions.length === 0) {
      return 'No failures detected - all checks passed!';
    }

    const categoryCounts = suggestions.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const parts: string[] = [];

    // Total failures
    parts.push(`${suggestions.length} failure${suggestions.length > 1 ? 's' : ''} detected`);

    // Breakdown by category
    for (const [category, count] of Object.entries(categoryCounts)) {
      parts.push(`${count} ${category}`);
    }

    // Severity breakdown
    const criticalCount = suggestions.filter((s) => s.severity === 'critical').length;
    const highCount = suggestions.filter((s) => s.severity === 'high').length;
    if (criticalCount > 0) {
      parts.push(`${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention`);
    } else if (highCount > 0) {
      parts.push(`${highCount} high priority issue${highCount > 1 ? 's' : ''}`);
    }

    return parts.join('. ') + '.';
  }
}

// Extended methods for job-based analysis
export class RepairAdvisorWithStore extends RepairAdvisor {
  private store: any;

  constructor(store: any) {
    super();
    this.store = store;
  }

  async analyzeJob(jobId: string): Promise<RepairAnalysis | null> {
    const result = this.store.get ? this.store.get(jobId) : null;
    if (!result) return null;
    return this.analyzeFailure(jobId, result);
  }
}
