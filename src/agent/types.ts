/**
 * Agent-specific types for the Webwright-inspired Agent Loop module
 */

/**
 * Configuration for the LLM-powered agent
 */
export interface AgentConfig {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-sonnet', 'glm-4') */
  model: string;
  /** Maximum number of steps before termination */
  maxSteps: number;
  /** API key for the LLM service */
  apiKey?: string;
  /** Base URL for OpenAI-compatible API */
  apiBase?: string;
  /** Maximum context window tokens (default varies by model) */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Timeout for each API request in milliseconds */
  requestTimeout?: number;
}

/**
 * Single step in the agent's execution trace
 */
export interface AgentStep {
  /** Step number (1-indexed) */
  step: number;
  /** Agent's reasoning at this step */
  thought: string;
  /** Action command executed */
  command: string;
  /** Output from command execution */
  output: string;
  /** Error message if execution failed */
  error?: string;
  /** Path to screenshot taken during this step */
  screenshot?: string;
  /** Timestamp of this step */
  timestamp: string;
  /** Number of tokens used in this step */
  tokens?: number;
}

/**
 * Final result from agent execution
 */
export interface AgentResult {
  /** Original task description */
  task: string;
  /** Target URL being verified */
  url: string;
  /** Whether verification passed */
  passed: boolean;
  /** All execution steps */
  steps: AgentStep[];
  /** Final validated Playwright script */
  finalScript: string;
  /** Total execution time in milliseconds */
  duration: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Evidence gathered during verification */
  evidence?: string[];
}

/**
 * Action types the agent can take
 */
export type ScriptActionType = 
  | 'write_script'
  | 'execute_script'
  | 'inspect_screenshot'
  | 'reflect'
  | 'done';

/**
 * Action command from the LLM
 */
export interface ScriptAction {
  /** Type of action to perform */
  type: ScriptActionType;
  /** Content associated with the action (script code, reflection, etc.) */
  content: string;
  /** Whether agent is signaling completion */
  done?: boolean;
}

/**
 * Result from self-reflection validation
 */
export interface ReflectionResult {
  /** Whether the reflection passed */
  passed: boolean;
  /** Evidence collected during reflection */
  evidence: string[];
  /** Screenshot analysis results */
  screenshotAnalysis?: {
    totalScreenshots: number;
    visibleElements: string[];
    errors: string[];
  };
  /** Console analysis results */
  consoleAnalysis?: {
    totalErrors: number;
    errorMessages: string[];
  };
  /** Reason for failure if reflection failed */
  failureReason?: string;
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  /** Agent's thinking/reasoning */
  thought: string;
  /** Action to perform */
  action: ScriptAction;
  /** Raw response text */
  raw: string;
  /** Tokens used in this response */
  tokens?: number;
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
  /** Standard output from script execution */
  stdout: string;
  /** Standard error from script execution */
  stderr: string;
  /** Paths to screenshots captured */
  screenshots: string[];
  /** Exit code from process */
  exitCode: number;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether execution was successful */
  success: boolean;
}

/**
 * Context compaction configuration
 */
export interface ContextCompactionConfig {
  /** Maximum tokens before compaction triggers */
  maxTokens: number;
  /** Compact every N steps */
  compactEvery: number;
  /** Number of recent steps to preserve verbatim */
  preserveRecent: number;
}

/**
 * Agent loop state
 */
export interface AgentLoopState {
  /** Current step number */
  currentStep: number;
  /** Total tokens consumed so far */
  totalTokens: number;
  /** Whether agent is done */
  isDone: boolean;
  /** Last action taken */
  lastAction?: ScriptAction;
  /** Last execution output */
  lastOutput?: string;
  /** Conversation history with LLM */
  history: ChatMessage[];
}

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Sandbox creation options
 */
export interface SandboxOptions {
  /** Base directory for sandbox */
  baseDir?: string;
  /** Timeout for script execution */
  timeout?: number;
  /** Whether to keep artifacts after execution */
  keepArtifacts?: boolean;
}
