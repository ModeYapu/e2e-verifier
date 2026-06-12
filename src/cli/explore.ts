#!/usr/bin/env ts-node

/**
 * Autonomous Explorer CLI
 * Entry point for the explore command
 */

import * as fs from 'fs';
import * as path from 'path';
import { AutonomousExplorer } from '../explorer/autonomous-explorer';
import { ExplorerReport } from '../explorer/explorer-report';
import { ExploreConfig, ExploreResult, TestExecution } from '../explorer/types';
import { SiteConfig, AuthConfig } from '../types';
import { Logger } from '../utils/logger';

interface ExploreOptions {
  url?: string;
  config?: string;
  auth?: string;
  maxPages: string;
  maxDepth: string;
  model: string;
  apiKey?: string;
  apiBase?: string;
  output: string;
  json: boolean;
  noLlm: boolean;
  timeout: string;
  maxTokens: string;
  temperature: string;
  verbose: boolean;
}

const logger = new Logger({ prefix: 'ExploreCLI' });

function parseArgs(): ExploreOptions {
  const args = process.argv.slice(2);
  const options: ExploreOptions = {
    maxPages: '20',
    maxDepth: '2',
    model: 'glm-4',
    output: 'explorer-output',
    json: false,
    noLlm: false,
    timeout: '30000',
    maxTokens: '2000',
    temperature: '0.7',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-u':
      case '--url':
        options.url = nextArg;
        i++;
        break;
      case '-c':
      case '--config':
        options.config = nextArg;
        i++;
        break;
      case '--auth':
        options.auth = nextArg;
        i++;
        break;
      case '--max-pages':
        options.maxPages = nextArg;
        i++;
        break;
      case '--max-depth':
        options.maxDepth = nextArg;
        i++;
        break;
      case '-m':
      case '--model':
        options.model = nextArg;
        i++;
        break;
      case '-k':
      case '--api-key':
        options.apiKey = nextArg;
        i++;
        break;
      case '-b':
      case '--api-base':
        options.apiBase = nextArg;
        i++;
        break;
      case '-o':
      case '--output':
        options.output = nextArg;
        i++;
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '--no-llm':
        options.noLlm = true;
        break;
      case '--timeout':
        options.timeout = nextArg;
        i++;
        break;
      case '--max-tokens':
        options.maxTokens = nextArg;
        i++;
        break;
      case '--temperature':
        options.temperature = nextArg;
        i++;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);  // Keep for error output
          logger.info('Use --help for usage information');
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  // Help text output - keep console.log for help
  console.log(`
Usage: npm run explore -- [options]

Autonomous E2E exploration mode - discover and test a website automatically

Options:
  -u, --url <url>          Target URL to explore
  -c, --config <path>      Path to site configuration file (JSON)
  --auth <json>            Authentication configuration as JSON string
  --max-pages <number>     Maximum pages to explore (default: 20)
  --max-depth <number>     Maximum navigation depth (default: 2)
  -m, --model <model>      LLM model to use (default: glm-4)
  -k, --api-key <key>      API key for LLM service
  -b, --api-base <url>     Base URL for LLM API
  -o, --output <dir>       Output directory (default: explorer-output)
  -j, --json               Output JSON to stdout
  --no-llm                 Disable LLM and use pure DOM analysis mode
  --timeout <ms>           Timeout for page operations in ms (default: 30000)
  --max-tokens <number>    Maximum tokens for LLM generation (default: 2000)
  --temperature <number>   LLM temperature 0-1 (default: 0.7)
  -v, --verbose            Enable verbose logging
  -h, --help               Show this help message

Examples:
  npm run explore -- --url http://localhost:3000 --no-llm
  npm run explore -- --config sites/logmonitor.json --max-pages 10
  npm run explore -- --url http://example.com --auth '{"loginUrl":"http://example.com/login","username":"user","password":"pass"}'
`);
}

async function main() {
  const options = parseArgs();

  try {
    // Load configuration
    const config = await loadConfig(options);

    logger.info('Starting autonomous exploration');
    logger.info(`Target: ${config.url}`);
    logger.info(`Max pages: ${config.maxPages}, Max depth: ${config.maxDepth}`);
    logger.info(`LLM mode: ${config.useLlm !== false ? 'enabled' : 'disabled (DOM-only)'}`);

    // Run exploration
    const explorer = new AutonomousExplorer(config);
    const result = await explorer.explore();

    // Generate reports
    const reportGenerator = new ExplorerReport();
    reportGenerator.generateReports(result, {
      outputDir: config.outputDir || 'explorer-output',
      includeScreenshots: true,
      includeScripts: true
    });

    // Output results
    if (options.json) {
      console.log(JSON.stringify({
        summary: result.summary,
        finalScript: result.finalScriptPath
      }, null, 2));
    } else {
      // Print summary to console
      printSummary(result);
    }

    // Exit with appropriate code
    const exitCode = result.summary.testsFailed > 0 ? 1 : 0;
    process.exit(exitCode);

  } catch (error) {
    logger.error(`Exploration failed: ${error}`);
    process.exit(1);
  }
}

