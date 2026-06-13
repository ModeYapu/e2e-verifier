# R011: AI Repair Advisor + Batch Site Management + Notification System

## Overview
Add three major features to the e2e-verifier: (1) AI-powered repair suggestions for failed verifications, (2) batch site management for bulk operations, and (3) a configurable notification system. Also enhance the dashboard with new UI for these features.

## Project Context
- TypeScript + Express + Playwright project
- Source in `src/`, tests in `tests/`, dashboard in `dashboard/index.html`
- Build: `npm run build` (tsc), Test: `npm test` (jest)
- Server entry: `src/server/verify-server.ts` — routes are registered there
- Types in `src/types/index.ts` — TestResult, CheckResult, ScreenshotResult
- Existing services pattern: `src/server/services/*.ts`
- Existing routes pattern: `src/server/routes/*.ts` — each exports a factory function taking services, returns Router

## Task 1: AI Repair Advisor (`src/services/repair-advisor.ts`)

Create a service that analyzes verification failures and generates repair suggestions.

### Requirements:
1. **RepairAdvisor class** in `src/services/repair-advisor.ts`
2. **analyzeFailure(jobId, result)** method that:
   - Takes a TestResult with failed checks
   - Categorizes failures (timeout, element-not-found, visual-diff, assertion-failure, network-error, etc.)
   - Generates actionable repair suggestions for each failure category
   - Returns structured suggestions with: category, severity, description, suggestedFix, confidence
3. **Suggestion types**:
   ```typescript
   interface RepairSuggestion {
     category: string;           // 'timeout' | 'element-not-found' | 'visual-diff' | 'assertion' | 'network' | 'auth' | 'general'
     severity: 'critical' | 'high' | 'medium' | 'low';
     description: string;        // What went wrong
     suggestedFix: string;       // How to fix it
     confidence: number;         // 0-1
     relatedCheck?: string;      // Name of the failed check
   }
   ```
4. **Failure pattern analysis**: Use heuristics based on:
   - Error messages (regex matching for common patterns)
   - Check type and failure message
   - Screenshot availability
   - Duration (detect timeout vs fast-fail)
5. **Batch analysis**: `analyzeJob(jobId)` — read results from ResultStore, analyze all failures

### Routes (`src/server/routes/repair-routes.ts`):
- `GET /api/results/:jobId/repair-suggestions` — Get AI repair suggestions for a job's failures
  - Returns: `{ suggestions: RepairSuggestion[], summary: string }`

### Registration:
- Import and register in `verify-server.ts` following the existing pattern (like ci-routes)

### Tests (`tests/repair-advisor.test.ts`):
- Test failure categorization for each category
- Test with mock TestResult data (passed and failed cases)
- Test edge cases (no failures, unknown error patterns)
- At least 5 test cases

## Task 2: Batch Site Management (`src/server/routes/batch-routes.ts`)

### Requirements:
1. **BatchRoutes** following existing route patterns
2. **POST /api/batch/verify** — Trigger verification for multiple sites:
   ```typescript
   // Request body:
   {
     sites: Array<{ url: string; name?: string; checks?: string[] }>,
     priority?: 'high' | 'normal',
     configPath?: string  // optional path to JSON config file for import
   }
   // Response:
   {
     batchId: string,
     jobs: Array<{ site: string; jobId: string; status: string }>,
     totalJobs: number
   }
   ```
3. **POST /api/batch/schedule** — Set up recurring verification for multiple sites:
   ```typescript
   // Request body:
   {
     sites: Array<{ url: string; name?: string }>,
     schedule: { frequency: 'hourly' | 'daily' | 'weekly'; time?: string },
     configPath?: string
   }
   // Response:
   {
     batchId: string,
     scheduled: Array<{ site: string; scheduleId: string; nextRun: string }>,
     totalScheduled: number
   }
   ```
4. **GET /api/batch/status/:batchId** — Check batch operation status:
   ```typescript
   {
     batchId: string,
     status: 'pending' | 'running' | 'completed' | 'failed',
     totalJobs: number,
     completedJobs: number,
     passedJobs: number,
     failedJobs: number,
     jobs: Array<{ site: string; jobId: string; status: string; passed?: boolean }>
   }
   ```
