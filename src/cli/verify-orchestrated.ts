/**
 * CLI entry point for Orchestrated Verification
 * Combines fast and deep verification with automatic task generation
 */

import { VerifyOrchestrator, OrchestratedResult, SiteOrchestratedResult } from '../orchestrator/verify-orchestrator';
import { SiteConfig, CheckResult } from '../types';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'VerifyOrchestrated' });

interface CLIArgs {
  config?: string;
  strict?: boolean;
  deepModel?: string;
  output?: string;
  json?: boolean;
  skipDeep?: boolean;
}

interface SitesConfigFormat {
  name?: string;
  sites?: SiteConfig[];
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--config':
      case '-c':
        result.config = args[++i];
        break;
      case '--strict':
      case '-s':
        result.strict = true;
        break;
      case '--deep-model':
      case '-m':
        result.deepModel = args[++i];
        break;
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--json':
      case '-j':
        result.json = true;
        break;
      case '--skip-deep':
        result.skipDeep = true;
        break;
      default:
        if (!result.config && !arg.startsWith('--')) {
          result.config = arg;
        }
    }
  }

  return result;
}

async function loadConfigName(configPath: string): Promise<string> {
  const resolvedPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedPath)) {
    return 'Verification';
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(content) as SitesConfigFormat;

  return parsed.name || 'Verification';
}

function printHeader(configName: string, model: string): void {
  logger.info('\n' + '='.repeat(40));
  logger.info(`VERIFICATION ORCHESTRATOR — ${configName}`);
  logger.info('='.repeat(40));
  logger.info(`Using deep model: ${model}`);
  logger.info('');
}

function printSiteResult(result: SiteOrchestratedResult): void {
  const { siteName, fastResult, fastPassed, deepNeeded, deepResult, overallPassed } = result;

  const passedChecks = fastResult.checks.filter((c: CheckResult) => c.passed).length;
  const failedChecks = fastResult.checks.filter((c: CheckResult) => !c.passed).length;
  const errorCount = fastResult.errors.length;
  const durationSec = (fastResult.duration / 1000).toFixed(1);

  const fastStatus = fastPassed
    ? `✅ PASSED (${fastResult.checks.length} checks, 0 errors, ${durationSec}s)`
    : `⚠️ FAILED (${passedChecks} passed, ${failedChecks} failed, ${errorCount} errors, ${durationSec}s)`;

  logger.info(`▶ ${siteName} (${fastResult.url})`);
  logger.info(`  Fast verify: ${fastStatus}`);

  if (deepNeeded) {
    if (deepResult) {
      const tokenCount = deepResult.totalTokens || 0;
      const stepCount = deepResult.steps?.length || 0;
      const deepStatus = deepResult.passed
        ? `✅ PASSED (${stepCount} steps, ${tokenCount} tokens)`
        : `❌ FAILED (${stepCount} steps, ${tokenCount} tokens)`;
      logger.info(`  Deep verify: ${deepStatus}`);
    } else {
      logger.info(`  Deep verify: ❌ ERROR`);
    }
  } else {
    logger.info(`  Deep verify: SKIPPED (all fast checks passed)`);
  }

  const overallLabel = overallPassed
    ? fastPassed
      ? '✅ PASSED'
      : '✅ PASSED (fixed by deep verify)'
    : '❌ FAILED';

  logger.info(`  Overall: ${overallLabel}`);
}

function printSummary(result: OrchestratedResult): void {
  logger.info('\n' + '='.repeat(40));
  logger.info('SUMMARY');
  logger.info('='.repeat(40));
  logger.info(`Total: ${result.summary.total}`);
  logger.info(`All passed: ${result.summary.allPassed}`);
  logger.info(`Needed deep verify: ${result.summary.neededDeep}`);
  logger.info(`Deep passed: ${result.summary.deepPassed}`);
  logger.info(`Deep failed: ${result.summary.deepFailed}`);
  logger.info('='.repeat(40));
}

function printJSONReport(result: OrchestratedResult): void {
  // JSON output - keep console.log for stdout
  logger.info('\n' + JSON.stringify(result, null, 2));
}

async function saveReport(result: OrchestratedResult, outputPath: string): Promise<void> {
  const resolvedPath = path.resolve(outputPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.info(`Detailed report: ${resolvedPath}`);
}

async function main(): Promise<void> {
  try {
    const args = parseArgs();

    if (!args.config) {
      logger.error('Error: Config file path is required');
      logger.error('Usage: npm run verify:orchestrated -- --config <path-to-config>');
      logger.error('   or: npm run verify:orchestrated -- <path-to-config>');
      process.exit(1);
    }

    // Load config name for header
    const configName = await loadConfigName(args.config);
    const model = args.deepModel || process.env.LLM_MODEL || 'gpt-4o';

    printHeader(configName, model);

    // Create orchestrator
    const orchestrator = new VerifyOrchestrator({
      strict: args.strict,
      model: args.skipDeep ? undefined : model,
      outputDir: 'reports'
    });

    // Run verification
    const result = await orchestrator.verifyAll(args.config);

    // Print site results
    for (const siteResult of result.sites) {
      printSiteResult(siteResult);
    }

    // Print summary
    printSummary(result);

    // Save report
    if (args.output) {
      await saveReport(result, args.output);
    } else {
      const defaultPath = orchestrator.saveReport(result);
      logger.info(`Detailed report: ${defaultPath}`);
    }

    // Print JSON if requested
    if (args.json) {
      printJSONReport(result);
    }

    // Exit with appropriate code
    const allPassed = result.sites.every(s => s.overallPassed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    logger.error(`Orchestrated verification failed: ${error}`);
    process.exit(1);
  }
}

main();
