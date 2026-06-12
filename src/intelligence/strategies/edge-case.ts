/**
 * Edge Case Strategy — Boundary Condition Analysis
 *
 * Analyzes test scenarios for untested edge cases:
 * - Empty inputs, very long inputs, special characters
 * - Rapid clicks, concurrent operations
 * - Extreme viewport sizes
 * - Boundary conditions
 */

import { VerificationStrategy, StrategyVerdict, StrategyIssue, VerificationContext } from '../verification-types';
import { ScenarioResult, PlannedStep, PlannedAssertion } from '../types';

export class EdgeCaseStrategy implements VerificationStrategy {
  name = 'edge-case';

  async verify(result: ScenarioResult, context: VerificationContext): Promise<StrategyVerdict> {
    const issues: StrategyIssue[] = [];
    const evidence: string[] = [];
    const edgeCases = this.identifyEdgeCases(result, context);

    // Analyze identified edge cases
    const criticalIssues = this.analyzeCriticalEdgeCases(edgeCases);
    issues.push(...criticalIssues);

    // Check for input boundary testing
    const inputIssues = this.analyzeInputEdgeCases(result, context);
    issues.push(...inputIssues);

    // Check for timing edge cases
    const timingIssues = this.analyzeTimingEdgeCases(result);
    issues.push(...timingIssues);

    // Check for viewport edge cases
    const viewportIssues = this.analyzeViewportEdgeCases(result, context);
    issues.push(...viewportIssues);

    // Check for concurrency edge cases
    const concurrencyIssues = this.analyzeConcurrencyEdgeCases(result);
    issues.push(...concurrencyIssues);

    // Generate evidence
    if (issues.length === 0) {
      evidence.push('Edge case analysis completed - no critical gaps identified');
    } else {
      evidence.push(`Found ${issues.length} potential edge case issue(s)`);
      evidence.push(`Identified ${edgeCases.length} total edge cases to consider`);
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(result, edgeCases, issues);

    return {
      // Edge case strategy doesn't fail tests, just identifies gaps
      passed: true,
      confidence,
      evidence,
      issues,
      metadata: {
        totalEdgeCases: edgeCases.length,
        criticalEdgeCases: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length,
        recommendedTests: this.generateRecommendedTests(edgeCases),
      },
    };
  }

  /**
   * Identify potential edge cases from the scenario
   */
  private identifyEdgeCases(result: ScenarioResult, context: VerificationContext): EdgeCase[] {
    const edgeCases: EdgeCase[] = [];
    const scenario = context.plan.scenarios.find(s => s.id === result.scenarioId);

    if (!scenario) {
      return edgeCases;
    }

    // Analyze each step for potential edge cases
    scenario.steps.forEach(step => {
      const stepEdgeCases = this.analyzeStepForEdgeCases(step);
      edgeCases.push(...stepEdgeCases);
    });

    // Analyze assertions for edge cases
    scenario.assertions.forEach(assertion => {
      const assertionEdgeCases = this.analyzeAssertionForEdgeCases(assertion);
      edgeCases.push(...assertionEdgeCases);
    });

    return edgeCases;
  }

  /**
   * Analyze step for edge cases
   */
  private analyzeStepForEdgeCases(step: PlannedStep): EdgeCase[] {
    const edgeCases: EdgeCase[] = [];

    switch (step.action) {
      case 'type':
        if (step.value) {
          // Check for empty input edge case
          if (step.value.length > 0) {
            edgeCases.push({
              type: 'empty-input',
              category: 'input',
              description: `Test with empty input for field "${step.description}"`,
              severity: 'medium',
              testable: true,
            });
          }

          // Check for very long input edge case
          edgeCases.push({
            type: 'long-input',
            category: 'input',
            description: `Test with very long input (1000+ chars) for field "${step.description}"`,
            severity: 'low',
            testable: true,
          });

          // Check for special characters edge case
          if (!this.hasSpecialCharacters(step.value)) {
            edgeCases.push({
              type: 'special-characters',
              category: 'input',
              description: `Test with special characters (!@#$%^&*) for field "${step.description}"`,
              severity: 'medium',
              testable: true,
            });
          }

          // Check for SQL injection edge case
          if (!this.hasSQLInjectionPattern(step.value)) {
            edgeCases.push({
              type: 'sql-injection',
              category: 'security',
              description: `Test with SQL injection patterns for field "${step.description}"`,
              severity: 'high',
              testable: true,
            });
          }

          // Check for XSS edge case
          if (!this.hasXSSPattern(step.value)) {
            edgeCases.push({
              type: 'xss',
              category: 'security',
              description: `Test with XSS patterns for field "${step.description}"`,
              severity: 'high',
              testable: true,
            });
          }
        }
        break;

      case 'click':
        // Check for rapid click edge case
        edgeCases.push({
          type: 'rapid-click',
          category: 'timing',
          description: `Test rapid clicking on element "${step.description}"`,
          severity: 'medium',
          testable: true,
        });

        // Check for double-click edge case
        edgeCases.push({
          type: 'double-click',
          category: 'timing',
          description: `Test double-clicking on element "${step.description}"`,
          severity: 'low',
          testable: true,
        });
        break;

      case 'wait':
        // Check for timeout edge case
        if (step.waitAfter && step.waitAfter > 0) {
          edgeCases.push({
            type: 'timeout',
            category: 'timing',
            description: `Test with zero wait time after "${step.description}"`,
            severity: 'medium',
            testable: true,
          });
        }
        break;

      case 'scroll':
        // Check for extreme scroll edge case
        edgeCases.push({
          type: 'extreme-scroll',
          category: 'interaction',
          description: `Test extreme scrolling (very long page) for "${step.description}"`,
          severity: 'low',
          testable: true,
        });
        break;

      case 'select':
        // Check for no selection edge case
        edgeCases.push({
          type: 'no-selection',
          category: 'input',
          description: `Test with no selection for dropdown "${step.description}"`,
          severity: 'medium',
          testable: true,
        });
        break;
    }

    return edgeCases;
  }

  /**
   * Analyze assertion for edge cases
   */
  private analyzeAssertionForEdgeCases(assertion: PlannedAssertion): EdgeCase[] {
    const edgeCases: EdgeCase[] = [];

    switch (assertion.type) {
      case 'element-count':
        const count = assertion.expected as number;
        // Check for zero count edge case
        if (count > 0) {
          edgeCases.push({
            type: 'zero-count',
            category: 'boundary',
            description: `Test with zero elements matching "${assertion.selector}"`,
            severity: 'high',
            testable: true,
          });
        }

        // Check for very large count edge case
        edgeCases.push({
          type: 'large-count',
          category: 'boundary',
          description: `Test with very large element count (>100) for "${assertion.selector}"`,
          severity: 'low',
          testable: false,
        });
        break;

      case 'text-contains':
      case 'text-equals':
        // Check for empty text edge case
        edgeCases.push({
          type: 'empty-text',
          category: 'boundary',
          description: `Test with empty text for "${assertion.selector}"`,
          severity: 'medium',
          testable: true,
        });

        // Check for very long text edge case
        edgeCases.push({
          type: 'long-text',
          category: 'boundary',
          description: `Test with very long text (10000+ chars) for "${assertion.selector}"`,
          severity: 'low',
          testable: false,
        });
        break;

      case 'performance':
        // Check for extreme performance edge case
        edgeCases.push({
          type: 'extreme-performance',
          category: 'performance',
          description: `Test under extreme load (slow network/CPU)`,
          severity: 'medium',
          testable: false,
        });
        break;

      case 'url-matches':
        // Check for invalid URL edge case
        edgeCases.push({
          type: 'invalid-url',
          category: 'boundary',
          description: `Test with malformed/malicious URL patterns`,
          severity: 'high',
          testable: true,
        });
        break;
    }

    return edgeCases;
  }

  /**
   * Analyze critical edge cases
   */
  private analyzeCriticalEdgeCases(edgeCases: EdgeCase[]): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Group by category
    const byCategory = new Map<string, EdgeCase[]>();
    edgeCases.forEach(ec => {
      const existing = byCategory.get(ec.category) || [];
      existing.push(ec);
      byCategory.set(ec.category, existing);
    });

    // Check for missing security edge cases
    const securityCases = byCategory.get('security') || [];
    const highSecurityCases = securityCases.filter(ec => ec.severity === 'high');

    if (highSecurityCases.length > 0) {
      issues.push({
        severity: 'high',
        category: 'edge-case-security',
        description: `Missing security edge case testing: ${highSecurityCases.map(ec => ec.type).join(', ')}`,
        evidence: highSecurityCases.map(ec => ec.description),
      });
    }

    // Check for missing input boundary testing
    const inputCases = byCategory.get('input') || [];
    const criticalInputCases = inputCases.filter(ec => ec.severity === 'high' || ec.severity === 'medium');

    if (criticalInputCases.length > 3) {
      issues.push({
        severity: 'medium',
        category: 'edge-case-input',
        description: `Multiple input edge cases not tested (${criticalInputCases.length} cases) - consider adding boundary value tests`,
        evidence: criticalInputCases.slice(0, 5).map(ec => ec.description),
      });
    }

    return issues;
  }

