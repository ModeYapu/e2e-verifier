/**
 * Worker Pool for concurrent job execution
 * Part of P1 Platform Job Queue Scheduler System
 */

import { logger } from '../utils/logger';
import type { Job, JobStatus } from './job-queue';

/**
 * Worker state tracking
 */
interface WorkerState {
  id: string;
  busy: boolean;
  currentJob?: Job;
}

/**
 * Configuration for the worker pool
 */
export interface WorkerPoolConfig {
  maxConcurrency: number;
}

/**
 * Worker Pool manages concurrent job execution with a fixed number of workers
 * - Workers pull jobs from the queue when available
 * - Executes jobs using the provided handler function
 * - Updates job status through the queue
 * - Provides visibility into active worker count
 */
export class WorkerPool {
  private workers: WorkerState[] = [];
  private maxConcurrency: number;
  private running = false;

  /**
   * Create a new worker pool
   * @param maxConcurrency - Maximum number of concurrent workers (default: 3)
   */
  constructor(maxConcurrency: number = 3) {
    if (maxConcurrency < 1) {
      throw new Error('maxConcurrency must be at least 1');
    }
    this.maxConcurrency = maxConcurrency;

    // Initialize worker pool
    for (let i = 0; i < maxConcurrency; i++) {
      this.workers.push({
        id: `worker-${i}`,
        busy: false,
      });
    }

    logger.info(`[WorkerPool] Initialized with ${maxConcurrency} workers`);
  }

  /**
   * Get the current number of active (busy) workers
   * @returns Count of active workers
   */
  getActiveCount(): number {
    return this.workers.filter(w => w.busy).length;
  }

  /**
   * Check if a worker is available
   * @returns true if at least one worker is available
   */
  isAvailable(): boolean {
    return this.getActiveCount() < this.maxConcurrency;
  }

  /**
   * Get the maximum concurrency limit
   * @returns Maximum number of concurrent workers
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Get all workers (for debugging/monitoring)
   * @returns Array of worker states
   */
  getWorkers(): WorkerState[] {
    return [...this.workers];
  }

  /**
   * Execute a job with the given handler
   * - Assigns job to an available worker
   * - Executes the handler with the job
   * - Updates job status during execution
   * @param job - The job to execute
   * @param handler - Async function that processes the job
   * @returns Promise resolving to the completed job
   */
  async execute(
    job: Job,
    handler: (job: Job) => Promise<unknown>
  ): Promise<Job> {
    const worker = this.findAvailableWorker();

    if (!worker) {
      throw new Error('No available workers. All workers are busy.');
    }

    // Assign job to worker
    worker.busy = true;
    worker.currentJob = job;

    logger.debug(`[WorkerPool] Worker ${worker.id} executing job ${job.id}`);

    try {
      // Execute the job handler
      const result = await handler(job);
      job.result = result;
      job.status = 'completed' as JobStatus;
      job.completedAt = new Date().toISOString();

      logger.info(`[WorkerPool] Worker ${worker.id} completed job ${job.id}`);
    } catch (error) {
      job.status = 'failed' as JobStatus;
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date().toISOString();

      logger.error(`[WorkerPool] Worker ${worker.id} failed job ${job.id}: ${job.error}`);
    } finally {
      // Release worker
      worker.busy = false;
      worker.currentJob = undefined;
    }

    return job;
  }

  /**
   * Find an available (non-busy) worker
   * @returns Available worker or undefined
   */
  private findAvailableWorker(): WorkerState | undefined {
    return this.workers.find(w => !w.busy);
  }

  /**
   * Wait for an available worker
   * @param timeout - Maximum time to wait in ms (default: 30000)
   * @returns Promise that resolves when a worker is available
   */
  async waitForAvailable(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (!this.isAvailable()) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for available worker after ${timeout}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Stop all workers gracefully
   * - Waits for running jobs to complete (with timeout)
   * @param timeout - Maximum time to wait for jobs to complete (default: 30000)
   */
  async stop(timeout: number = 30000): Promise<void> {
    logger.info('[WorkerPool] Stopping workers...');

    const startTime = Date.now();

    // Wait for running jobs to complete
    while (this.getActiveCount() > 0) {
      if (Date.now() - startTime > timeout) {
        logger.warn(`[WorkerPool] Timeout waiting for workers to finish. ${this.getActiveCount()} jobs still running.`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('[WorkerPool] All workers stopped');
  }

  /**
   * Get pool status
   * @returns Object with current pool statistics
   */
  getStatus() {
    return {
      maxConcurrency: this.maxConcurrency,
      activeCount: this.getActiveCount(),
      availableCount: this.maxConcurrency - this.getActiveCount(),
      utilizationPercent: (this.getActiveCount() / this.maxConcurrency) * 100,
    };
  }
}
