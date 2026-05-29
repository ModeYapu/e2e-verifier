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
  type: 'element' | 'text' | 'attribute' | 'javascript';
  selector?: string;
  expected?: string | boolean | number;
  script?: string;
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
