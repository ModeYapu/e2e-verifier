# SDD: P8 Deep Optimization — Tests, Types, Security, Fixes

## Slice 1: Fix Failing Tests + Intelligence Core Tests

### 1a: Fix handleDialog timeout in actions.test.ts
- The handleDialog test waits for a dialog event that never fires with the mock
- Fix: properly mock the page.on('dialog') event or adjust the test to not await dialog

### 1b: Add intelligence core tests
- tests/intelligence-executor.test.ts: Test PlaywrightExecutor page acquisition, step execution, error handling
- tests/intelligence-evaluator.test.ts: Test evaluation scoring, LLM response parsing, evidence collection
- tests/intelligence-planner.test.ts: Test plan generation, scenario decomposition
- tests/intelligence-repair-loop.test.ts: Test repair iteration, max retries, strategy selection

Mock all external deps (LLM, Playwright, BrowserPool). Use jest.mock heavily.

## Slice 2: Eliminate any from Top Offenders

Target files (66 any total):
- src/engine/agent-planner.ts (18 any) → type LLM responses, plan structures
- src/engine/test-plan-parser.ts (10 any) → type parsed plan nodes
- src/intelligence/multi-test-orchestrator.ts (10 any) → type orchestration state
- src/intelligence/dom-filter.ts (9 any) → type DOM node filtering
- src/intelligence/context-manager.ts (9 any) → type context operations
- src/intelligence/experience-planner.ts (8 any) → type experience queries

Strategy: Replace `any` with `unknown` + type guards, or proper interfaces.

## Slice 3: API Authentication Middleware

Currently 0 routes have auth protection. Add:
- src/middleware/api-auth.ts already exists — check it
- Apply to sensitive routes: POST /api/verify, POST /api/jobs, POST /api/projects, DELETE endpoints
- Keep GET /api/health, GET /api/stats public
- Support X-API-Key header
- Optional: make auth configurable (env var AUTH_ENABLED)

## Slice 4: Route Input Validation

Add input validation to critical routes using a lightweight approach:
- Create src/middleware/validate.ts with a validateBody helper
- Validate URL format for verify routes
- Validate required fields for create job/project
- Return 400 with specific error messages
