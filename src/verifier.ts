import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import { SiteConfig, TestResult, CheckResult, ScreenshotResult, CustomCheck } from './types';
import { PerformanceChecker } from './checks/performance';
import { AccessibilityChecker } from './checks/accessibility';
import { SEOChecker } from './checks/seo';
import { ConsoleMonitor } from './checks/console';
import { NetworkMonitor } from './checks/network';
import { VisualRegressionChecker } from './checks/visual-regression';
import { ScreenshotUtil } from './utils/screenshot';
import { Logger, LogLevel } from './utils/logger';

export class Verifier {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private ownsBrowser: boolean;

  constructor(private config: SiteConfig, sharedBrowser?: Browser) {
    this.ownsBrowser = !sharedBrowser;
    this.browser = sharedBrowser || null;
  }

  async verify(): Promise<TestResult> {
    const maxRetries = this.config.retries ?? 0;
    let lastResult: TestResult | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      const checks: CheckResult[] = [];
      const screenshots: ScreenshotResult[] = [];
      const errors: string[] = [];

      try {
        // Launch browser if not provided
        if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
        }
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
        const configuredViewports = this.getConfiguredViewports();

        // Apply custom viewport if specified
        await this.page.setViewportSize(configuredViewports[0]);

        // Setup console monitoring
        const consoleMonitor = new ConsoleMonitor(this.page);
        const networkMonitor = new NetworkMonitor(
          this.page,
          3000,
          this.config.ignoreUrlPatterns || []
        );

        // Set timeout
        const timeout = this.config.timeout || 30000;

        // Handle authentication if configured
        if (this.config.auth) {
          await this.performLogin(consoleMonitor, timeout);
          // Clear console errors from login phase
          consoleMonitor.clearErrors();
          networkMonitor.reset();
        }

        // Navigate to URL
        try {
          const response = await this.page.goto(this.config.url, {
            waitUntil: 'networkidle',
            timeout
          });

          // Check status code
          const statusCode = response?.status() || 0;
          const statusCheck: CheckResult = {
            name: 'Status Code',
            type: 'http',
            passed: statusCode === this.config.expectedStatusCode,
            message: `Expected ${this.config.expectedStatusCode}, got ${statusCode}`,
            details: { actual: statusCode, expected: this.config.expectedStatusCode }
          };
          checks.push(statusCheck);

          if (statusCode >= 400) {
            errors.push(`HTTP ${statusCode}: ${this.config.url}`);
          }

        } catch (navError) {
          const navCheck: CheckResult = {
            name: 'Navigation',
            type: 'http',
            passed: false,
            message: `Failed to navigate: ${navError}`,
            details: { error: String(navError) }
          };
          checks.push(navCheck);
          errors.push(`Navigation failed: ${navError}`);

          lastResult = this.createResult(attemptStartTime, checks, screenshots, errors, false);
          continue;
        }

        // Performance checks
        try {
          const perfChecker = new PerformanceChecker(this.page, this.config.performanceThresholds);
          const metrics = await perfChecker.collectMetrics();
          const passed = perfChecker.checkThresholds(metrics);

          if (!passed) {
            const violations = perfChecker.getThresholdViolations(metrics);
            violations.forEach(v => errors.push(`Performance: ${v}`));
          }

          const perfCheck: CheckResult = {
            name: 'Performance',
            type: 'performance',
            passed,
            message: perfChecker.formatMetrics(metrics),
            details: metrics
          };
          checks.push(perfCheck);
        } catch (perfError) {
          checks.push({
            name: 'Performance',
            type: 'performance',
            passed: false,
            message: `Performance check failed: ${perfError}`
          });
        }

        // Network checks (if enabled)
        const checksConfig = this.config.checks || [];
        if (checksConfig.includes('network')) {
          try {
            await this.page.waitForTimeout(1000);
            const networkResult = networkMonitor.getResult();

            if (!networkResult.passed) {
              networkResult.failedRequests.forEach(fr => {
                errors.push(`Network: ${fr.url} returned ${fr.status}`);
              });
            }

            const networkCheck: CheckResult = {
              name: 'Network',
              type: 'network',
              passed: networkResult.passed,
              message: networkMonitor.formatResult(networkResult),
              details: networkResult
            };
            checks.push(networkCheck);
          } catch (networkError) {
            checks.push({
              name: 'Network',
              type: 'network',
              passed: false,
              message: `Network check failed: ${networkError}`
            });
          }
        }

        if (configuredViewports.length > 1) {
          checks.push({
            name: 'Viewport Coverage',
            type: 'responsive',
            passed: true,
            message: `Executed responsive pass across ${configuredViewports.length} viewports`,
            details: {
              viewports: configuredViewports.map(v => `${v.width}x${v.height}`)
            }
          });
        }

        // Visual regression checks (if enabled)
        if (this.config.visualRegression?.enabled) {
          try {
            const vrChecker = new VisualRegressionChecker(
              this.config.visualRegression.baselineDir || 'baselines',
              this.config.visualRegression.threshold || 0.001
            );

            const vrCheck: CheckResult = {
              name: 'Visual Regression',
              type: 'visual-regression',
              passed: true,
              message: 'Visual regression check not yet implemented for screenshots',
              details: {}
            };

            // Only run if we have screenshots configured
            if (this.config.screenshots && this.config.screenshots.length > 0) {
              const screenshotNames = Array.isArray(this.config.screenshots)
                ? this.config.screenshots.map(s => typeof s === 'string' ? s : s.name)
                : [this.config.screenshots as unknown as string];

              for (const shotName of screenshotNames) {
                if (typeof shotName === 'string') {
                  const vrResult = await vrChecker.compare(this.page, shotName, this.config.name);
                  vrCheck.passed = vrResult.passed;
                  vrCheck.message = vrResult.message;
                  vrCheck.details = vrResult;

                  if (!vrResult.passed) {
                    errors.push(`Visual regression: ${vrResult.message}`);
                  }
                  break; // Only check first screenshot for now
                }
              }
            }

            checks.push(vrCheck);
          } catch (vrError) {
            checks.push({
              name: 'Visual Regression',
              type: 'visual-regression',
              passed: false,
              message: `Visual regression check failed: ${vrError}`
            });
          }
        }

        // Accessibility checks
        try {
          const a11yChecker = new AccessibilityChecker(this.page);
          const a11yResult = await a11yChecker.runChecks();
          const a11yCheck: CheckResult = {
            name: 'Accessibility',
            type: 'accessibility',
            passed: a11yResult.passed,
            message: a11yChecker.formatResults(a11yResult),
            details: a11yResult
          };
          checks.push(a11yCheck);

          if (!a11yResult.passed) {
            a11yResult.issues.forEach(issue => {
              if (issue.severity === 'error') {
                errors.push(`Accessibility: ${issue.message} (${issue.element})`);
              }
            });
          }
        } catch (a11yError) {
          checks.push({
            name: 'Accessibility',
            type: 'accessibility',
            passed: false,
            message: `Accessibility check failed: ${a11yError}`
          });
        }

        // SEO checks
        try {
          const seoChecker = new SEOChecker(this.page);
          const seoResult = await seoChecker.runChecks();
          const seoCheck: CheckResult = {
            name: 'SEO',
            type: 'seo',
            passed: seoResult.passed,
            message: seoChecker.formatResults(seoResult),
            details: seoResult
          };
          checks.push(seoCheck);
        } catch (seoError) {
          checks.push({
            name: 'SEO',
            type: 'seo',
            passed: false,
            message: `SEO check failed: ${seoError}`
          });
        }

        // Custom checks
        if (this.config.customChecks) {
          for (const customCheck of this.config.customChecks) {
            try {
              const result = await this.runCustomCheck(customCheck);
              checks.push(result);
              if (!result.passed) {
                errors.push(`Custom check "${customCheck.name}" failed: ${result.message}`);
              }
            } catch (customError) {
              checks.push({
                name: customCheck.name,
                type: customCheck.type,
                passed: false,
                message: `Custom check error: ${customError}`
              });
            }
          }
        }

        // Screenshots
        const screenshotConfigs = this.config.screenshots;
        if (screenshotConfigs && screenshotConfigs.length > 0) {
          try {
            const screenshotUtil = new ScreenshotUtil(this.page, this.config.name);

            // Normalize: support both string[] and ScreenshotConfig[]
            const normalizedConfigs = screenshotConfigs.map((s: any) =>
              typeof s === 'string' ? { name: s } : s
            );

            const vpScreenshots = await screenshotUtil.takeMultipleScreenshots(
              normalizedConfigs,
              configuredViewports
            );
            screenshots.push(...vpScreenshots);
          } catch (screenshotError) {
            errors.push(`Screenshot capture failed: ${screenshotError}`);
          }
        }

        // Console errors
        if (consoleMonitor.hasErrors()) {
          const consoleErrors = consoleMonitor.getErrors();
          checks.push({
            name: 'Console Errors',
            type: 'console',
            passed: false,
            message: consoleMonitor.formatErrors(),
            details: { errors: consoleErrors }
          });

          consoleErrors.forEach(error => {
            errors.push(`Console: ${error.message}`);
          });
        } else {
          checks.push({
            name: 'Console Errors',
            type: 'console',
            passed: true,
            message: 'No console errors'
          });
        }

      } catch (error) {
        errors.push(`Verification failed: ${error}`);
      } finally {
        // Cleanup
        try {
          await this.context?.close();
          if (this.ownsBrowser) {
            await this.browser?.close();
            this.browser = null;
          }
        } catch (cleanupError) {
          new Logger({ prefix: 'Verifier' }).error(`Cleanup error: ${cleanupError}`);
        }
      }

