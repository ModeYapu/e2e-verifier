# R010: CI/CD Integration + Smart Scheduling + Release Comparison

You are working on the e2e-verifier project. This is round R010 of the dev loop.
Your task is to implement three major features: CI/CD webhook triggers, smart scheduling, and release comparison.

## Project Context

- TypeScript + Express + Playwright
- File-based JSON storage (no database)
- Existing routes are in `src/server/routes/`
- Existing services are in `src/server/services/`
- Existing storage is in `src/storage/`
- The server entry point is `src/server/verify-server.ts`
- API key middleware exists at `src/middleware/api-auth.ts` (exports `apiKeyAuth`)
- ResultStore at `src/storage/result-store.ts` handles persistent results
- TrendAnalyzer at `src/storage/trend-analyzer.ts` handles trend analysis
- StorageService at `src/server/services/storage-service.ts` wraps storage layer
- Dashboard is at `dashboard/index.html` (Vue 3 + Element Plus CDN)

## Tasks

### 1. CI/CD Webhook Trigger Routes (`src/server/routes/ci-routes.ts`)

Create a new route file `src/server/routes/ci-routes.ts` with:

```typescript
export function createCIRoutes(verifyService: VerifyService, jobService: JobService, storageService: StorageService): Router
```

Endpoints:

#### POST /api/ci/trigger
- **Auth**: API key via `apiKeyAuth` middleware
- **Body**: `{ site: string, release: string, priority: "high"|"normal" }`
- **Behavior**: 
  - Creates a verification job for the given site
  - Stores release tag in job metadata
  - Returns `{ job_id: string, status: "queued" }`
  - If priority is "high", moves job to front of queue

#### POST /api/ci/gate
- **Auth**: API key via `apiKeyAuth` middleware
- **Body**: `{ site: string, release: string }`
- **Behavior**:
  - Looks up the latest verification result for the site+release
  - Calculates a quality score (pass rate percentage)
  - Returns `{ status: "pass"|"fail", score: number, checks: [{name, passed, message}] }`
  - Status is "pass" if score >= 80, otherwise "fail"

#### GET /api/ci/result/:job_id
- **Auth**: API key via `apiKeyAuth` middleware  
- **Behavior**: Returns job status and results if complete

### 2. Smart Scheduler Service (`src/server/services/scheduler-service.ts`)

Create `src/server/services/scheduler-service.ts`:

```typescript
export class SmartScheduler {
  constructor(storageService: StorageService)
  
  // Determine optimal verification frequency for a site
  getRecommendedFrequency(siteName: string): {
    frequency: 'hourly' | 'daily' | 'weekly';
    reason: string;
    verifyMode: 'fast' | 'deep';
  }
  
  // Get schedule recommendations for all sites
  getAllRecommendations(): Array<SiteSchedule>
  
  // Check if a site is in a release window (high-change period)
  isInReleaseWindow(siteName: string): boolean
}
```

Logic:
- **High-frequency changes** (results saved in last hour >= 3): → hourly + fast mode
- **Low pass rate** (< 70% over last 7 days): → hourly + deep mode  
- **Normal**: → daily + fast mode
- **Very stable** (100% pass rate over 30 days, infrequent changes): → weekly + fast mode
- Release window detection: if there are multiple verification runs within the last 2 hours, assume release mode

### 3. Release Comparison (`src/storage/result-store.ts` + `src/storage/release-comparator.ts`)

#### Add to ResultStore:
Add a `release` field support to TestResult saving. When saving a result that has `release` metadata, store it alongside the result. Add method:

```typescript
getByRelease(siteName: string, release: string): TestResult[]
```

#### Create `src/storage/release-comparator.ts`:

```typescript
export class ReleaseComparator {
  constructor(resultStore: ResultStore)
  
  compareReleases(siteName: string, releaseA: string, releaseB: string): ReleaseComparison
}

interface ReleaseComparison {
  siteName: string;
  releaseA: string;
  releaseB: string;
  summary: {
    passRateA: number;
    passRateB: number;
    passRateChange: number;
    avgDurationA: number;
    avgDurationB: number;
    durationChange: number;
  };
  newFailures: CheckResult[];  // Passed in A, failed in B
  fixed: CheckResult[];        // Failed in A, passed in B
  regressions: CheckResult[];  // Failed in both (ongoing issues)
}
```

#### API Route: Add to `ci-routes.ts` or create `src/server/routes/comparison-routes.ts`:
```
GET /api/results/compare?site=x&release_a=v1&release_b=v2
```
Returns the ReleaseComparison object.

### 4. Wire Up Routes in verify-server.ts

In `setupRoutes()` method of `VerifyServer`, add:
```typescript
this.app.use('/api', createCIRoutes(this.verifyService, this.jobService, this.storageService));
this.app.use('/api', createComparisonRoutes(this.storageService));
```

Import the new route creators at the top of verify-server.ts.

### 5. Dashboard Enhancements (`dashboard/index.html`)

Add three new sections/tabs to the sidebar navigation:

#### a) CI/CD Trigger Page
- Form with: Site selector, Release tag input, Priority selector (high/normal)
- "Trigger Verification" button → calls POST /api/ci/trigger
- "Check Gate" button → calls POST /api/ci/gate
- Display results in a card

#### b) Release Comparison Page  
- Two release version selectors
- Site selector
- "Compare" button → calls GET /api/results/compare
- Show: pass rate change (with up/down arrows), new failures list, fixed items list, duration change
- Use color coding (green for improvements, red for regressions)

#### c) Scheduler Config Page
- Table showing all sites with their recommended frequency, mode, and reason
- "Refresh Recommendations" button
- Visual indicators (badges) for frequency levels

### 6. Tests

Create test files:

#### `src/storage/release-comparator.test.ts`
- Test compareReleases with mock data
- Test newFailures detection
- Test fixed items detection
- Test pass rate calculation

#### `src/server/services/scheduler-service.test.ts`
- Test getRecommendedFrequency for high-frequency site
- Test getRecommendedFrequency for low pass rate site
- Test isInReleaseWindow detection

Make sure all existing tests still pass.

### 7. Type Updates

If ResultStore needs to store release info, update the TestResult interface or create a wrapper:
```typescript
interface ResultWithRelease extends TestResult {
  release?: string;
}
```

You can store release info in the existing `checks[].details` field or add a separate metadata file. The simplest approach: store release-tagged results in a separate directory `data/releases/{site}/{release}.json`.

## Build & Test Requirements

After all changes:
1. `npm run build` must exit 0 (TypeScript compilation)
2. `npm test` must exit 0 (all tests pass)

## Important Notes

- Do NOT break existing functionality
- Follow the existing code style (no semicolons in imports, Express 5 patterns)
- Use the existing `apiKeyAuth` middleware for CI routes
- All new files must be properly imported and wired up
- The dashboard uses Vue 3 + Element Plus from CDN, keep it that way
- Store release comparison data in the file system (JSON), consistent with existing patterns

## Verification Commands

```bash
npm run build
npm test
```

Both must succeed before committing.
