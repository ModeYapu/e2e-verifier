/**
 * Test Planner - Generates test plans from test targets
 *
 * The planner is responsible for analyzing a test target and generating
 * a structured test plan with scenarios, steps, and assertions.
 *
 * Two implementations:
 * - LLMPlanner: Uses LLM to analyze the site and generate intelligent test plans
 * - ConfigPlanner: Generates plans from existing site configurations (no LLM needed)
 */

import { TestTarget, TestPlan, PlannedScenario, PlannedStep, PlannedAssertion, StepAction, AssertionType } from './types';
import { LLMClient } from '../agent/llm-client';
import { LLMRegistry } from '../llm/llm-registry';
import { ContextManager } from './context-manager';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// PLANNER INTERFACE
// =====================================================

/**
 * Interface for test planners
 */
export interface ITestPlanner {
  /**
   * Generate a test plan from a test target
   * @param target - Test target to plan for
   * @returns Promise<TestPlan> - Generated test plan
   */
  plan(target: TestTarget): Promise<TestPlan>;
}

// =====================================================
// LLM PLANNER
// =====================================================

/**
 * Configuration for LLM-based planner
 */
export interface LLMPlannerConfig {
  /** LLM client configuration */
  llm: {
    apiKey: string;
    apiBase: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  /** Maximum number of scenarios to generate */
  maxScenarios?: number;
  /** Maximum steps per scenario */
  maxSteps?: number;
  /** Whether to generate comprehensive assertions */
  comprehensiveAssertions?: boolean;
}

/**
 * LLM-based test planner
 * Uses LLM to analyze a target URL and generate intelligent test scenarios
 */
export class LLMPlanner implements ITestPlanner {
  private llm: LLMClient;
  private config: Required<LLMPlannerConfig>;
  private contextManager: ContextManager;

  constructor(config: LLMPlannerConfig) {
    this.llm = LLMRegistry.getInstance().createClient({
      model: config.llm.model,
      apiKey: config.llm.apiKey,
      apiBase: config.llm.apiBase,
      temperature: config.llm.temperature || 0.7,
      maxTokens: config.llm.maxTokens || 4000,
      maxSteps: 20, // Default max steps for LLM operations
    });
    this.config = {
      llm: config.llm,
      maxScenarios: config.maxScenarios || 5,
      maxSteps: config.maxSteps || 10,
      comprehensiveAssertions: config.comprehensiveAssertions !== false,
    };
    this.contextManager = new ContextManager();
  }

