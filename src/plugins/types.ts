/**
 * Plugin System Types
 *
 * Defines the Plugin interface and the context objects passed to the
 * beforeVerify / afterVerify lifecycle hooks. Plugins are user-supplied
 * validation rules that observe and augment verification runs.
 */

import type { SiteConfig, TestResult, CheckResult } from '../types';

/**
 * Context handed to every `beforeVerify` hook.
 *
 * A hook may:
 *  - read/inspect `siteConfig` and `metadata`
 *  - mutate `metadata` to communicate state to `afterVerify`
 *  - set `veto` to short-circuit the verification (the run is aborted
 *    with a failing result that records the veto reason)
 */
export interface BeforeVerifyContext {
  /** The site configuration about to be verified. */
  siteConfig: SiteConfig;
  /** Convenience accessor for the target URL. */
  url: string;
  /** Set this to abort verification before it starts. */
  veto?: { reason: string };
  /** Free-form channel for plugins to pass data to afterVerify / each other. */
  metadata: Record<string, unknown>;
}

/**
 * Context handed to every `afterVerify` hook.
 *
 * The verification has already produced `result`. A hook may:
 *  - read `result` and `metadata`
 *  - append entries to `additionalChecks`; these are merged into the final
 *    TestResult and contribute to the overall pass/fail outcome
 *  - mutate `metadata` for downstream plugins
 */
export interface AfterVerifyContext {
  siteConfig: SiteConfig;
  url: string;
  /** The verification result produced by the core verifier. */
  result: TestResult;
  /** Checks appended here are merged into the final result. */
  additionalChecks: CheckResult[];
  /** Free-form channel shared with beforeVerify and other plugins. */
  metadata: Record<string, unknown>;
}

/**
 * Plugin contract.
 *
 * A plugin is identified by a unique `name` and may implement any subset of
 * the lifecycle hooks. All hooks are optional — a plugin that only cares
 * about post-run results can implement `afterVerify` alone.
 */
export interface Plugin {
  /** Unique plugin identifier. */
  name: string;
  /** Optional semver-ish version string. */
  version?: string;
  /** Human-readable description shown in listings. */
  description?: string;
  /** Called once when the plugin is registered (optional). */
  setup?: () => Promise<void> | void;
  /** Called once when the plugin is unregistered / manager torn down. */
  teardown?: () => Promise<void> | void;
  /** Hook fired before verification starts. See BeforeVerifyContext. */
  beforeVerify?: (ctx: BeforeVerifyContext) => Promise<void> | void;
  /** Hook fired after verification produces a result. See AfterVerifyContext. */
  afterVerify?: (ctx: AfterVerifyContext) => Promise<void> | void;
}
