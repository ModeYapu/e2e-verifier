/**
 * CLI entry point for Agent Deep Verification mode
 * Autonomous LLM-powered Playwright script generation and execution
 */

import { AgentLoop } from '../agent/agent-loop';
import { AgentConfig } from '../agent/types';
import { SiteConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

interface CLIArgs {
  config?: string;
  url?: string;
  task?: string;
  model?: string;
  maxSteps?: number;
  output?: string;
  apiKey?: string;
  apiBase?: string;
  json?: boolean;
}

interface SiteConfigWithTask extends SiteConfig {
  task?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--config':
      case '-c':
        result.config = args[++i];
        break;
      case '--url':
      case '-u':
        result.url = args[++i];
        break;
      case '--task':
      case '-t':
        result.task = args[++i];
        break;
      case '--model':
      case '-m':
        result.model = args[++i];
        break;
      case '--max-steps':
      case '-s':
        result.maxSteps = parseInt(args[++i], 10);
        break;
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--api-key':
      case '-k':
        result.apiKey = args[++i];
        break;
      case '--api-base':
      case '-b':
        result.apiBase = args[++i];
        break;
      case '--json':
      case '-j':
        result.json = true;
        break;
      default:
        if (!arg.startsWith('--') && !result.url) {
          result.url = arg;
        }
    }
  }

  return result;
}

async function loadConfig(configPath: string): Promise<SiteConfigWithTask[]> {
  const resolvedPath = path.resolve(configPath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(content);
  
  if (parsed.sites && Array.isArray(parsed.sites)) {
    return parsed.sites as SiteConfigWithTask[];
  } else {
    return [parsed as SiteConfigWithTask];
  }
}

function getApiKey(): string {
  // Try environment variables first
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  
  throw new Error('API key not found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GLM_API_KEY, or LLM_API_KEY environment variable, or use --api-key option.');
}

function getApiBase(model?: string): string {
  // Default base URLs for different providers
  if (model?.startsWith('gpt-')) {
    return process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  }
  if (model?.startsWith('claude-')) {
    return process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1';
  }
  if (model?.startsWith('glm-')) {
    return process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
  }
  
  return process.env.LLM_API_BASE || 'https://api.openai.com/v1';
}

async function runAgentVerification(args: CLIArgs): Promise<void> {
  // Determine target URL(s) and task(s)
  let targets: Array<{ url: string; task: string; name: string }> = [];

  if (args.config) {
    const configs = await loadConfig(args.config);
    targets = configs.map(config => ({
      url: config.url,
      task: args.task || config.task || 'Verify website functionality',
      name: config.name || 'Site'
    }));
  } else if (args.url) {
    targets = [{
      url: args.url,
      task: args.task || 'Verify website functionality',
      name: 'Target'
    }];
  } else {
    throw new Error('Either --config or --url must be specified');
  }

  // Validate task is provided
  for (const target of targets) {
    if (!target.task) {
      throw new Error('Task description is required. Use --task or include in config file.');
    }
  }

  // Get API key
  const apiKey = args.apiKey || getApiKey();

  // Determine model and API base
  const model = args.model || process.env.LLM_MODEL || 'gpt-4';
  const apiBase = args.apiBase || getApiBase(model);

  // Create agent configuration
  const agentConfig: AgentConfig = {
    model,
    maxSteps: args.maxSteps || 15,
    apiKey,
    apiBase,
    temperature: 0.7,
    maxTokens: 4000,
    requestTimeout: 120000
  };

  console.log('=== Agent Deep Verification Configuration ===');
  console.log(`Model: ${model}`);
  console.log(`API Base: ${apiBase}`);
  console.log(`Max Steps: ${agentConfig.maxSteps}`);
  console.log(`Targets: ${targets.length}`);
  console.log('');

  const results = [];

  // Run verification for each target
  for (const target of targets) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Target: ${target.name}`);
    console.log(`URL: ${target.url}`);
    console.log(`Task: ${target.task}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
      const agent = new AgentLoop(agentConfig);
      const result = await agent.run(target.task, target.url);
      results.push(result);

      // Print immediate result summary
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Result: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Steps: ${result.steps.length}`);
      console.log(`Tokens: ${result.totalTokens}`);
      console.log(`${'='.repeat(70)}\n`);

    } catch (error) {
      console.error(`Verification failed for ${target.name}:`, error);
      results.push({
        task: target.task,
        url: target.url,
        passed: false,
        steps: [],
        finalScript: '',
        duration: 0,
        totalTokens: 0,
        error: String(error)
      });
    }
  }

  // Generate report
  if (args.output) {
    await saveReport(results, args.output);
  }

  // Print final summary
  printFinalSummary(results, args.json);

  // Exit with appropriate code
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

async function saveReport(results: any[], outputPath: string): Promise<void> {
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length
    },
    results: results
  };

  const resolvedPath = path.resolve(outputPath);
  const dir = path.dirname(resolvedPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`Report saved to: ${resolvedPath}`);
}

function printFinalSummary(results: any[], json: boolean = false): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('FINAL SUMMARY');
  console.log(`${'='.repeat(70)}`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (json) {
    console.log('\n' + JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      console.log(`\n${result.passed ? '✅' : '❌'} ${result.url}`);
      console.log(`   Task: ${result.task}`);
      console.log(`   Steps: ${result.steps.length}`);
      console.log(`   Tokens: ${result.totalTokens}`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
}

async function main() {
  try {
    const args = parseArgs();
    await runAgentVerification(args);
  } catch (error) {
    console.error('Agent verification failed:', error);
    process.exit(1);
  }
}

main();