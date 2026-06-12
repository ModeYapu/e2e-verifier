import { ReportGenerator } from '../utils/report';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'Report' });

interface CLIArgs {
  input?: string;
  json?: boolean;
  summary?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      result.input = args[++i];
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--summary' || arg === '-s') {
      result.summary = true;
    } else if (!result.input && !arg.startsWith('--') && arg.endsWith('.json')) {
      result.input = arg;
    }
  }

  return result;
}

async function main() {
  try {
    const args = parseArgs();
    
    // Determine input file
    let inputPath = args.input;
    if (!inputPath) {
      // Try to find latest report
      const reportsDir = 'reports';
      const latestPath = path.join(reportsDir, 'latest.json');
      
      if (fs.existsSync(latestPath)) {
        inputPath = latestPath;
      } else {
        // Find most recent report file
        if (fs.existsSync(reportsDir)) {
          const files = fs.readdirSync(reportsDir)
            .filter(f => f.startsWith('report-') && f.endsWith('.json'))
            .sort()
            .reverse();

          if (files.length > 0) {
            inputPath = path.join(reportsDir, files[0]);
          }
        }
      }
    }

    if (!inputPath || !fs.existsSync(inputPath)) {
      logger.error('Error: No report file found');  // Keep for error output
      logger.error('Usage: npm run report -- --input <path-to-report>');
      logger.error('   or: npm run report -- <path-to-report>');
      logger.error('   or: npm run report (uses latest report)');
      process.exit(1);
    }

    logger.info(`Reading report from: ${inputPath}`);
    const content = fs.readFileSync(inputPath, 'utf-8');
    const reportData = JSON.parse(content);

    const reportGenerator = new ReportGenerator();

    if (args.json) {
      // JSON output - keep console.log for stdout
      logger.info(JSON.stringify(reportData, null, 2));
    } else if (args.summary) {
      const summary = reportGenerator.generateSummary(reportData);
      logger.info(summary);  // Keep console.log for user output

      // Also save the summary
      const summaryPath = reportGenerator.saveSummary(reportData);
      logger.info(`\nSummary saved: ${summaryPath}`);
    } else {
      // Default: print summary
      reportGenerator.printSummary(reportData);
    }

    process.exit(0);

  } catch (error) {
    logger.error(`Report generation failed: ${error}`);
    process.exit(1);
  }
}

main();
