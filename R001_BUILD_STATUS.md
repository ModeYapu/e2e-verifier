# R001 — Build & Fix Status

**Date:** 2026-06-16
**Verification command:** `npx tsc --noEmit`
**Result:** ✅ **EXIT 0** (clean type-check, no errors)

---

## Summary

This report covers four issues (P1-ANY-CLEANUP, P2-BATCH-PATH, P2-WS-AUTH,
P2-CREDENTIALS). Of these, **P2-WS-AUTH was already implemented** in a prior
slice and was verified rather than re-coded; the remaining three were applied
in this change set. The project type-checks cleanly with no regressions.

| Issue | Status | Files |
|-------|--------|-------|
| P1-ANY-CLEANUP  | ✅ Fixed | `export-routes.ts`, `benchmark-routes.ts` |
| P2-BATCH-PATH   | ✅ Fixed (defense-in-depth) | `batch-routes.ts` |
| P2-WS-AUTH      | ✅ Already implemented — verified | `verify-server.ts`, `realtime/websocket-server.ts` |
| P2-CREDENTIALS  | ✅ Fixed | `.env.example`, `explorer-output/scripts/*.ts` |

---

## P1-ANY-CLEANUP — eliminate `any` from export/benchmark routes

**Scope:** `src/server/routes/export-routes.ts`, `src/server/routes/benchmark-routes.ts`
(the two route modules with the most `any` usage).

**Approach — define proper interfaces instead of `any`:**

`export-routes.ts` introduced typed views for the heterogeneous result data
backing a report. That data is a runtime union (`JobResult` =
`TestResult | AgentResult | OrchestratedResult | MatrixResult`, or a
`TestResult` read back from storage), where each backend populates a different
subset of fields. Rather than `any`, the module now models only the fields it
actually consumes and narrows to them with a single controlled cast at the
boundary:

- `ResultCheckEntry` — a single check/result entry.
- `ResultPerformanceEntry` — a per-step performance timing point.
- `ResultTrendEntry` — a historical trend point.
- `ReportResultData` — the structural view consumed by `buildReportData`.

`benchmark-routes.ts` introduced `PerformanceRecordInput` for the untrusted
`POST` body and now builds a fully-typed `PerformanceRecord` with proper
`StepTiming[]` (the prior code passed the raw body's steps straight through
under `any`, hiding a missing per-step `timestamp`).

**Result:** the two named files went from **7 explicit `any` annotations to 0**.
(The broader `src/` still contains `any` in other modules outside the named
scope; those were intentionally left untouched per the "focus on export-routes
and benchmark-routes first" directive.)

---

## P2-BATCH-PATH — validate `batchId` before path join

**File:** `src/server/routes/batch-routes.ts`

The **read** path (`loadBatchState`) already validated `batchId` against
`/^[A-Za-z0-9_-]+$/` (`BATCH_ID_RE`) and resolved through `safeJoinPath` in a
prior slice. The **write** path (`saveBatchState`, the `path.join(BATCH_DIR,
\`${state.batchId}.json\`)` site) used the id directly. Although `batchId` is
internally generated and always matches the safe charset, this change adds the
same `BATCH_ID_RE` guard to `saveBatchState` so a tainted id can never reach
the filesystem — **reject (throw) otherwise**. This is defense-in-depth and
satisfies the requirement that `batchId` be validated against
`/^[a-zA-Z0-9_-]+$/` before every path join.

---

## P2-WS-AUTH — WebSocket authentication (verified, no change needed)

**Files:** `src/server/verify-server.ts:363`, `src/realtime/websocket-server.ts`

This was **already implemented** (Slice 5: "WebSocket auth/origin/cap"). Verified
the full chain:

- `verify-server.ts` constructs the `WebSocketServer` with:
  - `authToken` = `E2E_VERIFIER_WS_TOKEN` (falls back to
    `E2E_VERIFIER_API_TOKEN`),
  - `allowedOrigins` = the `CORS_ORIGINS` allowlist,
  - `maxConnections` = `E2E_VERIFIER_WS_MAX_CONNECTIONS` (default 50).
- `websocket-server.ts` `handleUpgrade` enforces, in order:
  1. path match (`404` otherwise),
  2. **Origin allowlist** — rejects cross-site WS hijacking (`403`),
  3. **connection cap** (`503`),
  4. **auth token** via the `?token=` query parameter (`401`).

The token is checked as a query parameter (the option the task named), which is
the correct choice for browser WS clients that cannot set custom handshake
headers. Unauthenticated connections are rejected at the HTTP upgrade with
`401` *before* the WebSocket connection is established — strictly stronger than
a post-handshake `1008` close, since the socket never opens. No code change was
required; the implementation is sound.

> Note: when no token is configured **and** the server is loopback-only,
> anonymous WS connections are permitted by design, mirroring the REST layer's
> local-trust policy. This is intentional and consistent.

---

## P2-CREDENTIALS — document generated-script test credentials

**Files:** `.env.example` (new), `explorer-output/scripts/*.ts` (19 files)

The scripts under `explorer-output/scripts/` are **auto-generated** test
artifacts that log into the local LogMonitor fixture using throwaway credentials
(`admin` / `admin123`) — not real secrets. Both remediation options from the
task were applied:

1. **Created `.env.example`** documenting `TEST_USERNAME` / `TEST_PASSWORD`
   (plus the server, CORS, WebSocket, and LLM env vars) so the fixtures can be
   reprovisioned without scanning generated source.
2. **Prepended a provenance header comment** to all 19 generated scripts noting
   they are auto-generated test artifacts and that the embedded credentials are
   documented test fixtures, not real secrets.

---

## Verification

```
$ npx tsc --noEmit
$ echo $?
0
```

- `npx tsc --noEmit` → **exit 0**, no diagnostics.
- Target route files are `any`-free:
  `grep ': any\|<any>\|any[]\|as any' export-routes.ts benchmark-routes.ts batch-routes.ts` → no matches.
- Changed files: 3 source files, 19 generated scripts, 1 new `.env.example`.

### Changed files
```
 src/server/routes/batch-routes.ts                  |  +8
 src/server/routes/benchmark-routes.ts              | +33 (net)
 src/server/routes/export-routes.ts                 | +76 (net)
 .env.example                                       |  new
 explorer-output/scripts/*.ts  (19 files)           | +9 each (header)
```
