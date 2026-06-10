/**
 * Webhook delivery service
 * Handles sending webhook notifications with HMAC-SHA256 signatures and retry logic
 */

import { WebhookConfig } from '../config/webhook-config';
import { Job, JobStatus } from '../scheduler/types';
import * as crypto from 'crypto';

/**
 * Webhook event types
 */
export type WebhookEventType = 'job.completed' | 'job.failed' | 'job.started';

/**
 * Webhook payload interface
 */
export interface WebhookPayload {
  event: WebhookEventType;
  job_id: string;
  status: JobStatus;
  result_summary?: {
    passed?: boolean;
    total_checks?: number;
    failed_checks?: number;
    duration?: number;
    error?: string;
  };
  timestamp: string;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
}

/**
 * Webhook delivery service
 */
export class WebhookDelivery {
  private retryDelays: number[] = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

  /**
   * Send webhook notification
   */
  async send(event: WebhookEventType, job: Job, config: WebhookConfig): Promise<WebhookDeliveryResult> {
    const payload = this.createPayload(event, job);
    const signature = this.generateSignature(payload, config.secret);

    let lastError: string | undefined;
    let statusCode: number | undefined;

    for (let attempt = 0; attempt < this.retryDelays.length + 1; attempt++) {
      try {
        const response = await this.deliver(config.url, payload, signature);

        if (response.ok) {
          console.log(`[Webhook] Successfully delivered ${event} for job ${job.id} to ${config.url}`);
          return {
            success: true,
            statusCode: response.status,
            attempts: attempt + 1
          };
        }

        statusCode = response.status;
        lastError = `HTTP ${response.status}: ${response.statusText}`;

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.error(`[Webhook] Client error ${response.status} for job ${job.id} - not retrying`);
          break;
        }

        // Retry on server errors (5xx) and rate limit (429)
        if (attempt < this.retryDelays.length) {
          const delay = this.retryDelays[attempt];
          console.log(`[Webhook] Attempt ${attempt + 1} failed for job ${job.id}, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`[Webhook] Attempt ${attempt + 1} failed for job ${job.id}:`, lastError);

        if (attempt < this.retryDelays.length) {
          const delay = this.retryDelays[attempt];
          await this.sleep(delay);
        }
      }
    }

    console.error(`[Webhook] Failed to deliver ${event} for job ${job.id} after ${this.retryDelays.length + 1} attempts`);

    return {
      success: false,
      statusCode,
      error: lastError,
      attempts: this.retryDelays.length + 1
    };
  }

  /**
   * Create webhook payload
   */
  private createPayload(event: WebhookEventType, job: Job): WebhookPayload {
    const result_summary: WebhookPayload['result_summary'] = {
      duration: job.startedAt && job.completedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : undefined
    };

    if (job.status === 'completed' && job.result) {
      // Extract summary from result
      if (typeof job.result === 'object' && 'passed' in job.result) {
        result_summary.passed = (job.result as any).passed;
        result_summary.total_checks = (job.result as any).totalChecks;
        result_summary.failed_checks = (job.result as any).failedChecks;
      }
    }

    if (job.status === 'failed' && job.error) {
      result_summary.error = job.error;
    }

    return {
      event,
      job_id: job.id,
      status: job.status,
      result_summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  private generateSignature(payload: WebhookPayload, secret: string): string {
    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Deliver webhook via HTTP POST
   */
  private async deliver(url: string, payload: WebhookPayload, signature: string): Promise<Response> {
    const payloadString = JSON.stringify(payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'e2e-verifier-webhook/1.0',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp
      },
      body: payloadString
    });

    return response;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send test webhook
   */
  async sendTest(config: WebhookConfig): Promise<WebhookDeliveryResult> {
    const testJob: Job = {
      id: crypto.randomUUID(),
      type: 'fast',
      config: {},
      status: 'completed',
      priority: 'normal',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      result: {
        passed: true,
        totalChecks: 5,
        failedChecks: 0
      }
    };

    return this.send('job.completed', testJob, config);
  }
}