  /**
   * Analyze input edge cases
   */
  private analyzeInputEdgeCases(result: ScenarioResult, context: VerificationContext): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check for variety in input values
    const typeSteps = result.stepResults.filter(sr => sr.step.action === 'type');
    const inputValuesSet = new Set(typeSteps.map(sr => sr.step.value));
    const inputValues = Array.from(inputValuesSet).filter(v => v); // Filter out undefined/null values

    if (inputValues.length > 0) {
      const hasEmptyInput = inputValues.some(v => v === '');
      const hasSpecialChars = inputValues.some(v => this.hasSpecialCharacters(v));
      const hasNumbers = inputValues.some(v => /\d/.test(v));
      const hasLetters = inputValues.some(v => /[a-zA-Z]/.test(v));

      if (!hasEmptyInput && typeSteps.length > 0) {
        issues.push({
          severity: 'low',
          category: 'input-variety',
          description: 'No empty input values tested - consider adding empty input tests',
          evidence: [`Total type actions: ${typeSteps.length}`],
        });
      }

      if (!hasSpecialChars && typeSteps.length > 2) {
        issues.push({
          severity: 'low',
          category: 'input-variety',
          description: 'No special characters in inputs tested - consider adding special character tests',
          evidence: [`Total type actions: ${typeSteps.length}`],
        });
      }
    }

