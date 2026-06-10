/**
 * Claim Decomposer — Break assertions into atomic claims
 *
 * Decomposes complex test assertions into smaller, verifiable atomic claims.
 * This allows for more granular verification and better error diagnosis.
 */

import { PlannedScenario, PlannedAssertion } from './types';
import { Claim, ClaimDecomposition } from './verification-types';

// =====================================================
// CLAIM DECOMPOSER
// =====================================================

/**
 * Decompose a planned scenario into atomic claims
 */
export class ClaimDecomposer {
  /**
   * Decompose a scenario into claims
   */
  decompose(scenario: PlannedScenario): ClaimDecomposition {
    const claims: Claim[] = [];
    const dependencies = new Map<string, string[]>();

    // Decompose each assertion into claims
    scenario.assertions.forEach((assertion, index) => {
      const assertionClaims = this.decomposeAssertion(assertion, scenario);
      claims.push(...assertionClaims);

      // Track dependencies
      assertionClaims.forEach(claim => {
        if (claim.dependencies.length > 0) {
          dependencies.set(claim.id, claim.dependencies);
        }
      });
    });

    // Add scenario-level claims
    const scenarioClaims = this.generateScenarioClaims(scenario);
    claims.push(...scenarioClaims);

    return {
      claims,
      dependencies,
      metadata: {
        originalAssertion: `${scenario.assertions.length} assertions`,
        decompositionMethod: 'hybrid',
      },
    };
  }

  /**
   * Decompose a single assertion into claims
   */
  private decomposeAssertion(assertion: PlannedAssertion, scenario: PlannedScenario): Claim[] {
    const claims: Claim[] = [];
    const baseId = `assertion-${assertion.type}-${Date.now()}`;

    switch (assertion.type) {
      case 'element-exists':
        claims.push(this.createElementExistsClaim(assertion, baseId));
        break;

      case 'element-visible':
        claims.push(this.createElementVisibleClaim(assertion, baseId));
        break;

      case 'element-count':
        claims.push(this.createElementCountClaim(assertion, baseId));
        break;

      case 'text-contains':
        claims.push(this.createTextContainsClaim(assertion, baseId));
        break;

      case 'text-equals':
        claims.push(this.createTextEqualsClaim(assertion, baseId));
        break;

      case 'attribute-equals':
        claims.push(this.createAttributeEqualsClaim(assertion, baseId));
        break;

      case 'url-matches':
        claims.push(this.createUrlMatchesClaim(assertion, baseId));
        break;

      case 'performance':
        claims.push(this.createPerformanceClaim(assertion, baseId));
        break;

      case 'console':
        claims.push(this.createConsoleClaim(assertion, baseId));
        break;

      case 'network':
        claims.push(this.createNetworkClaim(assertion, baseId));
        break;

      default:
        // Generic claim for unknown types
        claims.push(this.createGenericClaim(assertion, baseId));
    }

    return claims;
  }

  /**
   * Create claim for element existence
   */
  private createElementExistsClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-exists`,
      description: `Element "${assertion.selector}" exists in DOM`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'direct',
    };
  }

  /**
   * Create claim for element visibility
   */
  private createElementVisibleClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-visible`,
      description: `Element "${assertion.selector}" is visible to user`,
      relatedAssertion: assertion.description,
      dependencies: [`${baseId}-exists`],
      critical: assertion.critical !== false,
      verificationMethod: 'direct',
    };
  }

  /**
   * Create claim for element count
   */
  private createElementCountClaim(assertion: PlannedAssertion, baseId: string): Claim {
    const count = assertion.expected as number;
    return {
      id: `${baseId}-count`,
      description: `Found ${count} element(s) matching "${assertion.selector}"`,
      relatedAssertion: assertion.description,
      dependencies: [`${baseId}-exists`],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for text contains
   */
  private createTextContainsClaim(assertion: PlannedAssertion, baseId: string): Claim {
    const text = assertion.expected as string;
    return {
      id: `${baseId}-contains`,
      description: `Element "${assertion.selector}" contains "${text}"`,
      relatedAssertion: assertion.description,
      dependencies: [`${baseId}-exists`, `${baseId}-visible`],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for text equals
   */
  private createTextEqualsClaim(assertion: PlannedAssertion, baseId: string): Claim {
    const text = assertion.expected as string;
    return {
      id: `${baseId}-equals`,
      description: `Element "${assertion.selector}" text equals "${text}"`,
      relatedAssertion: assertion.description,
      dependencies: [`${baseId}-exists`, `${baseId}-visible`],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for attribute equals
   */
  private createAttributeEqualsClaim(assertion: PlannedAssertion, baseId: string): Claim {
    const value = assertion.expected as string;
    return {
      id: `${baseId}-attribute`,
      description: `Element "${assertion.selector}" attribute "${assertion.attribute}" equals "${value}"`,
      relatedAssertion: assertion.description,
      dependencies: [`${baseId}-exists`],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for URL matching
   */
  private createUrlMatchesClaim(assertion: PlannedAssertion, baseId: string): Claim {
    const pattern = assertion.expected as string;
    return {
      id: `${baseId}-url`,
      description: `Current URL matches pattern "${pattern}"`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for performance metrics
   */
  private createPerformanceClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-performance`,
      description: `Performance metrics meet threshold: ${assertion.expected}`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'comparison',
    };
  }

  /**
   * Create claim for console errors
   */
  private createConsoleClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-console`,
      description: `No critical console errors present`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'inference',
    };
  }

  /**
   * Create claim for network requests
   */
  private createNetworkClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-network`,
      description: `Network requests completed successfully`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'inference',
    };
  }

  /**
   * Create generic claim for unknown assertion types
   */
  private createGenericClaim(assertion: PlannedAssertion, baseId: string): Claim {
    return {
      id: `${baseId}-generic`,
      description: `Assertion "${assertion.description}" verified`,
      relatedAssertion: assertion.description,
      dependencies: [],
      critical: assertion.critical !== false,
      verificationMethod: 'direct',
    };
  }

  /**
   * Generate scenario-level claims
   */
  private generateScenarioClaims(scenario: PlannedScenario): Claim[] {
    const claims: Claim[] = [];

    // Navigation claim
    claims.push({
      id: `scenario-${scenario.id}-navigation`,
      description: `Successfully navigated to ${scenario.url}`,
      dependencies: [],
      critical: true,
      verificationMethod: 'inference',
    });

    // Steps execution claim
    scenario.steps.forEach((step, index) => {
      claims.push({
        id: `scenario-${scenario.id}-step-${index}`,
        description: `Step "${step.description}" executed successfully`,
        dependencies: index > 0 ? [`scenario-${scenario.id}-step-${index - 1}`] : [],
        critical: step.critical !== false,
        verificationMethod: 'inference',
      });
    });

    return claims;
  }

  /**
   * Get claims by dependency order
   */
  getClaimsInDependencyOrder(decomposition: ClaimDecomposition): Claim[] {
    const ordered: Claim[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (claimId: string) => {
      if (visited.has(claimId)) return;
      if (visiting.has(claimId)) return; // Circular dependency

      visiting.add(claimId);

      const claim = decomposition.claims.find(c => c.id === claimId);
      if (claim) {
        // Visit dependencies first
        claim.dependencies.forEach(depId => visit(depId));
        ordered.push(claim);
        visited.add(claimId);
      }

      visiting.delete(claimId);
    };

    decomposition.claims.forEach(claim => visit(claim.id));
    return ordered;
  }
}