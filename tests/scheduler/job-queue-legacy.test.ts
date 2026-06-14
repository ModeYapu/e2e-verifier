/**
 * JobQueue (legacy EventEmitter) unit tests
 *
 * Tests the JobQueue backed by a JobStore: createJob, enqueue/dequeue
 * priority ordering, complete/fail event emission, cancel, retry semantics,
 * and getStats.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JobQueue } from '../../src/scheduler/job-queue-legacy';
import { JobStore } from '../../src/scheduler/job-store';
import { Job } from '../../src/scheduler/types';

function makeConfig(): Job['config'] {
  return { fastVerify: { url: 'https://example.com', name: 'Example' } };
}

describe('JobQueue (legacy EventEmitter)', () => {
  let tempDir: string;
  let jobStore: JobStore;
  let queue: JobQueue;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-legacy-test-'));
    jobStore = new JobStore(tempDir);
    queue = new JobQueue(jobStore);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createJob', () => {
    test('should build a job with default priority and retries', () => {
      const job = queue.createJob('fast', makeConfig());
      expect(job.id).toMatch(/^job-/);
      expect(job.status).toBe('pending');
      expect(job.priority).toBe('normal');
      expect(job.maxRetries).toBe(3);
      expect(job.retryCount).toBe(0);
      expect(job.progress).toBe('Job created');
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    test('should respect priority, maxRetries and timeout overrides', () => {
      const job = queue.createJob('deep', makeConfig(), 'high', 5, 12000);
      expect(job.priority).toBe('high');
      expect(job.maxRetries).toBe(5);
      expect(job.timeout).toBe(12000);
    });

    test('should produce unique ids', () => {
      const a = queue.createJob('fast', makeConfig());
      const b = queue.createJob('fast', makeConfig());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('enqueue / dequeue', () => {
    test('enqueue should persist a pending job', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      expect(jobStore.get(job.id)).toBeDefined();
      expect(jobStore.get(job.id)!.status).toBe('pending');
    });

    test('dequeue should return null when there are no pending jobs', () => {
      expect(queue.dequeue()).toBeNull();
    });

    test('dequeue should return pending jobs and flip status to queued', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      const dequeued = queue.dequeue();
      expect(dequeued).not.toBeNull();
      expect(dequeued!.id).toBe(job.id);
      expect(jobStore.get(job.id)!.status).toBe('queued');
    });

    test('dequeue should honor priority order (high > normal > low)', () => {
      const low = queue.createJob('fast', makeConfig(), 'low');
      const high = queue.createJob('fast', makeConfig(), 'high');
      const normal = queue.createJob('fast', makeConfig(), 'normal');
      // stagger creation times so FIFO is deterministic within a priority
      low.createdAt = new Date(Date.now() - 3000);
      normal.createdAt = new Date(Date.now() - 2000);
      high.createdAt = new Date(Date.now() - 1000);
      queue.enqueue(low);
      queue.enqueue(high);
      queue.enqueue(normal);

      expect(queue.dequeue()!.id).toBe(high.id);
      expect(queue.dequeue()!.id).toBe(normal.id);
      expect(queue.dequeue()!.id).toBe(low.id);
    });

    test('dequeue should use FIFO within the same priority', () => {
      const first = queue.createJob('fast', makeConfig(), 'normal');
      first.createdAt = new Date(Date.now() - 1000);
      const second = queue.createJob('fast', makeConfig(), 'normal');
      second.createdAt = new Date(Date.now());
      queue.enqueue(first);
      queue.enqueue(second);

      expect(queue.dequeue()!.id).toBe(first.id);
      expect(queue.dequeue()!.id).toBe(second.id);
    });
  });

  describe('complete', () => {
    test('should set result, status and completedAt', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      queue.complete(job.id, { passed: true } as any);

      const stored = jobStore.get(job.id)!;
      expect(stored.status).toBe('completed');
      expect(stored.result).toEqual({ passed: true });
      expect(stored.completedAt).toBeInstanceOf(Date);
      expect(stored.progress).toContain('completed');
    });

    test('should emit job.completed event with the updated job', () => {
      const handler = jest.fn();
      queue.on('job.completed', handler);
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      queue.complete(job.id, { passed: true } as any);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].id).toBe(job.id);
    });

    test('should be a no-op for an unknown job id', () => {
      const handler = jest.fn();
      queue.on('job.completed', handler);
      expect(() => queue.complete('ghost', {} as any)).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('fail', () => {
    test('should set error and emit job.failed', () => {
      const handler = jest.fn();
      queue.on('job.failed', handler);

      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      queue.fail(job.id, 'boom');

      const stored = jobStore.get(job.id)!;
      expect(stored.status).toBe('failed');
      expect(stored.error).toBe('boom');
      expect(stored.completedAt).toBeInstanceOf(Date);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].id).toBe(job.id);
    });
  });

  describe('cancel', () => {
    test('should cancel a pending job', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      expect(queue.cancel(job.id)).toBe(true);
      expect(jobStore.get(job.id)!.status).toBe('cancelled');
    });

    test('should cancel a queued job', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      queue.dequeue(); // flips to queued
      expect(queue.cancel(job.id)).toBe(true);
      expect(jobStore.get(job.id)!.status).toBe('cancelled');
    });

    test('should refuse to cancel a running job', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      jobStore.update(job.id, { status: 'running' });
      expect(queue.cancel(job.id)).toBe(false);
    });

    test('should return false for unknown job', () => {
      expect(queue.cancel('ghost')).toBe(false);
    });
  });

  describe('retryJob', () => {
    test('should reset a failed job to pending and bump retryCount', () => {
      const job = queue.createJob('fast', makeConfig(), 'normal', 3);
      queue.enqueue(job);
      queue.fail(job.id, 'transient');

      const retried = queue.retryJob(job.id);
      expect(retried).not.toBeNull();
      expect(retried!.status).toBe('pending');
      expect(retried!.retryCount).toBe(1);
      expect(retried!.error).toBeUndefined();
    });

    test('should refuse to retry a non-failed job', () => {
      const job = queue.createJob('fast', makeConfig());
      queue.enqueue(job);
      expect(queue.retryJob(job.id)).toBeNull();
    });

    test('should refuse to retry once max retries is reached', () => {
      const job = queue.createJob('fast', makeConfig(), 'normal', 1);
      queue.enqueue(job);
      queue.fail(job.id, 'err');
      queue.retryJob(job.id); // retryCount -> 1 (== maxRetries)
      queue.fail(job.id, 'err again');
      expect(queue.retryJob(job.id)).toBeNull();
    });

    test('should return null for an unknown job', () => {
      expect(queue.retryJob('ghost')).toBeNull();
    });
  });

  describe('getStats', () => {
    test('should reflect counts by status from the store', () => {
      const a = queue.createJob('fast', makeConfig());
      const b = queue.createJob('fast', makeConfig());
      queue.enqueue(a);
      queue.enqueue(b);
      queue.complete(a.id, {} as any);
      queue.fail(b.id, 'err');

      const stats = queue.getStats() as ReturnType<JobStore['countByStatus']>;
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});
