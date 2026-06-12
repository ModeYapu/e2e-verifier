/**
 * Test Generator - LLM-powered test generation
 * Generates test plans and Playwright scripts from page analysis
 */

import { LLMClient } from '../agent/llm-client';
import { LLMRegistry } from '../llm/llm-registry';
import { AgentConfig } from '../agent/types';
import {
  PageAnalysis,
  TestPlan,
  PageTestPlan,
  TestCase,
  ExploreConfig
} from './types';
import { AuthConfig } from '../types';
import { Logger } from '../utils/logger';

/**
 * Parsed page test plan from LLM response
 */
interface ParsedPageTestPlan {
  url?: string;
  pageName?: string;
  tests?: ParsedTestCase[];
}

/**
 * Parsed test case from LLM response
 */
interface ParsedTestCase {
  name?: string;
  description?: string;
  steps?: unknown;
  assertions?: unknown;
  priority?: string;
  estimatedDuration?: number;
}

const TEST_GENERATION_SYSTEM_PROMPT = `You are an expert E2E test automation engineer specializing in Playwright.
Your task is to analyze page structures and generate comprehensive test plans.

Generate tests that cover:
1. Critical user flows and functionality
2. Form validation and submission
3. Navigation between pages
4. Data display and interaction (tables, lists)
5. Edge cases and error conditions

For each test, provide:
- A clear, descriptive name
- A description of what is being tested
- Step-by-step instructions in natural language
- Expected results/assertions
- Priority level (high/medium/low)

Respond in JSON format with a "thought" section and an "action" section containing the test plan.`;

const SCRIPT_GENERATION_SYSTEM_PROMPT = `You are an expert Playwright test automation engineer.
Generate standalone, executable Playwright TypeScript code based on the given test case and page analysis.

Requirements:
1. Use standalone mode (chromium.launch, not test())
2. Include proper error handling
3. Add assertions to verify expected behavior
4. Include helpful comments for complex logic
5. Make selectors robust and reliable
6. Include cleanup in finally block

Code structure:
\`\`\`typescript
import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Test implementation here
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
\`\`\`

Respond in the format:
<thought>Your reasoning</thought>
<action>
type: write_script
content: <typescript code here>
</action>`;

export class TestGenerator {
  private llm: LLMClient;
  private logger: Logger;

  constructor(config: AgentConfig) {
    this.llm = LLMRegistry.getInstance().createClient(config);
    this.logger = new Logger({ prefix: 'TestGenerator' });
  }

  /**
   * Generate a comprehensive test plan from multiple page analyses
   */
  async generatePlan(analyses: PageAnalysis[]): Promise<TestPlan> {
    this.logger.info(`Generating test plan from ${analyses.length} page analyses`);

    const prompt = this.buildPlanPrompt(analyses);

    try {
      const response = await this.llm.chatCompletion(
        TEST_GENERATION_SYSTEM_PROMPT,
        [{ role: 'user', content: prompt }],
        { timeout: 60000 }
      );

      // Parse the test plan from the response
      const plan = this.parseTestPlan(response.raw, analyses);
      this.logger.info(`Generated test plan with ${plan.totalTests} tests`);

      return plan;
    } catch (error) {
      this.logger.error(`Failed to generate test plan: ${error}`);
      // Fallback to heuristic-based plan
      return this.generateFallbackPlan(analyses);
    }
  }

  /**
   * Generate tests for a single page
   */
  async generateTests(analysis: PageAnalysis): Promise<TestCase[]> {
    this.logger.info(`Generating tests for page: ${analysis.url}`);

    const prompt = this.buildSinglePagePrompt(analysis);

    try {
      const response = await this.llm.chatCompletion(
        TEST_GENERATION_SYSTEM_PROMPT,
        [{ role: 'user', content: prompt }],
        { timeout: 60000 }
      );

      return this.parseTestCases(response.raw);
    } catch (error) {
      this.logger.error(`Failed to generate tests: ${error}`);
      // Fallback to heuristic-based tests
      return this.generateFallbackTests(analysis);
    }
  }

  /**
   * Generate a Playwright script for a specific test case
   */
  async generateScript(
    testCase: TestCase,
    pageAnalysis: PageAnalysis,
    auth?: AuthConfig
  ): Promise<string> {
    this.logger.info(`Generating script for test: ${testCase.name}`);

    const prompt = this.buildScriptPrompt(testCase, pageAnalysis, auth);

    try {
      const response = await this.llm.chatCompletion(
        SCRIPT_GENERATION_SYSTEM_PROMPT,
        [{ role: 'user', content: prompt }],
        { timeout: 60000 }
      );

      const script = this.extractScriptContent(response.raw);
      return script;
    } catch (error) {
      this.logger.error(`Failed to generate script: ${error}`);
      // Fallback to basic script template
      return this.generateFallbackScript(testCase, pageAnalysis, auth);
    }
  }

