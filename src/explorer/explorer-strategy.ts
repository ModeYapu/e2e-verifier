/**
 * Explorer Strategy - Phase orchestration for autonomous exploration
 * Handles the 4 phases: Discovery, Planning, Testing, Reporting
 */

import type { Page } from '@playwright/test';
import { URL } from 'url';
import { TestGenerator } from './test-generator';
import { ScriptEngine } from '../agent/script-engine';
import { ScreenshotUtil } from '../utils/screenshot';
import { Logger } from '../utils/logger';
import type {
  PageAnalysis,
  TestPlan,
  TestExecution,
  DiscoveryResult,
  TestCase,
  ExploreConfig
} from './types';
import { AuthConfig } from '../types';
import { buildSiteMap, generateHeuristicPlan, generateHeuristicScript } from './explorer-tools';
import { PageAnalyzer } from './page-analyzer';

/**
 * Phase 1: Discovery - explore all accessible pages
 */
export async function runDiscoveryPhase(
  page: Page,
  pageAnalyzer: PageAnalyzer,
  config: ExploreConfig,
  logger: Logger,
  performLogin: (page: Page, auth: AuthConfig, url: string) => Promise<void>
): Promise<DiscoveryResult> {
  const pages: PageAnalysis[] = [];
  const toVisit: Array<{ url: string; depth: number }> = [
    { url: config.url, depth: 0 }
  ];
  const visited = new Set<string>([config.url]);
  const maxPages = config.maxPages || 20;
  const maxDepth = config.maxDepth || 2;

  // Perform login if configured
  if (config.auth) {
    await performLogin(page, config.auth, config.url);
  }

  while (toVisit.length > 0 && pages.length < maxPages) {
    const { url, depth } = toVisit.shift()!;

    if (depth > maxDepth) continue;

    try {
      logger.info(`Discovering: ${url} (depth: ${depth}, remaining: ${toVisit.length})`);

      await page.goto(url, { waitUntil: 'networkidle', timeout: config.timeout || 30000 });

      // Analyze the page
      const analysis = await pageAnalyzer.analyze(page, depth);
      pages.push(analysis);

      // Collect navigation links for further exploration
      for (const navItem of analysis.navigation) {
        if (!navItem.isInternal) continue;
        if (visited.has(navItem.href)) continue;

        // Convert relative URLs to absolute
        let absoluteUrl = navItem.href;
        if (!navItem.href.startsWith('http')) {
          try {
            absoluteUrl = new URL(navItem.href, url).href;
          } catch {
            continue;
          }
        }

        if (pages.length + toVisit.length >= maxPages) break;
        if (!visited.has(absoluteUrl)) {
          visited.add(absoluteUrl);
          toVisit.push({ url: absoluteUrl, depth: depth + 1 });
        }
      }

    } catch (error) {
      logger.warn(`Failed to discover page ${url}: ${error}`);
    }
  }

  // Build site map
  const siteMap = buildSiteMap(pages, config.url);

  return {
    pages,
    siteMap,
    uniqueUrls: Array.from(visited),
    timestamp: new Date().toISOString()
  };
}

/**
 * Phase 2: Planning - generate test plan using LLM or heuristics
 */
export async function runPlanningPhase(
  analyses: PageAnalysis[],
  testGenerator: TestGenerator | null,
  useLlm: boolean,
  logger: Logger
): Promise<TestPlan> {
  if (testGenerator && useLlm !== false) {
    try {
      const plan = await testGenerator.generatePlan(analyses);
      return plan;
    } catch (error) {
      logger.warn(`LLM planning failed, using heuristic fallback: ${error}`);
    }
  }

  // Fallback: heuristic-based planning (no LLM needed)
  return generateHeuristicPlan(analyses);
}

/**
 * Phase 3: Testing - execute generated tests
 */
export async function runTestingPhase(
  testPlan: TestPlan,
  pageAnalyses: PageAnalysis[],
  config: ExploreConfig,
  page: Page,
  scriptEngine: ScriptEngine,
  testGenerator: TestGenerator | null,
  screenshotDir: string,
  logger: Logger,
  performLogin: (page: Page, auth: AuthConfig, url: string) => Promise<void>
): Promise<TestExecution[]> {
  const executions: TestExecution[] = [];

  // Create a map of URL to page analysis for quick lookup
  const analysisMap = new Map<string, PageAnalysis>();
  for (const analysis of pageAnalyses) {
    analysisMap.set(analysis.url, analysis);
  }

  for (const pagePlan of testPlan.pages) {
    const analysis = analysisMap.get(pagePlan.url);
    if (!analysis) {
      logger.warn(`No analysis found for page: ${pagePlan.url}`);
      continue;
    }

    // Perform login if needed (we might need to re-auth after navigation)
    if (config.auth && page.url().includes('login')) {
      await performLogin(page, config.auth, config.url);
    }

    for (const testCase of pagePlan.tests) {
      const execution = await executeTestCase(
        testCase,
        analysis,
        pageAnalyses,
        page,
        scriptEngine,
        testGenerator,
        config,
        screenshotDir,
        logger
      );
      executions.push(execution);
    }
  }

  return executions;
}

