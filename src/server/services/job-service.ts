/**
 * Job Service
 * Handles job queue operations including JobStore, JobQueue, and Scheduler management
 */

import { JobStore } from '../../scheduler/job-store';
import { JobQueue } from '../../scheduler/job-queue';
import { Scheduler } from '../../scheduler/scheduler';
import { Job, JobConfig, JobType, JobPriority, JobStatus } from '../../scheduler/types';

export class JobService {
  private jobStore: JobStore;
  private jobQueue: JobQueue;
  private scheduler: Scheduler;

  constructor() {
    this.jobStore = new JobStore();
    this.jobQueue = new JobQueue(this.jobStore);
    this.scheduler = new Scheduler(this.jobQueue, this.jobStore, {
      maxConcurrency: 2,
      headless: true
    });
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    await this.scheduler.start();
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    await this.scheduler.stop();
  }

  /**
   * Create a new job
   */
  createJob(
    type: JobType,
    config: JobConfig,
    priority: JobPriority = 'normal',
    maxRetries: number = 3,
    timeout?: number
  ): Job {
    const job = this.jobQueue.createJob(type, config, priority, maxRetries, timeout);
    return job;
  }

  /**
   * Enqueue a job
   */
  enqueueJob(job: Job): void {
    this.jobQueue.enqueue(job);
  }

  /**
   * Create and enqueue a job
   */
  createAndEnqueueJob(
    type: JobType,
    config: JobConfig,
    priority: JobPriority = 'normal',
    maxRetries: number = 3,
    timeout?: number
  ): Job {
    const job = this.createJob(type, config, priority, maxRetries, timeout);
    this.enqueueJob(job);
    return job;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobStore.get(jobId);
  }

  /**
   * List jobs with filtering
   */
  listJobs(filter: {
    status?: JobStatus;
    type?: JobType;
    priority?: JobPriority;
    offset?: number;
    limit?: number;
  } = {}): Job[] {
    return this.jobStore.list(filter);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    return this.jobQueue.cancel(jobId);
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): Job | undefined {
    return this.jobQueue.retryJob(jobId);
  }

  /**
   * Get job queue statistics
   */
  getQueueStats(): unknown {
    return this.jobQueue.getStats();
  }

  /**
   * Get scheduler instance
   */
  getScheduler(): Scheduler {
    return this.scheduler;
  }

  /**
   * Get job store instance
   */
  getJobStore(): JobStore {
    return this.jobStore;
  }

  /**
   * Get job queue instance
   */
  getJobQueue(): JobQueue {
    return this.jobQueue;
  }
}
