import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import { Logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger({ prefix: 'Screenshot' });

interface CLIArgs {
  url?: string;
  output?: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' || arg === '-u') {
      result.url = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--width' || arg === '-w') {
      result.width = parseInt(args[++i]);
    } else if (arg === '--height' || arg === '-h') {
      result.height = parseInt(args[++i]);
    } else if (arg === '--full-page' || arg === '-f') {
      result.fullPage = true;
    } else if (!result.url && !arg.startsWith('--')) {
      result.url = arg;
    }
  }

  return result;
}

function generateFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${hostname}-${timestamp}.png`;
  } catch {
    return `screenshot-${Date.now()}.png`;
  }
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.url) {
      logger.error('Error: URL is required');
      logger.error('Usage: npm run screenshot -- --url <url>');
      logger.error('   or: npm run screenshot -- <url>');
      logger.error('');
      logger.error('Options:');
      logger.error('  --output, -o      Output file path');
      logger.error('  --width, -w       Viewport width (default: 1920)');
      logger.error('  --height, -h      Viewport height (default: 1080)');
      logger.error('  --full-page, -f   Capture full page');
      process.exit(1);
    }

    const url = args.url;
    const outputDir = 'screenshots/quick';
    const outputFile = args.output || generateFilename(url);
    const outputPath = path.join(outputDir, outputFile);

    logger.info(`Taking screenshot of: ${url}`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: {
        width: args.width || 1920,
        height: args.height || 1080
      }
    });
    const page = await context.newPage();

    try {
      // Navigate to URL
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Take screenshot
      await page.screenshot({
        path: outputPath,
        fullPage: args.fullPage || false
      });

      logger.info(`Screenshot saved: ${outputPath}`);

    } finally {
      await context.close();
      await browser.close();
    }

    process.exit(0);

  } catch (error) {
    logger.error(`Screenshot failed: ${error}`);
    process.exit(1);
  }
}

main();