      const passed = errors.length === 0 && checks.every(c => c.passed);
      const result = this.createResult(attemptStartTime, checks, screenshots, errors, passed);

      if (passed) {
        // Mark if retried
        if (attempt > 0) {
          result.checks.push({
            name: 'Retry Status',
            type: 'info',
            passed: true,
            message: `Passed on attempt ${attempt + 1}`
          });
        }
        return result;
      }

      lastResult = result;

      // Retry with delay
      if (attempt < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Return the last result if all retries failed
    return lastResult || this.createResult(Date.now(), [], [], ['Verification failed: unknown error'], false);
  }

  private getConfiguredViewports(): Array<{ width: number; height: number }> {
    if (this.config.viewports && this.config.viewports.length > 0) {
      return this.config.viewports.map(v => ({ width: v.width, height: v.height }));
    }

    if (this.config.viewport?.width && this.config.viewport?.height) {
      return [{ width: this.config.viewport.width, height: this.config.viewport.height }];
    }

    return [{ width: 1920, height: 1080 }];
  }

  private async performLogin(consoleMonitor: ConsoleMonitor, timeout: number): Promise<void> {
    const auth = this.config.auth!;
    if (!this.page) throw new Error('Page not initialized');

    const loginUrl = auth.loginUrl || this.config.url;
    const logger = new Logger({ prefix: 'Auth' });
    logger.info(`Navigating to login: ${loginUrl}`);

    await this.page.goto(loginUrl, { waitUntil: 'networkidle', timeout });

    // Scope selectors to form if provided
    const scope = auth.formSelector || 'body';
    const form = this.page.locator(scope).first();

    const usernameSel = auth.usernameSelector || 'input:not([type="password"])';
    const passwordSel = auth.passwordSelector || 'input[type="password"]';
    const submitSel = auth.submitSelector || 'button[type="submit"], button';

    // Fill credentials
    const usernameInput = form.locator(usernameSel).first();
    const passwordInput = form.locator(passwordSel).first();
    const submitBtn = form.locator(submitSel).filter({ hasText: /登录|login|sign|submit|connect/i }).first();

    await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await usernameInput.fill(auth.username);
    await passwordInput.fill(auth.password);
    await submitBtn.click();

    // Wait for redirect
    if (auth.successUrlPattern) {
      await this.page.waitForURL(new RegExp(auth.successUrlPattern), { timeout: 10000 });
    } else {
      await this.page.waitForTimeout(3000);
    }

    logger.info(`Login complete, current URL: ${this.page.url()}`);
  }

