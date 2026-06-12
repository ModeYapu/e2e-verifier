/**
 * ExperienceStore unit tests
 *
 * Tests the experience accumulation and query implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExperienceStore } from '../src/intelligence/experience-store';
import { TestExperience, ExperienceQuery } from '../src/intelligence/experience-types';
import { ScenarioResult } from '../src/intelligence/types';

describe('ExperienceStore', () => {
  let tempDir: string;
  let experienceStore: ExperienceStore;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'experience-store-test-'));
    experienceStore = new ExperienceStore({
      storageDir: tempDir,
      persistEnabled: false, // Disable persistence for tests
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('store experience', () => {
    test('should store an experience', async () => {
      const experience: TestExperience = {
        id: 'exp-1',
        problemSignature: 'test-signature',
        context: 'test context',
        strategy: 'fast-test',
        testPlan: { steps: ['step1', 'step2'] },
        outcome: 'success',
        reward: 1.0,
        timestamp: Date.now(),
        meta: {
          siteName: 'test-site',
        },
      };

      await experienceStore.record(experience);

      expect(experienceStore.getCount()).toBe(1);
    });

    test('should handle multiple experiences', async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'sig-1',
          context: 'context 1',
          strategy: 'fast',
          testPlan: {},
          outcome: 'success',
          reward: 0.8,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-2',
          problemSignature: 'sig-2',
          context: 'context 2',
          strategy: 'deep',
          testPlan: {},
          outcome: 'failure',
          reward: -0.5,
          timestamp: Date.now(),
          meta: { siteName: 'site-2' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }

      expect(experienceStore.getCount()).toBe(2);
    });
  });

  describe('query experiences', () => {
    beforeEach(async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'login-form',
          context: 'login form context',
          strategy: 'fast-test',
          testPlan: {},
          outcome: 'success',
          reward: 1.0,
          timestamp: Date.now() - 1000,
          meta: { siteName: 'example-site' },
        },
        {
          id: 'exp-2',
          problemSignature: 'login-form',
          context: 'login form context',
          strategy: 'deep-test',
          testPlan: {},
          outcome: 'failure',
          reward: -0.5,
          timestamp: Date.now(),
          meta: { siteName: 'example-site' },
        },
        {
          id: 'exp-3',
          problemSignature: 'checkout-flow',
          context: 'checkout flow context',
          strategy: 'fast-test',
          testPlan: {},
          outcome: 'partial',
          reward: 0.5,
          timestamp: Date.now() - 500,
          meta: { siteName: 'shop-site' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }
    });

    test('should query all experiences', () => {
      const results = experienceStore.query({});
      expect(results).toHaveLength(3);
    });

    test('should filter by signature', () => {
      const results = experienceStore.query({ signature: 'login-form' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.problemSignature === 'login-form')).toBe(true);
    });

    test('should filter by site name', () => {
      const results = experienceStore.query({ siteName: 'example-site' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.meta.siteName === 'example-site')).toBe(true);
    });

    test('should filter by outcome', () => {
      const results = experienceStore.query({ outcome: 'success' });
      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe('success');
    });

    test('should filter by minimum reward', () => {
      const results = experienceStore.query({ minReward: 0.5 });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.reward >= 0.5)).toBe(true);
    });

    test('should filter by strategy', () => {
      const results = experienceStore.query({ strategy: 'fast-test' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.strategy === 'fast-test')).toBe(true);
    });

    test('should apply limit', () => {
      const results = experienceStore.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    test('should sort by reward (highest first) and timestamp', () => {
      const results = experienceStore.query({});
      expect(results[0].reward).toBe(1.0); // Highest reward
      expect(results[1].reward).toBe(0.5);
      expect(results[2].reward).toBe(-0.5); // Lowest reward
    });

    test('should return empty array for non-matching query', () => {
      const results = experienceStore.query({
        signature: 'non-existent',
        outcome: 'success',
      });
      expect(results).toEqual([]);
    });
  });

  describe('querySimilar', () => {
    beforeEach(async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'abc123456789012',
          context: 'context 1',
          strategy: 'strategy-1',
          testPlan: {},
          outcome: 'success',
          reward: 0.9,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-2',
          problemSignature: 'abc987654321098',
          context: 'context 2',
          strategy: 'strategy-2',
          testPlan: {},
          outcome: 'success',
          reward: 0.7,
          timestamp: Date.now(),
          meta: { siteName: 'site-2' },
        },
        {
          id: 'exp-3',
          problemSignature: 'xyz123456789012',
          context: 'context 3',
          strategy: 'strategy-3',
          testPlan: {},
          outcome: 'failure',
          reward: -0.3,
          timestamp: Date.now(),
          meta: { siteName: 'site-3' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }
    });

    test('should find similar experiences by signature prefix', () => {
      const results = experienceStore.querySimilar('abc123456789012', 5);
      expect(results.length).toBeGreaterThan(0);
    });

    test('should return experiences with similarity scores', () => {
      const results = experienceStore.querySimilar('abc123456789012', 5);
      results.forEach(result => {
        expect(result).toHaveProperty('experience');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('reason');
      });
    });

    test('should limit results to topK', () => {
      const results = experienceStore.querySimilar('abc123456789012', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should return empty array for no similar experiences', () => {
      const results = experienceStore.querySimilar('non-existent-signature', 5);
      expect(results).toEqual([]);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'sig-1',
          context: 'context 1',
          strategy: 'fast',
          testPlan: {},
          outcome: 'success',
          reward: 1.0,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-2',
          problemSignature: 'sig-2',
          context: 'context 2',
          strategy: 'deep',
          testPlan: {},
          outcome: 'failure',
          reward: -0.5,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-3',
          problemSignature: 'sig-3',
          context: 'context 3',
          strategy: 'fast',
          testPlan: {},
          outcome: 'partial',
          reward: 0.5,
          timestamp: Date.now(),
          meta: { siteName: 'site-2' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }
    });

    test('should return overall statistics', () => {
      const stats = experienceStore.getStats();

      expect(stats.totalExperiences).toBe(3);
      expect(stats.byOutcome.success).toBe(1);
      expect(stats.byOutcome.failure).toBe(1);
      expect(stats.byOutcome.partial).toBe(1);
      expect(stats.avgReward).toBeCloseTo((1.0 + (-0.5) + 0.5) / 3);
    });

    test('should filter statistics by site', () => {
      const stats = experienceStore.getStats('site-1');

      expect(stats.totalExperiences).toBe(2);
      expect(stats.byOutcome.success).toBe(1);
      expect(stats.byOutcome.failure).toBe(1);
    });

    test('should include strategy effectiveness', () => {
      const stats = experienceStore.getStats();

      expect(stats.byStrategy).toBeDefined();
      expect(stats.byStrategy.fast).toBeDefined();
      expect(stats.byStrategy.deep).toBeDefined();
    });

    test('should include top signatures', () => {
      const stats = experienceStore.getStats();

      expect(stats.topSignatures).toBeDefined();
      expect(stats.topSignatures.length).toBeGreaterThan(0);
      expect(stats.topSignatures.length).toBeLessThanOrEqual(10);
    });

    test('should include success trend', () => {
      const stats = experienceStore.getStats();

      expect(stats.successTrend).toBeDefined();
      expect(Array.isArray(stats.successTrend)).toBe(true);
    });
  });

  describe('getStrategyStats', () => {
    test('should return stats for existing strategy', async () => {
      const experience: TestExperience = {
        id: 'exp-1',
        problemSignature: 'sig-1',
        context: 'test context',
        strategy: 'test-strategy',
        testPlan: {},
        outcome: 'success',
        reward: 1.0,
        timestamp: Date.now(),
        meta: { siteName: 'site-1' },
      };

      await experienceStore.record(experience);

      const stats = experienceStore.getStrategyStats('test-strategy');

      expect(stats.strategy).toBe('test-strategy');
      expect(stats.totalUses).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgReward).toBe(1.0);
      expect(stats.successRate).toBe(1.0);
    });

    test('should return empty stats for non-existent strategy', () => {
      const stats = experienceStore.getStrategyStats('non-existent');

      expect(stats.strategy).toBe('non-existent');
      expect(stats.totalUses).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgReward).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('calculateReward', () => {
    test('should return positive reward for all passed', () => {
      const result: ScenarioResult = {
        passed: true,
        assertionResults: [
          { passed: true, assertion: { type: 'visibility' } as any },
          { passed: true, assertion: { type: 'text' } as any },
        ],
        retryCount: 0,
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        duration: 1000,
        scenarioName: 'test',
        scenarioId: 'test-scenario',
        stepResults: [],
        artifacts: [],
      };

      const reward = experienceStore.calculateReward(result);
      expect(reward.reward).toBe(1.0);
      expect(reward.reason).toBe('All assertions passed');
    });

    test('should return partial reward for partial pass', () => {
      const result: ScenarioResult = {
        passed: false,
        assertionResults: [
          { passed: true, assertion: { type: 'visibility' } as any },
          { passed: false, assertion: { type: 'text' } as any },
        ],
        retryCount: 0,
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        duration: 1000,
        scenarioName: 'test',
        scenarioId: 'test-scenario',
        stepResults: [],
        artifacts: [],
      };

      const reward = experienceStore.calculateReward(result);
      expect(reward.reward).toBe(0.5);
      expect(reward.reason).toBe('Partial pass - some assertions passed');
    });

    test('should return negative reward for failure', () => {
      const result: ScenarioResult = {
        passed: false,
        assertionResults: [
          { passed: false, assertion: { type: 'visibility' } as any },
          { passed: false, assertion: { type: 'text' } as any },
        ],
        retryCount: 0,
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        duration: 1000,
        scenarioName: 'test',
        scenarioId: 'test-scenario',
        stepResults: [],
        artifacts: [],
      };

      const reward = experienceStore.calculateReward(result);
      expect(reward.reward).toBe(-0.5);
      expect(reward.reason).toBe('Failed and could not be repaired');
    });

    test('should detect flaky tests', () => {
      const result: ScenarioResult = {
        passed: true,
        assertionResults: [{ passed: true, assertion: { type: 'visibility' } as any }],
        retryCount: 2,
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        duration: 1000,
        scenarioName: 'test',
        scenarioId: 'test-scenario',
        stepResults: [],
        artifacts: [],
      };

      const reward = experienceStore.calculateReward(result);
      expect(reward.reward).toBe(-0.2);
      expect(reward.reason).toBe('Flaky test - inconsistent results');
    });
  });

  describe('generateSignature', () => {
    test('should generate consistent signatures for same target', () => {
      const target = {
        url: 'https://example.com',
        name: 'test-target',
        description: 'test description',
      };

      const sig1 = experienceStore.generateSignature(target);
      const sig2 = experienceStore.generateSignature(target);

      expect(sig1).toBe(sig2);
    });

    test('should generate different signatures for different targets', () => {
      const target1 = { url: 'https://example.com', name: 'target-1' };
      const target2 = { url: 'https://different.com', name: 'target-2' };

      const sig1 = experienceStore.generateSignature(target1);
      const sig2 = experienceStore.generateSignature(target2);

      expect(sig1).not.toBe(sig2);
    });

    test('should include additional context in signature', () => {
      const target = { url: 'https://example.com', name: 'test' };
      const sig1 = experienceStore.generateSignature(target, 'context-1');
      const sig2 = experienceStore.generateSignature(target, 'context-2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('getSuccessfulPlans', () => {
    beforeEach(async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'test-sig',
          context: 'test context 1',
          strategy: 'fast',
          testPlan: { steps: ['step1'] },
          outcome: 'success',
          reward: 0.8,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-2',
          problemSignature: 'test-sig',
          context: 'test context 2',
          strategy: 'deep',
          testPlan: { steps: ['step1', 'step2'] },
          outcome: 'success',
          reward: 0.6,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-3',
          problemSignature: 'test-sig',
          context: 'test context 3',
          strategy: 'intelligent',
          testPlan: { steps: ['step1', 'step2', 'step3'] },
          outcome: 'failure',
          reward: -0.5,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }
    });

    test('should return successful test plans', () => {
      const plans = experienceStore.getSuccessfulPlans('test-sig');

      expect(plans).toHaveLength(2);
      expect(plans.every(p => p.experience.outcome === 'success')).toBe(true);
      expect(plans.every(p => p.experience.reward > 0.5)).toBe(true);
    });

    test('should include both plan and experience', () => {
      const plans = experienceStore.getSuccessfulPlans('test-sig');

      plans.forEach(plan => {
        expect(plan).toHaveProperty('plan');
        expect(plan).toHaveProperty('experience');
      });
    });
  });

  describe('clear', () => {
    test('should clear all experiences', async () => {
      const experience: TestExperience = {
        id: 'exp-1',
        problemSignature: 'sig-1',
        context: 'test context',
        strategy: 'fast',
        testPlan: {},
        outcome: 'success',
        reward: 1.0,
        timestamp: Date.now(),
        meta: { siteName: 'site-1' },
      };

      await experienceStore.record(experience);
      expect(experienceStore.getCount()).toBe(1);

      await experienceStore.clear();
      expect(experienceStore.getCount()).toBe(0);
    });
  });

  describe('getCount', () => {
    test('should return 0 for empty store', () => {
      expect(experienceStore.getCount()).toBe(0);
    });

    test('should return correct count after adding experiences', async () => {
      const experiences: TestExperience[] = [
        {
          id: 'exp-1',
          problemSignature: 'sig-1',
          context: 'context 1',
          strategy: 'fast',
          testPlan: {},
          outcome: 'success',
          reward: 1.0,
          timestamp: Date.now(),
          meta: { siteName: 'site-1' },
        },
        {
          id: 'exp-2',
          problemSignature: 'sig-2',
          context: 'context 2',
          strategy: 'deep',
          testPlan: {},
          outcome: 'success',
          reward: 0.8,
          timestamp: Date.now(),
          meta: { siteName: 'site-2' },
        },
      ];

      for (const exp of experiences) {
        await experienceStore.record(exp);
      }

      expect(experienceStore.getCount()).toBe(2);
    });
  });
});
