/**
 * Explorer Core - Main autonomous exploration orchestration
 * Coordinates browser resources, components, and the 4-phase exploration flow
 */

import type { Page } from '@playwright/test';
import { BrowserPool } from '../browser/browser-pool';
import * as fs from 'fs';
import * as path from 'path';
import { PageAnalyzer } from './page-analyzer';
import { TestGenerator } from './test-generator';
import { ScriptEngine } from '../agent/script-engine';
import { Logger } from '../utils/logger';
import {
  ExploreConfig,
  ExploreResult,
  ExploreSummary,
  DiscoveryResult,
  TestPlan,
  TestExecution
} from './types';
import { AuthConfig } from '../types';
import { performLogin as performLoginUtil } from './explorer-tools';
import {
  runDiscoveryPhase,
  runPlanningPhase,
  runTestingPhase,
  runReportingPhase
} from './explorer-strategy';

/**
 * Main autonomous exploration orchestrator
 * Runs 4-phase exploration: Discovery, Planning, Testing, Reporting
 */
export class AutonomousExplorer {
  private browser: Page | null = null;
  private browserPool: BrowserPool;
  private pageAnalyzer: PageAnalyzer;
  private testGenerator: TestGenerator | null = null;
  private scriptEngine: ScriptEngine;
  private logger: Logger;
  private config: ExploreConfig;
  private outputDir: string;
  private screenshotDir: string;
  private totalTokens: number = 0;

  constructor(config: ExploreConfig) {
    this.config = config;
    this.logger = new Logger({ prefix: 'Explorer' });
    this.outputDir = config.outputDir || 'explorer-output';
    this.screenshotDir = path.join(this.outputDir, 'screenshots');

    // Initialize BrowserPool
    this.browserPool = BrowserPool.getInstance({
      maxInstances: 2,
      headless: true,
    });

    // Create output directories
    this.ensureDirectories();

    // Initialize components
    this.pageAnalyzer = new PageAnalyzer(this.screenshotDir);
    this.scriptEngine = new ScriptEngine(path.join(process.cwd(), 'scripts', 'explorer-sandbox'));

    // Initialize TestGenerator only if LLM is enabled
    if (config.useLlm !== false && config.llm.apiKey) {
      this.testGenerator = new TestGenerator(config.llm);
    }
  }

  private ensureDirectories(): void {
    const dirs = [
      this.outputDir,
      this.screenshotDir,
      path.join(this.outputDir, 'scripts'),
      path.join(this.outputDir, 'reports')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Main exploration method - runs all 4 phases
   */
  async explore(): Promise<ExploreResult> {
    const startTime = Date.now();
    this.logger.info('Starting autonomous exploration');

    try {
      // Initialize browser
      await this.initializeBrowser();

      // Phase 1: Discovery
      this.logger.info('=== Phase 1: Discovery ===');
      const discovery = await runDiscoveryPhase(
        this.browser!,
        this.pageAnalyzer,
        this.config,
        this.logger,
        this.performLogin.bind(this)
      );
      this.logger.info(`Discovered ${discovery.pages.length} pages`);

      // Phase 2: Planning
      this.logger.info('=== Phase 2: Planning ===');
      const testPlan = await runPlanningPhase(
        discovery.pages,
        this.testGenerator,
        this.config.useLlm !== false,
        this.logger
      );
      this.logger.info(`Generated ${testPlan.totalTests} tests`);

      // Phase 3: Testing
      this.logger.info('=== Phase 3: Testing ===');
      const executions = await runTestingPhase(
        testPlan,
        discovery.pages,
        this.config,
        this.browser!,
        this.scriptEngine,
        this.testGenerator,
        this.screenshotDir,
        this.logger,
        this.performLogin.bind(this)
      );
      this.logger.info(`Executed ${executions.length} tests`);

      // Phase 4: Reporting
      this.logger.info('=== Phase 4: Reporting ===');
      const { finalScript, finalScriptPath } = await runReportingPhase(
        discovery,
        testPlan,
        executions,
        this.testGenerator,
        this.config,
        this.scriptEngine,
        this.outputDir,
        this.logger
      );

      const duration = Date.now() - startTime;

      // Build summary
      const summary: ExploreSummary = {
        pagesExplored: discovery.pages.length,
        testsPlanned: testPlan.totalTests,
        testsPassed: executions.filter(e => e.passed).length,
        testsFailed: executions.filter(e => !e.passed).length,
        duration,
        totalTokens: this.totalTokens,
        screenshotsTaken: discovery.pages.length + executions.filter(e => e.screenshot).length
      };

      const result: ExploreResult = {
        config: this.config,
        discovery: discovery.pages,
        testPlan,
        executions,
        summary,
        finalScript,
        finalScriptPath
      };

      this.logger.info(`=== Exploration Complete ===`);
      this.logger.info(`Pages: ${summary.pagesExplored}, Tests: ${summary.testsPassed}/${summary.testsPlanned} passed`);
      this.logger.info(`Duration: ${duration}ms, Tokens: ${summary.totalTokens}`);

      return result;

    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize browser and page
   */
  private async initializeBrowser(): Promise<void> {
    // Use BrowserPool to get a page
    this.browser = await this.browserPool.acquirePage();
    // Set viewport
    await this.browser.setViewportSize({ width: 1920, height: 1080 });
  }

  /**
   * Perform login using auth config (wrapper for utility function)
   */
  private async performLogin(auth: AuthConfig): Promise<void> {
    if (!this.browser) throw new Error('Page not initialized');
    await performLoginUtil(this.browser, auth, this.config.url);
    this.logger.info('Login successful');
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Release page back to the pool
      if (this.browser) {
        this.browserPool.releasePage(this.browser);
      }
    } catch (error) {
      this.logger.warn(`Cleanup error: ${error}`);
    }
  }

  /**
   * Get total tokens consumed (for LLM mode)
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }
}
