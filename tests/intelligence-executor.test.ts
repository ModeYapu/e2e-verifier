/**
 * Tests for PlaywrightExecutor
 * Tests the core execution engine for test scenarios
 */

import { PlaywrightExecutor, PlaywrightExecutorConfig, ITestExecutor } from '../src/intelligence/executor';
import { PlannedScenario, PlannedStep, ScenarioResult } from '../src/intelligence/types';
import { BrowserPool } from '../src/browser/browser-pool';
import { chromium, Page, Browser } from 'playwright';

// Mock dependencies
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

jest.mock('../src/browser/browser-pool');
jest.mock('fs');
jest.mock('path');

describe('PlaywrightExecutor', () => {
  let executor: ITestExecutor;
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;
  let mockBrowserPool: jest.Mocked<BrowserPool>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock page with essential methods
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      setViewportSize: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(undefined),
      isVisible: jest.fn().mockResolvedValue(true),
      $: jest.fn().mockResolvedValue({}),
      locator: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(1),
      }),
      title: jest.fn().mockResolvedValue('Test Page'),
      url: jest.fn().mockReturnValue('http://example.com'),
      on: jest.fn(),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
      selectOption: jest.fn().mockResolvedValue(undefined),
      hover: jest.fn().mockResolvedValue(undefined),
      waitFor: jest.fn().mockResolvedValue(undefined),
      content: jest.fn().mockResolvedValue('test content'),
      getAttribute: jest.fn().mockResolvedValue('test-value'),
      textContent: jest.fn().mockResolvedValue('test text'),
    } as any;

    // Create mock browser
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock browser pool
    mockBrowserPool = {
      acquirePage: jest.fn().mockResolvedValue(mockPage),
      releasePage: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock chromium.launch
    (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

    // Create executor with minimal config
    const config: PlaywrightExecutorConfig = {
      outputDir: './test-artifacts',
      enableScreenshots: false,
      enableConsoleLogs: false,
      enableNetworkLogs: false,
    };

    executor = new PlaywrightExecutor(config);
  });

  afterEach(async () => {
    // No cleanup needed for mocked executor
  });

  describe('executeStep', () => {
    it('should execute click action successfully', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].passed).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('#button', { timeout: 30000 });
    });

    it('should execute type action successfully', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'type',
            selector: '#input',
            value: 'test value',
            description: 'Type in input',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].passed).toBe(true);
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test value', { timeout: 30000 });
    });

    it('should execute wait action successfully', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'wait',
            value: '1000',
            description: 'Wait 1 second',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].passed).toBe(true);
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
    });

    it('should execute navigate action successfully', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'navigate',
            value: 'http://example.com/page',
            description: 'Navigate to page',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].passed).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com/page', { timeout: 30000 });
    });

    it('should handle step errors gracefully', async () => {
      // Make click fail
      mockPage.click = jest.fn().mockRejectedValue(new Error('Element not found'));

      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#nonexistent',
            description: 'Click nonexistent button',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].passed).toBe(false);
      expect(result.stepResults[0].error).toBe('Element not found');
    });

    it('should stop execution on critical step failure', async () => {
      // Make the first step fail
      mockPage.click = jest.fn().mockRejectedValue(new Error('First step failed'));

      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button1',
            description: 'First button',
          },
          {
            id: 'step2',
            action: 'click',
            selector: '#button2',
            description: 'Second button should not execute',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(1); // Only first step executed
      expect(result.stepResults[0].passed).toBe(false);
      expect(mockPage.click).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should continue execution on non-critical step failure', async () => {
      // Make the first step fail, second step succeed
      mockPage.click = jest.fn()
        .mockRejectedValueOnce(new Error('Non-critical step failed'))
        .mockResolvedValueOnce(undefined);

      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button1',
            description: 'Non-critical button',
            critical: false,
          },
          {
            id: 'step2',
            action: 'click',
            selector: '#button2',
            description: 'Second button should execute',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults).toHaveLength(2); // Both steps executed
      expect(result.stepResults[0].passed).toBe(false);
      expect(result.stepResults[1].passed).toBe(true);
    });
  });

  describe('executeAssertion', () => {
    it('should evaluate element-exists assertion', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [],
        assertions: [
          {
            type: 'element-exists',
            selector: '#element',
            expected: true,
            description: 'Element should exist',
          },
        ],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(true);
    });

    it('should evaluate element-visible assertion', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [],
        assertions: [
          {
            type: 'element-visible',
            selector: '#element',
            expected: true,
            description: 'Element should be visible',
          },
        ],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(true);
      expect(mockPage.isVisible).toHaveBeenCalledWith('#element');
    });

    it('should evaluate text-contains assertion', async () => {
      // Mock textContent to return text containing the expected string
      mockPage.textContent = jest.fn().mockResolvedValue('This is some expected text here');

      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [],
        assertions: [
          {
            type: 'text-contains',
            selector: '#text',
            expected: 'expected text',
            description: 'Text should contain expected text',
          },
        ],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(true);
      expect(mockPage.textContent).toHaveBeenCalledWith('#text');
    });

    it('should handle assertion failures', async () => {
      // Make element not exist
      mockPage.$ = jest.fn().mockResolvedValue(null);

      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [],
        assertions: [
          {
            type: 'element-exists',
            selector: '#nonexistent',
            expected: true,
            description: 'Nonexistent element',
          },
        ],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(false);
    });
  });

  describe('page cleanup', () => {
    it('should cleanup page after execution when created by executor', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      await executor.execute(scenario); // No page provided, executor creates own

      // Verify browser and page cleanup
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should not cleanup page when provided externally', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'click',
            selector: '#button',
            description: 'Click button',
          },
        ],
        assertions: [],
      };

      await executor.execute(scenario, mockPage); // Page provided externally

      // Verify browser cleanup was NOT called
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle executor initialization errors', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'navigate',
            value: 'http://example.com',
            description: 'Navigate',
          },
        ],
        assertions: [],
      };

      // Make page initialization fail
      (chromium.launch as jest.Mock).mockRejectedValue(new Error('Browser launch failed'));

      const failingExecutor = new PlaywrightExecutor({ outputDir: './test-artifacts' });
      const result: ScenarioResult = await failingExecutor.execute(scenario);

      expect(result.passed).toBe(false);
      expect(result.error).toBe('Browser launch failed');
    });

    it('should handle unknown step actions', async () => {
      const scenario: PlannedScenario = {
        id: 'test-scenario',
        name: 'Test Scenario',
        description: 'Test scenario for executor',
        url: 'http://example.com',
        steps: [
          {
            id: 'step1',
            action: 'unknown-action' as any,
            description: 'Unknown action',
          },
        ],
        assertions: [],
      };

      const result: ScenarioResult = await executor.execute(scenario, mockPage);

      expect(result.stepResults[0].passed).toBe(false);
      expect(result.stepResults[0].error).toContain('Unknown action');
    });
  });
});