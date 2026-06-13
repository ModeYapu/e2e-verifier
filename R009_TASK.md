# R009: Web Dashboard + Docker Deployment

You are working on the E2E Verifier project. This round adds a Web Dashboard and Docker deployment configuration.

## Project Context
- TypeScript + Express backend with REST APIs already exists
- Routes available: /api/health, /api/stats, /api/dashboard/overview, /api/trends/:site, /api/jobs, /api/projects, /api/keys, /api/webhooks
- Backend code is in src/server/

## Task 1: Web Dashboard (`dashboard/index.html`)

Create a single-page application using Vue 3 (CDN) + Element Plus (CDN) + Chart.js (CDN). No build step needed - pure HTML/JS.

### Layout:
- **Sidebar navigation** with items: Dashboard / Jobs / Sites / Trends / Settings
- **Top bar**: E2E Verifier title, health status indicator

### Pages:

#### Dashboard (Overview)
- 4 stat cards: Total Sites / Today's Verifications / Pass Rate / Active Jobs
- Fetch from `/api/dashboard/overview` 
- Recent verification results table (site, status, timestamp)

#### Jobs
- Job queue table: job ID, site, status (running/pending/completed/failed), progress bar, created time
- Fetch from `/api/jobs`
- Click a row to see detail dialog (job results, logs, screenshots info)

#### Sites
- Site management table: URL, name, last verified, pass rate %
- Fetch from `/api/dashboard/overview` (sites section) or `/api/projects`
- Search/filter box

#### Trends
- Chart.js line chart: pass rate over time (last 30 days)
- Fetch from `/api/trends/:site` for selected site
- Site selector dropdown
- Failure mode breakdown (bar chart or doughnut)

#### Settings
- API Key management: list keys, create new, revoke
- Fetch from `/api/keys`
- Webhook configuration: URL input, event selectors

### Technical:
- All CSS via Element Plus CDN, minimal custom CSS
- API base URL: relative (same origin) or configurable via a const at top
- Use `fetch()` for all API calls
- Handle loading states with `v-loading`
- Handle errors gracefully with ElMessage
- Auto-refresh dashboard every 30 seconds
- Responsive layout

## Task 2: Docker Deployment

### `Dockerfile`:
```dockerfile
FROM node:22-slim

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

# Set work directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install Playwright browser
RUN npx playwright install chromium

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# Start command
CMD ["node", "dist/cli/verify-server.js"]
```

### `docker-compose.yml`:
- Service: e2e-verifier
- Build from Dockerfile
- Ports: 3000:3000
- Volumes: ./data:/app/data, ./reports:/app/reports, ./screenshots:/app/screenshots, ./logs:/app/logs
- Environment: NODE_ENV=production, PORT=3000
- Restart: unless-stopped

### `.dockerignore`:
```
node_modules
dist
test-results
screenshots
reports
logs
.git
.dev-loop
*.md
artifacts
convergence-results
explorer-output
```

## Task 3: Health Check Enhancement

The file `src/server/routes/health-routes.ts` already exists with basic health info. Enhance the `/api/health` endpoint to also return:
- `memory`: process.memoryUsage() (rss, heapTotal, heapUsed, external)
- `dbSize`: check if data directory exists, return approximate size
- Keep existing fields intact (status, version, uptime, browserPool)

Also add a new endpoint `GET /api/health/detailed` that returns all of the above PLUS:
- `nodeVersion`: process.version
- `platform`: process.platform
- `arch`: process.arch
- `cpuUsage`: process.cpuUsage()
- `loadAverage`: os.loadavg()
- `totalMemory`: os.totalmem()
- `freeMemory`: os.freemem()

## Task 4: Tests

Add/update tests if needed:
- Test for enhanced health endpoint
- Test for detailed health endpoint
- Keep existing tests passing

## Verification Steps (do ALL before committing):

1. Run `npm run build` - must exit 0
2. Run `npm test` - must exit 0
3. Verify `dashboard/index.html` exists and has Vue + Element Plus + all 5 pages
4. Verify `Dockerfile` syntax (FROM, RUN, EXPOSE, CMD all present)
5. Verify `docker-compose.yml` is valid YAML with ports and volumes
6. Verify `.dockerignore` exists

## After Verification:

```bash
git add -A
git commit -m "feat: web dashboard + Docker deployment (R009)"
git push origin main
```

Create `.dev-loop/round-history/R009.json` with:
```json
{
  "round": "R009",
  "title": "Web Dashboard + Docker Deployment",
  "status": "completed",
  "tasks": [
    { "name": "Web Dashboard", "status": "done" },
    { "name": "Dockerfile", "status": "done" },
    { "name": "docker-compose.yml", "status": "done" },
    { "name": ".dockerignore", "status": "done" },
    { "name": "Health endpoint enhancement", "status": "done" },
    { "name": "Tests passing", "status": "done" }
  ],
  "verification": {
    "build": "pass",
    "test": "pass"
  }
}
```
