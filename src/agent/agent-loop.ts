/**
 * Main Agent Loop for Webwright-inspired Autonomous Verification
 * The heart of the system that orchestrates LLM, script execution, and self-reflection
 */

import { LLMClient } from './llm-client';
import { ScriptEngine } from './script-engine';
import { SelfReflectionGate } from './self-reflection';
import { ContextCompactor, DEFAULT_COMPACTOR_CONFIG } from './context-compactor';
import {
  AgentConfig,
  AgentStep,
  AgentResult,
  ScriptAction,
  AgentLoopState,
  ReflectionResult,
  ChatMessage
} from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * System prompt for the LLM
 */
const DEFAULT_SYSTEM_PROMPT = [
  'You are an expert QA automation engineer specializing in Playwright testing. Your task is to autonomously write and execute Playwright scripts to verify website functionality.',
  '',
  'CAPABILITIES:',
  '- Write complete, runnable Playwright TypeScript scripts',
  '- Use page.evaluate() and page.$$eval() for DOM inspection',
  '- Capture screenshots at each verification step',
  '- Analyze screenshots and execution results',
  '- Reflect on whether the task is truly complete',
  '',
  'OUTPUT FORMAT:',
  'Always respond with this exact structure:',
  '',
  '<thought>',
  'Your reasoning about the current state and what to do next',
  '</thought>',
  '',
  '<action>',
  'type: [write_script|execute_script|inspect_screenshot|reflect|done]',
  'content: [script code or analysis result]',
  'done: [true|false] (only for done action)',
  '</action>',
  '',
  'ACTION TYPES:',
  '- write_script: Generate Playwright script code for verification',
  '- execute_script: Request to run the previously written script',
  '- inspect_screenshot: Analyze a screenshot and report findings',
  '- reflect: Evaluate if the task is truly complete (use before declaring done)',
  '- done: Final completion declaration (only after self-reflection passes)',
  '',
  'BEST PRACTICES:',
  '1. Start by understanding the URL and task requirements',
  '2. Write clear, focused scripts that test specific aspects',
  '3. Capture screenshots at key verification points',
  '4. Analyze results thoroughly before proceeding',
  '5. Use page.waitForLoadState("networkidle") for stability',
  '6. Include proper error handling and assertions',
  '7. After completing verification, write a "final_script.ts" that reproduces the entire test',
  '8. Only declare "done: true" after self-reflection validation passes',
  '',
  'PLAYWRIGHT SCRIPT TEMPLATE (CRITICAL: Use standalone mode, NOT test runner DSL):',
  '```typescript',
  'import { chromium } from "@playwright/test";',
  '',
  'async function main() {',
  '  const browser = await chromium.launch({ headless: true });',
  '  const page = await browser.newPage();',
  '  try {',
  '    await page.goto("URL");',
  '    await page.waitForLoadState("networkidle");',
  '',
  '    const title = await page.title();',
  '    console.log("Title:", title);',
  '',
  '    const el = await page.$("selector");',
  '    console.log("Element exists:", !!el);',
  '',
  '    await page.screenshot({ path: "evidence.png" });',
  '  } finally {',
  '    await browser.close();',
  '  }',
  '}',
  '',
  'main().catch(console.error);',
  '```',
  '',
  'IMPORTANT:',
  '- NEVER use test(), expect(), or Playwright test runner DSL.',
  '- ALWAYS use chromium.launch() + standalone script pattern shown above.',
  '- Use page.$() / page.$$() for element queries, page.title() for title.',
  '- Use console.log() for output (the agent reads stdout).',
  '',
  'Remember: The goal is to create robust, verifiable tests that prove the website works correctly.'
].join('\n');

/**
 * Main Agent Loop class
 */
