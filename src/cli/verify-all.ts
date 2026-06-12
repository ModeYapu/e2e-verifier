import { VerifierPool } from '../verifier-pool';
import { SiteConfig, TestResult } from '../types';
import { ReportGenerator } from '../utils/report';
import { HtmlReportGenerator } from '../utils/html-report';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logger = new Logger({ prefix: 'VerifyAll' });

interface CLIArgs {
  sitesDir?: string;
  output?: string;
  json?: boolean;
  parallel?: number;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sites-dir' || arg === '-d') {
      result.sitesDir = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--parallel' || arg === '-p') {
      result.parallel = parseInt(args[++i], 10);
    }
  }

  return result;
}

async function loadAllConfigs(sitesDir: string): Promise<SiteConfig[]> {
  const resolvedDir = path.resolve(sitesDir);
  
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Sites directory not found: ${resolvedDir}`);
  }

  const configs: SiteConfig[] = [];
  const files = fs.readdirSync(resolvedDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(resolvedDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(content);
        configs.push(config);
      } catch (error) {
        logger.error(`Error loading config from ${file}: ${error}`);
      }
    }
  }

  return configs;
}

async function main() {
  const pool = new VerifierPool();

  try {
    const args = parseArgs();
    const sitesDir = args.sitesDir || 'sites';

    // Determine parallelism (default: min of CPU cores or 4)
    const defaultParallel = Math.min(os.cpus().length, 4);
    const parallel = args.parallel || defaultParallel;

    logger.info(`Loading configs from: ${sitesDir}`);
    const configs = await loadAllConfigs(sitesDir);

    if (configs.length === 0) {
      logger.error('No site configs found in directory');
      process.exit(1);
    }

    logger.info(`Found ${configs.length} site(s) to verify`);
    if (parallel > 1) {
      logger.info(`Running with parallelism: ${parallel}`);
    }
    logger.info('');

    const results = await pool.verifyAll(configs, { parallel });

    for (const result of results) {
      const status = result.passed ? '✓ PASSED' : '✗ FAILED';
      logger.info(`${result.siteName}: ${status} (${result.duration}ms)`);
    }
    logger.info('');

    // Generate report
    const reportGenerator = new ReportGenerator();
    const reportData = reportGenerator.generateReport(results);

    // Save report
    reportGenerator.saveLatestReport(reportData);
    const jsonReportPath = reportGenerator.saveJSONReport(reportData);
    logger.info(`JSON report saved: ${jsonReportPath}`);

    const summaryPath = reportGenerator.saveSummary(reportData);
    logger.info(`Summary report saved: ${summaryPath}`);

    // Generate HTML report if output specified
    if (args.output) {
      const htmlPath = args.output.endsWith('.html') ? args.output : `${args.output}.html`;
      const htmlGenerator = new HtmlReportGenerator();
      htmlGenerator.saveHtmlReport(reportData, htmlPath);
      logger.info(`HTML report saved: ${htmlPath}`);
    }

    // Print summary
    logger.info('');
    if (args.json) {
      // JSON output - keep console.log for stdout
      console.log(JSON.stringify(reportData, null, 2));
    } else {
      reportGenerator.printSummary(reportData);
    }

    // Exit with appropriate code
    process.exit(reportData.failedSites === 0 ? 0 : 1);

  } catch (error) {
    logger.error(`Batch verification failed: ${error}`);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
