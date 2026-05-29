#!/bin/bash
cd /root/.openclaw/workspace/e2e-verifier
kill $(lsof -ti:3002) 2>/dev/null
sleep 1

# DeepSeek by default
DEEPSEEK_API_KEY='sk-bb8a684da2bd4606b58e4ab6bf62a4f1' \
LLM_MODEL=deepseek-v4-flash \
LLM_BASE_URL=https://api.deepseek.com \
PORT=3002 \
exec npx tsx src/server/verify-server.ts 2>&1
