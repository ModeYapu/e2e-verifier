/**
 * Minimal async mutex.
 *
 * Single-process Node is cooperatively scheduled, so synchronous read-modify-
 * write blocks are atomic by construction. The risk appears once a critical
 * section spans an `await` (e.g. read JSON, await something, write JSON back):
 * interleaving then loses updates. This mutex serialises those sections.
 *
 * It is NOT a cross-process lock — multi-process deployments need an external
 * file lock (flock / proper-lockfile) layered on top.
 */
export class Mutex {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Run `fn` while holding the lock. Resolves with fn's result.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for the previous holder, then release after fn settles.
    const next = this.chain.then(() => fn());
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
