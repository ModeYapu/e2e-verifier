export interface AuthConfig {
  loginUrl?: string;          // URL to navigate to for login (defaults to url)
  usernameSelector?: string;  // CSS selector for username input
  passwordSelector?: string;  // CSS selector for password input
  submitSelector?: string;    // CSS selector for submit button
  username: string;
  password: string;
  successUrlPattern?: string; // Regex pattern for post-login URL
  formSelector?: string;      // CSS selector to scope the login form
  tokenKey?: string;          // localStorage key for auth token
  
  // Login verification (P0 - Task 1)
  verifySelector?: string;    // CSS selector that should exist after successful login
  verifyText?: string;        // Expected text on page after successful login
  verifyAttribute?: {
    selector: string;         // Element selector
    attribute: string;        // Attribute name
    value?: string;           // Expected value (optional, just check existence if omitted)
  };
  verifyUrl?: string;         // Exact URL to match after login (alternative to successUrlPattern)
  verifyTimeout?: number;     // Timeout for verification (default 10000ms)
}

export interface SiteConfig {
  name: string;
  url: string;
  expectedStatusCode: number;
  screenshots?: ScreenshotConfig[] | string[];
  viewport?: { width: number; height: number };
  viewports?: ViewportConfig[];
  customChecks?: CustomCheck[];
  checks?: string[];
  timeout?: number;
  auth?: AuthConfig;
  retries?: number;
  performanceThresholds?: PerformanceThresholds;
  visualRegression?: VisualRegressionConfig;
  ignoreUrlPatterns?: string[];
}

export interface PerformanceThresholds {
  fcp?: number;
  lcp?: number;
  loadTime?: number;
  pageWeight?: number;
}

export interface VisualRegressionConfig {
  enabled: boolean;
  threshold?: number;
  baselineDir?: string;
}

export interface ScreenshotConfig {
  name: string;
  path?: string;
  waitForSelector?: string;
  waitForTimeout?: number;
}

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

