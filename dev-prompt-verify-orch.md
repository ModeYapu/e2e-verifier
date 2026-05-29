You are adding a verification orchestration layer to the e2e-verifier project (path: /root/.openclaw/workspace/e2e-verifier/). This orchestrator sits between the existing fast verify (using Verifier class) and the newly added deep verify (using AgentLoop class). Its job: run fast checks first, then automatically trigger deep verification for failed items.

## Existing Architecture

### src/verifier.ts
- Class `Verifier(config: SiteConfig)` 
- Method `verify(): Promise<TestResult>` — runs all fast checks (status code, performance, accessibility, SEO, console, screenshots)
- TestResult has: { siteName, url, timestamp, passed, checks: CheckResult[], screenshots, errors }

### src/types/index.ts
- SiteConfig: { name, url, expectedStatusCode, screenshots, viewport, checks, timeout }
- TestResult: { siteName, url, timestamp, passed, duration, checks, screenshots, errors }
- CheckResult: { name, type, passed, message, details? }

### src/agent/agent-loop.ts
- Class `AgentLoop(config: AgentConfig)` 
- Method `run(task: string, url: string): Promise<AgentResult>`
- AgentResult: { task, url, passed, steps, finalScript, duration, totalTokens }
- AgentConfig: { model, maxSteps, apiKey?, apiBase? }

### src/agent/llm-client.ts
- Class `LLMClient(config: AgentConfig)` — OpenAI-compatible client
- Uses env vars: LLM_API_KEY, LLM_BASE_URL, OPENAI_API_KEY

### src/cli/verify.ts — existing fast verify CLI
- Loads site config file, runs Verifier for each site, generates report
- npm run verify -- --config <path>

### src/cli/verify-deep.ts — deep verify CLI
- npm run verify:deep -- --config <path> --task "description"
- Runs AgentLoop for each site

### src/utils/report.ts
- Class ReportGenerator — generates, saves, prints reports

## Sites config format (sites/quick-check.json):
```json
{
  "name": "description",
  "sites": [
    { "name": "...", "url": "...", "expectedStatusCode": 200, ... }
  ]
}
```

### package.json scripts:
- "verify": "ts-node src/cli/verify.ts"
- "verify:all": "ts-node src/cli/verify-all.ts"
- "verify:deep": "ts-node src/cli/verify-deep.ts"

## What to Build

Create 2 files only:

### 1. src/orchestrator/verify-orchestrator.ts — ~350 lines

Class `VerifyOrchestrator` that implements the chained verification flow:

```
for each site in config:
  1. Run fast verify (existing Verifier.verify())
  2. Analyze results: identify failed checks + error details
  3. Determine if deep verify is needed:
     - ALL checks passed → skip deep, mark as fully passed
     - Any critical check failed (http/accessibility error level) → require deep
     - Non-critical checks failed (console warnings, seo issues) → optionally deep
     - Errors count > 0 → require deep
  4. For sites needing deep verify:
     - Generate a task description from the failed check details
     - Run AgentLoop.run(task, url) with that description
     - Merge deep verify result into the final report
  5. Produce a unified report that combines fast + deep results
```

**Key design decisions:**
- The orchestrator generates task descriptions AUTOMATICALLY from the fast check failure details. For example, if accessibility fails with "missing alt text on 3 images", the generated task is "检查图片alt属性是否缺失，验证页面可访问性"
- Deep verify model defaults to "gpt-4o" but uses env var LLM_MODEL if set
- If deep verify also fails, the orchestrator still produces a report — it doesn't block on deep verify failure
- Deep verify is OPTIONAL for non-critical failures unless --strict flag is passed
- Time budget: max 5 minutes per deep verify (AgentLoop will handle its own max steps)

**Constructor:**
```typescript
constructor(options?: {
  strict?: boolean;       // if true, deep-verify even non-critical failures
  model?: string;         // LLM model for deep verify
  maxDeepSteps?: number;  // max agent loop steps for deep verify
  outputDir?: string;     // output directory for reports
})
```

