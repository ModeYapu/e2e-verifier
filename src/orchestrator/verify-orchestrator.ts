/**
 * Verification Orchestrator
 * Chained verification flow: fast checks first, then deep verification for failures
 */

import { Verifier } from '../verifier';
import { AgentLoop } from '../agent/agent-loop';
import { AgentConfig, AgentResult } from '../agent/types';
import { SiteConfig, TestResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Result from orchestrating verification for a single site
 */
export interface SiteOrchestratedResult {
  siteName: string;
  url: string;
  fastResult: TestResult;
  fastPassed: boolean;
  deepNeeded: boolean;
  deepResult?: AgentResult;
  overallPassed: boolean;
  config?: SiteConfig;
}

/**
 * Complete orchestration result across all sites
 */
export interface OrchestratedResult {
  timestamp: string;
  summary: {
    total: number;
    allPassed: number;
    neededDeep: number;
    deepPassed: number;
    deepFailed: number;
  };
  sites: SiteOrchestratedResult[];
}

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorOptions {
  strict?: boolean;
  model?: string;
  maxDeepSteps?: number;
  outputDir?: string;
}

/**
 * Check severity levels for determining deep verification necessity
 */
enum CheckSeverity {
  Critical = 'critical',
  NonCritical = 'non-critical'
}

/**
 * Map check types to severity levels
 */
const CHECK_SEVERITY: Record<string, CheckSeverity> = {
  http: CheckSeverity.Critical,
  accessibility: CheckSeverity.Critical,
  performance: CheckSeverity.NonCritical,
  seo: CheckSeverity.NonCritical,
  console: CheckSeverity.NonCritical
};

/**
 * Main orchestrator class for chained verification
 */
export class VerifyOrchestrator {
  private strict: boolean;
  private model: string;
  private maxDeepSteps: number;
  private outputDir: string;

  constructor(options?: OrchestratorOptions) {
    this.strict = options?.strict ?? false;
    this.model = options?.model ?? process.env.LLM_MODEL ?? 'gpt-4o';
    this.maxDeepSteps = options?.maxDeepSteps ?? 15;
    this.outputDir = options?.outputDir ?? 'reports';
  }

  /**
   * Run orchestrated verification for all sites in a config file
   */
  async verifyAll(configPath: string): Promise<OrchestratedResult> {
    const configs = await this.loadSiteConfigs(configPath);
    const results: SiteOrchestratedResult[] = [];

    for (const config of configs) {
      const result = await this.verifySite(config);
      results.push(result);
    }

    return this.createOrchestratedResult(results);
  }

  /**
   * Run orchestrated verification for a single site
   */
  async verifySite(config: SiteConfig): Promise<SiteOrchestratedResult> {
    logger.info(`\n▶ ${config.name} (${config.url})`);

    // Step 1: Run fast verification
    let fastResult: TestResult;
    try {
      const verifier = new Verifier(config);
      fastResult = await verifier.verify();
    } catch (error) {
      fastResult = {
        siteName: config.name,
        url: config.url,
        timestamp: new Date().toISOString(),
        passed: false,
        duration: 0,
        checks: [],
        screenshots: [],
        errors: [`Fast verification failed: ${error}`]
      };
    }

    const fastPassed = fastResult.passed;
    const passedChecks = fastResult.checks.filter(c => c.passed).length;
    const failedChecks = fastResult.checks.filter(c => !c.passed).length;
    const errorCount = fastResult.errors.length;
    const durationSec = (fastResult.duration / 1000).toFixed(1);

    logger.info(`  Fast verify: ${fastPassed ? '✅ PASSED' : '⚠️ FAILED'} (${passedChecks} checks, ${failedChecks} failed, ${errorCount} errors, ${durationSec}s)`);

    // Step 2: Determine if deep verification is needed
    const deepNeeded = this.shouldDeepVerify(fastResult, this.strict);
    let deepResult: AgentResult | undefined;
    let deepPassed = false;

    if (deepNeeded) {
      const task = this.generateTaskFromFailures(fastResult);
      logger.info(`  Deep verify: Running... (task: "${task.substring(0, 60)}...")`);

      try {
        deepResult = await this.runDeepVerification(task, config.url);
        deepPassed = deepResult.passed;

        const tokenCount = deepResult.totalTokens || 0;
        const stepCount = deepResult.steps?.length || 0;

        logger.info(`  Deep verify: ${deepPassed ? '✅ PASSED' : '❌ FAILED'} (${stepCount} steps, ${tokenCount} tokens)`);
      } catch (error) {
        logger.info(`  Deep verify: ❌ ERROR - ${error}`);
        // Create a minimal AgentResult for error case
        deepResult = {
          task,
          url: config.url,
          passed: false,
          steps: [{
            step: 1,
            thought: 'Deep verification encountered an error',
            command: 'error',
            output: String(error),
            error: String(error),
            timestamp: new Date().toISOString()
          }],
          finalScript: '',
          duration: 0,
          totalTokens: 0
        };
      }
    } else {
      logger.info(`  Deep verify: SKIPPED (all fast checks passed)`);
    }

    // Step 3: Determine overall pass status
    const overallPassed = fastPassed || (deepNeeded && deepPassed);

    logger.info(`  Overall: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}${fastPassed ? '' : deepPassed ? ' (fixed by deep verify)' : ''}`);

    return {
      siteName: config.name,
      url: config.url,
      fastResult,
      fastPassed,
      deepNeeded,
      deepResult,
      overallPassed,
      config
    };
  }

  /**
   * Determine whether deep verification is needed based on fast check results
   */
  private shouldDeepVerify(result: TestResult, strict: boolean): boolean {
    // All checks passed - no deep verify needed
    if (result.passed) {
      return false;
    }

    // Any errors present - deep verify required
    if (result.errors.length > 0) {
      return true;
    }

    // Check for critical failures
    const hasCriticalFailure = result.checks.some(check => {
      if (check.passed) return false;
      const severity = CHECK_SEVERITY[check.type] ?? CheckSeverity.NonCritical;
      return severity === CheckSeverity.Critical;
    });

    if (hasCriticalFailure) {
      return true;
    }

    // Non-critical failures - deep verify only in strict mode
    return strict;
  }

  /**
   * Generate a task description from failed checks
   */
  private generateTaskFromFailures(result: TestResult): string {
    const failedChecks = result.checks.filter(c => !c.passed);
    const taskParts: string[] = [];

    for (const check of failedChecks) {
      switch (check.type) {
        case 'http':
          taskParts.push(`验证页面HTTP状态码和导航是否正常`);
          break;
        case 'accessibility':
          taskParts.push(`检查页面可访问性问题，特别是${check.message}`);
          break;
        case 'performance':
          taskParts.push(`分析页面性能指标，${check.message}`);
          break;
        case 'seo':
          taskParts.push(`检查SEO元数据配置`);
          break;
        case 'console':
          taskParts.push(`调查控制台错误和警告`);
          break;
        default:
          taskParts.push(`验证${check.name}: ${check.message}`);
      }
    }

    // Add error-specific tasks
    if (result.errors.length > 0) {
      taskParts.push(`调查和解决以下错误: ${result.errors.slice(0, 2).join('; ')}`);
    }

    // Generate combined task with Chinese description
    if (taskParts.length === 0) {
      return '全面验证页面功能和用户体验';
    }

    return taskParts.join('; ');
  }

  /**
   * Run deep verification using AgentLoop
   */
  private async runDeepVerification(task: string, url: string): Promise<AgentResult> {
    const apiKey = this.getApiKey();
    const apiBase = this.getApiBase();

    const agentConfig: AgentConfig = {
      model: this.model,
      maxSteps: this.maxDeepSteps,
      apiKey,
      apiBase,
      temperature: 0.7,
      maxTokens: 4000,
      requestTimeout: 300000 // 5 minutes max per deep verify
    };

    const agent = new AgentLoop(agentConfig);
    return await agent.run(task, url);
  }

  /**
   * Get API key from environment
   */
  private getApiKey(): string {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
    if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;

    throw new Error('API key not found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GLM_API_KEY, or LLM_API_KEY environment variable.');
  }

  /**
   * Get API base URL from environment
   */
  private getApiBase(): string {
    if (this.model.startsWith('gpt-')) {
      return process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    }
    if (this.model.startsWith('claude-')) {
      return process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1';
    }
    if (this.model.startsWith('glm-')) {
      return process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
    }

    return process.env.LLM_API_BASE || 'https://api.openai.com/v1';
  }

  /**
   * Load site configurations from file
   */
  private async loadSiteConfigs(configPath: string): Promise<SiteConfig[]> {
    const resolvedPath = path.resolve(configPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(content);

    if (parsed.sites && Array.isArray(parsed.sites)) {
      return parsed.sites as SiteConfig[];
    }

    return [parsed as SiteConfig];
  }

  /**
   * Create the final orchestrated result
   */
  private createOrchestratedResult(sites: SiteOrchestratedResult[]): OrchestratedResult {
    const total = sites.length;
    const allPassed = sites.filter(s => s.fastPassed).length;
    const neededDeep = sites.filter(s => s.deepNeeded).length;
    const deepPassed = sites.filter(s => s.deepNeeded && s.deepResult?.passed).length;
    const deepFailed = sites.filter(s => s.deepNeeded && !s.deepResult?.passed).length;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        allPassed,
        neededDeep,
        deepPassed,
        deepFailed
      },
      sites
    };
  }

  /**
   * Save orchestrated result to JSON file
   */
  saveReport(result: OrchestratedResult, filename?: string): string {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const reportFilename = filename || `orchestrated-${timestamp}.json`;
    const filepath = path.join(this.outputDir, reportFilename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
    return filepath;
  }
}
