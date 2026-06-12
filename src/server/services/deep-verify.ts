/**
 * Deep Verify Service
 * Handles deep verification and orchestrated verification logic
 */

import { SiteConfig } from '../../types';
import { MatrixRunner } from '../../runner/matrix-runner';
import { ResultStore } from '../../storage/result-store';

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
 * Perform deep verification
 * TODO: Implement deep verification logic
 */
export async function deepVerify(
  request: DeepVerifyRequest,
  resultStore: ResultStore
): Promise<any> {
  // Placeholder for future implementation
  throw new Error('Deep verification not yet implemented');
}

/**
 * Perform orchestrated verification
 * TODO: Implement orchestrated verification logic
 */
export async function orchestratedVerify(
  request: OrchestratedVerifyRequest,
  resultStore: ResultStore
): Promise<any> {
  // Placeholder for future implementation
  throw new Error('Orchestrated verification not yet implemented');
}

/**
 * Perform matrix verification
 */
export async function matrixVerify(
  request: MatrixVerifyRequest,
  resultStore: ResultStore
): Promise<any> {
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