async function loadConfig(options: ExploreOptions): Promise<ExploreConfig> {
  let siteConfig: SiteConfig | null = null;

  // Load from config file if specified
  if (options.config) {
    const configPath = path.resolve(options.config);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configContent);
    
    // Support multi-site format { "sites": [...] }
    if (parsed.sites && Array.isArray(parsed.sites)) {
      // Use the first site with auth, or first site overall
      const authSite = parsed.sites.find((s: SiteConfig) => s.auth) || parsed.sites[0];
      siteConfig = authSite as SiteConfig;
      logger.info(`Multi-site config: using "${siteConfig.name}" as entry point`);
    } else {
      siteConfig = parsed as SiteConfig;
    }
    logger.info(`Loaded config from: ${configPath}`);
  }

  // Parse auth config
  let auth: AuthConfig | undefined;
  if (options.auth) {
    try {
      auth = JSON.parse(options.auth);
    } catch (error) {
      throw new Error(`Invalid auth JSON: ${error}`);
    }
  } else if (siteConfig?.auth) {
    auth = siteConfig.auth;
  }

  // Build LLM config
  const llmConfig = {
    model: options.model,
    maxSteps: 50,
    apiKey: options.apiKey || process.env.LLM_API_KEY,
    apiBase: options.apiBase || process.env.LLM_API_BASE,
    maxTokens: parseInt(options.maxTokens),
    temperature: parseFloat(options.temperature)
  };

  // Validate API key if LLM is enabled
  if (!options.noLlm && !llmConfig.apiKey) {
    logger.warn('No API key provided, falling back to DOM-only mode');
    options.noLlm = true;
  }

  // Build explore config
  const config: ExploreConfig = {
    url: options.url || siteConfig?.url || '',
    auth,
    maxPages: parseInt(options.maxPages),
    maxDepth: parseInt(options.maxDepth),
    screenshotDir: path.join(options.output, 'screenshots'),
    llm: llmConfig,
    outputDir: options.output,
    useLlm: !options.noLlm,
    timeout: parseInt(options.timeout)
  };

  // Validate URL
  if (!config.url) {
    throw new Error('URL is required. Specify with --url or in config file');
  }

  return config;
}

function printSummary(result: ExploreResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 EXPLORATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\n📊 Discovery:`);
  console.log(`   Pages explored: ${result.summary.pagesExplored}`);
  console.log(`   Screenshots: ${result.summary.screenshotsTaken}`);

  console.log(`\n🧪 Testing:`);
  console.log(`   Tests planned: ${result.summary.testsPlanned}`);
  console.log(`   Tests passed: ${result.summary.testsPassed}`);
  console.log(`   Tests failed: ${result.summary.testsFailed}`);

  const passRate = result.summary.testsPlanned > 0
    ? ((result.summary.testsPassed / result.summary.testsPlanned) * 100).toFixed(1)
    : '0.0';
  console.log(`   Pass rate: ${passRate}%`);

  console.log(`\n⏱️ Duration:`);
  console.log(`   Total: ${Math.round(result.summary.duration / 1000)}s`);

  if (result.summary.totalTokens > 0) {
    console.log(`\n🤖 LLM:`);
    console.log(`   Tokens used: ${result.summary.totalTokens}`);
  }

  console.log(`\n📁 Output:`);
  console.log(`   Directory: ${result.config.outputDir}`);
  console.log(`   Final script: ${result.finalScriptPath}`);

  // Show failed tests if any
  const failedTests = result.executions.filter((e: TestExecution) => !e.passed);
  if (failedTests.length > 0) {
    console.log(`\n❌ Failed tests:`);
    for (const test of failedTests.slice(0, 5)) {
      console.log(`   - ${test.testCase.name}`);
      if (test.error) {
        console.log(`     Error: ${test.error.substring(0, 100)}${test.error.length > 100 ? '...' : ''}`);
      }
    }
    if (failedTests.length > 5) {
      console.log(`   ... and ${failedTests.length - 5} more`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (result.summary.testsFailed === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.log(`⚠️  ${result.summary.testsFailed} test(s) failed`);
  }

  console.log('='.repeat(60) + '\n');
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