  async plan(target: TestTarget): Promise<TestPlan> {
    const prompt = this.buildPlanningPrompt(target);

    try {
      // Use ContextManager to optimize prompt if it's too large
      const optimizedPrompt = this.optimizePromptWithContext(prompt, target);

      const response = await this.llm.chatCompletion(
        this.getSystemPrompt(),
        [{ role: 'user', content: optimizedPrompt }]
      );

      const plan = this.parseLLMResponse(response.raw, target);

      // Write successful plan to scratchpad for future reference
      this.contextManager.writeBack(`plan-${target.name || 'unknown'}`, plan);

      return plan;
    } catch (error) {
      throw new Error(`LLM planning failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getSystemPrompt(): string {
    return [
      'You are an expert QA test planner specializing in web application testing.',
      'Your task is to analyze a website URL and generate comprehensive test scenarios.',
      '',
      'You must respond with a JSON object containing:',
      '- scenarios: array of test scenario objects',
      '',
      'Each scenario must have:',
      '- name: short descriptive name',
      '- description: what this scenario tests',
      '- url: the URL to test (can be same as target or specific path)',
      '- steps: array of step objects',
      '- assertions: array of assertion objects',
      '',
      'Each step must have:',
      '- action: one of: navigate, click, type, wait, scroll, hover, select, submit, screenshot, assert, javascript',
      '- selector: CSS selector (for element actions)',
      '- value: value to type/select (optional)',
      '- description: what this step does',
      '- expected: what the expected result is (optional)',
      '',
      'Each assertion must have:',
      '- type: one of: element-exists, element-visible, text-contains, url-matches, javascript',
      '- expected: the expected value',
      '- selector: CSS selector (for element assertions)',
      '- description: what this assertion checks',
      '',
      'Focus on:',
      '1. Critical user flows',
      '2. Common failure points',
      '3. Edge cases',
      '4. Performance and accessibility',
      '',
      'Return ONLY valid JSON, no other text.',
    ].join('\n');
  }

  private buildPlanningPrompt(target: TestTarget): string {
    const parts = [
      `Generate a comprehensive test plan for: ${target.url}`,
    ];

    if (target.name) {
      parts.push(`Site name: ${target.name}`);
    }

    if (target.description) {
      parts.push(`Description: ${target.description}`);
    }

    if (target.tags && target.tags.length > 0) {
      parts.push(`Focus areas: ${target.tags.join(', ')}`);
    }

    parts.push('');
    parts.push(`Generate up to ${this.config.maxScenarios} scenarios with up to ${this.config.maxSteps} steps each.`);
    parts.push('Include both happy path and edge case scenarios.');

    return parts.join('\n');
  }

  private parseLLMResponse(response: string, target: TestTarget): TestPlan {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.scenarios || !Array.isArray(parsed.scenarios)) {
        throw new Error('Invalid response structure: missing scenarios array');
      }

      const scenarios: PlannedScenario[] = parsed.scenarios.map((s: any, index: number) =>
        this.parseScenario(s, index)
      );

      return {
        target,
        scenarios,
        metadata: {
          plannerType: 'llm',
          generatedAt: new Date().toISOString(),
          confidence: 0.8, // Base confidence for LLM-generated plans
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }

  private parseScenario(data: any, index: number): PlannedScenario {
    if (!data.name || !data.steps || !Array.isArray(data.steps)) {
      throw new Error('Invalid scenario: missing name or steps');
    }

    const steps: PlannedStep[] = data.steps.map((step: any, stepIndex: number) =>
      this.parseStep(step, stepIndex)
    );

    const assertions: PlannedAssertion[] = (data.assertions || []).map((assertion: any) =>
      this.parseAssertion(assertion)
    );

    return {
      id: `scenario-${index}`,
      name: data.name,
      description: data.description || `Test scenario for ${data.name}`,
      url: data.url || '',
      steps,
      assertions,
      timeout: data.timeout || 30000,
      viewport: data.viewport,
      auth: data.auth,
      estimatedDuration: this.estimateDuration(steps),
    };
  }

  private parseStep(data: any, index: number): PlannedStep {
    const validActions: StepAction[] = ['navigate', 'click', 'type', 'wait', 'scroll', 'hover', 'select', 'submit', 'screenshot', 'assert', 'javascript', 'goto'];

    if (!data.action || !validActions.includes(data.action)) {
      throw new Error(`Invalid step action: ${data.action}`);
    }

    return {
      id: `step-${index}`,
      action: data.action,
      selector: data.selector,
      value: data.value,
      description: data.description || `${data.action} step`,
      waitAfter: data.waitAfter || 0,
      expected: data.expected,
      critical: data.critical !== false, // Default to critical
      screenshot: data.screenshot || false,
    };
  }

  private parseAssertion(data: any): PlannedAssertion {
    const validTypes: AssertionType[] = [
      'element-exists', 'element-visible', 'element-count', 'text-contains',
      'text-equals', 'attribute-equals', 'attribute-contains', 'url-matches',
      'title-equals', 'javascript', 'performance', 'accessibility', 'console', 'network'
    ];

    if (!data.type || !validTypes.includes(data.type)) {
      throw new Error(`Invalid assertion type: ${data.type}`);
    }

    return {
      type: data.type,
      expected: data.expected,
      selector: data.selector,
      attribute: data.attribute,
      description: data.description || `Assert ${data.type}`,
      critical: data.critical !== false,
    };
  }

  private estimateDuration(steps: PlannedStep[]): number {
    // Base estimation: 2s per step + navigation overhead
    return steps.length * 2000 + 5000;
  }

  /**
   * Optimize prompt using ContextManager
   */
  private optimizePromptWithContext(prompt: string, target: TestTarget): string {
    // Check if we have relevant context from scratchpad
    const existingPlans = this.contextManager.readFromScratchpad(`plan-${target.name || 'similar'}`);

    if (existingPlans.length > 0) {
      // Use previous successful plans as reference
      const mostRecent = existingPlans[existingPlans.length - 1];
      return [
        prompt,
        '',
        'REFERENCE: You may use this previous successful plan as inspiration (but adapt as needed):',
        JSON.stringify(mostRecent.value, null, 2).substring(0, 1000),
      ].join('\n');
    }

    return prompt;
  }
}

// =====================================================
// CONFIG PLANNER
// =====================================================

/**
 * Configuration for config-based planner
 */
export interface ConfigPlannerConfig {
  /** Sites configuration directory */
  sitesDir?: string;
  /** Whether to generate comprehensive scenarios */
  comprehensive?: boolean;
}

/**
 * Configuration-based test planner
 * Generates test plans from existing site configurations without using LLM
 */
export class ConfigPlanner implements ITestPlanner {
  private config: Required<ConfigPlannerConfig>;

  constructor(config: ConfigPlannerConfig = {}) {
    this.config = {
      sitesDir: config.sitesDir || './sites',
      comprehensive: config.comprehensive !== false,
    };
  }

  async plan(target: TestTarget): Promise<TestPlan> {
    // If target has siteConfig, use it directly
    if (target.siteConfig) {
      return this.generateFromSiteConfig(target, target.siteConfig);
    }

    // Try to load from file
    const siteConfigPath = this.findSiteConfig(target.url, target.name);
    if (siteConfigPath) {
      const siteConfig = this.loadSiteConfig(siteConfigPath);
      return this.generateFromSiteConfig(target, siteConfig);
    }

    // Fallback: generate basic plan from URL
    return this.generateBasicPlan(target);
  }

  private findSiteConfig(url: string, name?: string): string | null {
    // Try to find matching config file
    const sitesDir = this.config.sitesDir;

    if (!fs.existsSync(sitesDir)) {
      return null;
    }

    // Try by name first
    if (name) {
      const namePath = path.join(sitesDir, `${name}.json`);
      if (fs.existsSync(namePath)) {
        return namePath;
      }
    }

    // Try to extract domain from URL
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const domainPath = path.join(sitesDir, `${domain}.json`);
      if (fs.existsSync(domainPath)) {
        return domainPath;
      }
    } catch {
      // Invalid URL, continue
    }

    return null;
  }

  private loadSiteConfig(configPath: string): any {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load site config from ${configPath}: ${error.message}`);
    }
  }

