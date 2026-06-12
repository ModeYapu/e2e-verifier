/**
 * JobStore unit tests
 *
 * Tests the persistent job storage implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JobStore } from '../src/scheduler/job-store';
import { Job } from '../src/scheduler/types';

describe('JobStore', () => {
  let tempDir: string;
  let jobStore: JobStore;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-store-test-'));
    jobStore = new JobStore(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createJob', () => {
    test('should save a new job', () => {
      const job: Job = {
        id: 'test-job-1',
        type: 'fast',
        priority: 'normal',
        status: 'pending',
        config: {
          fastVerify: {
            url: 'https://example.com',
            name: 'Test Job',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        progress: 'Pending execution',
      };

      jobStore.save(job);

      const retrieved = jobStore.get('test-job-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-job-1');
      expect(retrieved?.type).toBe('fast');
    });

    test('should persist job to storage', () => {
      const job: Job = {
        id: 'persist-test',
        type: 'deep',
        priority: 'high',
        status: 'pending',
        config: {
          deepVerify: {
            url: 'https://example.com',
            task: 'Persist test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      jobStore.save(job);

      // Create new JobStore instance to test persistence
      const newJobStore = new JobStore(tempDir);
      const retrieved = newJobStore.get('persist-test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('persist-test');
    });
  });

  describe('getJob', () => {
    test('should retrieve existing job', () => {
      const job: Job = {
        id: 'get-test',
        type: 'intelligent',
        priority: 'low',
        status: 'pending',
        config: {
          intelligentVerify: {
            target: {
              url: 'https://example.com',
              name: 'Get Test',
            },
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      jobStore.save(job);

      const retrieved = jobStore.get('get-test');
      expect(retrieved).toEqual(job);
    });

    test('should return undefined for non-existent job', () => {
      const retrieved = jobStore.get('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('updateJob', () => {
    test('should update existing job', () => {
      const job: Job = {
        id: 'update-test',
        type: 'fast',
        priority: 'normal',
        status: 'pending',
        config: {
          fastVerify: {
            url: 'https://example.com',
            name: 'Update Test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      jobStore.save(job);

      const updated = jobStore.update('update-test', {
        status: 'running',
        startedAt: new Date(),
        progress: 'Job started',
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('running');
      expect(updated?.progress).toBe('Job started');
      expect(updated?.id).toBe('update-test'); // Should keep original id
    });

    test('should return null for non-existent job', () => {
      const updated = jobStore.update('non-existent', {
        status: 'running',
      });

      expect(updated).toBeNull();
    });

    test('should persist updates', () => {
      const job: Job = {
        id: 'persist-update',
        type: 'deep',
        priority: 'high',
        status: 'pending',
        config: {
          deepVerify: {
            url: 'https://example.com',
            task: 'Persist update test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      jobStore.save(job);
      const updatedJob = jobStore.update('persist-update', {
        status: 'completed', // Use completed instead of running to avoid recovery
        progress: 'Updated',
      });

      expect(updatedJob?.status).toBe('completed');
      expect(updatedJob?.progress).toBe('Updated');

      // Create new instance to test persistence
      const newJobStore = new JobStore(tempDir);
      const retrieved = newJobStore.get('persist-update');

      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.progress).toBe('Updated');
    });
  });

  describe('deleteJob', () => {
    test('should delete existing job', () => {
      const job: Job = {
        id: 'delete-test',
        type: 'fast',
        priority: 'normal',
        status: 'pending',
        config: {
          fastVerify: {
            url: 'https://example.com',
            name: 'Delete Test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      jobStore.save(job);
      expect(jobStore.get('delete-test')).toBeDefined();

      const deleted = jobStore.delete('delete-test');
      expect(deleted).toBe(true);
      expect(jobStore.get('delete-test')).toBeUndefined();
    });

    test('should return false for non-existent job', () => {
      const deleted = jobStore.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('listJobs', () => {
    beforeEach(() => {
      // Create test jobs
      const jobs: Job[] = [
        {
          id: 'job-1',
          type: 'fast',
          priority: 'high',
          status: 'pending',
          config: {
            fastVerify: {
              url: 'https://example.com',
              name: 'Job 1',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'job-2',
          type: 'deep',
          priority: 'normal',
          status: 'running',
          config: {
            deepVerify: {
              url: 'https://example.com',
              task: 'Job 2',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date('2024-01-01T11:00:00Z'),
        },
        {
          id: 'job-3',
          type: 'intelligent',
          priority: 'low',
          status: 'completed',
          config: {
            intelligentVerify: {
              target: {
                url: 'https://example.com',
                name: 'Job 3',
              },
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          id: 'job-4',
          type: 'fast',
          priority: 'normal',
          status: 'pending',
          config: {
            fastVerify: {
              url: 'https://example.com',
              name: 'Job 4',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date('2024-01-01T13:00:00Z'),
        },
      ];

      jobs.forEach(job => jobStore.save(job));
    });

    test('should list all jobs', () => {
      const jobs = jobStore.list();
      expect(jobs).toHaveLength(4);
    });

    test('should filter by status', () => {
      const pendingJobs = jobStore.list({ status: 'pending' });
      expect(pendingJobs).toHaveLength(2);
      expect(pendingJobs.every(j => j.status === 'pending')).toBe(true);
    });

    test('should filter by type', () => {
      const fastJobs = jobStore.list({ type: 'fast' });
      expect(fastJobs).toHaveLength(2);
      expect(fastJobs.every(j => j.type === 'fast')).toBe(true);
    });

    test('should filter by priority', () => {
      const highJobs = jobStore.list({ priority: 'high' });
      expect(highJobs).toHaveLength(1);
      expect(highJobs[0].priority).toBe('high');
    });

    test('should apply pagination', () => {
      const paginatedJobs = jobStore.list({ offset: 1, limit: 2 });
      expect(paginatedJobs).toHaveLength(2);
    });

    test('should sort by creation time (newest first)', () => {
      const jobs = jobStore.list();
      const times = jobs.map(j => j.createdAt.getTime());
      const sortedTimes = [...times].sort((a, b) => b - a);
      expect(times).toEqual(sortedTimes);
    });
  });

  describe('countByStatus', () => {
    test('should count jobs by status', () => {
      const jobs: Job[] = [
        {
          id: 'pending-1',
          type: 'fast',
          priority: 'normal',
          status: 'pending',
          config: {
            fastVerify: {
              url: 'https://example.com',
              name: 'Pending 1',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        {
          id: 'pending-2',
          type: 'deep',
          priority: 'normal',
          status: 'pending',
          config: {
            deepVerify: {
              url: 'https://example.com',
              task: 'Pending 2',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        {
          id: 'running-1',
          type: 'fast',
          priority: 'normal',
          status: 'running',
          config: {
            fastVerify: {
              url: 'https://example.com',
              name: 'Running 1',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        {
          id: 'completed-1',
          type: 'intelligent',
          priority: 'normal',
          status: 'completed',
          config: {
            intelligentVerify: {
              target: {
                url: 'https://example.com',
                name: 'Completed 1',
              },
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
      ];

      jobs.forEach(job => jobStore.save(job));

      const stats = jobStore.countByStatus();
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
    });

    test('should return zero counts for empty store', () => {
      const stats = jobStore.countByStatus();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
    });
  });

  describe('job recovery', () => {
    test('should reset running jobs to pending on load', () => {
      const job: Job = {
        id: 'recovery-test',
        type: 'fast',
        priority: 'normal',
        status: 'running',
        config: {
          fastVerify: {
            url: 'https://example.com',
            name: 'Recovery Test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        startedAt: new Date(),
        progress: 'Running...',
      };

      jobStore.save(job);

      // Create new instance - should reset running jobs
      const newJobStore = new JobStore(tempDir);
      const recovered = newJobStore.get('recovery-test');

      expect(recovered?.status).toBe('pending');
      expect(recovered?.startedAt).toBeUndefined();
      expect(recovered?.progress).toBe('Job was interrupted - pending retry');
    });
  });

  describe('clear', () => {
    test('should clear all jobs', () => {
      const jobs: Job[] = [
        {
          id: 'clear-1',
          type: 'fast',
          priority: 'normal',
          status: 'pending',
          config: {
            fastVerify: {
              url: 'https://example.com',
              name: 'Clear 1',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        {
          id: 'clear-2',
          type: 'deep',
          priority: 'normal',
          status: 'pending',
          config: {
            deepVerify: {
              url: 'https://example.com',
              task: 'Clear 2',
            },
          },
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
      ];

      jobs.forEach(job => jobStore.save(job));
      expect(jobStore.list()).toHaveLength(2);

      jobStore.clear();
      expect(jobStore.list()).toHaveLength(0);
    });
  });

  describe('serialization', () => {
    test('should handle date serialization correctly', () => {
      const now = new Date();
      const job: Job = {
        id: 'date-test',
        type: 'fast',
        priority: 'normal',
        status: 'pending',
        config: {
          fastVerify: {
            url: 'https://example.com',
            name: 'Date Test',
          },
        },
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        startedAt: new Date(now.getTime() + 1000),
        completedAt: new Date(now.getTime() + 5000),
      };

      jobStore.save(job);

      // Create new instance to test serialization/deserialization
      const newJobStore = new JobStore(tempDir);
      const retrieved = newJobStore.get('date-test');

      expect(retrieved?.createdAt).toEqual(now);
      expect(retrieved?.startedAt).toEqual(new Date(now.getTime() + 1000));
      expect(retrieved?.completedAt).toEqual(new Date(now.getTime() + 5000));
    });
  });
});
