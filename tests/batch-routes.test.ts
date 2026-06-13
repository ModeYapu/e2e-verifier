/**
 * Batch Routes Tests
 */

import request from 'supertest';
import express, { Application } from 'express';
import { createBatchRoutes } from '../src/server/routes/batch-routes';
import { JobService } from '../src/server/services/job-service';
import { StorageService } from '../src/server/services/storage-service';
import { Job, JobStatus } from '../src/scheduler/types';

jest.mock('../src/server/services/storage-service');
jest.mock('../src/scheduler/schedule-manager');
jest.mock('fs');

describe('Batch Routes', () => {
  let app: Application;
  let jobService: JobService;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockJobs: Job[];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock jobs array
    mockJobs = [];

    // Create mock job service
    jobService = {
      createAndEnqueueJob: jest.fn((type, config, priority, maxRetries, timeout) => {
        const job: Job = {
          id: `job-${mockJobs.length + 1}`,
          type,
          config,
          priority: priority || 'normal',
          status: 'queued' as JobStatus,
          createdAt: new Date().toISOString(),
          maxRetries: maxRetries || 3,
          timeout,
        };
        mockJobs.push(job);
        return job;
      }),
      getJob: jest.fn((jobId: string) => {
        return mockJobs.find(j => j.id === jobId);
      }),
      getScheduleManager: jest.fn(() => ({
        addSchedule: jest.fn((config) => `schedule-${Date.now()}`)
      })),
      start: jest.fn(),
      stop: jest.fn(),
      createJob: jest.fn(),
      enqueueJob: jest.fn(),
      getScheduler: jest.fn(),
      getJobStore: jest.fn(),
      getJobQueue: jest.fn(),
      listJobs: jest.fn(),
      cancelJob: jest.fn(),
      retryJob: jest.fn(),
      getQueueStats: jest.fn(),
    } as unknown as JobService;

    mockStorageService = {
      getResultStore: jest.fn(),
      getTrendAnalyzer: jest.fn(),
      getQualityCalculator: jest.fn(),
      saveResult: jest.fn(),
      getAllSiteNames: jest.fn(),
      getSiteTrends: jest.fn(),
      getSiteRegressions: jest.fn(),
      getAllProfiles: jest.fn(),
      getSiteProfile: jest.fn(),
    } as jest.Mocked<StorageService>;

    app = express();
    app.use(express.json());
    app.use('/api', createBatchRoutes(jobService, mockStorageService));
  });

  describe('POST /api/batch/verify', () => {
    test('should create batch verification for multiple sites', async () => {
      const response = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com', name: 'Example' },
            { url: 'https://test.com', name: 'Test' }
          ],
          priority: 'high'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toMatch(/^batch-/);
      expect(response.body.data.totalJobs).toBe(2);
      expect(response.body.data.jobs).toHaveLength(2);
      expect(response.body.data.jobs[0]).toHaveProperty('jobId');
      expect(response.body.data.jobs[0]).toHaveProperty('site');
    });

    test('should accept config file path for batch verification', async () => {
      const response = await request(app)
        .post('/api/batch/verify')
        .send({
          configPath: 'test-config.json',
          sites: [
            { url: 'https://example.com', name: 'Example' }
          ]
        });

      // Note: Config file reading is mocked, so it falls back to sites array
      expect(response.status).toBe(201);
      expect(response.body.data.totalJobs).toBe(1);
    });

    test('should return error for empty sites array', async () => {
      const response = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: []
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No sites provided');
    });

    test('should handle individual job failures gracefully', async () => {
      // Mock createAndEnqueueJob to fail for second site
      (jobService.createAndEnqueueJob as jest.Mock).mockImplementationOnce((type, config, priority, maxRetries, timeout) => {
        const job: Job = {
          id: 'job-1',
          type,
          config,
          priority: priority || 'normal',
          status: 'queued' as JobStatus,
          createdAt: new Date().toISOString(),
          maxRetries: maxRetries || 3,
          timeout,
        };
        return job;
      }).mockImplementationOnce(() => {
        throw new Error('Job creation failed');
      });

      const response = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com' },
            { url: 'https://test.com' }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.data.totalJobs).toBe(2);
      expect(response.body.data.jobs[1].status).toBe('failed');
      expect(response.body.data.jobs[1].jobId).toBe('failed');
    });

    test('should use default checks when not specified', async () => {
      const response = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com' }
          ]
        });

      expect(response.status).toBe(201);
      expect(jobService.createAndEnqueueJob).toHaveBeenCalledWith(
        'fast',
        expect.objectContaining({
          fastVerify: expect.objectContaining({
            checks: ['status', 'title', 'console-errors']
          })
        }),
        'normal',
        3,
        30000
      );
    });
  });

  describe('POST /api/batch/schedule', () => {
    test('should create batch schedule for multiple sites', async () => {
      const response = await request(app)
        .post('/api/batch/schedule')
        .send({
          sites: [
            { url: 'https://example.com', name: 'Example' },
            { url: 'https://test.com', name: 'Test' }
          ],
          schedule: {
            frequency: 'daily',
            time: '09:00'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toMatch(/^batch-schedule-/);
      expect(response.body.data.totalScheduled).toBe(2);
      expect(response.body.data.scheduled).toHaveLength(2);
      expect(response.body.data.scheduled[0]).toHaveProperty('scheduleId');
      expect(response.body.data.scheduled[0]).toHaveProperty('nextRun');
    });

    test('should return error for missing schedule configuration', async () => {
      const response = await request(app)
        .post('/api/batch/schedule')
        .send({
          sites: [
            { url: 'https://example.com' }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('schedule');
    });

    test('should handle hourly frequency', async () => {
      const response = await request(app)
        .post('/api/batch/schedule')
        .send({
          sites: [
            { url: 'https://example.com' }
          ],
          schedule: {
            frequency: 'hourly'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.data.totalScheduled).toBe(1);
    });

    test('should handle weekly frequency', async () => {
      const response = await request(app)
        .post('/api/batch/schedule')
        .send({
          sites: [
            { url: 'https://example.com' }
          ],
          schedule: {
            frequency: 'weekly',
            time: '14:30'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.data.totalScheduled).toBe(1);
    });

    test('should use default time for daily schedule when not specified', async () => {
      const response = await request(app)
        .post('/api/batch/schedule')
        .send({
          sites: [
            { url: 'https://example.com' }
          ],
          schedule: {
            frequency: 'daily'
          }
        });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/batch/status/:batchId', () => {
    test('should return batch operation status', async () => {
      // First create a batch
      const createResponse = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com' }
          ]
        });

      const batchId = createResponse.body.data.batchId;

      // Get status
      const statusResponse = await request(app)
        .get(`/api/batch/status/${batchId}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.batchId).toBe(batchId);
      expect(statusResponse.body.data).toHaveProperty('status');
      expect(statusResponse.body.data).toHaveProperty('totalJobs');
      expect(statusResponse.body.data).toHaveProperty('completedJobs');
      expect(statusResponse.body.data).toHaveProperty('passedJobs');
      expect(statusResponse.body.data).toHaveProperty('failedJobs');
      expect(statusResponse.body.data).toHaveProperty('jobs');
    });

    test('should return 404 for non-existent batch', async () => {
      const response = await request(app)
        .get('/api/batch/status/nonexistent-batch');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should update job statuses from job service', async () => {
      // Create a batch
      const createResponse = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com' }
          ]
        });

      const batchId = createResponse.body.data.batchId;
      const jobId = createResponse.body.data.jobs[0].jobId;

      // Update job status in mock
      const job = jobService.getJob(jobId);
      if (job) {
        job.status = 'completed';
        (job as any).result = { passed: true };
      }

      // Get status
      const statusResponse = await request(app)
        .get(`/api/batch/status/${batchId}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.jobs[0].status).toBe('completed');
      expect(statusResponse.body.data.completedJobs).toBeGreaterThan(0);
    });

    test('should track passed and failed jobs correctly', async () => {
      // Create a batch with multiple sites
      const createResponse = await request(app)
        .post('/api/batch/verify')
        .send({
          sites: [
            { url: 'https://example.com' },
            { url: 'https://test.com' }
          ]
        });

      const batchId = createResponse.body.data.batchId;
      const jobs = createResponse.body.data.jobs;

      // Update job statuses in mock
      for (const jobInfo of jobs) {
        const job = jobService.getJob(jobInfo.jobId);
        if (job) {
          job.status = 'completed';
          if (jobInfo.jobId === jobs[0].jobId) {
            (job as any).result = { passed: true };
          } else {
            (job as any).result = { passed: false };
          }
        }
      }

      // Get status
      const statusResponse = await request(app)
        .get(`/api/batch/status/${batchId}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.passedJobs).toBe(1);
      expect(statusResponse.body.data.failedJobs).toBe(1);
    });
  });
});
