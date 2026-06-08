You are fixing the ScriptEngine and AgentLoop in the e2e-verifier project at /root/.openclaw/workspace/e2e-verifier/.

Read the files first:
1. cat src/agent/script-engine.ts
2. cat src/agent/agent-loop.ts (lines 280-350 for handleExecuteScript)

## Problems to Fix

### Problem 1: Playwright can't find test files
The script filenames use timestamps like `step-1-2026-05-28T03-21-25-273Z.ts`. When `npx playwright test` is called with this path, Playwright's test runner can't find the file because:
- The path contains characters that break test matching
- The file is just a standalone .ts file, not in a proper test structure
- Playwright needs a proper project configuration to compile TypeScript

Fix: Instead of running scripts via `npx playwright test path/to/file.ts`, use `npx ts-node path/to/file.ts` as the execution method. The tests should be simple scripts that use `@playwright/test`'s `chromium.launch()` directly rather than the `test()` DSL.

In `executeScript()`: Change from:
```
npx playwright test scriptPath --reporter=list --output=reportDir
```
To:
```
npx ts-node scriptPath
```

AND modify `wrapScript()` so the generated scripts use standalone Playwright API (not test runner):
```typescript
import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    ${USER_SCRIPT_CODE}
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
```

The key: stop using `import { test, expect } from '@playwright/test'` with the test runner DSL. Use standalone `chromium.launch()` + script-based execution via ts-node.

### Problem 2: Wrong script paths from LLM
The LLM sometimes returns `/home/user/scripts/...` paths instead of the actual project root path. Since `handleExecuteScript()` already has logic to detect script code vs paths, add path resolution:

```typescript
if (content.includes('page.') || content.includes('test(') || content.includes('chromium')) {
  // It's script code — write to file
} else {
  // It's a file path — resolve to absolute if needed
  const resolvedPath = path.resolve(content);
  if (!fs.existsSync(resolvedPath)) {
    // Try with scripts/ prefix
    const altPath = path.resolve('scripts', content);
    if (fs.existsSync(altPath)) {
      scriptPath = altPath;
    } else {
      return `Script file not found at: ${content} or scripts/${content}`;
    }
  } else {
    scriptPath = resolvedPath;
  }
}
```

### Problem 3: Script filename makes Playwright unhappy
Simplify filenames: remove the full ISO timestamp. Use a simple counter-based name:
```typescript
writeScript(script: string, name: string): string {
  const filename = `${name}.ts`;
  const filepath = path.join(this.scriptsDir, filename);
  ...
}
```

BUT maintain uniqueness by appending a short counter:
```typescript
private scriptCounter = 0;
writeScript(script: string, name: string): string {
  this.scriptCounter++;
  const filename = `${name}-${this.scriptCounter}.ts`;
  ...
}
```

## Files to Modify

Only modify these 2 files:
1. src/agent/script-engine.ts — change wrapScript() to standalone API, simplify filenames, change execution to ts-node
2. src/agent/agent-loop.ts — improve handleExecuteScript() path resolution (lines ~300-320)

## Do NOT modify any other files

After modifications, run `npx tsc --noEmit` to verify zero errors.
