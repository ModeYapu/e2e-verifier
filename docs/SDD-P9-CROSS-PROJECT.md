# SDD: P9 — LogMonitor Fix + E2E Verifier Final Polish

## Part A: LogMonitor P2 Build Fixes

The collector has build errors from P2 code:
1. storage/sqlite.go:748,775,780 - CleanupResult type mismatch
2. storage/sqlite.go:1003 - undefined IssueStatusResolved

Fix all build errors. Then run go test ./...

## Part B: E2E Verifier Final Polish
1. Fix last failing test (json-storage tmp cleanup)
2. Reduce remaining 142 any to under 100
3. Add API integration test (start server, hit endpoints, verify responses)
