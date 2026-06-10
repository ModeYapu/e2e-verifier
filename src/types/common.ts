// Unified common types shared across all modules
// This file is the SINGLE SOURCE OF TRUTH for types that were previously duplicated

import { ConsoleError, FailedRequest } from './index';

// =====================================================
// FailureCategory - Unified (7 values, superset of all previous definitions)
// =====================================================
export type FailureCategory =
  | 'environment'
  | 'infrastructure'
  | 'page_bug'
  | 'script_issue'
  | 'data_issue'
  | 'flaky'
  | 'unknown';

// =====================================================
// Evidence - Unified (merged from types/index.ts + intelligence/types.ts)
// =====================================================
export interface Evidence {
  console?: ConsoleError[];
  network?: FailedRequest[];
  trace?: string;
  screenshot?: string;
  domSnapshot?: string;
  performanceMetrics?: Record<string, number>;
  additional?: Record<string, unknown>;
}

// =====================================================
// ArtifactType - Unified (8 values, superset)
// =====================================================
export type ArtifactType =
  | 'screenshot'
  | 'trace'
  | 'console-log'
  | 'network-log'
  | 'dom-snapshot'
  | 'video'
  | 'performance-metrics'
  | 'har';

// =====================================================
// Artifact - Unified (complete version with optional fields)
// =====================================================
export interface Artifact {
  type: ArtifactType;
  path: string;
  timestamp: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

// =====================================================
// AssertionType - Unified (14 values, superset)
// =====================================================
export type AssertionType =
  | 'element-exists'
  | 'element-visible'
  | 'element-count'
  | 'text-contains'
  | 'text-equals'
  | 'attribute-equals'
  | 'attribute-contains'
  | 'url-matches'
  | 'title-equals'
  | 'javascript'
  | 'performance'
  | 'accessibility'
  | 'console'
  | 'network';

// =====================================================
// ChatMessage - Unified (single definition)
// =====================================================
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