  private generateFromSiteConfig(target: TestTarget, siteConfig: any): TestPlan {
    const scenarios: PlannedScenario[] = [];

    // Generate main scenario from site config
    const mainScenario = this.generateMainScenario(target, siteConfig);
    scenarios.push(mainScenario);

    // Generate additional scenarios for custom checks
    if (siteConfig.customChecks && Array.isArray(siteConfig.customChecks)) {
      for (const customCheck of siteConfig.customChecks) {
        if (this.config.comprehensive) {
          const scenario = this.generateCustomCheckScenario(target, customCheck);
          scenarios.push(scenario);
        }
      }
    }

    return {
      target,
      scenarios,
      metadata: {
        plannerType: 'config',
        generatedAt: new Date().toISOString(),
        confidence: 1.0, // High confidence for config-based plans
      },
    };
  }

  private generateMainScenario(target: TestTarget, siteConfig: any): PlannedScenario {
    const steps: PlannedStep[] = [];
    const assertions: PlannedAssertion[] = [];

    // Navigation step
    steps.push({
      id: 'step-0',
      action: 'navigate',
      value: target.url,
      description: `Navigate to ${target.url}`,
      critical: true,
      screenshot: true,
    });

    // Wait for page load
    steps.push({
      id: 'step-1',
      action: 'wait',
      value: '2000',
      description: 'Wait for page to load',
      critical: false,
    });

    // Generate steps from custom checks
    if (siteConfig.customChecks && Array.isArray(siteConfig.customChecks)) {
      siteConfig.customChecks.forEach((check: any, index: number) => {
        const step = this.generateStepFromCustomCheck(check, index + 2);
        if (step) {
          steps.push(step);
        }

        const assertion = this.generateAssertionFromCustomCheck(check, index);
        if (assertion) {
          assertions.push(assertion);
        }
      });
    }

    // Generate checks
    if (siteConfig.checks && Array.isArray(siteConfig.checks)) {
      siteConfig.checks.forEach((checkType: string) => {
        const assertion = this.generateAssertionFromCheckType(checkType);
        if (assertion) {
          assertions.push(assertion);
        }
      });
    }

    // Add default assertions
    assertions.push({
      type: 'element-exists',
      expected: true,
      selector: 'body',
      description: 'Page body exists',
      critical: true,
    });

    if (siteConfig.expectedStatusCode) {
      assertions.push({
        type: 'javascript',
        expected: true,
        description: 'Page loaded successfully',
        critical: true,
      });
    }

    return {
      id: 'scenario-main',
      name: `Main flow - ${target.name || 'Homepage'}`,
      description: `Test main functionality of ${target.url}`,
      url: target.url,
      steps,
      assertions,
      viewport: siteConfig.viewport || { width: 1920, height: 1080 },
      timeout: siteConfig.timeout || 30000,
      auth: siteConfig.auth,
      estimatedDuration: this.estimateDuration(steps),
    };
  }

