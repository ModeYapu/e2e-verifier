/**
 * Job Store with persistence to JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import { Job, JobStatus, JobStats, JobFilter, JobResult } from './types';
import { JsonStorage } from '../storage/json-storage';

/**
 * JSON-serializable representation of a Job
 * Date fields are stored as ISO strings
 */
interface SerializedJob extends Omit<Job, 'createdAt' | 'startedAt' | 'completedAt' | 'result'> {
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>; // JobResult serialized to plain object
}

/**
 * Job Store class for managing persistent job storage
 */
export class JobStore {
  private jobs: Map<string, Job> = new Map();
  private filePath: string;
  private dataDir: string;
  private storage: JsonStorage;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.filePath = 'jobs';

    // Initialize storage
    this.storage = new JsonStorage({
      storageDir: dataDir,
      fileExtension: '.json',
      createDir: true,
    });

    this.loadJobs();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Load jobs from JSON file
   */
  private loadJobs(): void {
    try {
      const data = this.storage.get(this.filePath) as { jobs: SerializedJob[] } | null;

      if (data && data.jobs && Array.isArray(data.jobs)) {
        for (const jobData of data.jobs) {
          const job = this.deserializeJob(jobData);

          // Recovery: reset running jobs to pending on server restart
          if (job.status === 'running') {
            job.status = 'pending';
            job.startedAt = undefined;
            job.progress = 'Job was interrupted - pending retry';
          }

          this.jobs.set(job.id, job);
        }
        console.log(`[JobStore] Loaded ${this.jobs.size} jobs from ${this.filePath}`);
      } else {
        console.log(`[JobStore] No existing jobs found`);
      }
    } catch (error) {
      console.error(`[JobStore] Error loading jobs: ${error}`);
      // Start with empty store if file is corrupted
      this.jobs = new Map();
    }
  }

  /**
   * Save jobs to JSON file with atomic write
   */
  private saveJobs(): void {
    try {
      const jobsArray = Array.from(this.jobs.values()).map(job => this.serializeJob(job));
      const data = { jobs: jobsArray, lastUpdated: new Date().toISOString() };

      this.storage.set(this.filePath, data);
    } catch (error) {
      console.error(`[JobStore] Error saving jobs: ${error}`);
      throw error;
    }
  }

  /**
   * Serialize job for JSON storage
   */
  private serializeJob(job: Job): SerializedJob {
    const { createdAt, startedAt, completedAt, result, ...rest } = job;
    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      startedAt: startedAt?.toISOString(),
      completedAt: completedAt?.toISOString(),
      result: result ? result as unknown as Record<string, unknown> : undefined
    };
  }

  /**
   * Deserialize job from JSON storage
   */
  private deserializeJob(data: SerializedJob): Job {
    const { createdAt, startedAt, completedAt, result, ...rest } = data;
    return {
      ...rest,
      createdAt: new Date(createdAt),
      startedAt: startedAt ? new Date(startedAt) : undefined,
      completedAt: completedAt ? new Date(completedAt) : undefined,
      result: result as unknown as JobResult | undefined
    };
  }

  /**
   * Save a new job
   */
  save(job: Job): void {
    this.jobs.set(job.id, job);
    this.saveJobs();
  }

  /**
   * Get a job by ID
   */
  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Update an existing job
   */
  update(id: string, updates: Partial<Job>): Job | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    const updatedJob = { ...job, ...updates };
    this.jobs.set(id, updatedJob);
    this.saveJobs();

    return updatedJob;
  }

  /**
   * Delete a job
   */
  delete(id: string): boolean {
    const existed = this.jobs.delete(id);
    if (existed) {
      this.saveJobs();
    }
    return existed;
  }

  /**
   * List jobs with optional filtering
   */
  list(filter?: JobFilter): Job[] {
    let jobs = Array.from(this.jobs.values());

    // Apply filters
    if (filter) {
      if (filter.status) {
        jobs = jobs.filter(job => job.status === filter.status);
      }
      if (filter.type) {
        jobs = jobs.filter(job => job.type === filter.type);
      }
      if (filter.priority) {
        jobs = jobs.filter(job => job.priority === filter.priority);
      }
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    if (filter) {
      const offset = filter.offset || 0;
      const limit = filter.limit || jobs.length;
      jobs = jobs.slice(offset, offset + limit);
    }

    return jobs;
  }

  /**
   * Count jobs by status
   */
  countByStatus(): JobStats {
    const stats: JobStats = {
      total: this.jobs.size,
      pending: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }

  /**
   * Get all jobs (internal use)
   */
  getAllJobs(): Map<string, Job> {
    return this.jobs;
  }

  /**
   * Clear all jobs (testing use only)
   */
  clear(): void {
    this.jobs.clear();
    this.saveJobs();
  }
}