5. **JSON config file import**: Support reading site configs from a JSON file path:
   ```json
   {
     "sites": [
       { "url": "https://example.com", "name": "Example", "checks": ["screenshot", "status"] }
     ]
   }
   ```
6. **Batch state storage**: Store batch metadata in `data/batch/` directory as JSON files

### Tests (`tests/batch-routes.test.ts`):
- Test batch verify triggers multiple jobs
- Test batch schedule creates schedules
- Test batch status retrieval
- Test config file import
- At least 4 test cases

## Task 3: Notification System (`src/services/notifier.ts`)

### Requirements:
1. **Notifier class** in `src/services/notifier.ts`
2. **Notification channels** (all optional, configured via env or API):
   - **Feishu webhook**: POST to configured webhook URL with formatted message
   - **Email**: Using nodemailer (or console.log stub if not configured)
   - **Slack**: POST to Slack webhook URL
   - **Console**: Always logs notification
3. **Notification config**:
   ```typescript
   interface NotificationConfig {
     channels: {
       feishu?: { webhookUrl: string };
       email?: { smtpHost: string; port: number; from: string; to: string[] };
       slack?: { webhookUrl: string };
     };
     rules: {
       notifyOn: 'all' | 'failure-only' | 'regression-only';
       minSeverity?: 'critical' | 'high' | 'medium' | 'low';
       siteFilter?: string[];  // only notify for these sites (empty = all)
     };
   }
   ```
4. **Notification template**: Format includes:
   - Site name and URL
   - Pass rate (%)
   - Failed checks list with messages
   - Screenshot paths (as links if served)
   - Timestamp
   - Job ID for reference
5. **Notification history**: Store sent notifications in `data/notifications/` as JSON
6. **Methods**:
   - `notify(jobId, result)` — Check rules and send notifications
   - `sendNotification(channel, message)` — Send to specific channel
   - `getHistory(limit?)` — Get notification history
   - `updateConfig(config)` — Update notification configuration

### Routes (`src/server/routes/notification-routes.ts`):
- `POST /api/notifications/config` — Update notification configuration
- `GET /api/notifications/config` — Get current configuration
- `GET /api/notifications/history` — Get notification history (query: ?limit=20)

### Tests (`tests/notifier.test.ts`):
- Test notification rule filtering (all, failure-only, regression-only)
- Test notification template generation
- Test config update
- Test history retrieval
- At least 4 test cases

## Task 4: Dashboard Enhancement (`dashboard/index.html`)

Add the following to the existing dashboard:

1. **Repair Suggestions Panel**: When viewing failed job details, show AI repair suggestions in a collapsible panel below the failure details
2. **Batch Operations Section**: 
   - A form to input multiple URLs (textarea, one per line) and trigger batch verification
   - Show batch job progress
3. **Notification Configuration Panel**:
   - Toggle notification channels (feishu/email/slack)
   - Select notification rules (all/failure-only/regression-only)
   - View recent notification history

Keep the existing dashboard functionality intact. Add new sections with clear visual separation. Use vanilla JS (no frameworks) consistent with existing dashboard code.

## Integration in verify-server.ts

Register all new routes following the existing pattern:
```typescript
import { createRepairRoutes } from './routes/repair-routes';
import { createBatchRoutes } from './routes/batch-routes';
import { createNotificationRoutes } from './routes/notification-routes';
// ...in setupRoutes():
this.router.use('/api', createRepairRoutes(this.storageService, ...));
this.router.use('/api', createBatchRoutes(this.verifyService, ...));
this.router.use('/api', createNotificationRoutes(...));
```

## Acceptance Criteria
1. `npm run build` exits 0 — TypeScript compiles cleanly
2. `npm test` exits 0 — All tests pass (existing + new)
3. All new routes are registered and functional
4. New services follow existing code patterns
5. Dashboard has all new UI sections
6. No breaking changes to existing functionality

## Important Notes
- Follow the existing code style (no semicolons in route files that don't use them, match surrounding code)
- Use the existing logger: `import { logger } from '../utils/logger'`
- Use the existing ResultStore for reading test results
- Don't add external dependencies — use built-in http/https for webhooks, or fetch
- Keep functions async where they do I/O
- Ensure all TypeScript types are properly exported
