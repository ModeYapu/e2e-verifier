/**
 * Script Engine for Agent Loop
 * Writes Playwright scripts to disk and executes them in isolation
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ScriptExecutionResult, SandboxOptions } from './types';

const execFileAsync = promisify(execFile);

/**
 * Script Engine for managing Playwright script lifecycle
 */
export class ScriptEngine {
  private scriptsDir: string;
  private sandboxCounter: number = 0;
  private scriptCounter: number = 0;

  constructor(scriptsDir: string = 'scripts') {
    this.scriptsDir = scriptsDir;
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.scriptsDir,
      path.join(this.scriptsDir, 'sandbox'),
      path.join(this.scriptsDir, 'final')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Write a Playwright script to disk
   * @param script TypeScript/JavaScript code for Playwright test
   * @param name Name for the script file
   * @returns Full path to the written script
   */
  writeScript(script: string, name: string): string {
    // Strip markdown code block markers if present
    const cleanedScript = this.stripCodeBlocks(script);
    this.scriptCounter++;
    const filename = `${name}-${this.scriptCounter}.ts`;
    const filepath = path.join(this.scriptsDir, filename);

    // Ensure the script has proper imports and structure
    const wrappedScript = this.wrapScript(cleanedScript);

    fs.writeFileSync(filepath, wrappedScript, 'utf-8');
    console.log(`Script written: ${filepath}`);
    
    return filepath;
  }

  /**
   * Strip markdown code block markers from script content
   */
  private stripCodeBlocks(script: string): string {
    // Remove opening ```typescript, ```javascript, ```ts, ```js, ``` etc.
    let cleaned = script.replace(/^```\w*\s*\n/gm, '');
    // Remove closing ```
    cleaned = cleaned.replace(/^```\s*$/gm, '');
    // Trim whitespace
    cleaned = cleaned.trim();
    return cleaned;
  }

  /**
   * Wrap script code in proper Playwright test structure
   */
  private wrapScript(script: string): string {
    // If script already uses standalone imports, return as-is
    if (script.includes('chromium.launch(') || script.includes('require(')) {
      return script;
    }

    // If script uses test runner DSL (test(), expect()), wrap it in standalone mode
    if (script.includes('import { test') || script.includes("from '@playwright/test'")) {
      // Extract the test body
      const testBodyMatch = script.match(/test\s*\([^)]*\)\s*{\s*(?:async\s+)?(?:\(\s*{\s*page\s*}\s*\)\s*)?=>\s*{([\s\S]*?)}\s*\)\s*;/);
      const testCode = testBodyMatch ? testBodyMatch[1] : script;
      return `import { chromium } from '@playwright/test';\n\nasync function main() {\n  const browser = await chromium.launch({ headless: true });\n  const page = await browser.newPage();\n  try {\n    ${testCode.split('\\n').map(line => '    ' + line).join('\\n')}\n  } finally {\n    await browser.close();\n  }\n}\n\nmain().catch(console.error);`;
    }

    // Raw script code — wrap in standalone template
    return `import { chromium } from '@playwright/test';\n\nasync function main() {\n  const browser = await chromium.launch({ headless: true });\n  const page = await browser.newPage();\n  try {\n    ${script.split('\\n').map(line => '    ' + line).join('\\n')}\n  } finally {\n    await browser.close();\n  }\n}\n\nmain().catch(console.error);`;
  }

  /**
   * Execute a Playwright script and capture results
   * @param scriptPath Path to the script file
   * @param options Execution options
   * @returns Execution result with output, screenshots, and exit code
   */
  async executeScript(
    scriptPath: string,
    options?: { timeout?: number }
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const timeout = options?.timeout || 30000; // 30 seconds default

    console.log(`Executing script: ${scriptPath}`);

    try {
      // Create temporary directory for this execution's artifacts
      const execId = `exec-${Date.now()}`;
      const reportDir = path.join(this.scriptsDir, 'reports', execId);
      fs.mkdirSync(reportDir, { recursive: true });

      // Run Playwright script with ts-node
      const { stdout, stderr } = await execFileAsync('npx', [
        'ts-node',
        scriptPath
      ], {
        timeout,
        cwd: process.cwd()  // Use e2e-verifier root as cwd (where node_modules lives)
      });

      const duration = Date.now() - startTime;
      
      // Collect screenshots from the report directory
      const screenshots = this.findScreenshots(reportDir);

      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        screenshots,
        exitCode: 0,
        duration,
        success: true
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Even on error, try to collect any screenshots that were created
      const screenshots = this.findScreenshots(path.join(this.scriptsDir, 'reports'));

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        screenshots,
        exitCode: error.code || 1,
        duration,
        success: false
      };
    }
  }

  /**
   * Find all screenshot files in a directory
   */
  private findScreenshots(dir: string): string[] {
    const screenshots: string[] = [];

    if (!fs.existsSync(dir)) {
      return screenshots;
    }

    const findScreenshotsRecursive = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          findScreenshotsRecursive(fullPath);
        } else if (entry.isFile() && this.isScreenshotFile(entry.name)) {
          screenshots.push(fullPath);
        }
      }
    };

    findScreenshotsRecursive(dir);
    return screenshots;
  }

  /**
   * Check if a file is a screenshot
   */
  private isScreenshotFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  }

  /**
   * Create a sandbox environment with minimal Playwright test template
   * @param url Target URL for the test
   * @param options Sandbox options
   * @returns Path to the created sandbox directory
   */
  createSandbox(url: string, options?: SandboxOptions): string {
    const sandboxId = `sandbox-${this.sandboxCounter++}-${Date.now()}`;
    const sandboxDir = path.join(this.scriptsDir, 'sandbox', sandboxId);
    
    fs.mkdirSync(sandboxDir, { recursive: true });

    // Create minimal Playwright config for sandbox
    const playwrightConfig = {
      testDir: '.',
      timeout: options?.timeout || 30000,
      use: {
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
      }
    };

    fs.writeFileSync(
      path.join(sandboxDir, 'playwright.config.json'),
      JSON.stringify(playwrightConfig, null, 2),
      'utf-8'
    );

    // Create a basic test template
    const testTemplate = `import { test } from '@playwright/test';

test('sandbox test', async ({ page }) => {
  await page.goto('${url}');
  await page.waitForLoadState('networkidle');
  
  // Add your test code here
  
});`;

    const testFile = path.join(sandboxDir, 'sandbox-test.ts');
    fs.writeFileSync(testFile, testTemplate, 'utf-8');

    console.log(`Sandbox created: ${sandboxDir}`);
    return sandboxDir;
  }

  /**
   * Clean up script artifacts
   * @param scriptPath Path to script to clean up
   */
  cleanup(scriptPath: string): void {
    try {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
        console.log(`Cleaned up script: ${scriptPath}`);
      }

      // Clean up associated report directory if it exists
      const scriptBasename = path.basename(scriptPath, path.extname(scriptPath));
      const reportDir = path.join(this.scriptsDir, 'reports', scriptBasename);
      
      if (fs.existsSync(reportDir)) {
        fs.rmSync(reportDir, { recursive: true, force: true });
        console.log(`Cleaned up report directory: ${reportDir}`);
      }
    } catch (error) {
      console.warn(`Failed to clean up script ${scriptPath}:`, error);
    }
  }

  /**
   * Clean up old sandbox directories
   * @param maxAge Maximum age in milliseconds (default: 24 hours)
   */
  cleanupOldSandboxes(maxAge: number = 24 * 60 * 60 * 1000): void {
    const sandboxDir = path.join(this.scriptsDir, 'sandbox');
    
    if (!fs.existsSync(sandboxDir)) {
      return;
    }

    const now = Date.now();
    const entries = fs.readdirSync(sandboxDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(sandboxDir, entry.name);
      const stats = fs.statSync(fullPath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`Cleaned up old sandbox: ${entry.name}`);
        } catch (error) {
          console.warn(`Failed to clean up sandbox ${entry.name}:`, error);
        }
      }
    }
  }

  /**
   * Get path to scripts directory
   */
  getScriptsDir(): string {
    return this.scriptsDir;
  }

  /**
   * Save final script to the final/ directory
   * @param script Script content
   * @param name Name for the script
   * @returns Path to saved final script
   */
  saveFinalScript(script: string, name: string): string {
    const finalDir = path.join(this.scriptsDir, 'final');
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.ts`;
    const filepath = path.join(finalDir, filename);

    const wrappedScript = this.wrapScript(script);
    fs.writeFileSync(filepath, wrappedScript, 'utf-8');

    console.log(`Final script saved: ${filepath}`);
    return filepath;
  }
}
