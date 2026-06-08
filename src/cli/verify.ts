import { VerifierPool } from '../verifier-pool';
import { SiteConfig, TestResult } from '../types';
import { ReportGenerator } from '../utils/report';
import { HtmlReportGenerator } from '../utils/html-report';
import * as fs from 'fs';
import * as path from 'path';

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
      console.error('Error: Config file path is required');
      console.error('Usage: npm run verify -- --config <path-to-config>');
      console.error('   or: npm run verify -- <path-to-config>');
      process.exit(1);
    }

    console.log(`Loading config from: ${args.config}`);
    const configs = await loadConfig(args.config);

    console.log(`Found ${configs.length} site(s) to verify\n`);

    // Initialize shared browser
    await pool.init();

    const results: TestResult[] = [];

    for (const config of configs) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Verifying site: ${config.name}`);
      console.log(`URL: ${config.url}`);
      console.log(`${'='.repeat(60)}`);

      const result = await pool.verify(config);
      results.push(result);

      console.log(`\nResult: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Checks: ${result.checks.length} (${result.checks.filter(c => c.passed).length} passed, ${result.checks.filter(c => !c.passed).length} failed)`);
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
      }
      console.log('');
    }

    // Generate report
    const reportGenerator = new ReportGenerator();
    const reportData = reportGenerator.generateReport(results);

    // Save report - wait for write to complete
    reportGenerator.saveLatestReport(reportData);
    const reportPath = reportGenerator.saveJSONReport(reportData);
    console.log(`\nFull report saved: ${reportPath}`);

    // Generate HTML report if output specified
    if (args.output) {
      const htmlPath = args.output.endsWith('.html') ? args.output : `${args.output}.html`;
      const htmlGenerator = new HtmlReportGenerator();
      htmlGenerator.saveHtmlReport(reportData, htmlPath);
      console.log(`HTML report saved: ${htmlPath}`);
    }

    // Print summary
    if (args.json) {
      console.log(JSON.stringify(reportData, null, 2));
    } else {
      reportGenerator.printSummary(reportData);
    }

    // Exit with appropriate code
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
