/**
 * Job Queue — single, persistent, priority-based FIFO queue.
 *
 * Backed by {@link JobStore} (JSON file persistence) and extending EventEmitter
 * for job lifecycle events. This is the ONE queue used by the Scheduler,
 * ScheduleManager and the REST routes. The previous separate in-memory queue
 * and the mis-named `job-queue-legacy` module were merged into this file.
 */

import { EventEmitter } from 'events';
import { JobStore } from './job-store';
import { Job, JobStatus, JobPriority, JobConfig, JobResult, JobStats, JobFilter } from './types';
import { generateId } from '../utils/security';
import { logger } from '../utils/logger';

// Re-export the job model so consumers can import everything from one place.
export type { Job, JobStatus, JobPriority, JobConfig, JobResult, JobStats, JobFilter };

/**
 * Queue status shape used by the legacy `/api/jobs/queue/status` route.
 * `waiting` aggregates pending + queued jobs.
 */
export interface QueueStatus {
  waiting: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

/**
 * Job Queue class extending EventEmitter for job lifecycle events
 */
export class JobQueue extends EventEmitter {
  private jobStore: JobStore;

  constructor(jobStore: JobStore) {
    super();
    this.jobStore = jobStore;
  }

  /** Expose the backing store (routes/transactions). */
  getStore(): JobStore {
    return this.jobStore;
  }

  /**
   * Enqueue a new job
   */
  enqueue(job: Job): void {
    // Set initial status to pending
    job.status = 'pending';
    this.jobStore.save(job);

    logger.info(`[JobQueue] Enqueued job ${job.id} (type: ${job.type}, priority: ${job.priority})`);
  }

  /**
   * Atomically claim the next pending job.
   *
   * Delegates to {@link JobStore.claimNextPending} which performs the
   * select-and-status-flip in a single synchronous critical section, so
   * multiple workers can never be handed the same job.
   */
  dequeue(): Job | null {
    const job = this.jobStore.claimNextPending();
    if (job) {
      logger.info(`[JobQueue] Dequeued job ${job.id} (type: ${job.type}, priority: ${job.priority})`);
    }
    return job;
  }

  /**
   * Mark a job as completed
   */
  complete(jobId: string, result: JobResult): void {
    const job = this.jobStore.get(jobId);
    if (!job) return;

    const updatedJob = this.jobStore.update(jobId, {
      status: 'completed',
      result,
      completedAt: new Date(),
      progress: 'Job completed successfully'
    });

    if (updatedJob) {
      this.emit('job.completed', updatedJob);
      logger.info(`[JobQueue] Job ${jobId} completed successfully`);
    }
  }

  /**
   * Mark a job as failed
   */
  fail(jobId: string, error: string): void {
    const job = this.jobStore.get(jobId);
    if (!job) return;

    const updatedJob = this.jobStore.update(jobId, {
      status: 'failed',
      error,
      completedAt: new Date(),
      progress: `Job failed: ${error}`
    });

    if (updatedJob) {
      this.emit('job.failed', updatedJob);
      logger.info(`[JobQueue] Job ${jobId} failed: ${error}`);
    }
  }

  /**
   * Cancel a job
   */
  cancel(jobId: string): boolean {
    const job = this.jobStore.get(jobId);
    if (!job) return false;

    // Can only cancel pending or queued jobs
    if (job.status !== 'pending' && job.status !== 'queued') {
      logger.info(`[JobQueue] Cannot cancel job ${jobId} with status ${job.status}`);
      return false;
    }

    this.jobStore.update(jobId, {
      status: 'cancelled',
      completedAt: new Date(),
      progress: 'Job cancelled by user'
    });

    logger.info(`[JobQueue] Job ${jobId} cancelled`);
    return true;
  }

  /**
   * Create a new job (factory method)
   */
  createJob(
    type: Job['type'],
    config: JobConfig,
    priority: JobPriority = 'normal',
    maxRetries: number = 3,
    timeout?: number
  ): Job {
    return {
      id: generateId('job-'),
      type,
      status: 'pending',
      priority,
      config,
      retryCount: 0,
      maxRetries,
      createdAt: new Date(),
      timeout,
      progress: 'Job created'
    };
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): Job | null {
    const job = this.jobStore.get(jobId);
    if (!job) return null;

    // Can only retry failed jobs
    if (job.status !== 'failed') {
      logger.info(`[JobQueue] Cannot retry job ${jobId} with status ${job.status}`);
      return null;
    }

    // Check retry limit
    if (job.retryCount >= job.maxRetries) {
      logger.info(`[JobQueue] Job ${jobId} has reached max retries (${job.maxRetries})`);
      return null;
    }

    // Reset job for retry
    const updatedJob = this.jobStore.update(jobId, {
      status: 'pending',
      retryCount: job.retryCount + 1,
      error: undefined,
      completedAt: undefined,
      progress: `Retry attempt ${job.retryCount + 1} of ${job.maxRetries}`
    });

    if (updatedJob) {
      logger.info(`[JobQueue] Job ${jobId} queued for retry (attempt ${updatedJob.retryCount}/${updatedJob.maxRetries})`);
    }

    return updatedJob;
  }

  /**
   * Get queue statistics (status counts).
   */
  getStats(): JobStats {
    return this.jobStore.countByStatus();
  }

  // ---------------------------------------------------------------
  // Route-facing convenience accessors.
  // These delegate to the store so the REST layer can talk to the
  // queue directly without a separate JobStore reference.
  // ---------------------------------------------------------------

  /** Get a job by id. */
  get(jobId: string): Job | undefined {
    return this.jobStore.get(jobId);
  }

  /** List jobs, optionally filtered by status (or a full JobFilter). */
  list(filter?: JobStatus | JobFilter): Job[] {
    if (!filter) return this.jobStore.list();
    if (typeof filter === 'string') return this.jobStore.list({ status: filter });
    return this.jobStore.list(filter);
  }

  /**
   * Queue status in the legacy {@link QueueStatus} shape used by the
   * `/api/jobs/queue/status` route. `waiting` covers both pending and queued.
   */
  getQueueStatus(): QueueStatus {
    const s = this.jobStore.countByStatus();
    return {
      waiting: s.pending + s.queued,
      running: s.running,
      completed: s.completed,
      failed: s.failed,
      cancelled: s.cancelled,
      total: s.total,
    };
  }
}