    return issues;
  }

  /**
   * Analyze timing edge cases
   */
  private analyzeTimingEdgeCases(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check for rapid operations
    const rapidOperations = result.stepResults.filter(sr =>
      sr.step.action === 'click' && sr.duration < 100
    );

    if (rapidOperations.length === 0) {
      issues.push({
        severity: 'low',
        category: 'timing-variety',
        description: 'No rapid operations tested - consider adding rapid click/interaction tests',
        evidence: ['Rapid operations can reveal race conditions'],
      });
    }

    // Check for concurrent operations
    const parallelSteps = result.stepResults.filter(sr => sr.step.action === 'click').length;
    if (parallelSteps < 2) {
      issues.push({
        severity: 'low',
        category: 'timing-concurrency',
        description: 'Limited concurrent operations - consider testing concurrent user actions',
        evidence: ['Concurrent operations can reveal locking/state issues'],
      });
    }

    return issues;
  }

  /**
   * Analyze viewport edge cases
   */
  private analyzeViewportEdgeCases(result: ScenarioResult, context: VerificationContext): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    const scenario = context.plan.scenarios.find(s => s.id === result.scenarioId);
    if (!scenario || !scenario.viewport) {
      // No viewport specified - consider multiple viewport tests
      issues.push({
        severity: 'medium',
        category: 'viewport-coverage',
        description: 'No viewport specified - consider testing multiple viewport sizes',
        evidence: [
          'Recommended viewports:',
          '- Desktop: 1920x1080',
          '- Laptop: 1366x768',
          '- Tablet: 768x1024',
          '- Mobile: 375x667',
        ],
      });
      return issues;
    }

    const { width, height } = scenario.viewport;

    // Check if testing multiple viewports
    const allScenarios = context.plan.scenarios;
    const viewports = new Set(allScenarios.map(s => s.viewport ? `${s.viewport.width}x${s.viewport.height}` : 'default'));

    if (viewports.size === 1) {
      issues.push({
        severity: 'medium',
        category: 'viewport-coverage',
        description: `Only one viewport size tested (${width}x${height}) - consider testing multiple viewports`,
        evidence: [
          'Current viewport:',
          `- ${width}x${height}`,
          'Missing viewports for different screen sizes',
        ],
      });
    }

    // Check for extreme viewport sizes
    if (width < 375 || height < 667) {
      issues.push({
        severity: 'low',
        category: 'viewport-extreme',
        description: `Small viewport (${width}x${height}) - consider testing even smaller sizes (320x568)`,
        evidence: [`Current: ${width}x${height}, Minimum common: 320x568`],
      });
    }

    if (width > 1920 || height > 1080) {
      issues.push({
        severity: 'low',
        category: 'viewport-extreme',
        description: `Large viewport (${width}x${height}) - consider testing ultra-wide displays`,
        evidence: [`Current: ${width}x${height}, Ultra-wide: 2560x1080`],
      });
    }

    return issues;
  }

  /**
   * Analyze concurrency edge cases
   */
  private analyzeConcurrencyEdgeCases(result: ScenarioResult): StrategyIssue[] {
    const issues: StrategyIssue[] = [];

    // Check for concurrent operation testing
    const clickSteps = result.stepResults.filter(sr => sr.step.action === 'click');
    const formSteps = result.stepResults.filter(sr => sr.step.action === 'submit');

    if (clickSteps.length > 0 && formSteps.length > 0) {
      // Check if testing rapid form submission
      const hasRapidSubmit = result.stepResults.some(sr =>
        sr.step.action === 'submit' && sr.step.description.toLowerCase().includes('rapid')
      );

      if (!hasRapidSubmit) {
        issues.push({
          severity: 'low',
          category: 'concurrency-form',
          description: 'Consider testing rapid/duplicate form submissions',
          evidence: ['Can reveal form validation and state management issues'],
        });
      }
    }

    return issues;
  }

  /**
   * Generate recommended tests
   */
  private generateRecommendedTests(edgeCases: EdgeCase[]): string[] {
    const tests: string[] = [];

    // Get high-priority testable edge cases
    const priorityCases = edgeCases
      .filter(ec => ec.testable && (ec.severity === 'high' || ec.severity === 'medium'))
      .slice(0, 5);

    priorityCases.forEach(ec => {
      tests.push(`[${ec.category}] ${ec.description}`);
    });

    return tests;
  }

  /**
   * Check if string has special characters
   */
  private hasSpecialCharacters(str: string): boolean {
    return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(str);
  }

  /**
   * Check if string has SQL injection patterns
   */
  private hasSQLInjectionPattern(str: string): boolean {
    const sqlPatterns = [
      /' OR '1'='1/i,
      /' OR '1'='1'--/i,
      /' UNION /i,
      /' DROP /i,
      /1=1/i,
    ];
    return sqlPatterns.some(pattern => pattern.test(str));
  }

  /**
   * Check if string has XSS patterns
   */
  private hasXSSPattern(str: string): boolean {
    const xssPatterns = [
      /<script>/i,
      /javascript:/i,
      /onerror=/i,
      /onload=/i,
      /<img/i,
    ];
    return xssPatterns.some(pattern => pattern.test(str));
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(result: ScenarioResult, edgeCases: EdgeCase[], issues: StrategyIssue[]): number {
    let confidence = 1.0;

    // Reduce confidence based on critical edge case gaps
    const criticalGaps = edgeCases.filter(ec => ec.severity === 'high' && ec.testable).length;
    const mediumGaps = edgeCases.filter(ec => ec.severity === 'medium' && ec.testable).length;

    confidence -= criticalGaps * 0.1;
    confidence -= mediumGaps * 0.05;

    // Reduce confidence based on issues
    const highSeverityIssues = issues.filter(i => i.severity === 'high').length;
    const mediumSeverityIssues = issues.filter(i => i.severity === 'medium').length;

    confidence -= highSeverityIssues * 0.1;
    confidence -= mediumSeverityIssues * 0.05;

    return Math.max(0, Math.min(1, confidence));
  }
}

// =====================================================
// EDGE CASE TYPES
// =====================================================

interface EdgeCase {
  /** Edge case type */
  type: string;

  /** Category */
  category: 'input' | 'timing' | 'interaction' | 'boundary' | 'performance' | 'security';

  /** Description */
  description: string;

  /** Severity priority */
  severity: 'high' | 'medium' | 'low';

  /** Whether this is testable */
  testable: boolean;
}