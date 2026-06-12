/**
 * Job Queue with priority-based FIFO semantics
 */

import { EventEmitter } from 'events';
import { JobStore } from './job-store';
import { Job, JobStatus, JobPriority, JobConfig, JobResult } from './types';
import { logger } from '../utils/logger';

/**
 * Job Queue class extending EventEmitter for job lifecycle events
 */
export class JobQueue extends EventEmitter {
  private jobStore: JobStore;

  constructor(jobStore: JobStore) {
    super();
    this.jobStore = jobStore;
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
   * Dequeue the next job based on priority and FIFO
   * Returns null if no pending jobs are available
   */
  dequeue(): Job | null {
    const pendingJobs = this.jobStore.list({ status: 'pending' });

    if (pendingJobs.length === 0) {
      return null;
    }

    // Sort by priority (high > normal > low), then by creation time (FIFO within same priority)
    const priorityOrder: Record<JobPriority, number> = {
      high: 3,
      normal: 2,
      low: 1
    };

    pendingJobs.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Same priority: FIFO by creation time
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Get the highest priority job
    const job = pendingJobs[0];

    // Update status to queued
    this.jobStore.update(job.id, { status: 'queued' });

    logger.info(`[JobQueue] Dequeued job ${job.id} (type: ${job.type}, priority: ${job.priority})`);

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
      id: this.generateId(),
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
   * Get queue statistics
   */
  getStats() {
    return this.jobStore.countByStatus();
  }

  /**
   * Generate unique job ID
   */
  private generateId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}