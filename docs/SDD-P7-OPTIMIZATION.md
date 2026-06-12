# SDD: P7 Continuous Optimization

## Slice 1: Core Module Tests

Add test coverage for the most critical modules (0 → meaningful coverage).

### Priority test files:
1. `tests/browser-pool.test.ts` — BrowserPool singleton, acquire/release, maxInstances
2. `tests/json-storage.test.ts` — IStorage interface, atomic write, concurrent access, backup
3. `tests/llm-registry.test.ts` — LLMRegistry singleton, register/get, default client
4. `tests/verify-service.test.ts` — Fast verify flow, deep verify, orchestrated verify (mock browser)
5. `tests/job-store.test.ts` — CRUD, list with filters, JsonStorage integration
6. `tests/experience-store.test.ts` — Store/query/getStats, JsonStorage integration

### Rules:
- Use vitest or jest (check package.json for test runner)
- Mock external deps (playwright, LLM calls, filesystem where appropriate)
- Test happy path + error path for each
- Minimum: 3 tests per file (create, read, error handling)
- `npm test` must pass

## Slice 2: verify-service.ts Split

Current: 399 lines with fast/deep/orchestrated/intelligent/multi-agent verify methods.

Split into:
- `src/server/services/verify-service.ts` — Main class, constructor, public API (~100 lines)
- `src/server/services/fast-verify.ts` — fastVerify() logic
- `src/server/services/deep-verify.ts` — deepVerify(), orchestratedVerify() logic
- `src/server/services/intelligent-verify.ts` — intelligentVerify(), multiAgentVerify() logic

## Slice 3: Orchestrator Explicit Init

Change auto-init pattern: if `run()` is called without `init()`, throw Error("Orchestrator not initialized. Call init() first.") instead of silently auto-initializing.

Update callers to call init() explicitly.

## Slice 4: Express Error Middleware + Request Typing

1. Create `src/middleware/error-handler.ts`:
   - Centralized Express error handler (catch all errors from routes)
   - Consistent error response format: { error: string, code: string, details?: any }
   - Log errors with context

2. Create typed request interfaces in `src/types/express.ts`:
   - TypedRequestBody<T> helper
   - FastVerifyBody, DeepVerifyBody, CreateJobBody, CreateProjectBody, CreateKeyBody
   - Apply to route handlers

3. Wire error handler into verify-server.ts app.use(errorHandler)