  private generateCustomCheckScenario(target: TestTarget, customCheck: any): PlannedScenario {
    const steps: PlannedStep[] = [];
    const assertions: PlannedAssertion[] = [];

    // Navigate step
    steps.push({
      id: 'step-0',
      action: 'navigate',
      value: target.url,
      description: `Navigate to ${target.url}`,
      critical: true,
    });

    // Generate step from custom check
    const step = this.generateStepFromCustomCheck(customCheck, 1);
    if (step) {
      steps.push(step);
    }

    // Generate assertion
    const assertion = this.generateAssertionFromCustomCheck(customCheck, 0);
    if (assertion) {
      assertions.push(assertion);
    }

    return {
      id: `scenario-custom-${customCheck.name}`,
      name: `Custom check - ${customCheck.name}`,
      description: `Test custom check: ${customCheck.name}`,
      url: target.url,
      steps,
      assertions,
      timeout: 30000,
      estimatedDuration: this.estimateDuration(steps),
    };
  }

  private generateStepFromCustomCheck(check: any, index: number): PlannedStep | null {
    if (check.selector && check.type === 'element') {
      return {
        id: `step-${index}`,
        action: 'assert',
        selector: check.selector,
        description: `Check element: ${check.selector}`,
        expected: String(check.expected !== false),
        critical: check.critical !== false,
      };
    }

    if (check.script && check.type === 'javascript') {
      return {
        id: `step-${index}`,
        action: 'javascript',
        value: check.script,
        description: `Execute custom check: ${check.name}`,
        expected: String(check.expected !== false),
        critical: check.critical !== false,
      };
    }

    return null;
  }

  private generateAssertionFromCustomCheck(check: any, index: number): PlannedAssertion | null {
    if (check.selector) {
      return {
        type: 'element-exists',
        expected: check.expected !== false,
        selector: check.selector,
        description: `Element exists: ${check.selector}`,
        critical: check.critical !== false,
      };
    }

    return null;
  }

