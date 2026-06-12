/**
 * Fast Verify Service
 * Handles fast verification logic
 */

import { SiteConfig, TestResult } from '../../types';
import { Verifier } from '../../verifier';
import { ResultStore } from '../../storage/result-store';

export interface FastVerifyRequest {
  url: string;
  name: string;
  checks?: string[];
  viewport?: { width: number; height: number };
  timeout?: number;
  expectedStatusCode?: number;
  screenshots?: string[];
  customChecks?: Array<{
    name: string;
    type: 'element' | 'text' | 'attribute' | 'javascript';
    selector?: string;
    expected?: string | boolean;
    script?: string;
  }>;
}

/**
 * Perform fast verification
 */
export async function fastVerify(
  request: FastVerifyRequest,
  resultStore: ResultStore
): Promise<TestResult> {
  const config: SiteConfig = {
    name: request.name,
    url: request.url,
    expectedStatusCode: request.expectedStatusCode ?? 200,
    viewport: request.viewport,
    timeout: request.timeout ?? 30000,
    checks: request.checks,
    screenshots: request.screenshots?.map(s => typeof s === 'string' ? { name: s } : s),
    customChecks: request.customChecks
  };

  const verifier = new Verifier(config);
  const result = await verifier.verify();

  // Save result automatically
  try {
    resultStore.save(result);
  } catch (saveError) {
    console.error(`[${new Date().toISOString()}] Error saving result:`, saveError);
  }

  return result;
}