export class AgentLoop {
  private config: AgentConfig;
  private llmClient: LLMClient;
  private scriptEngine: ScriptEngine;
  private reflectionGate: SelfReflectionGate;
  private contextCompactor: ContextCompactor;
  private state: AgentLoopState;
  private startTime: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
    this.llmClient = new LLMClient(config);
    this.scriptEngine = new ScriptEngine();
    this.reflectionGate = new SelfReflectionGate(this.scriptEngine);
    this.contextCompactor = new ContextCompactor(DEFAULT_COMPACTOR_CONFIG);
    
    this.state = {
      currentStep: 0,
      totalTokens: 0,
      isDone: false,
      history: []
    };
  }

  /**
   * Run the main agent loop
   * @param task Task description for the agent
   * @param url Target URL to verify
   * @returns Complete agent result with all steps and final script
   */
  async run(task: string, url: string): Promise<AgentResult> {
    console.log('=== Starting Agent Deep Verification ===');
    console.log(`Task: ${task}`);
    console.log(`URL: ${url}`);
    console.log(`Model: ${this.config.model}`);
    console.log(`Max Steps: ${this.config.maxSteps}`);

    this.startTime = Date.now();
    this.state = {
      currentStep: 0,
      totalTokens: 0,
      isDone: false,
      history: []
    };

    const steps: AgentStep[] = [];
    let finalScript = '';

    // Initialize conversation with task
    const initialMessage = this.createInitialMessage(task, url);
    this.state.history.push({ role: 'user', content: initialMessage });

    // Main agent loop
    while (!this.state.isDone && this.state.currentStep < this.config.maxSteps) {
      this.state.currentStep++;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Step ${this.state.currentStep}/${this.config.maxSteps}`);
      console.log(`${'='.repeat(60)}`);

      // Check if context needs compaction
      if (this.contextCompactor.shouldCompactBySteps(this.state.currentStep)) {
        console.log('Compacting context window...');
        this.compactContext(steps);
      }

      // Get action from LLM
      const stepResult = await this.executeAgentStep(steps, url);
      steps.push(stepResult);

      // Update token usage
      if (stepResult.tokens) {
        this.state.totalTokens += stepResult.tokens;
        this.contextCompactor.addTokenUsage(stepResult.tokens);
      }

      // Check if agent is done
      if (this.state.lastAction?.done) {
        console.log('Agent claims task is complete. Running self-reflection...');
        const reflectionResult = await this.runSelfReflection(this.state.lastAction.content, url);
        
        if (reflectionResult.passed) {
          console.log('✅ Self-reflection PASSED. Task is truly complete.');
          this.state.isDone = true;
          finalScript = this.state.lastAction.content;
          
          // Add reflection result to final step
          steps[steps.length - 1].output += `\n\n[REFLECTION]: ${reflectionResult.evidence.join('; ')}`;
        } else {
          console.log('❌ Self-reflection FAILED. Agent will retry.');
          console.log(`Failure reason: ${reflectionResult.failureReason}`);
          
          // Add reflection failure to context and continue
          const reflectionMessage = `Self-reflection failed: ${reflectionResult.failureReason}. Please fix the issues and try again.`;
          this.state.history.push({ role: 'user', content: reflectionMessage });
          
          steps[steps.length - 1].error = `Reflection failed: ${reflectionResult.failureReason}`;
        }
      }

      // Safety check for infinite loops
      if (this.state.currentStep >= this.config.maxSteps) {
        console.log(`⚠️ Reached maximum step limit (${this.config.maxSteps})`);
        if (!this.state.isDone) {
          steps.push({
            step: this.state.currentStep + 1,
            thought: 'Terminated due to step limit',
            command: 'max_steps_reached',
            output: 'Agent stopped before task completion',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    const duration = Date.now() - this.startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log('Agent Execution Complete');
    console.log(`Total Steps: ${steps.length}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Total Tokens: ${this.state.totalTokens}`);
    console.log(`Result: ${this.state.isDone ? '✅ PASSED' : '❌ INCOMPLETE'}`);
    console.log(`${'='.repeat(60)}`);

    return {
      task,
      url,
      passed: this.state.isDone,
      steps,
      finalScript,
      duration,
      totalTokens: this.state.totalTokens,
      evidence: this.extractEvidence(steps)
    };
  }

  /**
   * Execute a single agent step
   */
  private async executeAgentStep(steps: AgentStep[], url: string): Promise<AgentStep> {
    const startTime = Date.now();

    try {
      // Get response from LLM
      const response = await this.llmClient.chatCompletion(
        DEFAULT_SYSTEM_PROMPT,
        this.state.history
      );

      // Add assistant response to history
      this.state.history.push({ 
        role: 'assistant', 
        content: response.raw 
      });

      // Store action for next iteration
      this.state.lastAction = response.action;

      // Execute the action
      const result = await this.executeAction(response.action, url);

      // Add result to conversation history
      const resultMessage = this.formatActionResult(result, response.action);
      this.state.history.push({ role: 'user', content: resultMessage });
      this.state.lastOutput = resultMessage;

      return {
        step: this.state.currentStep,
        thought: response.thought,
        command: `${response.action.type}: ${response.action.content.substring(0, 50)}...`,
        output: resultMessage,
        timestamp: new Date().toISOString(),
        tokens: response.tokens
      };

    } catch (error) {
      const errorMessage = `Step execution failed: ${error}`;
      console.error(errorMessage);

      return {
        step: this.state.currentStep,
        thought: 'Error occurred during step execution',
        command: 'error',
        output: errorMessage,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a specific action
   */
  private async executeAction(action: ScriptAction, url: string): Promise<string> {
    console.log(`Executing action: ${action.type}`);

    switch (action.type) {
      case 'write_script':
        return this.handleWriteScript(action.content);

      case 'execute_script':
        return await this.handleExecuteScript(action.content);

      case 'inspect_screenshot':
        return await this.handleInspectScreenshot(action.content);

      case 'reflect':
        return await this.handleReflect(action.content, url);

      case 'done':
        return this.handleDone(action.content);

      default:
        return `Unknown action type: ${action.type}`;
    }
  }

  /**
   * Handle write_script action
   */
  private handleWriteScript(content: string): string {
    const scriptPath = this.scriptEngine.writeScript(content, `step-${this.state.currentStep}`);
    return `Script written to: ${scriptPath}`;
  }

  /**
   * Handle execute_script action
   */
  private async handleExecuteScript(content: string): Promise<string> {
    try {
      // If content contains script code, write it first
      let scriptPath: string;
      if (content.includes('page.') || content.includes('test(') || content.includes('chromium') || content.includes('playwright')) {
        // It's script code — write to file
        scriptPath = this.scriptEngine.writeScript(content, `step-${this.state.currentStep}`);
      } else if (content.includes(' ') || content.includes('&&') || content.includes('|') || content.startsWith('ls') || content.startsWith('cat') || content.startsWith('pwd') || content.startsWith('echo') || content.startsWith('npx ') || content.startsWith('node ')) {
        // It's a shell command — execute it directly
        return await this.executeShellCommand(content);
      } else {
        // It's a file path — resolve to absolute if needed
        const resolvedPath = path.resolve(content);
        if (fs.existsSync(resolvedPath)) {
          scriptPath = resolvedPath;
        } else {
          // Try with scripts/ prefix
          const altPath = path.resolve('scripts', content);
          if (fs.existsSync(altPath)) {
            scriptPath = altPath;
          } else {
            return `Script file not found at: ${content} or scripts/${content}`;
          }
        }
      }

      console.log(`Executing script: ${scriptPath}`);
      const result = await this.scriptEngine.executeScript(scriptPath);

      let output = `Exit code: ${result.exitCode}\n`;
      output += `Duration: ${result.duration}ms\n`;
      output += `Screenshots: ${result.screenshots.length}\n`;

      if (result.stdout) {
        output += `Output: ${result.stdout.substring(0, 500)}${result.stdout.length > 500 ? '...' : ''}\n`;
      }

      if (result.stderr) {
        output += `Errors: ${result.stderr.substring(0, 300)}${result.stderr.length > 300 ? '...' : ''}\n`;
      }

      return output;
    } catch (error) {
      return `Script execution failed: ${error}`;
    }
  }

  /**
   * Execute a shell command directly and return output
   */
  private async executeShellCommand(command: string): Promise<string> {
    console.log(`Executing shell command: ${command}`);
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
      return `Shell command output:\n${stdout.substring(0, 1000)}${stderr ? '\nStderr: ' + stderr.substring(0, 500) : ''}`;
    } catch (error: any) {
      return `Shell command failed (exit ${error.code || '?'}): ${(error.stdout || error.message || '').substring(0, 500)}`;
    }
  }

  /**
   * Handle inspect_screenshot action
   */
  private async handleInspectScreenshot(content: string): Promise<string> {
    // Basic screenshot inspection
    if (!content || !fs.existsSync(content)) {
      return `Screenshot not found: ${content}`;
    }

    const stats = fs.statSync(content);
    return `Screenshot analysis: ${content} (${stats.size} bytes, ${new Date(stats.mtime).toISOString()})`;
  }

  /**
   * Handle reflect action
   */
  private async handleReflect(content: string, url: string): Promise<string> {
    console.log('Agent performing self-reflection...');
    
    try {
      const reflectionResult = await this.reflectionGate.validate(content, url);
      return `Reflection result: ${reflectionResult.passed ? 'PASSED' : 'FAILED'}`;
    } catch (error) {
      return `Reflection error: ${error}`;
    }
  }

  /**
   * Handle done action
   */
  private handleDone(content: string): string {
    // Save the final script
    if (content && content.trim().length > 0) {
      const finalPath = this.scriptEngine.saveFinalScript(content, 'final-verification');
      return `Final script saved: ${finalPath}\nTask marked as complete.`;
    }
    return 'Task marked as complete (no final script provided)';
  }

  /**
   * Run self-reflection validation
   */
  private async runSelfReflection(script: string, url: string): Promise<ReflectionResult> {
    return await this.reflectionGate.validate(script, url);
  }

  /**
   * Create initial message for the agent
   */
  private createInitialMessage(task: string, url: string): string {
    return [
      `I need you to verify the following task:`,
      `Task: ${task}`,
      `URL: ${url}`,
      `Please write and execute Playwright scripts to verify this task.`,
      `Provide a final script that reproduces the verification when you are done.`
    ].join('\n\n');
  }

  /**
   * Format action result for conversation history
   */
  private formatActionResult(result: string, action: ScriptAction): string {
    return `[ACTION RESULT: ${action.type}]\n${result}`;
  }

  /**
   * Compact conversation history
   */
  private compactContext(steps: AgentStep[]): void {
    const compactedSteps = this.contextCompactor.compactSteps(steps);
    
    // Create a summary message
    const summaryMessage = [
      `[CONTEXT COMPACTED - Step ${this.state.currentStep}]`,
      compactedSteps,
      '',
      'Continuing from most recent state...'
    ].join('\n');

    // Reset history with summary
    this.state.history = [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: summaryMessage }
    ];

    console.log('Context compacted successfully');
  }

  /**
   * Extract evidence from steps
   */
  private extractEvidence(steps: AgentStep[]): string[] {
    const evidence: string[] = [];

    for (const step of steps) {
      if (step.screenshot) {
        evidence.push(`Screenshot: ${step.screenshot}`);
      }
      if (step.output && step.output.includes('passed')) {
        evidence.push(`Verification passed at step ${step.step}`);
      }
    }

    return evidence;
  }

  /**
   * Get current agent state
   */
  getState(): AgentLoopState {
    return { ...this.state };
  }

  /**
   * Get context compaction statistics
   */
  getCompactionStats() {
    return this.contextCompactor.getStats();
  }
}