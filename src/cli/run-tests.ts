/**
 * run-tests CLI — 通用测试执行器
 * 
 * 用法:
 *   npx ts-node src/cli/run-tests.ts --project /path/to/project
 *   npx ts-node src/cli/run-tests.ts --plan /path/to/test-plan.yaml
 * 
 * 每个 project/e2e-test/test-plan.yaml 声明测试规格，
 * Agent 读取规格 → 规划 → 生成 Playwright 脚本 → 真实执行 → 反思重试
 */

import { AgentPlanner, type ScenarioResult } from '../engine/agent-planner';
import { parseTestPlan, findTestPlan } from '../engine/test-plan-parser';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger({ prefix: 'RunTests' });

interface RunOptions {
  projectDir?: string;
  planPath?: string;
  outputDir?: string;
  llm?: { apiKey: string; apiBase: string; model: string };
}

function parseArgs(args: string[]): RunOptions {
  const opts: RunOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project': opts.projectDir = args[++i]; break;
      case '--plan': opts.planPath = args[++i]; break;
      case '--output': opts.outputDir = args[++i]; break;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Find test plan
  let planPath: string;
  if (opts.planPath) {
    planPath = opts.planPath;
  } else if (opts.projectDir) {
    const found = findTestPlan(opts.projectDir);
    if (!found) {
      logger.error(`No test-plan.yaml found in ${opts.projectDir}/e2e-test/`);
      process.exit(1);
    }
    planPath = found;
  } else {
    logger.error('Usage: --project <dir> or --plan <yaml>');
    process.exit(1);
  }

  logger.info(`📋 Loading test plan: ${planPath}`);
  const plan = parseTestPlan(planPath);

  const outputDir = opts.outputDir || path.join(path.dirname(planPath), 'results');
  fs.mkdirSync(outputDir, { recursive: true });

  // Run with Agent Planner
  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`🧪 e2e-verifier — ${plan.project} v${plan.version}`);
  logger.info(`   ${plan.scenarios.length} scenarios, base: ${plan.environment.base_url}`);
  logger.info(`${'═'.repeat(60)}\n`);

  // Handle dependencies first
  if (plan.dependencies) {
    logger.info('📦 Processing dependencies...');
    const { execSync } = require('child_process');
    for (const dep of plan.dependencies) {
      if (dep.type === 'script' && dep.script) {
        logger.info(`  Running: ${dep.script}`);
        try {
          // Copy script to e2e-verifier dir so node_modules resolves
          const scriptBasename = path.basename(dep.script);
          const localCopy = path.join(outputDir, `dep-${scriptBasename}`);
          fs.copyFileSync(dep.script, localCopy);
          const cmd = dep.script.endsWith('.ts')
            ? `npx ts-node --project tsconfig.json "${localCopy}"`
            : `node "${localCopy}"`;
          execSync(cmd, {
            timeout: 60000,
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '../..'),
          });
        } catch (e) {
          logger.warn(`  Dependency failed: ${e}`);
        }
      }
      if (dep.wait_after) {
        logger.info(`  Waiting ${dep.wait_after}ms...`);
        await new Promise(r => setTimeout(r, dep.wait_after));
      }
    }
  }

  // Check for LLM config — auto-detect from OpenClaw config or env
  let llmConfig = opts.llm;
  if (!llmConfig) {
    // Try OpenClaw config (zai provider)
    try {
      const ocPath = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');
      if (fs.existsSync(ocPath)) {
        const oc = JSON.parse(fs.readFileSync(ocPath, 'utf-8'));
        const zaiKey = oc?.mcp?.servers?.['glm-search']?.env?.Z_AI_API_KEY;
        if (zaiKey) {
          llmConfig = {
            apiKey: zaiKey,
            apiBase: 'https://open.bigmodel.cn/api/coding/paas/v4',
            model: 'glm-4.5-flash',  // Free, fast, good enough for test planning
          };
          logger.info('🤖 LLM Agent enabled: GLM-4.5-Flash (auto-detected from OpenClaw)');
        }
      }
    } catch {}
  }
  if (!llmConfig && process.env.OPENAI_API_KEY) {
    llmConfig = {
      apiKey: process.env.OPENAI_API_KEY,
      apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL || 'gpt-4',
    };
    logger.info('🤖 LLM Agent enabled: ' + llmConfig.model);
  }
  if (!llmConfig) {
    logger.info('ℹ️  LLM Agent not configured, using heuristic mode');
  }

  const planner = new AgentPlanner({
    testPlan: plan,
    outputDir,
    llm: llmConfig,
    maxRetries: 2,
  });

  const results = await planner.runAll();

  // Summary
  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`📊 Results`);
  logger.info(`${'═'.repeat(60)}`);

  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const stepsPassed = r.steps.filter(s => s.passed).length;
    const stepsTotal = r.steps.length;
    logger.info(`  ${icon} ${r.scenario}: ${stepsPassed}/${stepsTotal} steps (${r.durationMs}ms)${r.retries > 0 ? ` [retry ${r.retries}]` : ''}`);
    if (!r.passed) {
      for (const s of r.steps.filter(s => !s.passed)) {
        logger.info(`     ❌ ${s.step}: ${s.details}`);
      }
    }
    if (r.passed) passed++; else failed++;
  }

  const total = results.length;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
  logger.info(`\n  Total: ${passed}/${total} scenarios passed (${rate}%)`);
  logger.info(`${'═'.repeat(60)}`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    project: plan.project,
    total,
    passed,
    failed,
    rate: parseFloat(rate as string),
    results: results.map(r => ({
      scenario: r.scenario,
      passed: r.passed,
      steps: r.steps,
      retries: r.retries,
      durationMs: r.durationMs,
      error: r.error,
    })),
  };

  const reportPath = path.join(outputDir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.info(`\n📄 Report: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  logger.error(`Fatal: ${e}`);
  process.exit(1);
});
