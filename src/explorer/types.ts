/**
 * Autonomous Explorer Module Types
 * Types for the autonomous exploration and testing mode
 */

import { AuthConfig } from '../types';

/**
 * Configuration for autonomous exploration
 */
export interface ExploreConfig {
  /** Target URL to explore */
  url: string;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Maximum number of pages to explore (default: 20) */
  maxPages?: number;
  /** Maximum navigation depth (default: 2) */
  maxDepth?: number;
  /** Screenshot output directory */
  screenshotDir?: string;
  /** LLM configuration */
  llm: AgentConfig;
  /** Output directory for reports */
  outputDir?: string;
  /** Whether to use LLM for planning and test generation */
  useLlm?: boolean;
  /** Timeout for page operations in milliseconds */
  timeout?: number;
}

/**
 * LLM agent configuration
 */
export interface AgentConfig {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-sonnet', 'glm-4') */
  model: string;
  /** Maximum number of steps before termination (for agent loop compatibility) */
  maxSteps: number;
  /** Maximum number of tokens for generation */
  maxTokens?: number;
  /** API key for the LLM service */
  apiKey?: string;
  /** Base URL for OpenAI-compatible API */
  apiBase?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Timeout for each API request in milliseconds */
  requestTimeout?: number;
}

/**
 * Result of analyzing a single page
 */
export interface PageAnalysis {
  /** Full URL of the page */
  url: string;
  /** Page title */
  title: string;
  /** Path to screenshot */
  screenshot: string;
  /** DOM structure summary */
  domSummary: string;
  /** Navigation links found on the page */
  navigation: NavItem[];
  /** Interactive elements detected */
  interactiveElements: InteractiveElement[];
  /** Forms found on the page */
  forms: FormAnalysis[];
  /** Tables found on the page */
  tables: TableAnalysis[];
  /** Suggested tests (from LLM or heuristic) */
  suggestedTests: string[];
  /** Page depth from entry point */
  depth: number;
  /** Timestamp of analysis */
  timestamp: string;
}

/**
 * Navigation item (link)
 */
export interface NavItem {
  /** Visible text of the link */
  text: string;
  /** Href attribute value */
  href: string;
  /** CSS selector for the link */
  selector: string;
  /** Whether this is an internal link */
  isInternal: boolean;
}

/**
 * Interactive element detected on page
 */
export interface InteractiveElement {
  /** Element type */
  type: 'button' | 'input' | 'select' | 'link' | 'toggle' | 'checkbox' | 'radio' | 'textarea';
  /** CSS selector */
  selector: string;
  /** Visible text or label */
  text: string;
  /** Description of what this element does */
  action: string;
  /** Element attributes */
  attributes?: Record<string, string>;
}

/**
 * Form analysis result
 */
export interface FormAnalysis {
  /** CSS selector for the form */
  selector: string;
  /** Form fields */
  fields: FormField[];
  /** Submit button selector */
  submitButton?: string;
  /** Form action URL */
  action?: string;
  /** Form method */
  method?: string;
}

/**
 * Form field information
 */
export interface FormField {
  /** Field type */
  type: string;
  /** CSS selector */
  selector: string;
  /** Label text */
  label?: string;
  /** Name attribute */
  name?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether field is required */
  required?: boolean;
}

/**
 * Table analysis result
 */
export interface TableAnalysis {
  /** CSS selector for the table */
  selector: string;
  /** Table headers */
  headers: string[];
  /** Number of data rows */
  rowCount: number;
  /** Sample data (first 3 rows) */
  sampleData: string[][];
  /** Whether table is sortable */
  sortable?: boolean;
  /** Whether table is paginated */
  paginated?: boolean;
}

/**
 * Test plan for all explored pages
 */
export interface TestPlan {
  /** Test plans for each page */
  pages: PageTestPlan[];
  /** Total number of tests */
  totalTests: number;
  /** Timestamp when plan was created */
  timestamp: string;
}

/**
 * Test plan for a single page
 */
export interface PageTestPlan {
  /** Page URL */
  url: string;
  /** Page name/title */
  pageName: string;
  /** Test cases for this page */
  tests: TestCase[];
}

/**
 * Single test case
 */
export interface TestCase {
  /** Test case name */
  name: string;
  /** Description of what is being tested */
  description: string;
  /** Test steps (natural language) */
  steps: string[];
  /** Expected results/assertions */
  assertions: string[];
  /** Test priority */
  priority: 'high' | 'medium' | 'low';
  /** Estimated duration in milliseconds */
  estimatedDuration?: number;
}

/**
 * Test execution result
 */
export interface TestExecution {
  /** The test case that was executed */
  testCase: TestCase;
  /** URL where test was executed */
  url: string;
  /** Whether test passed */
  passed: boolean;
  /** Screenshot after execution */
  screenshot?: string;
  /** Generated Playwright script */
  script: string;
  /** Execution output */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Timestamp of execution */
  timestamp: string;
}

/**
 * Final exploration result
 */
export interface ExploreResult {
  /** Configuration used for exploration */
  config: ExploreConfig;
  /** Discovery phase results */
  discovery: PageAnalysis[];
  /** Test plan generated */
  testPlan: TestPlan;
  /** Test execution results */
  executions: TestExecution[];
  /** Summary statistics */
  summary: ExploreSummary;
  /** Final merged Playwright script */
  finalScript: string;
  /** Path to final script file */
  finalScriptPath?: string;
}

/**
 * Exploration summary statistics
 */
export interface ExploreSummary {
  /** Number of pages explored */
  pagesExplored: number;
  /** Number of tests planned */
  testsPlanned: number;
  /** Number of tests passed */
  testsPassed: number;
  /** Number of tests failed */
  testsFailed: number;
  /** Total exploration duration in milliseconds */
  duration: number;
  /** Total tokens consumed (if LLM used) */
  totalTokens: number;
  /** Number of screenshots taken */
  screenshotsTaken: number;
}

/**
 * Discovery phase result
 */
export interface DiscoveryResult {
  /** All analyzed pages */
  pages: PageAnalysis[];
  /** Site map (URL hierarchy) */
  siteMap: SiteMapNode;
  /** Unique URLs discovered */
  uniqueUrls: string[];
  /** Discovery timestamp */
  timestamp: string;
}

/**
 * Site map node representing page hierarchy
 */
export interface SiteMapNode {
  /** Node URL */
  url: string;
  /** Page title */
  title: string;
  /** Child pages */
  children: SiteMapNode[];
  /** Depth from root */
  depth: number;
}

/**
 * Script generation options
 */
export interface ScriptGenerationOptions {
  /** Whether to include auth logic */
  includeAuth?: boolean;
  /** Whether to include setup code */
  includeSetup?: boolean;
  /** Whether to include teardown code */
  includeTeardown?: boolean;
  /** Custom imports */
  customImports?: string[];
}