  private generateAssertionFromCheckType(checkType: string): PlannedAssertion | null {
    switch (checkType) {
      case 'console':
        return {
          type: 'console',
          expected: true,
          description: 'No console errors',
          critical: false,
        };
      case 'network':
        return {
          type: 'network',
          expected: true,
          description: 'No network failures',
          critical: false,
        };
      case 'accessibility':
        return {
          type: 'accessibility',
          expected: true,
          description: 'No accessibility issues',
          critical: false,
        };
      case 'performance':
        return {
          type: 'performance',
          expected: true,
          description: 'Performance within acceptable range',
          critical: false,
        };
      default:
        return null;
    }
  }

  private generateBasicPlan(target: TestTarget): TestPlan {
    const steps: PlannedStep[] = [
      {
        id: 'step-0',
        action: 'navigate',
        value: target.url,
        description: `Navigate to ${target.url}`,
        critical: true,
        screenshot: true,
      },
      {
        id: 'step-1',
        action: 'wait',
        value: '2000',
        description: 'Wait for page load',
        critical: false,
      },
    ];

    const assertions: PlannedAssertion[] = [
      {
        type: 'element-exists',
        expected: true,
        selector: 'body',
        description: 'Page body exists',
        critical: true,
      },
      {
        type: 'console',
        expected: true,
        description: 'No console errors',
        critical: false,
      },
    ];

    const scenario: PlannedScenario = {
      id: 'scenario-basic',
      name: 'Basic navigation test',
      description: `Basic test for ${target.url}`,
      url: target.url,
      steps,
      assertions,
      timeout: 30000,
      viewport: { width: 1920, height: 1080 },
      estimatedDuration: this.estimateDuration(steps),
    };

    return {
      target,
      scenarios: [scenario],
      metadata: {
        plannerType: 'config',
        generatedAt: new Date().toISOString(),
        confidence: 0.5, // Lower confidence for basic plans
      },
    };
  }

  private estimateDuration(steps: PlannedStep[]): number {
    return steps.length * 2000 + 5000;
  }
}

// =====================================================
// PLANNER FACTORY
// =====================================================

/**
 * Factory for creating test planners
 * @deprecated Use `new LLMPlanner(config)` or `new ConfigPlanner(config)` directly.
 */
export class PlannerFactory {
  /**
   * Create a planner based on configuration
   * @param useLLM - Whether to use LLM-based planner
   * @param llmConfig - Configuration for LLM planner (if useLLM is true)
   * @param configConfig - Configuration for config planner (if useLLM is false)
   * @deprecated Use `new LLMPlanner(config)` or `new ConfigPlanner(config)` directly.
   */
  static create(
    useLLM: boolean,
    llmConfig?: LLMPlannerConfig,
    configConfig?: ConfigPlannerConfig
  ): ITestPlanner {
    if (useLLM) {
      if (!llmConfig) {
        throw new Error('LLM config is required when useLLM is true');
      }
      return new LLMPlanner(llmConfig);
    } else {
      return new ConfigPlanner(configConfig);
    }
  }

  /**
   * Create a planner from environment variables
   * @deprecated Use `parseIntelligenceConfigFromEnv()` and pass config to planner constructors directly.
   */
  static fromEnv(): ITestPlanner {
    const useLLM = process.env.USE_LLM_PLANNER === 'true';

    if (useLLM) {
      const llmConfig: LLMPlannerConfig = {
        llm: {
          apiKey: process.env.LLM_API_KEY || '',
          apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1',
          model: process.env.LLM_MODEL || 'gpt-4',
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
        },
        maxScenarios: parseInt(process.env.MAX_SCENARIOS || '5'),
        maxSteps: parseInt(process.env.MAX_STEPS || '10'),
        comprehensiveAssertions: process.env.COMPREHENSIVE_ASSERTIONS !== 'false',
      };
      return new LLMPlanner(llmConfig);
    } else {
      return new ConfigPlanner({
        sitesDir: process.env.SITES_DIR || './sites',
        comprehensive: process.env.COMPREHENSIVE_PLANNING !== 'false',
      });
    }
  }
}
