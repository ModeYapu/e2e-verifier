You are adding an HTTP API server to the e2e-verifier project at /root/.openclaw/workspace/e2e-verifier/.

The project already has:
- Verifier (fast checks), AgentLoop (deep verify), VerifyOrchestrator (chained)
- CLI entry points for all of them

Now we need an HTTP API server so external services can call verification without CLI args.

## Requirements

### 1. Install express + types
```
npm install express cors
npm install -D @types/express @types/cors
```

### 2. Create src/server/verify-server.ts — HTTP API server

A self-contained HTTP server on configurable port (default 3001) with these endpoints:

#### POST /api/verify
Fast verification:
```json
Request: { "url": "https://sanfacheng.cyou/vault/", "name": "Vault Reader", "checks": ["screenshot","console","performance","seo"], "viewport": { "width": 1280, "height": 720 }, "timeout": 15000 }
Response: { "success": true, "data": { TestResult fields } }
```

#### POST /api/verify/deep
Deep verification (Agent Loop):
```json
Request: { "url": "...", "task": "验证页面...", "model": "glm-5.1", "maxSteps": 30 }
Response: { "success": true, "data": { AgentResult fields } }
```

#### POST /api/verify/orchestrated
Orchestrated verification (fast + deep chained):
```json
Request: { "sites": [SiteConfig...], "strict": false, "model": "glm-5.1", "skipDeep": false }
Response: { "success": true, "data": { OrchestratedResult fields } }
```

#### GET /api/health
Health check:
```json
Response: { "status": "ok", "version": "1.0.0", "uptime": 12345 }
```

#### GET /api/stats
Usage statistics:
```json
Response: { "totalVerifications": 42, "totalDeepVerifications": 10, "uptime": 12345 }
```

### 3. Server Architecture

- Singleton server — one instance, shared browser pool (launch Chromium once, reuse for all requests)
- **Browser pool**: Reuse a single chromium browser instance across all requests to save memory/time
- Each request creates a new BrowserContext + Page (isolated sessions)
- Deep verification runs asynchronously — returns immediately with a job ID, client polls
- **Async job pattern for deep/orchestrated**: POST creates a job, returns `{ jobId, status: "pending" }`, GET /api/jobs/:jobId to poll result

Job tracking:
```typescript
interface VerificationJob {
  id: string;
  type: 'fast' | 'deep' | 'orchestrated';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: string;
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

### 4. Endpoint Details

**POST /api/verify** — synchronous, returns result within timeout
- Timeout: 60 seconds default (configurable via request body `timeout`)
- Creates temporary SiteConfig, calls Verifier, returns TestResult

**POST /api/verify/deep** — asynchronous (returns jobId immediately)
- Starts AgentLoop in background
- Client polls GET /api/jobs/:jobId

**POST /api/verify/orchestrated** — asynchronous
- Starts VerifyOrchestrator in background
- Client polls GET /api/jobs/:jobId

**GET /api/jobs/:jobId** — polling endpoint
Returns current job status and result if completed

**DELETE /api/jobs/:jobId** — cancel a running job

### 5. CLI Entry Point: src/cli/verify-server.ts

Start server: `npm run verify:server`
```bash
npx ts-node src/cli/verify-server.ts --port 3001
```

Options:
- --port, -p: Port (default 3001)
- --host: Host (default 0.0.0.0)
- --headless: Browser headless mode (default true)

### 6. Update package.json
Add script: "verify:server": "ts-node src/cli/verify-server.ts"

### 7. Update src/index.ts
Add server export.

## Implementation Notes:
1. Use Express with CORS enabled (for cross-origin calls from admin panel etc.)
2. Use uuid or simple crypto.randomUUID() for job IDs (Node 19+ has crypto.randomUUID)
3. Job results stored in memory (Map) — ephemeral, lost on restart. For production, add file persistence option.
4. Browser pool: launch Chromium once at server start, reuse for all requests
5. Clean up browser on server shutdown (process.on('SIGTERM', ...))
6. Error handling: catch all errors, return 500 with error message
7. Rate limiting: optional, not required for MVP
8. Logging: console.log with timestamps
9. CORS: allow all origins for dev, make configurable
10. Keep it focused — ~300-400 lines for the server, ~100 lines for the CLI

## Files to Create:
1. src/server/verify-server.ts — HTTP server class + job manager
2. src/cli/verify-server.ts — CLI entry point to start server

## Files to Modify:
1. package.json — add "verify:server" script
2. src/index.ts — add exports

## Verification:
After implementation, run: `npx tsc --noEmit` to confirm zero errors.

IMPORTANT: Also add a note about E2E_VERIFIER_PORT env var being checked before CLI args (standard 12-factor app pattern).
