/**
 * Deep Verify Service
 *
 * NOTE: The actual deep and orchestrated verification implementations are in:
 * - src/scheduler/scheduler.ts: executeDeepVerify() - uses AgentLoop
 * - src/scheduler/scheduler.ts: executeOrchestratedVerify() - uses VerifyOrchestrator
 *
 * The API routes (src/server/routes/verify-routes.ts) create jobs that are
 * processed by the scheduler, not by direct service calls.
 *
 * This file exports types and the matrixVerify implementation.
 */

import { SiteConfig } from '../../types';
import type { ResultStore } from '../../storage/result-store';

// Define DeviceMatrixConfig locally since it's not exported from MatrixRunner
interface DeviceMatrixConfig {
  browsers?: ('chromium' | 'webkit' | 'firefox')[];
  viewports?: Array<{ name: string; width: number; height: number }>;
  locales?: string[];
}

export interface DeepVerifyRequest {
  url: string;
  task: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

export interface OrchestratedVerifyRequest {
  sites: SiteConfig[];
  strict?: boolean;
  model?: string;
  skipDeep?: boolean;
}

export interface MatrixVerifyRequest {
  site: SiteConfig;
  matrix: {
    browsers?: ('chromium' | 'webkit' | 'firefox')[];
    viewports?: Array<{ name: string; width: number; height: number }>;
    locales?: string[];
  };
}

/**
 * Perform matrix verification
 */
export async function matrixVerify(
  request: MatrixVerifyRequest,
  resultStore: ResultStore
): Promise<any> {
  // Lazy import to avoid pulling playwright into unit tests
  const { MatrixRunner } = await import('../../runner/matrix-runner');

  // Validate matrix configuration
  const matrixConfig: DeviceMatrixConfig = {
    browsers: request.matrix.browsers,
    viewports: request.matrix.viewports,
    locales: request.matrix.locales
  };

  const validation = MatrixRunner.validateMatrixConfig(matrixConfig);
  if (!validation.valid) {
    throw new Error(`Invalid matrix configuration: ${validation.errors.join(', ')}`);
  }

  // Create matrix runner and execute
  const runner = new MatrixRunner();
  const result = await runner.run(request.site, matrixConfig);

  // Save individual test results from matrix
  try {
    for (const combo of result.combinations) {
      resultStore.save(combo.result);
    }
  } catch (saveError) {
    console.error(`[${new Date().toISOString()}] Error saving matrix results:`, saveError);
  }

  return result;
}