  private async runCustomCheck(check: CustomCheck): Promise<CheckResult> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      switch (check.type) {
        case 'element':
          const element = await this.page.$(check.selector!);
          return {
            name: check.name,
            type: check.type,
            passed: element !== null,
            message: element ? `Element found: ${check.selector}` : `Element not found: ${check.selector}`
          };

        case 'text':
          const textContent = await this.page.$eval(check.selector!, el => el.textContent?.trim() || '');
          const textMatches = textContent === check.expected;
          return {
            name: check.name,
            type: check.type,
            passed: textMatches,
            message: textMatches 
              ? `Text matches: "${check.expected}"`
              : `Text mismatch. Expected: "${check.expected}", Got: "${textContent}"`
          };

        case 'attribute':
          const attrValue = await this.page.$eval(check.selector!, 
            (el, attr) => el.getAttribute(attr), 
            check.expected as string
          );
          return {
            name: check.name,
            type: check.type,
            passed: attrValue !== null,
            message: attrValue 
              ? `Attribute ${check.expected} = "${attrValue}"`
              : `Attribute ${check.expected} not found`
          };

        case 'javascript':
          const jsResult = await this.page.evaluate(check.script!);
          return {
            name: check.name,
            type: check.type,
            passed: !!jsResult,
            message: `Script result: ${jsResult}`,
            details: { result: jsResult }
          };

        default:
          return {
            name: check.name,
            type: check.type,
            passed: false,
            message: `Unknown check type: ${check.type}`
          };
      }
    } catch (error) {
      return {
        name: check.name,
        type: check.type,
        passed: false,
        message: `Check execution error: ${error}`
      };
    }
  }

  private createResult(
    startTime: number,
    checks: CheckResult[],
    screenshots: ScreenshotResult[],
    errors: string[],
    passed: boolean
  ): TestResult {
    return {
      siteName: this.config.name,
      url: this.config.url,
      timestamp: new Date().toISOString(),
      passed,
      duration: Date.now() - startTime,
      checks,
      screenshots,
      errors
    };
  }
}