export interface CustomCheck {
  name: string;
  type: 'element' | 'text' | 'attribute' | 'javascript' | 'custom' | 'api';
  selector?: string;
  expected?: string | boolean | number;
  script?: string;
  // api check fields
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Record<string, unknown>;
  expectedStatus?: number;
  expectedBody?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface TestResult {
  siteName: string;
  url: string;
  timestamp: string;
  passed: boolean;
  duration: number;
  checks: CheckResult[];
  screenshots: ScreenshotResult[];
  errors: string[];
}

export interface CheckResult {
  name: string;
  type: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface ScreenshotResult {
  name: string;
  path: string;
  viewport: string;
  timestamp: string;
}

export interface PerformanceMetrics {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  domContentLoaded?: number;
  loadTime?: number;
  pageWeight?: number;
}

export interface AccessibilityResult {
  passed: boolean;
  issues: AccessibilityIssue[];
}

export interface AccessibilityIssue {
  type: string;
  element: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface SEOResult {
  passed: boolean;
  checks: {
    titleTag: boolean;
    metaDescription: boolean;
    h1Presence: boolean;
    favicon: boolean;
    viewportMeta: boolean;
    openGraphTags: boolean;
  };
}

export interface ConsoleError {
  message: string;
  type: string;
  timestamp: number;
}

export interface ReportData {
  timestamp: string;
  totalSites: number;
  passedSites: number;
  failedSites: number;
  results: TestResult[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    totalErrors: number;
  };
}

export interface NetworkResult {
  passed: boolean;
  failedRequests: FailedRequest[];
  slowRequests: SlowRequest[];
  totalRequests: number;
}

export interface FailedRequest {
  url: string;
  status: number;
}

export interface SlowRequest {
  url: string;
  duration: number;
}

export interface VisualRegressionResult {
  passed: boolean;
  diffPercentage: number;
  baselinePath: string;
  diffPath?: string;
  message: string;
}

// =====================================================// UNIFIED TASK MODEL (P0 - Task 1)
// =====================================================
export type TaskType = 'quick' | 'deep' | 'orchestrated';

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  scenarios: Scenario[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  name: string;
  url: string;
  steps: Step[];
  viewport?: { width: number; height: number };
  auth?: AuthConfig;
  timeout?: number;
  retries?: number;
}

export type StepType = 'navigate' | 'check' | 'screenshot' | 'wait' | 'custom' | 'interact';

export interface Step {
  id: string;
  name: string;
  type: StepType;
  action: string;
  timeout?: number;
  assertions?: Assertion[];
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

export type AssertionType = 'element-exists' | 'text-contains' | 'attribute-equals' | 'url-matches' | 'javascript' | 'performance' | 'accessibility';

export interface Assertion {
  type: AssertionType;
  expected: unknown;
  actual?: unknown;
  passed?: boolean;
  message?: string;
  selector?: string;
  attribute?: string;
}

export type ArtifactType = 'screenshot' | 'trace' | 'console-log' | 'network-log' | 'dom-snapshot' | 'video' | 'performance-metrics';

export interface Artifact {
  type: ArtifactType;
  path: string;
  timestamp: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

// =====================================================// UNIFIED RESULTS AND REPORTS (P0 - Task 2)
// =====================================================
export type ExecutionStatus =
  | 'passed'
  | 'failed'
  | 'flaky'
  | 'blocked'
  | 'infra_failed'
  | 'assertion_failed'
  | 'skipped';

export interface UnifiedResult {
  taskId: string;
  scenarioId: string;
  stepId?: string;
  status: ExecutionStatus;
  summary: string;
  checks: CheckResult[];
  artifacts: Artifact[];
  rootCause?: RootCause;
  timestamp: string;
  duration: number;
}

export interface RootCause {
  category: FailureCategory;
  message: string;
  evidence?: Evidence;
}

export type FailureCategory = 'environment' | 'infrastructure' | 'business' | 'test' | 'unknown';

export interface Evidence {
  console?: ConsoleError[];
  network?: FailedRequest[];
  trace?: string;
  screenshot?: string;
  domSnapshot?: string;
}

export interface FailureClassification {
  isRetryable: boolean;
  category: FailureCategory;
  reason: string;
}

// =====================================================// EXECUTION CONFIGURATION (P0 - Task 3)
// =====================================================
export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses: ExecutionStatus[];
}

export interface TimeoutConfig {
  navigation: number;
  elementWait: number;
  assertion: number;
  screenshot: number;
  custom: number;
  pageLoad: number;
}

export interface ArtifactDirectoryStructure {
  root: string;
  screenshots: string;
  traces: string;
  console: string;
  network: string;
  dom: string;
  videos: string;
}

export interface ExecutionConfig {
  retryStrategy: RetryStrategy;
  timeouts: TimeoutConfig;
  artifactDirectories: ArtifactDirectoryStructure;
  maxConcurrentTasks: number;
  enableTrace: boolean;
  enableVideo: boolean;
}

// =====================================================// UNIFIED REPORT DATA (P0 - shared between report.ts and html-report.ts)
// =====================================================
export interface UnifiedReportData {
  timestamp: string;
  summary: {
    totalTasks: number;
    totalResults: number;
    passed: number;
    failed: number;
    flaky: number;
    blocked: number;
    skipped: number;
    totalDuration: number;
  };
  results: UnifiedResult[];
}

// =====================================================// DEVICE MATRIX CONFIG (P1 - Slice 2)
// =====================================================
export type BrowserType = 'chromium' | 'webkit' | 'firefox';

export interface DeviceMatrixConfig {
  browsers?: BrowserType[];
  viewports?: ViewportConfig[];
  locales?: string[];
  userAgent?: string;
}

export interface CombinationConfig {
  browser: BrowserType;
  viewport: ViewportConfig;
  locale: string;
}

export interface CombinationResult {
  combination: CombinationConfig;
  result: TestResult;
  passed: boolean;
  duration: number;
  errors: string[];
}

export interface MatrixResult {
  timestamp: string;
  siteName: string;
  url: string;
  combinations: CombinationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
  byBrowser: {
    [browser: string]: {
      total: number;
      passed: number;
      failed: number;
    };
  };
}