  /**
   * Merge multiple test scripts into one comprehensive script
   */
  mergeScripts(scripts: string[], auth?: AuthConfig): string {
    this.logger.info(`Merging ${scripts.length} test scripts`);

    const testFunctions: string[] = [];

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      // Extract the main logic from each script
      const extracted = this.extractMainLogic(script, i);
      testFunctions.push(extracted);
    }

    const authBlock = auth ? this.generateAuthBlock(auth) : '';

    const mergedScript = `import { chromium } from '@playwright/test';

/**
 * Auto-generated E2E test suite from autonomous exploration
 * Generated: ${new Date().toISOString()}
 */

async function performLogin(page: Page) {
${authBlock}
}

${testFunctions.join('\n\n')}

/**
 * Main test runner - executes all tests
 */
async function runAllTests(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    logger.info('Starting comprehensive E2E test suite...');

${testFunctions.map((_, i) => `    await test${i + 1}(page);
    logger.info('Test ${i + 1} completed');`).join('\n')}

    logger.info('All tests completed successfully');
  } catch (error) {
    logger.error('Test suite failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run tests if executed directly
if (require.main === module) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  runAllTests(baseUrl).catch(console.error);
}

export { runAllTests };
`;

    return mergedScript;
  }

  /**
   * Build prompt for test plan generation
   */
  private buildPlanPrompt(analyses: PageAnalysis[]): string {
    const pagesSummary = analyses.map(a => `
Page: ${a.title}
URL: ${a.url}
Navigation Items: ${a.navigation.length}
Interactive Elements: ${a.interactiveElements.length}
Forms: ${a.forms.length}
Tables: ${a.tables.length}
`).join('\n');

    return `Generate a comprehensive test plan for the following website:

${pagesSummary}

Create a test plan that:
1. Tests critical user flows across all pages
2. Validates form submissions and data entry
3. Verifies navigation between pages
4. Tests data display and filtering (tables, lists)
5. Includes negative test cases where appropriate

Return the test plan in the following JSON format within your action:
{
  "pages": [
    {
      "url": "page URL",
      "pageName": "Page Name",
      "tests": [
        {
          "name": "Test name",
          "description": "What is being tested",
          "steps": ["step 1", "step 2"],
          "assertions": ["expected result 1", "expected result 2"],
          "priority": "high|medium|low"
        }
      ]
    }
  ]
}`;
  }

  /**
   * Build prompt for single page test generation
   */
  private buildSinglePagePrompt(analysis: PageAnalysis): string {
    return `Generate test cases for the following page:

Title: ${analysis.title}
URL: ${analysis.url}

DOM Summary:
${analysis.domSummary}

Navigation (${analysis.navigation.length} items):
${analysis.navigation.slice(0, 10).map(n => `- ${n.text}: ${n.href}`).join('\n')}

Interactive Elements (${analysis.interactiveElements.length}):
${analysis.interactiveElements.slice(0, 15).map(e => `- ${e.type}: ${e.text} (${e.action})`).join('\n')}

Forms (${analysis.forms.length}):
${analysis.forms.map(f => `- ${f.selector}: ${f.fields.length} fields`).join('\n')}

Tables (${analysis.tables.length}):
${analysis.tables.map(t => `- ${t.selector}: ${t.rowCount} rows, ${t.headers.length} columns`).join('\n')}

Suggested Tests:
${analysis.suggestedTests.join('\n')}

Generate 3-7 test cases covering the most important functionality.`;
  }

  /**
   * Build prompt for script generation
   */
  private buildScriptPrompt(testCase: TestCase, pageAnalysis: PageAnalysis, auth?: AuthConfig): string {
    return `Generate a Playwright TypeScript script for the following test:

Test Name: ${testCase.name}
Description: ${testCase.description}
Target URL: ${pageAnalysis.url}

Test Steps:
${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Expected Assertions:
${testCase.assertions.map(a => `- ${a}`).join('\n')}

Page Context:
- Title: ${pageAnalysis.title}
- Forms: ${pageAnalysis.forms.map(f => `${f.selector} (${f.fields.length} fields)`).join(', ')}
- Buttons: ${pageAnalysis.interactiveElements.filter(e => e.type === 'button').map(b => b.text).join(', ')}

${auth ? `Authentication required: Yes
Login URL: ${auth.loginUrl || pageAnalysis.url}
Username: ${auth.username}` : 'Authentication required: No'}

Generate a complete, standalone Playwright script that executes this test.`;
  }

  /**
   * Parse test plan from LLM response
   */
  private parseTestPlan(response: string, analyses: PageAnalysis[]): TestPlan {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        // Ensure proper structure
        const pages: PageTestPlan[] = (parsed.pages || []).map((p: ParsedPageTestPlan) => ({
          url: p.url || '',
          pageName: p.pageName || p.url || '',
          tests: (p.tests || []).map((t: ParsedTestCase) => this.normalizeTestCase(t))
        }));

        const totalTests = pages.reduce((sum, p) => sum + p.tests.length, 0);

        return {
          pages,
          totalTests,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to parse test plan JSON: ${error}`);
    }

    // Fallback to heuristic-based plan
    return this.generateFallbackPlan(analyses);
  }

  /**
   * Parse test cases from LLM response
   */
  private parseTestCases(response: string): TestCase[] {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        const tests = Array.isArray(parsed) ? parsed : (parsed.tests || []);
        return tests.map((t: ParsedTestCase) => this.normalizeTestCase(t));
      }
    } catch (error) {
      this.logger.warn(`Failed to parse test cases JSON: ${error}`);
    }

    return [];
  }

  /**
   * Normalize test case to ensure all required fields
   */
  private normalizeTestCase(t: ParsedTestCase): TestCase {
    return {
      name: t.name || 'Unnamed Test',
      description: t.description || t.name || '',
      steps: Array.isArray(t.steps) ? t.steps : [t.steps || 'Execute test'],
      assertions: Array.isArray(t.assertions) ? t.assertions : [t.assertions || 'Test passes'],
      priority: (t.priority || 'medium') as 'high' | 'medium' | 'low',
      estimatedDuration: t.estimatedDuration || 5000
    };
  }

  /**
   * Extract script content from LLM response
   */
  private extractScriptContent(response: string): string {
    // Try to extract TypeScript code block
    const tsMatch = response.match(/```(?:typescript|ts)\s*([\s\S]*?)\s*```/);
    if (tsMatch) {
      return tsMatch[1].trim();
    }

    // Try generic code block
    const codeMatch = response.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }

    // Return as-is if no code blocks found
    return response.trim();
  }

  /**
   * Extract main logic from a script for merging
   */
  private extractMainLogic(script: string, index: number): string {
    // Remove imports
    let cleaned = script.replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '');

    // Remove main function wrapper
    const mainMatch = cleaned.match(/async\s+function\s+main\(\)\s*\{([\s\S]*)\}/);
    if (mainMatch) {
      cleaned = mainMatch[1];
    }

    // Create a named test function
    const functionName = `test${index + 1}`;
    const lines = cleaned.split('\n');
    const indentedBody = lines.map(line => '  ' + line).join('\n');

    return `async function ${functionName}(page: Page) {
${indentedBody}
}`;
  }

  /**
   * Generate auth block for login
   */
  private generateAuthBlock(auth: AuthConfig): string {
    const loginUrl = auth.loginUrl || '';
    const username = auth.username;
    const usernameSelector = auth.usernameSelector || 'input:not([type="password"])';
    const passwordSelector = auth.passwordSelector || 'input[type="password"]';
    const submitSelector = auth.submitSelector || 'button[type="submit"]';

    return `  // Perform login
  await page.goto('${loginUrl}');
  const scope = '${auth.formSelector || 'body'}';
  const form = page.locator(scope).first();

  await form.locator('${usernameSelector}').fill('${username}');
  await form.locator('${passwordSelector}').fill('${auth.password}');
  await form.locator('${submitSelector}').click();

${auth.successUrlPattern ? `  await page.waitForURL(new RegExp('${auth.successUrlPattern}'));` : `  await page.waitForTimeout(3000);`}
  logger.info('Login successful');`;
  }

  /**
   * Generate fallback test plan based on heuristics
   */
  private generateFallbackPlan(analyses: PageAnalysis[]): TestPlan {
    const pages: PageTestPlan[] = [];

    for (const analysis of analyses) {
      const tests = this.generateFallbackTests(analysis);
      pages.push({
        url: analysis.url,
        pageName: analysis.title,
        tests
      });
    }

    const totalTests = pages.reduce((sum, p) => sum + p.tests.length, 0);

    return {
      pages,
      totalTests,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate fallback tests based on page analysis heuristics
   */
  private generateFallbackTests(analysis: PageAnalysis): TestCase[] {
    const tests: TestCase[] = [];

    // Test page accessibility
    tests.push({
      name: `Navigate to ${analysis.title}`,
      description: `Verify the page loads and is accessible`,
      steps: [`Navigate to ${analysis.url}`, 'Wait for page to load'],
      assertions: ['Page title contains text', 'No console errors'],
      priority: 'high'
    });

    // Form tests
    for (const form of analysis.forms) {
      tests.push({
        name: `Submit form ${form.selector}`,
        description: `Test form submission with valid data`,
        steps: [
          `Navigate to ${analysis.url}`,
          `Fill form ${form.selector} with test data`,
          'Click submit button'
        ],
        assertions: ['Form submits successfully', 'Success message or redirect occurs'],
        priority: 'high'
      });

      // Validation test for required fields
      const requiredFields = form.fields.filter(f => f.required);
      if (requiredFields.length > 0) {
        tests.push({
          name: `Validate required fields for ${form.selector}`,
          description: 'Verify required field validation works',
          steps: [
            `Navigate to ${analysis.url}`,
            'Leave required fields empty',
            'Attempt to submit form'
          ],
          assertions: ['Validation error shown', 'Form does not submit'],
          priority: 'medium'
        });
      }
    }

    // Navigation tests
    if (analysis.navigation.length > 0) {
      tests.push({
        name: `Test navigation from ${analysis.title}`,
        description: 'Verify navigation links work correctly',
        steps: analysis.navigation.slice(0, 3).map(nav => `Click link "${nav.text}"`),
        assertions: ['Navigation successful', 'Target page loads'],
        priority: 'medium'
      });
    }

    // Table tests
    for (const table of analysis.tables) {
      tests.push({
        name: `Verify table ${table.selector} displays data`,
        description: 'Check table renders with expected data',
        steps: [`Navigate to ${analysis.url}`, 'Wait for table to load'],
        assertions: [`Table has ${table.rowCount}+ rows`, 'Headers are visible', 'Data cells populated'],
        priority: 'medium'
      });

      if (table.sortable) {
        tests.push({
          name: `Test sorting for ${table.selector}`,
          description: 'Verify table sorting functionality',
          steps: ['Click column header to sort', 'Wait for reordering'],
          assertions: ['Table reorders correctly', 'Sort indicator shown'],
          priority: 'low'
        });
      }
    }

    return tests;
  }

  /**
   * Generate fallback script for a test case
   */
  private generateFallbackScript(
    testCase: TestCase,
    pageAnalysis: PageAnalysis,
    auth?: AuthConfig
  ): string {
    const steps: string[] = [];

    // Add login if needed
    if (auth) {
      const loginUrl = auth.loginUrl || pageAnalysis.url;
      const usernameSel = auth.usernameSelector || 'input:not([type="password"])';
      const passwordSel = auth.passwordSelector || 'input[type="password"]';
      const submitSel = auth.submitSelector || 'button[type="submit"]';

      steps.push('// Login');
      steps.push(`await page.goto('${loginUrl}');`);
      steps.push(`await page.fill('${usernameSel}', '${auth.username}');`);
      steps.push(`await page.fill('${passwordSel}', '${auth.password}');`);
      steps.push(`await page.click('${submitSel}');`);
      steps.push('await page.waitForTimeout(3000);');
      steps.push('');
    }

    // Navigate to target page
    steps.push('// Navigate to target page');
    steps.push(`await page.goto('${pageAnalysis.url}');`);
    steps.push('await page.waitForLoadState(\'networkidle\');');
    steps.push('');

    // Add test-specific logic based on steps
    for (const step of testCase.steps) {
      const lowerStep = step.toLowerCase();

      if (lowerStep.includes('click')) {
        const buttonMatch = /click\s+(?:button\s+)?["']?([^"'\.]+)["']?/i.exec(step);
        if (buttonMatch) {
          const button = pageAnalysis.interactiveElements.find(
            e => e.type === 'button' && e.text.toLowerCase().includes(buttonMatch[1].toLowerCase())
          );
          if (button) {
            steps.push(`await page.click('${button.selector}');`);
          }
        }
      } else if (lowerStep.includes('fill') || lowerStep.includes('enter')) {
        const form = pageAnalysis.forms[0];
        if (form && form.fields.length > 0) {
          const field = form.fields[0];
          steps.push(`await page.fill('${field.selector}', 'test value');`);
        }
      } else if (lowerStep.includes('wait')) {
        steps.push('await page.waitForTimeout(1000);');
      }
    }

    // Add assertions
    steps.push('');
    steps.push('// Assertions');
    for (const assertion of testCase.assertions) {
      steps.push(`// Expect: ${assertion}`);
    }

    return `import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Test: ${testCase.name}
    logger.info('Starting test: ${testCase.name}');

${steps.map(s => '    ' + s).join('\n')}

    logger.info('Test completed successfully');
  } catch (error) {
    logger.error('Test failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
`;
  }

  /**
   * Get the underlying LLM client
   */
  getLLMClient(): LLMClient {
    return this.llm;
  }
}
