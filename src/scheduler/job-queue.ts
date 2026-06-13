/**
 * In-memory Job Queue with priority-based FIFO semantics
 * Part of P1 Platform Job Queue Scheduler System
 */

import { logger } from '../utils/logger';

/**
 * Job status throughout its lifecycle
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Job interface representing a unit of work
 */
export interface Job {
  id: string;
  type: string;
  payload: unknown;
  priority: number; // Higher number = higher priority
  status: JobStatus;
  createdAt: string; // ISO timestamp
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

/**
 * Queue status statistics
 */
export interface QueueStatus {
  waiting: number; // queued jobs
  running: number; // running jobs
  completed: number; // completed jobs
  failed: number; // failed jobs
  cancelled: number; // cancelled jobs
  total: number; // total jobs ever created
}

/**
 * In-memory job queue with priority-based FIFO scheduling
 * - Higher priority number = higher priority (executed first)
 * - FIFO ordering within same priority level
 * - In-memory storage only (no persistence)
 */
export class JobQueue {
  private queue: Map<string, Job> = new Map();
  private jobIdCounter = 0;
  private totalCreated = 0;

  /**
   * Enqueue a new job
   * @param job - The job to enqueue (id is auto-generated if empty)
   * @returns The jobId of the enqueued job
   */
  enqueue(job: Omit<Job, 'id' | 'status' | 'createdAt'> & Partial<Pick<Job, 'id' | 'status' | 'createdAt'>>): string {
    const jobId = job.id || this.generateJobId();
    const newJob: Job = {
      id: jobId,
      type: job.type,
      payload: job.payload,
      priority: job.priority ?? 0,
      status: job.status ?? 'queued',
      createdAt: job.createdAt || new Date().toISOString(),
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      result: job.result,
      error: job.error,
    };

    this.queue.set(jobId, newJob);
    this.totalCreated++;

    logger.debug(`[JobQueue] Enqueued job ${jobId} (type: ${newJob.type}, priority: ${newJob.priority})`);

    return jobId;
  }

  /**
   * Dequeue the next job based on priority and FIFO
   * - Jobs must be in 'queued' status to be dequeued
   * - Higher priority numbers are dequeued first
   * - FIFO ordering within same priority
   * @returns The next job to process, or undefined if no queued jobs
   */
  dequeue(): Job | undefined {
    const queuedJobs = Array.from(this.queue.values()).filter(j => j.status === 'queued');

    if (queuedJobs.length === 0) {
      return undefined;
    }

    // Sort by priority (descending), then by creation time (ascending for FIFO)
    queuedJobs.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Same priority: FIFO by creation time
      return a.createdAt.localeCompare(b.createdAt);
    });

    const job = queuedJobs[0];
    logger.debug(`[JobQueue] Dequeued job ${job.id} (type: ${job.type}, priority: ${job.priority})`);

    return job;
  }

  /**
   * Cancel a queued or running job
   * @param jobId - The ID of the job to cancel
   * @returns true if cancelled, false if not found or not cancellable
   */
  cancel(jobId: string): boolean {
    const job = this.queue.get(jobId);

    if (!job) {
      logger.warn(`[JobQueue] Cannot cancel non-existent job ${jobId}`);
      return false;
    }

    // Can only cancel queued or running jobs
    if (job.status !== 'queued' && job.status !== 'running') {
      logger.warn(`[JobQueue] Cannot cancel job ${jobId} with status ${job.status}`);
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();

    logger.info(`[JobQueue] Cancelled job ${jobId}`);
    return true;
  }

  /**
   * Update job status
   * @param jobId - The ID of the job to update
   * @param status - The new status
   */
  updateStatus(jobId: string, status: JobStatus): void {
    const job = this.queue.get(jobId);
    if (job) {
      job.status = status;
      if (status === 'running' && !job.startedAt) {
        job.startedAt = new Date().toISOString();
      } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        if (!job.completedAt) {
          job.completedAt = new Date().toISOString();
        }
      }
    }
  }

  /**
   * Update job result
   * @param jobId - The ID of the job to update
   * @param result - The result to set
   */
  updateResult(jobId: string, result: unknown): void {
    const job = this.queue.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
    }
  }

  /**
   * Update job error
   * @param jobId - The ID of the job to update
   * @param error - The error message to set
   */
  updateError(jobId: string, error: string): void {
    const job = this.queue.get(jobId);
    if (job) {
      job.error = error;
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
    }
  }

  /**
   * Get a job by ID
   * @param jobId - The ID of the job to retrieve
   * @returns The job, or undefined if not found
   */
  get(jobId: string): Job | undefined {
    return this.queue.get(jobId);
  }

  /**
   * Get queue status statistics
   * @returns Queue status with counts by status
   */
  getQueueStatus(): QueueStatus {
    const jobs = Array.from(this.queue.values());

    return {
      waiting: jobs.filter(j => j.status === 'queued').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
      total: this.totalCreated,
    };
  }

  /**
   * Get all jobs (optional filter by status)
   * @param status - Optional status to filter by
   * @returns Array of jobs matching the filter
   */
  list(status?: JobStatus): Job[] {
    const jobs = Array.from(this.queue.values());
    return status ? jobs.filter(j => j.status === status) : jobs;
  }

  /**
   * Clear all jobs from the queue
   */
  clear(): void {
    this.queue.clear();
    this.totalCreated = 0;
    logger.info('[JobQueue] Queue cleared');
  }

  /**
   * Generate a unique job ID
   * @returns A unique job ID string
   */
  private generateJobId(): string {
    return `job-${Date.now()}-${++this.jobIdCounter}`;
  }
}
