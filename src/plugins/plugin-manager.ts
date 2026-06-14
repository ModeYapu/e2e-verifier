/**
 * Plugin Manager
 *
 * Registry + lifecycle orchestrator for verification plugins. Maintains
 * insertion order so that hooks fire deterministically. Shared `metadata`
 * is threaded through beforeVerify -> afterVerify so plugins can cooperate.
 */

import type { Plugin, BeforeVerifyContext, AfterVerifyContext } from './types';
import type { SiteConfig, TestResult, CheckResult } from '../types';
import { logger } from '../utils/logger';

export class PluginManager {
  private plugins: Plugin[] = [];
  /** Shared metadata channel preserved across a single verification run. */
  private sharedMetadata: Record<string, unknown> = {};

  /**
   * Register a plugin. Runs its `setup` hook if present.
   * Throws if a plugin with the same name is already registered.
   */
  async register(plugin: Plugin): Promise<void> {
    if (this.getPlugin(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }
    this.plugins.push(plugin);
    if (plugin.setup) {
      await plugin.setup();
    }
    logger.info(`[Plugins] Registered plugin: ${plugin.name}`);
  }

  /**
   * Register multiple plugins in order.
   */
  async registerAll(plugins: Plugin[]): Promise<void> {
    for (const plugin of plugins) {
      await this.register(plugin);
    }
  }

  /**
   * Remove a plugin by name. Runs its `teardown` hook if present.
   * @returns true if a plugin was removed
   */
  async unregister(name: string): Promise<boolean> {
    const idx = this.plugins.findIndex(p => p.name === name);
    if (idx === -1) {
      return false;
    }
    const [removed] = this.plugins.splice(idx, 1);
    if (removed.teardown) {
      await removed.teardown();
    }
    logger.info(`[Plugins] Unregistered plugin: ${name}`);
    return true;
  }

  /** Look up a plugin by name. */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.find(p => p.name === name);
  }

  /** All registered plugins, in registration order. */
  getPlugins(): Plugin[] {
    return [...this.plugins];
  }

  /** Number of registered plugins. */
  get count(): number {
    return this.plugins.length;
  }

  /** Run all setup hooks (useful for re-initialising a cleared manager). */
  async setupAll(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.setup) {
        await plugin.setup();
      }
    }
  }

  /** Run all teardown hooks and clear the registry. */
  async teardownAll(): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      if (plugin.teardown) {
        try {
          await plugin.teardown();
        } catch (err) {
          logger.error(`[Plugins] Teardown error for ${plugin.name}: ${err}`);
        }
      }
    }
    this.plugins = [];
  }

  /**
   * Fire every plugin's `beforeVerify` hook in registration order.
   * Hooks share one `metadata` object. If any hook sets `veto`, the run
   * is aborted: remaining beforeVerify hooks are skipped and the veto is
   * surfaced to the caller via the returned context.
   *
   * @returns the (possibly vetoed) context, plus the shared metadata
   */
  async runBeforeVerify(siteConfig: SiteConfig): Promise<BeforeVerifyContext> {
    const ctx: BeforeVerifyContext = {
      siteConfig,
      url: siteConfig.url,
      metadata: this.sharedMetadata,
    };

    for (const plugin of this.plugins) {
      if (!plugin.beforeVerify) {
        continue;
      }
      try {
        await plugin.beforeVerify(ctx);
      } catch (err) {
        logger.error(`[Plugins] beforeVerify error in ${plugin.name}: ${err}`);
        // Treat a throwing hook as a veto so a broken plugin can't silently pass.
        ctx.veto = { reason: `Plugin ${plugin.name} errored in beforeVerify: ${err}` };
      }
      if (ctx.veto) {
        logger.info(`[Plugins] Verification vetoed by ${plugin.name}: ${ctx.veto.reason}`);
        break;
      }
    }

    return ctx;
  }

  /**
   * Fire every plugin's `afterVerify` hook in registration order.
   * Hooks receive the produced `result` and may push entries into
   * `additionalChecks`, which the caller merges into the final result.
   *
   * @returns the checks appended by plugins (may be empty)
   */
  async runAfterVerify(siteConfig: SiteConfig, result: TestResult): Promise<CheckResult[]> {
    const additionalChecks: CheckResult[] = [];
    const ctx: AfterVerifyContext = {
      siteConfig,
      url: siteConfig.url,
      result,
      additionalChecks,
      metadata: this.sharedMetadata,
    };

    for (const plugin of this.plugins) {
      if (!plugin.afterVerify) {
        continue;
      }
      try {
        await plugin.afterVerify(ctx);
      } catch (err) {
        logger.error(`[Plugins] afterVerify error in ${plugin.name}: ${err}`);
        // Record the plugin failure as a warning check so it is visible
        // without crashing the whole verification.
        additionalChecks.push({
          name: `Plugin: ${plugin.name}`,
          type: 'plugin',
          passed: false,
          severity: 'warning',
          message: `Plugin ${plugin.name} errored in afterVerify: ${err}`,
        });
      }
    }

    return additionalChecks;
  }

  /**
   * Reset the shared metadata channel. Call this at the start of each
   * independent verification run so stale data does not leak between runs.
   */
  resetMetadata(): void {
    this.sharedMetadata = {};
  }

  /** Read-only view of the shared metadata channel. */
  getMetadata(): Record<string, unknown> {
    return { ...this.sharedMetadata };
  }
}
