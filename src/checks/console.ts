import { Page, ConsoleMessage } from '@playwright/test';
import { ConsoleError } from '../types';

const MAX_ERROR_LENGTH = 200;
const MAX_ERRORS = 5;

function truncateError(message: string): string {
  if (message.length <= MAX_ERROR_LENGTH) return message;
  return message.substring(0, MAX_ERROR_LENGTH) + '...';
}

export class ConsoleMonitor {
  private errors: ConsoleError[] = [];
  private paused = false;
  private ignorePatterns: RegExp[] = [];

  constructor(private page: Page) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.page.on('console', (message: ConsoleMessage) => {
      if (this.paused) return;
      if (message.type() === 'error') {
        const text = message.text();
        // Skip errors matching ignore patterns
        if (this.ignorePatterns.some(pattern => pattern.test(text))) return;
        
        const truncatedMessage = truncateError(text);
        this.errors.push({
          message: truncatedMessage,
          type: message.type(),
          timestamp: Date.now()
        });

        // Keep only the most recent errors up to MAX_ERRORS
        if (this.errors.length > MAX_ERRORS) {
          this.errors.shift();
        }
      }
    });
  }

  getErrors(): ConsoleError[] {
    return [...this.errors];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  clearErrors(): void {
    this.errors = [];
  }

  formatErrors(): string {
    if (this.errors.length === 0) return 'No console errors';

    const uniqueMessages = [...new Set(this.errors.map(e => e.message))];
    const displayed = uniqueMessages.slice(0, 5);
    const suffix = uniqueMessages.length > 5 ? '...' : '';
    return `${this.errors.length} error(s): ${displayed.join('; ')}${suffix}`;
  }

  /**
   * Pause console error collection.
   * Used during api checks that intentionally trigger non-2xx responses.
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume console error collection.
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Run a callback with console monitoring paused.
   * Any errors during the callback are suppressed.
   */
  async whilePaused<T>(fn: () => Promise<T>): Promise<T> {
    this.paused = true;
    try {
      return await fn();
    } finally {
      this.paused = false;
    }
  }

  /**
   * Add patterns to ignore. Matching console errors are silently dropped.
   * Useful for known harmless errors from third-party scripts.
   */
  addIgnorePatterns(patterns: RegExp[]): void {
    this.ignorePatterns.push(...patterns);
  }
}