**Public methods:**
```typescript
async verifyAll(configPath: string): Promise<OrchestratedResult>
async verifySite(config: SiteConfig): Promise<SiteOrchestratedResult>
```

**Types (define in this file):**
```typescript
interface OrchestratedResult {
  timestamp: string;
  summary: {
    total: number;
    allPassed: number;
    neededDeep: number;
    deepPassed: number;
    deepFailed: number;
  };
  sites: SiteOrchestratedResult[];
}

interface SiteOrchestratedResult {
  siteName: string;
  url: string;
  fastResult: TestResult;
  fastPassed: boolean;
  deepNeeded: boolean;
  deepResult?: AgentResult;
  overallPassed: boolean;
  // Add a field to carry the original SiteConfig for CLI usage
  config?: SiteConfig;
}
```

**Critical implementation detail:** The `deepNeeded` flag should trigger deep verify ONLY for checks that actually failed. Don't waste LLM tokens on passing checks.

### 2. src/cli/verify-orchestrated.ts — ~250 lines

A CLI that uses VerifyOrchestrator:

```
npm run verify:orchestrated -- --config sites/quick-check.json
npm run verify:orchestrated -- --config sites/quick-check.json --strict
npm run verify:orchestrated -- --config sites/quick-check.json --deep-model glm-5.1
```

**Options:**
- --config, -c (required): path to site config file
- --strict, -s: if set, deep-verify even non-critical failures
- --deep-model, -m: LLM model for deep verify (default: env LLM_MODEL or "gpt-4o")
- --output, -o: output report path
- --json, -j: JSON output
- --skip-deep: skip all deep verification, only run fast checks (equivalent to ordinary verify but with orchestrator report format)

**Output format (console):**
```
========================================
VERIFICATION ORCHESTRATOR — sanfacheng.cyou quick check
========================================
Using deep model: gpt-4o

▶ Vault Reader (http://sanfacheng.cyou/vault/)
  Fast verify: ✅ PASSED (8 checks, 0 errors, 2.3s)
  Deep verify: SKIPPED (all fast checks passed)
  Overall: ✅ PASSED

▶ OpenClaw Control (http://sanfacheng.cyou/)
  Fast verify: ⚠️ FAILED (7 passed, 1 failed, 1 error, 2.5s)
  Deep verify: ✅ PASSED (5 steps, 1280 tokens)
  Overall: ✅ PASSED (fixed by deep verify)

▶ WebGPU 3D Studio (http://sanfacheng.cyou/webgpu/)
  Fast verify: ❌ FAILED (5 passed, 3 failed, 3 errors, 1.8s)
  Deep verify: ❌ FAILED (15 steps, 3400 tokens)
  Overall: ❌ FAILED

========================================
SUMMARY
========================================
Total: 3
All passed: 1
Needed deep verify: 2
Deep passed: 1
Deep failed: 1
========================================
Detailed report: reports/orchestrated-2026-05-26.json
```

**Error handling:**
- If deep verify throws an error (network, API key, etc.), mark deepResult as error and continue
- If fast verify throws an error, mark site as failed and skip deep for that site
- Collect all errors and print at end

## Implementation Notes:
1. Import from existing modules using relative paths (../verifier, ../agent/agent-loop, ../types)
2. Do NOT modify any existing files
3. Use console.log for progress output (it's a CLI tool)
4. Write clean TypeScript with proper types
5. Use async/await throughout
6. After creating both files:
   - Add script to package.json: "verify:orchestrated": "ts-node src/cli/verify-orchestrated.ts"
   - Add export to src/index.ts
   - Run `npx tsc --noEmit` to verify compilation
7. Keep it focused — ~600 lines total for both files

## How to Run
```
cd /root/.openclaw/workspace/e2e-verifier
npm run verify:orchestrated -- --config sites/quick-check.json
```
