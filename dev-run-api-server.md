You are implementing the HTTP API server for the e2e-verifier project.

Your project folder: /root/.openclaw/workspace/e2e-verifier/

Read the prompt first:
cat /root/.openclaw/workspace/e2e-verifier/dev-prompt-api-server.md

Create ALL files:
1. src/server/verify-server.ts
2. src/cli/verify-server.ts

Modify:
3. package.json — add "verify:server" script + express/cors dependencies
4. src/index.ts — add server export

Steps:
1. Read existing files (verifier.ts, agent-loop.ts, verify-orchestrator.ts, types) to understand imports
2. Install express + @types/express + cors + @types/cors
3. Create src/server/verify-server.ts
4. Create src/cli/verify-server.ts
5. Update package.json and index.ts
6. Run npx tsc --noEmit to verify
