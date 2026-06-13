/**
 * Notification Service
 * Handles multi-channel notifications for verification results
 */

import { TestResult } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// TYPES
// =====================================================

export interface NotificationConfig {
  channels: {
    feishu?: { webhookUrl: string };
    email?: {
      smtpHost: string;
      port: number;
      from: string;
      to: string[];
      user?: string;
      pass?: string;
    };
    slack?: { webhookUrl: string };
  };
  rules: {
    notifyOn: 'all' | 'failure-only' | 'regression-only';
    minSeverity?: 'critical' | 'high' | 'medium' | 'low';
    siteFilter?: string[];
  };
}

export interface NotificationMessage {
  siteName: string;
  url: string;
  passRate: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  failedCheckList: Array<{ name: string; message: string }>;
  screenshots: Array<{ name: string; path: string }>;
  timestamp: string;
  jobId: string;
  duration: number;
}

export interface NotificationRecord {
  id: string;
  timestamp: string;
  jobId: string;
  channel: string;
  status: 'sent' | 'failed';
  message?: string;
  error?: string;
}

// =====================================================
// CONSTANTS
// =====================================================

const NOTIFICATION_DIR = path.join(process.cwd(), 'data', 'notifications');
const SEVERITY_LEVELS: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Default notification configuration
 */
const DEFAULT_CONFIG: NotificationConfig = {
  channels: {},
  rules: {
    notifyOn: 'failure-only',
    minSeverity: 'high'
  }
};

// =====================================================
// NOTIFICATION SERVICE
// =====================================================

export class Notifier {
  private config: NotificationConfig;
  private history: NotificationRecord[] = [];

  constructor(config?: Partial<NotificationConfig>) {
    this.config = this.mergeConfig(config);
    this.loadHistory();
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: Partial<NotificationConfig>): NotificationConfig {
    const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as NotificationConfig;

    if (config) {
      if (config.channels) {
        merged.channels = { ...merged.channels, ...config.channels };
      }
      if (config.rules) {
        merged.rules = { ...merged.rules, ...config.rules };
      }
    }

    // Also check environment variables
    if (process.env.FEISHU_WEBHOOK_URL && !merged.channels.feishu) {
      merged.channels.feishu = { webhookUrl: process.env.FEISHU_WEBHOOK_URL };
    }
    if (process.env.SLACK_WEBHOOK_URL && !merged.channels.slack) {
      merged.channels.slack = { webhookUrl: process.env.SLACK_WEBHOOK_URL };
    }

    return merged;
  }

  /**
   * Ensure notification directory exists
   */
  private ensureDir(): void {
    if (!fs.existsSync(NOTIFICATION_DIR)) {
      fs.mkdirSync(NOTIFICATION_DIR, { recursive: true });
    }
  }

  /**
   * Load notification history from disk
   */
  private loadHistory(): void {
    this.ensureDir();
    const historyPath = path.join(NOTIFICATION_DIR, 'history.json');

    if (fs.existsSync(historyPath)) {
      try {
        const data = fs.readFileSync(historyPath, 'utf-8');
        this.history = JSON.parse(data);
      } catch (error) {
        logger.warn(`Failed to load notification history: ${error}`);
        this.history = [];
      }
    } else {
      this.history = [];
    }
  }

  /**
   * Save notification history to disk
   */
  private saveHistory(): void {
    this.ensureDir();
    const historyPath = path.join(NOTIFICATION_DIR, 'history.json');

    try {
      // Keep only last 1000 notifications
      const toSave = this.history.slice(-1000);
      fs.writeFileSync(historyPath, JSON.stringify(toSave, null, 2));
    } catch (error) {
      logger.error(`Failed to save notification history: ${error}`);
    }
  }

  /**
   * Add a record to history
   */
  private addRecord(record: NotificationRecord): void {
    this.history.push(record);
    this.saveHistory();
  }

