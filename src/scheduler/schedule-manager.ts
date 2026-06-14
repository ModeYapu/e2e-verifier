/**
 * Schedule Manager
 * Manages cron-like scheduled tasks for automated verification
 * Part of P1 Platform Job Queue Scheduler System
 */

import { CronExpressionParser } from 'cron-parser';
import { logger } from '../utils/logger';
import { JobQueue } from './job-queue';
import type { JobPriority } from './types';

/**
 * Site configuration for scheduled verification
 */
export interface SiteConfig {
  url: string;
  name: string;
  expectedStatusCode?: number;
  viewport?: { width: number; height: number };
  timeout?: number;
  checks?: string[];
}

/**
 * Schedule configuration
 */
export interface ScheduleConfig {
  id: string;
  name: string;
  cron: string; // Cron expression: "* * * * *"
  siteConfig: SiteConfig;
  enabled: boolean;
  priority?: number;
}

/**
 * Calculate the next execution time for a cron expression.
 *
 * Delegates to the `cron-parser` library, which correctly handles the full
 * cron grammar (ranges, lists, steps, L/W modifiers, etc.) that the previous
 * hand-rolled matcher did not. Throws on an invalid expression, which the
 * caller catches.
 */
function getNextExecutionTime(cron: string, from: Date = new Date()): Date {
  const iterator = CronExpressionParser.parse(cron, { currentDate: from });
  return iterator.next().toDate();
}

/**
 * Schedule Manager class
 * Manages scheduled verification tasks
 */
export class ScheduleManager {
  private schedules: Map<string, ScheduleConfig> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private jobQueue: JobQueue;
  private scheduleIdCounter = 0;

  constructor(jobQueue: JobQueue) {
    this.jobQueue = jobQueue;
  }

  /**
   * Add a new schedule
   * @param config - Schedule configuration
   * @returns The schedule ID
   */
  addSchedule(config: Omit<ScheduleConfig, 'id'>): string {
    const id = this.generateScheduleId();
    const scheduleConfig: ScheduleConfig = {
      ...config,
      id,
    };

    this.schedules.set(id, scheduleConfig);

    if (scheduleConfig.enabled) {
      this.scheduleNextExecution(id);
    }

    logger.info(`[ScheduleManager] Added schedule ${id} - ${scheduleConfig.name} (${scheduleConfig.cron})`);
    return id;
  }

  /**
   * Remove a schedule
   * @param id - Schedule ID
   * @returns true if removed, false if not found
   */
  removeSchedule(id: string): boolean {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      logger.warn(`[ScheduleManager] Cannot remove non-existent schedule ${id}`);
      return false;
    }

    // Clear existing timer
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.schedules.delete(id);
    logger.info(`[ScheduleManager] Removed schedule ${id}`);
    return true;
  }

  /**
   * Get all schedules
   * @returns Array of all schedule configurations
   */
  getSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get a specific schedule by ID
   * @param id - Schedule ID
   * @returns Schedule configuration or undefined
   */
  getSchedule(id: string): ScheduleConfig | undefined {
    return this.schedules.get(id);
  }

  /**
   * Update a schedule
   * @param id - Schedule ID
   * @param updates - Partial schedule configuration to update
   * @returns Updated schedule or undefined if not found
   */
  updateSchedule(id: string, updates: Partial<ScheduleConfig>): ScheduleConfig | undefined {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return undefined;
    }

    const updated: ScheduleConfig = {
      ...schedule,
      ...updates,
      id, // Ensure ID doesn't change
    };

    this.schedules.set(id, updated);

    // Reschedule if enabled status changed or cron changed
    if (updates.enabled !== undefined || updates.cron !== undefined) {
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }

      if (updated.enabled) {
        this.scheduleNextExecution(id);
      }
    }

    logger.info(`[ScheduleManager] Updated schedule ${id}`);
    return updated;
  }

  /**
   * Enable a schedule
   * @param id - Schedule ID
   * @returns true if enabled, false if not found
   */
  enableSchedule(id: string): boolean {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return false;
    }

    if (!schedule.enabled) {
      schedule.enabled = true;
      this.scheduleNextExecution(id);
      logger.info(`[ScheduleManager] Enabled schedule ${id}`);
    }

    return true;
  }

  /**
   * Disable a schedule
   * @param id - Schedule ID
   * @returns true if disabled, false if not found
   */
  disableSchedule(id: string): boolean {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return false;
    }

    if (schedule.enabled) {
      schedule.enabled = false;

      // Clear existing timer
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }

      logger.info(`[ScheduleManager] Disabled schedule ${id}`);
    }

    return true;
  }

  /**
   * Stop all schedules and clear timers
   */
  stop(): void {
    for (const [id, timer] of this.timers.entries()) {
      clearTimeout(timer);
      logger.debug(`[ScheduleManager] Cleared timer for schedule ${id}`);
    }
    this.timers.clear();
    logger.info('[ScheduleManager] Stopped all schedules');
  }

  /**
   * Schedule next execution for a schedule
   */
  private scheduleNextExecution(id: string): void {
    const schedule = this.schedules.get(id);
    if (!schedule || !schedule.enabled) {
      return;
    }

    try {
      const nextExecution = getNextExecutionTime(schedule.cron);
      const now = new Date();
      const delay = Math.max(0, nextExecution.getTime() - now.getTime());

      logger.debug(`[ScheduleManager] Scheduling ${id} (${schedule.name}) for ${nextExecution.toISOString()}`);

      const timer = setTimeout(() => {
        this.executeScheduledTask(id);
        this.scheduleNextExecution(id); // Reschedule for next occurrence
      }, delay);

      this.timers.set(id, timer);
    } catch (error) {
      logger.error(`[ScheduleManager] Failed to schedule ${id}: ${(error as Error).message}`);
    }
  }

  /**
   * Execute a scheduled task
   *
   * Builds a real 'fast' verify job from the schedule's site config and
   * enqueues it on the shared persistent JobQueue. (Previously this enqueued
   * an ad-hoc `{type:'scheduled', payload}` shape onto a separate in-memory
   * queue that the Scheduler could never actually execute.)
   */
  private executeScheduledTask(id: string): void {
    const schedule = this.schedules.get(id);
    if (!schedule || !schedule.enabled) {
      return;
    }

    logger.info(`[ScheduleManager] Executing scheduled task ${id} - ${schedule.name}`);

    const site = schedule.siteConfig;
    const job = this.jobQueue.createJob(
      'fast',
      {
        name: site.name,
        fastVerify: {
          url: site.url,
          name: site.name,
          checks: site.checks,
          viewport: site.viewport,
          timeout: site.timeout,
          expectedStatusCode: site.expectedStatusCode,
        },
      },
      this.numericPriorityToEnum(schedule.priority),
    );
    this.jobQueue.enqueue(job);

    logger.info(`[ScheduleManager] Enqueued job ${job.id} for schedule ${id}`);
  }

  /**
   * Map the schedule's numeric priority (higher = more urgent) onto the
   * JobPriority enum the queue understands.
   */
  private numericPriorityToEnum(priority: number | undefined): JobPriority {
    if (priority === undefined) return 'normal';
    if (priority >= 7) return 'high';
    if (priority <= 3) return 'low';
    return 'normal';
  }

  /**
   * Generate a unique schedule ID
   */
  private generateScheduleId(): string {
    return `sched-${Date.now()}-${++this.scheduleIdCounter}`;
  }
}
