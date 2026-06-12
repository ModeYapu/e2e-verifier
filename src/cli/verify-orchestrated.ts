/**
 * CLI entry point for Orchestrated Verification
 * Combines fast and deep verification with automatic task generation
 */

import { VerifyOrchestrator, OrchestratedResult, SiteOrchestratedResult } from '../orchestrator/verify-orchestrator';
import { SiteConfig, CheckResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

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
  console.log('\n' + '='.repeat(40));
  console.log(`VERIFICATION ORCHESTRATOR — ${configName}`);
  console.log('='.repeat(40));
  console.log(`Using deep model: ${model}`);
  console.log('');
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

  console.log(`▶ ${siteName} (${fastResult.url})`);
  console.log(`  Fast verify: ${fastStatus}`);

  if (deepNeeded) {
    if (deepResult) {
      const tokenCount = deepResult.totalTokens || 0;
      const stepCount = deepResult.steps?.length || 0;
      const deepStatus = deepResult.passed
        ? `✅ PASSED (${stepCount} steps, ${tokenCount} tokens)`
        : `❌ FAILED (${stepCount} steps, ${tokenCount} tokens)`;
      console.log(`  Deep verify: ${deepStatus}`);
    } else {
      console.log(`  Deep verify: ❌ ERROR`);
    }
  } else {
    console.log(`  Deep verify: SKIPPED (all fast checks passed)`);
  }

  const overallLabel = overallPassed
    ? fastPassed
      ? '✅ PASSED'
      : '✅ PASSED (fixed by deep verify)'
    : '❌ FAILED';

  console.log(`  Overall: ${overallLabel}`);
}

function printSummary(result: OrchestratedResult): void {
  console.log('\n' + '='.repeat(40));
  console.log('SUMMARY');
  console.log('='.repeat(40));
  console.log(`Total: ${result.summary.total}`);
  console.log(`All passed: ${result.summary.allPassed}`);
  console.log(`Needed deep verify: ${result.summary.neededDeep}`);
  console.log(`Deep passed: ${result.summary.deepPassed}`);
  console.log(`Deep failed: ${result.summary.deepFailed}`);
  console.log('='.repeat(40));
}

function printJSONReport(result: OrchestratedResult): void {
  console.log('\n' + JSON.stringify(result, null, 2));
}

async function saveReport(result: OrchestratedResult, outputPath: string): Promise<void> {
  const resolvedPath = path.resolve(outputPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Detailed report: ${resolvedPath}`);
}

async function main(): Promise<void> {
  try {
    const args = parseArgs();

    if (!args.config) {
      console.error('Error: Config file path is required');
      console.error('Usage: npm run verify:orchestrated -- --config <path-to-config>');
      console.error('   or: npm run verify:orchestrated -- <path-to-config>');
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
      console.log(`Detailed report: ${defaultPath}`);
    }

    // Print JSON if requested
    if (args.json) {
      printJSONReport(result);
    }

    // Exit with appropriate code
    const allPassed = result.sites.every(s => s.overallPassed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('Orchestrated verification failed:', error);
    process.exit(1);
  }
}

main();