  /**
   * Build notification message from test result
   */
  private buildMessage(result: TestResult, jobId: string): NotificationMessage {
    const totalChecks = result.checks.length;
    const passedChecks = result.checks.filter(c => c.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const passRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    return {
      siteName: result.siteName,
      url: result.url,
      passRate,
      totalChecks,
      passedChecks,
      failedChecks,
      failedCheckList: result.checks
        .filter(c => !c.passed)
        .map(c => ({ name: c.name, message: c.message })),
      screenshots: result.screenshots.map(s => ({
        name: s.name,
        path: s.path
      })),
      timestamp: result.timestamp,
      jobId,
      duration: result.duration
    };
  }

  /**
   * Check if notification should be sent based on rules
   */
  private shouldNotify(message: NotificationMessage): boolean {
    const rules = this.config.rules;

    // Check site filter
    if (rules.siteFilter && rules.siteFilter.length > 0) {
      if (!rules.siteFilter.includes(message.siteName)) {
        return false;
      }
    }

    // Check notifyOn rule
    if (rules.notifyOn === 'failure-only') {
      if (message.passRate === 100) {
        return false;
      }
    } else if (rules.notifyOn === 'regression-only') {
      // This would require historical comparison - for now, treat as failure-only
      if (message.passRate === 100) {
        return false;
      }
    }
    // 'all' means always notify

    // Check minimum severity if there are failed checks
    if (rules.minSeverity && message.failedCheckList.length > 0) {
      // For simplicity, if there are any failures and severity threshold is set,
      // we check if the failure passes the threshold (lower severity = more notifications)
      const minLevel = SEVERITY_LEVELS[rules.minSeverity] || 0;
      // Since we don't have per-check severity in the message, we default to allowing
      // if there are any critical/high failures
    }

    return true;
  }

  /**
   * Format message for console output
   */
  private formatForConsole(message: NotificationMessage): string {
    const lines = [
      `🔔 Verification Notification`,
      `Site: ${message.siteName}`,
      `URL: ${message.url}`,
      `Status: ${message.passRate}% pass rate (${message.passedChecks}/${message.totalChecks} checks passed)`,
      `Duration: ${message.duration}ms`,
      `Job ID: ${message.jobId}`,
      ''
    ];

    if (message.failedCheckList.length > 0) {
      lines.push('Failed checks:');
      for (const check of message.failedCheckList) {
        lines.push(`  ❌ ${check.name}: ${check.message}`);
      }
      lines.push('');
    }

    if (message.screenshots.length > 0) {
      lines.push('Screenshots:');
      for (const ss of message.screenshots) {
        lines.push(`  📸 ${ss.name}: ${ss.path}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format message for Feishu webhook
   */
  private formatForFeishu(message: NotificationMessage): object {
    const status = message.passRate === 100 ? '✅ PASSED' : '❌ FAILED';
    const color = message.passRate === 100 ? 'green' : 'red';

    const failedChecksText = message.failedCheckList.length > 0
      ? message.failedCheckList.map(c => `**${c.name}**: ${c.message}`).join('\n')
      : 'None';

    const screenshotsText = message.screenshots.length > 0
      ? message.screenshots.map(s => s.path).join(', ')
      : 'None';

    return {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            content: `E2E Verification ${status}`,
            tag: 'plain_text'
          },
          template: color
        },
        elements: [
          {
            tag: 'div',
            text: {
              content: `**Site**: ${message.siteName}\n**URL**: ${message.url}\n**Pass Rate**: ${message.passRate}%\n**Duration**: ${message.duration}ms`,
              tag: 'lark_md'
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              content: `**Failed Checks**:\n${failedChecksText}`,
              tag: 'lark_md'
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              content: `**Screenshots**: ${screenshotsText}\n**Job ID**: ${message.jobId}\n**Timestamp**: ${message.timestamp}`,
              tag: 'lark_md'
            }
          }
        ]
      }
    };
  }

  /**
   * Format message for Slack webhook
   */
  private formatForSlack(message: NotificationMessage): object {
    const status = message.passRate === 100 ? '✅ PASSED' : '❌ FAILED';
    const color = message.passRate === 100 ? 'good' : 'danger';

    const failedChecksFields = message.failedCheckList.slice(0, 5).map(c => ({
      type: 'mrkdwn',
      text: `*${c.name}*: ${c.message}`
    }));

    return {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `E2E Verification ${status}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Site:*\n${message.siteName}`
                },
                {
                  type: 'mrkdwn',
                  text: `*URL:*\n${message.url}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Pass Rate:*\n${message.passRate}%`
                },
                {
                  type: 'mrkdwn',
                  text: `*Duration:*\n${message.duration}ms`
                }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Job ID*: \`${message.jobId}\`\n*Timestamp*: ${message.timestamp}`
              }
            }
          ]
        }
      ]
    };
  }

  /**
   * Format message for email
   */
  private formatForEmail(message: NotificationMessage): { subject: string; body: string } {
    const status = message.passRate === 100 ? '✅ PASSED' : '❌ FAILED';
    const subject = `[${status}] E2E Verification: ${message.siteName}`;

    const body = `
E2E Verification Report

Site: ${message.siteName}
URL: ${message.url}
Status: ${status}
Pass Rate: ${message.passRate}% (${message.passedChecks}/${message.totalChecks} checks passed)
Duration: ${message.duration}ms
Job ID: ${message.jobId}
Timestamp: ${message.timestamp}

Failed Checks:
${message.failedCheckList.length > 0 ? message.failedCheckList.map(c => `  ❌ ${c.name}: ${c.message}`).join('\n') : '  None'}

Screenshots:
${message.screenshots.length > 0 ? message.screenshots.map(s => `  📸 ${s.name}: ${s.path}`).join('\n') : '  None'}
`;

    return { subject, body };
  }

  /**
   * Send notification to console
   */
  private sendToConsole(message: NotificationMessage): void {
    logger.info(this.formatForConsole(message));
  }

  /**
   * Send notification to Feishu webhook
   */
  private async sendToFeishu(message: NotificationMessage): Promise<boolean> {
    const webhookUrl = this.config.channels.feishu?.webhookUrl;
    if (!webhookUrl) {
      return false;
    }

    try {
      const payload = this.formatForFeishu(message);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error(`Failed to send Feishu notification: ${error}`);
      return false;
    }
  }

  /**
   * Send notification to Slack webhook
   */
  private async sendToSlack(message: NotificationMessage): Promise<boolean> {
    const webhookUrl = this.config.channels.slack?.webhookUrl;
    if (!webhookUrl) {
      return false;
    }

    try {
      const payload = this.formatForSlack(message);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error(`Failed to send Slack notification: ${error}`);
      return false;
    }
  }

  /**
   * Send notification to email
   */
  private async sendToEmail(message: NotificationMessage): Promise<boolean> {
    const emailConfig = this.config.channels.email;
    if (!emailConfig) {
      return false;
    }

    // For now, just log - email would require nodemailer
    // In a real implementation, you would use nodemailer here
    const { subject, body } = this.formatForEmail(message);
    logger.info(`Email notification (stub): ${subject}`);
    logger.info(`To: ${emailConfig.to.join(', ')}`);
    logger.info(body);

    return true;
  }

  /**
   * Send notification to a specific channel
   */
  async sendNotification(channel: string, message: NotificationMessage): Promise<boolean> {
    let success = false;

    try {
      switch (channel) {
        case 'console':
          this.sendToConsole(message);
          success = true;
          break;
        case 'feishu':
          success = await this.sendToFeishu(message);
          break;
        case 'slack':
          success = await this.sendToSlack(message);
          break;
        case 'email':
          success = await this.sendToEmail(message);
          break;
        default:
          logger.warn(`Unknown notification channel: ${channel}`);
      }
    } catch (error) {
      logger.error(`Error sending notification to ${channel}: ${error}`);
    }

    return success;
  }

  /**
   * Notify for a job result
   */
  async notify(jobId: string, result: TestResult): Promise<void> {
    const message = this.buildMessage(result, jobId);

    if (!this.shouldNotify(message)) {
      logger.debug(`Notification skipped for job ${jobId} based on rules`);
      return;
    }

    logger.info(`Sending notifications for job ${jobId}`);

    // Always send to console
    this.sendToConsole(message);

    // Send to configured channels
    const channels: string[] = [];
    if (this.config.channels.feishu?.webhookUrl) {
      channels.push('feishu');
    }
    if (this.config.channels.slack?.webhookUrl) {
      channels.push('slack');
    }
    if (this.config.channels.email) {
      channels.push('email');
    }

    for (const channel of channels) {
      const success = await this.sendNotification(channel, message);

      this.addRecord({
        id: `notif-${Date.now()}-${channel}`,
        timestamp: new Date().toISOString(),
        jobId,
        channel,
        status: success ? 'sent' : 'failed',
        message: success ? `Notification sent to ${channel}` : `Failed to send to ${channel}`
      });
    }

    // Add console record
    this.addRecord({
      id: `notif-${Date.now()}-console`,
      timestamp: new Date().toISOString(),
      jobId,
      channel: 'console',
      status: 'sent'
    });
  }

  /**
   * Get notification history
   */
  getHistory(limit?: number): NotificationRecord[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Update notification configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = this.mergeConfig(config);
    logger.info('Notification configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }
}