/**
 * Execute a single test case
 */
async function executeTestCase(
  testCase: TestCase,
  pageAnalysis: PageAnalysis,
  allAnalyses: PageAnalysis[],
  page: Page,
  scriptEngine: ScriptEngine,
  testGenerator: TestGenerator | null,
  config: ExploreConfig,
  screenshotDir: string,
  logger: Logger
): Promise<TestExecution> {
  const startTime = Date.now();
  logger.info(`Executing test: ${testCase.name}`);

  try {
    let script: string;

    // Generate script using LLM or fallback
    if (testGenerator && config.useLlm !== false) {
      script = await testGenerator.generateScript(
        testCase,
        pageAnalysis,
        config.auth
      );
    } else {
      // Use heuristic script generation (no LLM)
      script = generateHeuristicScript(testCase, pageAnalysis, config);
    }

    // Write script to disk
    const scriptPath = scriptEngine.writeScript(script, testCase.name.replace(/\s+/g, '-').toLowerCase());

    // Execute the script
    const result = await scriptEngine.executeScript(scriptPath, {
      timeout: testCase.estimatedDuration || 30000
    });

    // Take screenshot after execution
    let screenshot: string | undefined;
    try {
      const screenshotUtil = new ScreenshotUtil(page, 'explorer', screenshotDir);
      const filename = `${testCase.name.replace(/\s+/g, '-')}-${Date.now()}`;
      screenshot = await screenshotUtil.takeScreenshot({ name: filename });
    } catch (error) {
      logger.warn(`Failed to take post-test screenshot: ${error}`);
    }

    const execution: TestExecution = {
      testCase,
      url: pageAnalysis.url,
      passed: result.success,
      screenshot,
      script,
      output: result.stdout,
      error: result.success ? undefined : result.stderr,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    logger.info(`Test ${testCase.name}: ${execution.passed ? 'PASSED' : 'FAILED'}`);
    return execution;

  } catch (error) {
    logger.error(`Test execution failed: ${error}`);

    return {
      testCase,
      url: pageAnalysis.url,
      passed: false,
      script: '',
      output: '',
      error: String(error),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Phase 4: Reporting - merge scripts and generate final output
 */
export async function runReportingPhase(
  discovery: DiscoveryResult,
  testPlan: TestPlan,
  executions: TestExecution[],
  testGenerator: TestGenerator | null,
  config: ExploreConfig,
  scriptEngine: ScriptEngine,
  outputDir: string,
  logger: Logger
): Promise<{ finalScript: string; finalScriptPath: string }> {
  // Extract all successful scripts
  const successfulScripts = executions
    .filter(e => e.passed && e.script)
    .map(e => e.script);

  // Import mergeScriptsFallback dynamically to avoid circular dependency
  const { mergeScriptsFallback } = await import('./explorer-tools');

  // Merge into one comprehensive script
  const finalScript = testGenerator
    ? testGenerator.mergeScripts(successfulScripts, config.auth)
    : mergeScriptsFallback(successfulScripts, config);

  // Save final script
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const finalScriptName = `final-test-suite-${timestamp}`;
  const finalScriptPath = scriptEngine.saveFinalScript(finalScript, finalScriptName);

  // Save JSON report
  const jsonReportPath = `${outputDir}/report-${timestamp}.json`;
  const reportData = {
    discovery: {
      pages: discovery.pages.map(p => ({
        url: p.url,
        title: p.title,
        screenshot: p.screenshot,
        depth: p.depth
      })),
      siteMap: discovery.siteMap,
      uniqueUrls: discovery.uniqueUrls
    },
    testPlan,
    executions,
    timestamp: new Date().toISOString()
  };

  const fs = await import('fs');
  fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));

  logger.info(`Final script saved: ${finalScriptPath}`);
  logger.info(`JSON report saved: ${jsonReportPath}`);

  return { finalScript, finalScriptPath };
}
