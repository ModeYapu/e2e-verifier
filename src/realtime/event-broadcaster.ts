/**
 * Event Broadcaster
 *
 * Translates job-lifecycle and progress events into RealtimeMessage pushes
 * over the WebSocket server. The dashboard subscribes to these to update
 * job cards, progress bars and screenshot galleries in real time.
 *
 * It is intentionally decoupled from the Scheduler: callers feed it events
 * (or wire EventEmitter listeners onto it), and it formats + broadcasts them.
 */

import type { WebSocketServer, RealtimeMessage } from './websocket-server';
import type { Job } from '../scheduler/types';
import { logger } from '../utils/logger';

/** Stable event type names consumed by the dashboard. */
export type RealtimeEventType =
  | 'job.status'
  | 'job.progress'
  | 'screenshot.completed'
  | 'scheduler.status'
  | 'system.info';

export interface JobStatusPayload {
  jobId: string;
  type: string;
  status: string;
  siteName?: string;
  url?: string;
  passed?: boolean;
  error?: string;
  progress?: string;
  retryCount?: number;
}

export interface JobProgressPayload {
  jobId: string;
  percent: number; // 0-100
  message?: string;
}

export interface ScreenshotPayload {
  jobId: string;
  name: string;
  path: string;
  viewport?: string;
  timestamp: string;
}

export class EventBroadcaster {
  /** Total messages broadcast (for stats / health). */
  private messagesSent = 0;

  constructor(private ws: WebSocketServer) {}

  /** Total events pushed since creation. */
  get sentCount(): number {
    return this.messagesSent;
  }

  /** Low-level emit: stamp and broadcast a single event. */
  broadcast(type: RealtimeEventType | string, payload: unknown): void {
    const message: RealtimeMessage = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.ws.broadcast(message);
    this.messagesSent++;
  }

  /**
   * Broadcast a job status change. Derives siteName/url from the job config
   * so the dashboard can render context without a follow-up fetch.
   */
  broadcastJobStatus(job: Job): void {
    const payload: JobStatusPayload = {
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      retryCount: job.retryCount,
      siteName: this.deriveSiteName(job),
      url: this.deriveUrl(job),
      passed: this.derivePassed(job),
      error: job.error,
    };
    this.broadcast('job.status', payload);
  }

  /**
   * Broadcast a progress update as an explicit percentage (0-100).
   * Clamps to [0, 100].
   */
  broadcastProgress(jobId: string, percent: number, message?: string): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const payload: JobProgressPayload = { jobId, percent: clamped, message };
    this.broadcast('job.progress', payload);
  }

  /** Broadcast that a screenshot for a job has been captured. */
  broadcastScreenshot(jobId: string, screenshot: Omit<ScreenshotPayload, 'jobId'>): void {
    this.broadcast('screenshot.completed', { jobId, ...screenshot });
  }

  /** Broadcast scheduler status (running state, worker utilization). */
  broadcastSchedulerStatus(status: {
    running: boolean;
    activeWorkers: number;
    availableWorkers: number;
    queueStats: unknown;
  }): void {
    this.broadcast('scheduler.status', status);
  }

  /** Broadcast an informational/system message. */
  broadcastInfo(message: string): void {
    this.broadcast('system.info', { message });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private deriveSiteName(job: Job): string | undefined {
    const cfg = job.config;
    return (
      cfg.fastVerify?.name ??
      cfg.deepVerify?.task ??
      cfg.intelligentVerify?.target.name ??
      cfg.orchestratedVerify?.sites?.[0]?.name
    );
  }

  private deriveUrl(job: Job): string | undefined {
    const cfg = job.config;
    return (
      cfg.fastVerify?.url ??
      cfg.deepVerify?.url ??
      cfg.intelligentVerify?.target.url ??
      cfg.orchestratedVerify?.sites?.[0]?.url ??
      cfg.url
    );
  }

  private derivePassed(job: Job): boolean | undefined {
    const result = job.result as { passed?: boolean } | undefined;
    return result?.passed;
  }

  /**
   * Convenience: attach listeners to a Scheduler-like EventEmitter so that
   * job.started / job.completed / job.failed automatically broadcast.
   * Returns a detach function that removes the listeners.
   */
  attachToScheduler(scheduler: {
    on: (event: string, listener: (job: Job) => void) => unknown;
    off?: (event: string, listener: (job: Job) => void) => unknown;
    removeListener?: (event: string, listener: (job: Job) => void) => unknown;
  }): () => void {
    const onStarted = (job: Job) => {
      this.broadcastJobStatus(job);
      this.broadcastProgress(job.id, 5, job.progress ?? 'Job started');
    };
    const onCompleted = (job: Job) => {
      this.broadcastJobStatus(job);
      this.broadcastProgress(job.id, 100, 'Job completed');
    };
    const onFailed = (job: Job) => {
      this.broadcastJobStatus(job);
    };

    scheduler.on('job.started', onStarted);
    scheduler.on('job.completed', onCompleted);
    scheduler.on('job.failed', onFailed);

    return () => {
      const off = scheduler.off ?? scheduler.removeListener;
      if (off) {
        off.call(scheduler, 'job.started', onStarted);
        off.call(scheduler, 'job.completed', onCompleted);
        off.call(scheduler, 'job.failed', onFailed);
      }
    };
  }
}
