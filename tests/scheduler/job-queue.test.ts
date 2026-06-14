/**
 * JobQueue unit tests (in-memory, priority-based FIFO implementation)
 *
 * Tests enqueue/dequeue priority ordering, lifecycle transitions
 * (cancel, updateStatus, updateResult, updateError), and stats.
 */

import { JobQueue, Job, JobStatus } from '../../src/scheduler/job-queue';

describe('JobQueue (in-memory)', () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  describe('enqueue / dequeue', () => {
    test('should enqueue a job and auto-generate an id', () => {
      const id = queue.enqueue({ type: 'fast', payload: { a: 1 }, priority: 0 });
      expect(id).toMatch(/^job-\d+-\d+$/);
      expect(queue.get(id)).toBeDefined();
      expect(queue.get(id)!.status).toBe('queued');
      expect(queue.get(id)!.type).toBe('fast');
      expect(queue.get(id)!.payload).toEqual({ a: 1 });
    });

    test('should preserve a caller-supplied id', () => {
      const id = queue.enqueue({ id: 'custom-id', type: 'deep', payload: {}, priority: 0 });
      expect(id).toBe('custom-id');
      expect(queue.get('custom-id')).toBeDefined();
    });

    test('should default priority to 0 when not provided', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: undefined as unknown as number });
      expect(queue.get(id)!.priority).toBe(0);
    });

    test('should default createdAt to an ISO timestamp', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      const createdAt = queue.get(id)!.createdAt;
      expect(() => new Date(createdAt).toISOString()).not.toThrow();
      expect(new Date(createdAt).toString()).not.toBe('Invalid Date');
    });

    test('should return undefined when dequeuing an empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    test('should return undefined when no queued jobs remain', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'running');
      expect(queue.dequeue()).toBeUndefined();
    });

    test('should dequeue the highest priority job first', () => {
      const low = queue.enqueue({ type: 'fast', payload: { tag: 'low' }, priority: 1 });
      const high = queue.enqueue({ type: 'fast', payload: { tag: 'high' }, priority: 10 });
      const mid = queue.enqueue({ type: 'fast', payload: { tag: 'mid' }, priority: 5 });

      // dequeue does not mutate status, so mark each dequeued job non-queued
      // before asking for the next one.
      expect(queue.dequeue()!.id).toBe(high);
      queue.updateStatus(high, 'running');
      expect(queue.dequeue()!.id).toBe(mid);
      queue.updateStatus(mid, 'running');
      expect(queue.dequeue()!.id).toBe(low);
      queue.updateStatus(low, 'running');
      expect(queue.dequeue()).toBeUndefined();

      // ensure original entries still exist (dequeue does not remove)
      expect(queue.get(low)).toBeDefined();
    });

    test('should preserve FIFO order within the same priority', () => {
      const first = queue.enqueue({ type: 'fast', payload: {}, priority: 5, createdAt: '2024-01-01T00:00:00.000Z' });
      const second = queue.enqueue({ type: 'fast', payload: {}, priority: 5, createdAt: '2024-01-02T00:00:00.000Z' });
      const third = queue.enqueue({ type: 'fast', payload: {}, priority: 5, createdAt: '2024-01-03T00:00:00.000Z' });

      expect(queue.dequeue()!.id).toBe(first);
      queue.updateStatus(first, 'running');
      expect(queue.dequeue()!.id).toBe(second);
      queue.updateStatus(second, 'running');
      expect(queue.dequeue()!.id).toBe(third);
    });
  });

  describe('cancel', () => {
    test('should cancel a queued job', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      expect(queue.cancel(id)).toBe(true);
      expect(queue.get(id)!.status).toBe('cancelled');
      expect(queue.get(id)!.completedAt).toBeDefined();
    });

    test('should cancel a running job', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'running');
      expect(queue.cancel(id)).toBe(true);
      expect(queue.get(id)!.status).toBe('cancelled');
    });

    test('should return false for a non-existent job', () => {
      expect(queue.cancel('does-not-exist')).toBe(false);
    });

    test('should not cancel an already-completed job', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'completed');
      expect(queue.cancel(id)).toBe(false);
      expect(queue.get(id)!.status).toBe('completed');
    });

    test('should not cancel an already-failed job', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'failed');
      expect(queue.cancel(id)).toBe(false);
    });
  });

  describe('updateStatus', () => {
    test('should set startedAt when transitioning to running', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'running');
      expect(queue.get(id)!.startedAt).toBeDefined();
    });

    test('should not overwrite startedAt on subsequent updates', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'running');
      const first = queue.get(id)!.startedAt;
      queue.updateStatus(id, 'running');
      expect(queue.get(id)!.startedAt).toBe(first);
    });

    test('should set completedAt for terminal states', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(id, 'completed');
      expect(queue.get(id)!.completedAt).toBeDefined();
    });

    test('should be a no-op for an unknown job', () => {
      expect(() => queue.updateStatus('ghost', 'completed')).not.toThrow();
    });
  });

  describe('updateResult', () => {
    test('should store the result and mark the job completed', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateResult(id, { passed: true });
      const job = queue.get(id)!;
      expect(job.result).toEqual({ passed: true });
      expect(job.status).toBe('completed');
      expect(job.completedAt).toBeDefined();
    });
  });

  describe('updateError', () => {
    test('should store the error and mark the job failed', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateError(id, 'something broke');
      const job = queue.get(id)!;
      expect(job.error).toBe('something broke');
      expect(job.status).toBe('failed');
      expect(job.completedAt).toBeDefined();
    });
  });

  describe('getQueueStatus', () => {
    test('should count jobs by status and track total created', () => {
      const a = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      const b = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(a, 'running');
      queue.updateResult(b, { ok: true });

      const status = queue.getQueueStatus();
      expect(status.waiting).toBe(1);
      expect(status.running).toBe(1);
      expect(status.completed).toBe(1);
      expect(status.failed).toBe(0);
      expect(status.cancelled).toBe(0);
      expect(status.total).toBe(3);
    });

    test('should keep totalCreated after cancel/complete', () => {
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.cancel(id);
      expect(queue.getQueueStatus().total).toBe(1);
      expect(queue.getQueueStatus().cancelled).toBe(1);
    });
  });

  describe('list', () => {
    test('should return all jobs when no filter is supplied', () => {
      queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.enqueue({ type: 'deep', payload: {}, priority: 0 });
      expect(queue.list().length).toBe(2);
    });

    test('should filter jobs by status', () => {
      const a = queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.updateStatus(a, 'running');
      const running = queue.list('running');
      expect(running.length).toBe(1);
      expect(running[0].id).toBe(a);
    });
  });

  describe('clear', () => {
    test('should remove all jobs and reset the total counter', () => {
      queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.enqueue({ type: 'fast', payload: {}, priority: 0 });
      queue.clear();
      expect(queue.list().length).toBe(0);
      expect(queue.getQueueStatus().total).toBe(0);
    });
  });

  describe('integration: priority + lifecycle', () => {
    test('end-to-end enqueue → dequeue → run → complete flow', () => {
      const statuses: JobStatus[] = [];
      const id = queue.enqueue({ type: 'fast', payload: {}, priority: 7 });
      statuses.push(queue.get(id)!.status); // queued

      const dequeued = queue.dequeue()!;
      expect(dequeued.id).toBe(id);
      queue.updateStatus(id, 'running');
      statuses.push(queue.get(id)!.status); // running

      queue.updateResult(id, { ok: true });
      statuses.push(queue.get(id)!.status); // completed

      expect(statuses).toEqual(['queued', 'running', 'completed']);
      expect(queue.getQueueStatus().total).toBe(1);
    });
  });
});
