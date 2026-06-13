/**
 * Notifier Tests
 */

import { Notifier, NotificationConfig, NotificationMessage } from '../src/services/notifier';
import { TestResult } from '../src/types';

// Mock fetch for webhook calls
global.fetch = jest.fn();

describe('Notifier', () => {
  let notifier: Notifier;
  let mockTestResult: TestResult;

  beforeEach(() => {
    jest.clearAllMocks();

    notifier = new Notifier({
      channels: {
        feishu: { webhookUrl: 'https://feishu.example.com/webhook' },
        slack: { webhookUrl: 'https://slack.example.com/webhook' },
      },
      rules: {
        notifyOn: 'all',
        minSeverity: 'high'
      }
    });

    mockTestResult = {
      siteName: 'Test Site',
      url: 'https://example.com',
      timestamp: '2024-01-01T12:00:00Z',
      passed: false,
      duration: 5000,
      checks: [
        { name: 'Status Check', type: 'status', passed: true, message: '200 OK' },
        { name: 'Title Check', type: 'title', passed: false, message: 'Title mismatch' },
        { name: 'Console Check', type: 'console', passed: false, message: 'Console error found' },
      ],
      screenshots: [
        { name: 'homepage', path: '/screenshots/home.png', viewport: 'desktop', timestamp: '2024-01-01T12:00:00Z' }
      ],
      errors: []
    };
  });

  describe('configuration', () => {
    test('should use default configuration when none provided', () => {
      const defaultNotifier = new Notifier();
      const config = defaultNotifier.getConfig();

      expect(config.rules.notifyOn).toBe('failure-only');
      expect(config.rules.minSeverity).toBe('high');
      expect(Object.keys(config.channels)).toHaveLength(0);
    });

    test('should merge user config with defaults', () => {
      const config = notifier.getConfig();

      expect(config.channels.feishu).toBeDefined();
      expect(config.channels.slack).toBeDefined();
      expect(config.rules.notifyOn).toBe('all');
    });

    test('should update configuration', () => {
      notifier.updateConfig({
        rules: {
          notifyOn: 'failure-only'
        }
      });

      const config = notifier.getConfig();
      expect(config.rules.notifyOn).toBe('failure-only');
    });
  });

  describe('notification rules', () => {
    test('should notify for all results when notifyOn is "all"', () => {
      notifier.updateConfig({ rules: { notifyOn: 'all' } });

      const message = notifier['buildMessage'](mockTestResult, 'job-1');
      const shouldNotify = notifier['shouldNotify'](message);

      expect(shouldNotify).toBe(true);
    });

    test('should not notify for passed results when notifyOn is "failure-only"', () => {
      notifier.updateConfig({ rules: { notifyOn: 'failure-only' } });

      const passedResult: TestResult = {
        ...mockTestResult,
        passed: true,
        checks: [
          { name: 'Status Check', type: 'status', passed: true, message: 'OK' },
          { name: 'Title Check', type: 'title', passed: true, message: 'OK' }
        ]
      };

      const message = notifier['buildMessage'](passedResult, 'job-1');
      const shouldNotify = notifier['shouldNotify'](message);

      expect(shouldNotify).toBe(false);
    });

    test('should notify for failed results when notifyOn is "failure-only"', () => {
      notifier.updateConfig({ rules: { notifyOn: 'failure-only' } });

      const message = notifier['buildMessage'](mockTestResult, 'job-1');
      const shouldNotify = notifier['shouldNotify'](message);

      expect(shouldNotify).toBe(true);
    });

    test('should respect site filter', () => {
      notifier.updateConfig({
        rules: {
          notifyOn: 'all',
          siteFilter: ['allowed-site.com']
        }
      });

      const message = notifier['buildMessage'](mockTestResult, 'job-1');
      const shouldNotify = notifier['shouldNotify'](message);

      expect(shouldNotify).toBe(false);
    });

    test('should allow notification for sites in filter', () => {
      const filteredResult = { ...mockTestResult, siteName: 'allowed-site.com' };

      notifier.updateConfig({
        rules: {
          notifyOn: 'all',
          siteFilter: ['allowed-site.com']
        }
      });

      const message = notifier['buildMessage'](filteredResult, 'job-1');
      const shouldNotify = notifier['shouldNotify'](message);

      expect(shouldNotify).toBe(true);
    });
  });

  describe('message formatting', () => {
    test('should build correct message from test result', () => {
      const message = notifier['buildMessage'](mockTestResult, 'job-123');

      expect(message.siteName).toBe('Test Site');
      expect(message.url).toBe('https://example.com');
      expect(message.jobId).toBe('job-123');
      expect(message.totalChecks).toBe(3);
      expect(message.passedChecks).toBe(1);
      expect(message.failedChecks).toBe(2);
      expect(message.passRate).toBe(33);
    });

    test('should format console message correctly', () => {
      const message = notifier['buildMessage'](mockTestResult, 'job-123');
      const consoleMsg = notifier['formatForConsole'](message);

      expect(consoleMsg).toContain('Verification Notification');
      expect(consoleMsg).toContain('Test Site');
      expect(consoleMsg).toContain('33%');
      expect(consoleMsg).toContain('Failed checks:');
      expect(consoleMsg).toContain('Title Check');
    });

    test('should format Feishu message correctly', () => {
      const message = notifier['buildMessage'](mockTestResult, 'job-123');
      const feishuMsg = notifier['formatForFeishu'](message);

      expect(feishuMsg).toHaveProperty('msg_type', 'interactive');
      expect(feishuMsg).toHaveProperty('card');
      expect(feishuMsg.card.header).toBeDefined();
    });

    test('should format Slack message correctly', () => {
      const message = notifier['buildMessage'](mockTestResult, 'job-123');
      const slackMsg = notifier['formatForSlack'](message);

      expect(slackMsg).toHaveProperty('attachments');
      expect(Array.isArray(slackMsg.attachments)).toBe(true);
      expect(slackMsg.attachments[0]).toHaveProperty('color');
      expect(slackMsg.attachments[0]).toHaveProperty('blocks');
    });

    test('should format email message correctly', () => {
      const message = notifier['buildMessage'](mockTestResult, 'job-123');
      const emailMsg = notifier['formatForEmail'](message);

      expect(emailMsg).toHaveProperty('subject');
      expect(emailMsg).toHaveProperty('body');
      expect(emailMsg.subject).toContain('Test Site');
      expect(emailMsg.body).toContain('Test Site');
    });
  });

  describe('sending notifications', () => {
    test('should always send to console', async () => {
      const consoleSpy = jest.spyOn(logger, 'info');

      await notifier.notify('job-1', mockTestResult);

      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should send to Feishu when configured', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await notifier.notify('job-1', mockTestResult);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://feishu.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    test('should send to Slack when configured', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await notifier.notify('job-1', mockTestResult);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.example.com/webhook',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    test('should handle webhook failures gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(notifier.notify('job-1', mockTestResult)).resolves.not.toThrow();
    });
  });

  describe('notification history', () => {
    test('should track notification history', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await notifier.notify('job-1', mockTestResult);

      const history = notifier.getHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1]).toHaveProperty('jobId', 'job-1');
      expect(history[history.length - 1]).toHaveProperty('channel');
    });

    test('should respect limit parameter for history', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await notifier.notify('job-1', mockTestResult);
      await notifier.notify('job-2', mockTestResult);

      const limitedHistory = notifier.getHistory(1);

      expect(limitedHistory.length).toBe(1);
    });

    test('should include failed notifications in history', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed'));

      await notifier.notify('job-1', mockTestResult);

      const history = notifier.getHistory();
      const failedRecords = history.filter(r => r.status === 'failed');

      expect(failedRecords.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    test('should handle result with no failed checks', () => {
      const passedResult: TestResult = {
        siteName: 'Perfect Site',
        url: 'https://perfect.com',
        timestamp: '2024-01-01T12:00:00Z',
        passed: true,
        duration: 1000,
        checks: [
          { name: 'Check 1', type: 'status', passed: true, message: 'OK' },
          { name: 'Check 2', type: 'title', passed: true, message: 'OK' }
        ],
        screenshots: [],
        errors: []
      };

      const message = notifier['buildMessage'](passedResult, 'job-perfect');

      expect(message.passRate).toBe(100);
      expect(message.failedCheckList).toHaveLength(0);
    });

    test('should handle result with no screenshots', () => {
      const resultNoScreenshots = { ...mockTestResult, screenshots: [] };

      const message = notifier['buildMessage'](resultNoScreenshots, 'job-no-ss');

      expect(message.screenshots).toHaveLength(0);
    });

    test('should handle result with errors array', () => {
      const resultWithErrors = {
        ...mockTestResult,
        errors: ['Global error 1', 'Global error 2']
      };

      const message = notifier['buildMessage'](resultWithErrors, 'job-errors');

      expect(message).toBeDefined();
    });

    test('should handle empty notification channels', () => {
      const emptyNotifier = new Notifier({ channels: {} });

      // Should not throw
      emptyNotifier['sendToConsole'](notifier['buildMessage'](mockTestResult, 'job-1'));

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
