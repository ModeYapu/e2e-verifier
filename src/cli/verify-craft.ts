/**
 * CLI entry point for Script Crafting mode
 * Generates reusable Playwright scripts from natural language tasks
 */
import { AgentLoop } from '../agent/agent-loop';
import { AgentConfig, ScriptAction, AgentStep } from '../agent/types';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'VerifyCraft' });

interface CLIArgs {
  url?: string;
  task?: string;
  model?: string;
  output?: string;
  apiKey?: string;
  apiBase?: string;
  name?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
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
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--name':
      case '-n':
        result.name = args[++i];
        break;
      default:
        if (!arg.startsWith('--') && !result.url) {
          result.url = arg;
        }
    }
  }
  return result;
}

function getApiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  throw new Error('API key not found. Set OPENAI_API_KEY, GLM_API_KEY, or LLM_API_KEY.');
}

function getApiBase(model?: string): string {
  if (model?.startsWith('glm-')) {
    return process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
  }
  return process.env.LLM_API_BASE || 'https://api.openai.com/v1';
}

function extractFinalScript(steps: AgentStep[]): string {
  // Walk through steps to find the final script content
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.command?.startsWith('write_script') || step.command?.startsWith('done')) {
      return step.output || '';
    }
  }
  return '';
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.url) {
      console.error('Error: URL is required');
      console.error('Usage: npm run verify:craft -- --url <url> --task <task description>');
      console.error('Options:');
      console.error('  --url, -u       Target URL');
      console.error('  --task, -t      Task description in natural language');
      console.error('  --model, -m     LLM model (default: gpt-4)');
      console.error('  --output, -o    Output file path');
      console.error('  --name, -n      Script name');
      process.exit(1);
    }

    if (!args.task) {
      logger.error('Error: Task description is required');
      process.exit(1);
    }

    const apiKey = args.apiKey || getApiKey();
    const model = args.model || process.env.LLM_MODEL || 'gpt-4';
    const apiBase = args.apiBase || getApiBase(model);

    const agentConfig: AgentConfig = {
      model,
      maxSteps: 15, // Limited steps for script generation
      apiKey,
      apiBase,
      temperature: 0.5, // Lower temp for more deterministic output
      maxTokens: 4000,
      requestTimeout: 120000
    };

    logger.info('=== Script Crafting ===');
    logger.info(`Task: ${args.task}`);
    logger.info(`URL: ${args.url}`);
    logger.info(`Model: ${model}`);
    logger.info('');

    const agent = new AgentLoop(agentConfig);
    const result = await agent.run(
      `Generate a reusable Playwright script that: ${args.task}. ` +
      `The script should be self-contained, have proper imports, ` +
      `include assertions and screenshot captures, ` +
      `and be saved as a final_script.`,
      args.url
    );

    const scriptContent = result.finalScript || extractFinalScript(result.steps);

    if (scriptContent) {
      const scriptsDir = path.resolve('scripts/final');
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      const scriptName = args.name || args.task
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')
        .replace(/-+/g, '-')
        .toLowerCase()
        .substring(0, 40);

      const filename = `${scriptName}-${Date.now()}.spec.ts`;
      const filepath = args.output || path.join(scriptsDir, filename);

      fs.writeFileSync(filepath, scriptContent, 'utf-8');
      logger.info(`\n✅ Script saved: ${filepath}`);
      logger.info(`\nRun it with: npx playwright test ${filepath}`);
    } else {
      logger.info('\n❌ No script was generated.');
      if (result.steps.length > 0) {
        logger.info(`Last step output: ${result.steps[result.steps.length - 1].output}`);
      }
    }

    logger.info(`\nSteps used: ${result.steps.length}`);
    logger.info(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
    logger.info(`Tokens: ${result.totalTokens}`);

  } catch (error) {
    logger.error(`Script crafting failed: ${error}`);
    process.exit(1);
  }
}

main();
