# E2E Verifier Framework

A complete, production-ready end-to-end verification framework built with Playwright and TypeScript. This framework provides automated testing for websites with comprehensive checks including performance, accessibility, SEO, console error detection, and screenshot comparison.

## Features

- **Multi-site Batch Verification** - Test multiple sites from configuration files
- **Screenshot Comparison** - Automated screenshots with timestamps and viewport variations
- **Console Error Detection** - Capture and report all JavaScript console errors
- **Performance Metrics** - Measure FCP, LCP, DOM Content Loaded, Load time, and page weight
- **Accessibility Checks** - Verify alt text, ARIA labels, heading structure, form labels, and more
- **SEO Checks** - Validate title tags, meta descriptions, H1 presence, favicon, viewport meta, and Open Graph tags
- **JSON Report Generation** - Comprehensive reports with pass/fail status for all checks
- **CLI Interface** - Easy-to-use command-line tools for all operations
- **Config-Driven** - Define sites and tests in JSON configuration files
- **Type-Safe** - Built with TypeScript for robust development

## Roadmap

- Product roadmap: `docs/ROADMAP.md`

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## Quick Start

### Verify a Single Site

```bash
npm run verify -- --config sites/example.json
```

### Verify All Sites

```bash
npm run verify:all
```

### Take a Quick Screenshot

```bash
npm run screenshot -- --url https://example.com
```

### Generate a Report

```bash
npm run report
```

## Configuration

Site configurations are stored in JSON files in the `sites/` directory. Each configuration file defines a site to verify with specific checks and settings.

### Configuration Structure

```json
{
  "name": "example",
  "url": "https://example.com",
  "expectedStatusCode": 200,
  "screenshots": [
    {
      "name": "homepage",
      "path": "/page-path",
      "waitForSelector": "main-content",
      "waitForTimeout": 1000
    }
  ],
  "viewports": [
    {
      "name": "desktop",
      "width": 1920,
      "height": 1080
    },
    {
      "name": "mobile",
      "width": 375,
      "height": 667
    }
  ],
  "customChecks": [
    {
      "name": "Main heading",
      "type": "element",
      "selector": "h1"
    },
    {
      "name": "Welcome text",
      "type": "text",
      "selector": ".welcome",
      "expected": "Welcome to our site"
    },
    {
      "name": "Check meta",
      "type": "attribute",
      "selector": "meta[name='description']",
      "expected": "content"
    },
    {
      "name": "Custom JS",
      "type": "javascript",
      "script": "document.querySelectorAll('img').length > 0"
    }
  ],
  "timeout": 30000
}
```

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for the site |
| `url` | string | Yes | URL to verify (must include protocol) |
| `expectedStatusCode` | number | Yes | Expected HTTP status code |
| `screenshots` | array | No | Screenshot configurations |
| `viewports` | array | No | Viewport sizes for screenshots |
| `customChecks` | array | No | Custom validation checks |
| `timeout` | number | No | Navigation timeout in milliseconds (default: 30000) |

### Screenshot Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Screenshot identifier (used in filename) |
| `path` | string | URL path to navigate to before screenshot |
| `waitForSelector` | string | CSS selector to wait for before screenshot |
| `waitForTimeout` | number | Milliseconds to wait before screenshot |

### Custom Check Types

#### Element Check
```json
{
  "name": "Logo present",
  "type": "element",
  "selector": ".logo"
}
```

#### Text Check
```json
{
  "name": "Heading text",
  "type": "text",
  "selector": "h1",
  "expected": "Expected Heading Text"
}
```

#### Attribute Check
```json
{
  "name": "Meta description",
  "type": "attribute",
  "selector": "meta[name='description']",
  "expected": "content"
}
```

#### JavaScript Check
```json
{
  "name": "Image count",
  "type": "javascript",
  "script": "document.querySelectorAll('img').length > 0"
}
```

## CLI Usage

### verify - Single Site Verification

```bash
npm run verify -- --config sites/example.json
npm run verify -- -c sites/github.json
npm run verify -- sites/example.json
```

**Options:**
- `--config, -c` - Path to site configuration file (required)
- `--output, -o` - Custom output path for report
- `--json, -j` - Output results in JSON format

### verify:all - Batch Verification

```bash
npm run verify:all
npm run verify:all -- --sites-dir ./my-sites
npm run verify:all -- --json
```

**Options:**
- `--sites-dir, -d` - Directory containing site configs (default: `sites/`)
- `--output, -o` - Custom output path for report
- `--json, -j` - Output results in JSON format

### screenshot - Quick Screenshot

```bash
npm run screenshot -- --url https://example.com
npm run screenshot -- -u https://example.com --output my-screenshot.png
npm run screenshot -- --url https://example.com --width 1920 --height 1080 --full-page
```

**Options:**
- `--url, -u` - URL to screenshot (required)
- `--output, -o` - Output file path
- `--width, -w` - Viewport width (default: 1920)
- `--height, -h` - Viewport height (default: 1080)
- `--full-page, -f` - Capture full page

### report - Report Generation

```bash
npm run report
npm run report -- --input reports/report-2024-01-15.json
npm run report -- --json
npm run report -- --summary
```

**Options:**
- `--input, -i` - Path to report JSON file (default: latest)
- `--json, -j` - Output in JSON format
- `--summary, -s` - Generate and save text summary

