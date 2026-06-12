import { VerifierPool } from '../verifier-pool';
import { SiteConfig, TestResult } from '../types';
import { ReportGenerator } from '../utils/report';
import { HtmlReportGenerator } from '../utils/html-report';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'Verify' });

interface CLIArgs {
  config: string;
  output?: string;
  json?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    config: ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' || arg === '-c') {
      result.config = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (!result.config && !arg.startsWith('--')) {
      result.config = arg;
    }
  }

  return result;
}

async function loadConfig(configPath: string): Promise<SiteConfig[]> {
  const resolvedPath = path.resolve(configPath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(content);
  
  // Support both single site config and array format
  // Format 1: { "sites": [...] } — multi-site array
  // Format 2: { "name": "...", "url": "..." } — single site
  if (parsed.sites && Array.isArray(parsed.sites)) {
    return parsed.sites as SiteConfig[];
  } else {
    return [parsed as SiteConfig];
  }
}

async function main() {
  const pool = new VerifierPool();

  try {
    const args = parseArgs();

    if (!args.config) {
      logger.error('Error: Config file path is required');
      logger.error('Usage: npm run verify -- --config <path-to-config>');
      logger.error('   or: npm run verify -- <path-to-config>');
      process.exit(1);
    }

    logger.info(`Loading config from: ${args.config}`);
    const configs = await loadConfig(args.config);

    logger.info(`Found ${configs.length} site(s) to verify\n`);

    // Initialize shared browser
    await pool.init();

    const results: TestResult[] = [];

    for (const config of configs) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Verifying site: ${config.name}`);
      logger.info(`URL: ${config.url}`);
      logger.info(`${'='.repeat(60)}`);

      const result = await pool.verify(config);
      results.push(result);

      logger.info(`\nResult: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      logger.info(`Duration: ${result.duration}ms`);
      logger.info(`Checks: ${result.checks.length} (${result.checks.filter(c => c.passed).length} passed, ${result.checks.filter(c => !c.passed).length} failed)`);
      if (result.errors.length > 0) {
        logger.info(`Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(e => logger.info(`  - ${e}`));
      }
      logger.info('');
    }

    // Generate report
    const reportGenerator = new ReportGenerator();
    const reportData = reportGenerator.generateReport(results);

    // Save report - wait for write to complete
    reportGenerator.saveLatestReport(reportData);
    const reportPath = reportGenerator.saveJSONReport(reportData);
    logger.info(`\nFull report saved: ${reportPath}`);

    // Generate HTML report if output specified
    if (args.output) {
      const htmlPath = args.output.endsWith('.html') ? args.output : `${args.output}.html`;
      const htmlGenerator = new HtmlReportGenerator();
      htmlGenerator.saveHtmlReport(reportData, htmlPath);
      logger.info(`HTML report saved: ${htmlPath}`);
    }

    // Print summary
    if (args.json) {
      // JSON output - keep console.log for stdout
      logger.info(JSON.stringify(reportData, null, 2));
    } else {
      reportGenerator.printSummary(reportData);
    }

    // Exit with appropriate code
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    logger.error(`Verification failed: ${error}`);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
