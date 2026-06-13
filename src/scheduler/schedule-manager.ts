/**
 * Schedule Manager
 * Manages cron-like scheduled tasks for automated verification
 * Part of P1 Platform Job Queue Scheduler System
 */

import { logger } from '../utils/logger';
import { JobQueue, type Job } from './job-queue';

/**
 * Simple cron expression parser
 * Supports: "* * * * *" format (minute hour day-of-month month day-of-week)
 * - *: any value
 * - Number: exact match
 * - *&#47;n: every n units
 */
interface CronSchedule {
  minute: string;   // 0-59
  hour: string;     // 0-23
  dayOfMonth: string; // 1-31
  month: string;    // 1-12
  dayOfWeek: string; // 0-6 (0=Sunday)
}

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
 * Parse cron expression into components
 */
function parseCron(cron: string): CronSchedule {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron}. Expected format: "* * * * *"`);
  }
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

/**
 * Check if a cron pattern matches a value
 */
function matchesCronPattern(pattern: string, value: number): boolean {
  if (pattern === '*') return true;

  // Handle */n pattern (every n units)
  const intervalMatch = pattern.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    const interval = parseInt(intervalMatch[1], 10);
    return value % interval === 0;
  }

  // Exact match
  return parseInt(pattern, 10) === value;
}

/**
 * Calculate next execution time based on cron schedule
 */
function getNextExecutionTime(cron: string, from: Date = new Date()): Date {
  const schedule = parseCron(cron);
  const next = new Date(from);

  // Add 1 minute to start checking from the next minute
  next.setSeconds(0, 0);
  next.setTime(next.getTime() + 60000);

  // Check up to 4 years ahead (leap year safe)
  for (let yearOffset = 0; yearOffset < 1461; yearOffset++) {
    const current = new Date(next.getTime() + yearOffset * 365 * 24 * 60 * 60 * 1000);

    for (let month = 0; month < 12; month++) {
      current.setMonth(month);

      // Check month
      if (!matchesCronPattern(schedule.month, current.getMonth() + 1)) {
        continue;
      }

      // Check day of month
      if (!matchesCronPattern(schedule.dayOfMonth, current.getDate())) {
        continue;
      }

      // Check day of week (0=Sunday, 6=Saturday)
      if (!matchesCronPattern(schedule.dayOfWeek, current.getDay())) {
        continue;
      }

      // Find matching day in the month
      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        current.setDate(day);

        // Re-check day of month and day of week for this specific day
        if (!matchesCronPattern(schedule.dayOfMonth, current.getDate())) {
          continue;
        }
        if (!matchesCronPattern(schedule.dayOfWeek, current.getDay())) {
          continue;
        }

        // Check hour
        for (let hour = 0; hour < 24; hour++) {
          current.setHours(hour, 0, 0, 0);

          if (!matchesCronPattern(schedule.hour, current.getHours())) {
            continue;
          }

          // Check minute
          for (let minute = 0; minute < 60; minute++) {
            current.setMinutes(minute);

            if (!matchesCronPattern(schedule.minute, current.getMinutes())) {
              continue;
            }

            // Found match - ensure it's in the future
            if (current.getTime() > from.getTime()) {
              return current;
            }
          }
        }
      }
    }
  }

  throw new Error(`Could not calculate next execution time for cron: ${cron}`);
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
   */
  private executeScheduledTask(id: string): void {
    const schedule = this.schedules.get(id);
    if (!schedule || !schedule.enabled) {
      return;
    }

    logger.info(`[ScheduleManager] Executing scheduled task ${id} - ${schedule.name}`);

    // Create a job and enqueue it
    const jobId = this.jobQueue.enqueue({
      type: 'scheduled',
      payload: {
        scheduleId: id,
        scheduleName: schedule.name,
        siteConfig: schedule.siteConfig,
        executedAt: new Date().toISOString(),
      },
      priority: schedule.priority ?? 5,
    });

    logger.info(`[ScheduleManager] Enqueued job ${jobId} for schedule ${id}`);
  }

  /**
   * Generate a unique schedule ID
   */
  private generateScheduleId(): string {
    return `sched-${Date.now()}-${++this.scheduleIdCounter}`;
  }
}