## Adding New Sites

1. Create a new JSON file in the `sites/` directory:

```bash
nano sites/my-new-site.json
```

2. Add your site configuration:

```json
{
  "name": "my-new-site",
  "url": "https://mysite.com",
  "expectedStatusCode": 200,
  "screenshots": [
    {
      "name": "home"
    }
  ]
}
```

3. Run verification:

```bash
npm run verify -- --config sites/my-new-site.json
```

## Output Structure

```
e2e-verifier/
├── reports/           # JSON and text reports
│   ├── latest.json    # Most recent report
│   ├── report-*.json  # Timestamped reports
│   └── summary-*.txt  # Text summaries
├── screenshots/       # Screenshot captures
│   ├── example/       # Site-specific directories
│   │   ├── homepage-2024-01-15T10-30-00-000Z.png
│   │   └── mobile-2024-01-15T10-30-05-000Z.png
│   └── quick/         # Quick screenshots from CLI
└── logs/              # Log files (if implemented)
```

## Report Format

### JSON Report Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalSites": 3,
  "passedSites": 2,
  "failedSites": 1,
  "results": [
    {
      "siteName": "example",
      "url": "https://example.com",
      "timestamp": "2024-01-15T10:30:05.000Z",
      "passed": true,
      "duration": 1234,
      "checks": [
        {
          "name": "Status Code",
          "type": "http",
          "passed": true,
          "message": "Expected 200, got 200"
        },
        {
          "name": "Performance",
          "type": "performance",
          "passed": true,
          "message": "FCP: 450ms, LCP: 1200ms, DCL: 800ms"
        },
        {
          "name": "Accessibility",
          "type": "accessibility",
          "passed": true,
          "message": "All checks passed"
        },
        {
          "name": "SEO",
          "type": "seo",
          "passed": false,
          "message": "Failed: Meta description, Open Graph tags"
        },
        {
          "name": "Console Errors",
          "type": "console",
          "passed": true,
          "message": "No console errors"
        }
      ],
      "screenshots": [
        {
          "name": "homepage",
          "path": "screenshots/example/homepage-2024-01-15T10-30-05-000Z.png",
          "viewport": "1920x1080",
          "timestamp": "2024-01-15T10:30:05.000Z"
        }
      ],
      "errors": []
    }
  ],
  "summary": {
    "totalChecks": 15,
    "passedChecks": 13,
    "failedChecks": 2,
    "totalErrors": 0
  }
}
```

## Checks Performed

### HTTP Status
- Verifies the HTTP response code matches expected value
- Handles redirects, client errors, and server errors

### Performance Metrics
- **FCP (First Contentful Paint)** - Time to first content render
- **LCP (Largest Contentful Paint)** - Time to largest content render
- **DOM Content Loaded** - Time to DOM ready state
- **Load Time** - Complete page load time
- **Page Weight** - Total transfer size of all resources

### Accessibility
- Images with missing alt text
- Links without accessible text
- Heading structure (skipped levels)
- Form inputs without labels
- ARIA attribute validity

### SEO
- Title tag presence and length
- Meta description presence and length
- H1 tag presence and uniqueness
- Favicon presence
- Viewport meta tag
- Open Graph tags

### Console Errors
- JavaScript errors
- Console warnings
- Network errors
- Failed resource loads

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Verification

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  verify:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        npm ci
        npx playwright install chromium
    
    - name: Run verification
      run: npm run verify:all
    
    - name: Upload reports
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: verification-reports
        path: reports/
    
    - name: Upload screenshots
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: verification-screenshots
        path: screenshots/
```

### GitLab CI Example

```yaml
image: node:18

stages:
  - verify

e2e-verify:
  stage: verify
  script:
    - npm ci
    - npx playwright install chromium
    - npm run verify:all
  artifacts:
    when: always
    paths:
      - reports/
      - screenshots/
    expire_in: 1 week
  only:
    - main
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install chromium'
            }
        }
        
        stage('Verify') {
            steps {
                sh 'npm run verify:all'
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
            archiveArtifacts artifacts: 'screenshots/**/*', allowEmptyArchive: true
        }
    }
}
```

## Error Handling

The framework gracefully handles various error scenarios:

- **Connection Refused** - Logged as navigation failure
- **Timeout** - Logged with timeout details
- **404 Errors** - Logged as status code mismatch
- **Invalid JSON** - Configuration parse errors are reported
- **Missing Elements** - Custom checks fail with clear messages
- **Screenshot Failures** - Errors logged but don't stop verification

## Development

### Build

```bash
npm run build
```

### Type Checking

```bash
npx tsc --noEmit
```

### Testing

Create test configurations in `sites/` and run:

```bash
npm run verify -- --config sites/test-site.json
```

## Troubleshooting

### Playwright Browser Not Found

```bash
npx playwright install chromium
```

### TypeScript Errors

```bash
npm install --save-dev @types/node @types/playwright
```

### Permission Issues

```bash
chmod +x node_modules/.bin/playwright
```

### Screenshots Not Saving

Check that the `screenshots/` directory exists and is writable:

```bash
mkdir -p screenshots
chmod 755 screenshots
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Support

For issues and questions, please use the GitHub issue tracker.
