/**
 * Job Store with persistence to JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import { Job, JobStatus, JobStats, JobFilter } from './types';

/**
 * Job Store class for managing persistent job storage
 */
export class JobStore {
  private jobs: Map<string, Job> = new Map();
  private filePath: string;
  private dataDir: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'jobs.json');
    this.ensureDataDir();
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
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(content);

        if (Array.isArray(data.jobs)) {
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
        }
      } else {
        console.log(`[JobStore] No existing jobs file found at ${this.filePath}`);
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
      const content = JSON.stringify(data, null, 2);

      // Atomic write: temp file + rename
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      console.error(`[JobStore] Error saving jobs: ${error}`);
      throw error;
    }
  }

  /**
   * Serialize job for JSON storage
   */
  private serializeJob(job: Job): any {
    return {
      ...job,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString()
    };
  }

  /**
   * Deserialize job from JSON storage
   */
  private deserializeJob(data: any): Job {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined
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