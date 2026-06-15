/**
 * Report Export Routes
 * Handles endpoints for exporting test results in various formats
 */

import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storage-service';
import { JobService } from '../services/job-service';
import { ReportExporter, ExportFormat, ReportData, ReportSummary, FailureDetail } from '../../services/report-exporter';
import { logger } from '../../utils/logger';

// =====================================================
// RESULT DATA TYPES
// =====================================================
//
// The data backing an export/report originates from heterogeneous sources:
// the in-memory job result (`JobResult`, a union of TestResult |
// AgentResult | OrchestratedResult | MatrixResult) or a `TestResult`
// read back from storage. Every backend populates a slightly different
// subset of fields, so rather than `any` we model only the fields this
// module actually consumes and narrow to it with a single controlled cast
// at the boundary (`as unknown as ReportResultData`).

/** A single check/result entry within a job result (fields vary by backend). */
interface ResultCheckEntry {
  name?: string;
  check?: string;
  passed?: boolean;
  expected?: string;
  actual?: string;
  message?: string;
  severity?: string;
  critical?: boolean;
}

/** A per-step performance timing point attached to some job results. */
interface ResultPerformanceEntry {
  step?: string;
  name?: string;
  duration?: number;
  time?: number;
}

/** A historical trend point attached to some job results. */
interface ResultTrendEntry {
  date?: string;
  timestamp?: string | number;
  passRate?: number;
}

/**
 * Structural view of the job-result data consumed when building an export
 * report. Callers narrow the concrete (union-typed) runtime value to this
 * view with one controlled cast at the boundary.
 */
interface ReportResultData {
  checks?: ResultCheckEntry[];
  results?: ResultCheckEntry[];
  performance?: ResultPerformanceEntry[];
  trend?: ResultTrendEntry[];
  timestamp?: string;
}

export function createExportRoutes(
  storageService: StorageService,
  jobService: JobService
): Router {
  const router = Router();
  const exporter = new ReportExporter();

  /**
   * GET /api/results/:jobId/export - Export job result in specified format
   * Query params: format (pdf|md|csv)
   */
  router.get('/results/:jobId/export', async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = typeof req.params.jobId === 'string' ? req.params.jobId : req.params.jobId[0];
      const format = (req.query.format as ExportFormat) || 'pdf';

      if (!['pdf', 'md', 'csv'].includes(format)) {
        res.status(400).json({
          success: false,
          error: 'Invalid format. Must be one of: pdf, md, csv'
        });
        return;
      }

      // Get job from job service
      const job = jobService.getJob(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          error: `Job not found: ${jobId}`
        });
        return;
      }

      // Check if user has access to this job's site when project context exists
      const site = job.config?.name;
      if (req.project && req.project.sites.length > 0 && site) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this job'
          });
          return;
        }
      }

      // Get result from storage if job is completed
      let resultData: ReportResultData | null = null;
      if (job.status === 'completed' && job.result) {
        resultData = job.result as unknown as ReportResultData;
      } else {
        // Try to get result from storage
        const resultStore = storageService.getResultStore();
        const siteName = site || 'unknown';
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const results = resultStore.getBySite(siteName, { start: yesterday, end: now });
        resultData = results.length > 0 ? (results[0] as unknown as ReportResultData) : null;

        if (!resultData) {
          res.status(400).json({
            success: false,
            error: 'Job result not available. Job may not be completed yet.'
          });
          return;
        }
      }

      // Build report data
      const reportData = buildReportData(jobId, site || 'unknown', resultData);

      // Export in requested format
      let content: string;
      let contentType: string;
      let filename: string;

      switch (format) {
        case 'md':
          content = exporter.exportMarkdown(reportData);
          contentType = 'text/markdown; charset=utf-8';
          filename = `report_${jobId.slice(0, 8)}.md`;
          break;

        case 'csv':
          content = exporter.exportCSV(reportData);
          contentType = 'text/csv; charset=utf-8';
          filename = `report_${jobId.slice(0, 8)}.csv`;
          break;

        case 'pdf':
        default:
          // For PDF, we return HTML that can be converted or printed
          content = exporter.exportPDFReady(reportData);
          contentType = 'text/html; charset=utf-8';
          filename = `report_${jobId.slice(0, 8)}.html`;
          break;
      }

      logger.info(`Exported job ${jobId} as ${format}`);

      // Set appropriate headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      logger.error(`Error exporting result: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/results/:jobId/report - Get report data as JSON
   */
  router.get('/results/:jobId/report', async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = typeof req.params.jobId === 'string' ? req.params.jobId : req.params.jobId[0];

      // Get job from job service
      const job = jobService.getJob(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          error: `Job not found: ${jobId}`
        });
        return;
      }

      // Check if user has access to this job's site when project context exists
      const site = job.config?.name;
      if (req.project && req.project.sites.length > 0 && site) {
        if (!req.project.sites.includes(site)) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to this job'
          });
          return;
        }
      }

      // Get result from storage if job is completed
      let resultData: ReportResultData | null = null;
      if (job.status === 'completed' && job.result) {
        resultData = job.result as unknown as ReportResultData;
      } else {
        // Try to get result from storage
        const resultStore = storageService.getResultStore();
        const siteName = site || 'unknown';
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const results = resultStore.getBySite(siteName, { start: yesterday, end: now });
        resultData = results.length > 0 ? (results[0] as unknown as ReportResultData) : null;

        if (!resultData) {
          res.status(400).json({
            success: false,
            error: 'Job result not available. Job may not be completed yet.'
          });
          return;
        }
      }

      // Build report data
      const reportData = buildReportData(jobId, site || 'unknown', resultData);

      res.json({
        success: true,
        data: reportData
      });
    } catch (error) {
      logger.error(`Error getting report data: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/export/formats - Get available export formats
   */
  router.get('/export/formats', async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        formats: [
          {
            name: 'pdf',
            description: 'HTML document optimized for PDF printing',
            extension: '.html'
          },
          {
            name: 'md',
            description: 'Markdown format documentation',
            extension: '.md'
          },
          {
            name: 'csv',
            description: 'Comma-separated values for data analysis',
            extension: '.csv'
          }
        ]
      }
    });
  });

  return router;
}

/**
 * Build report data from job result
 */
function buildReportData(jobId: string, site: string, resultData: ReportResultData): ReportData {
  const checks: ResultCheckEntry[] = resultData.checks || resultData.results || [];
  const total = checks.length;
  const passed = checks.filter((c: ResultCheckEntry) => c.passed !== false).length;
  const failed = total - passed;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const summary: ReportSummary = {
    total,
    passed,
    failed,
    passRate
  };

  // Extract failures
  const failures: FailureDetail[] = [];
  for (const check of checks) {
    if (check.passed === false) {
      failures.push({
        step: check.name || check.check || 'unknown',
        expected: check.expected || 'N/A',
        actual: check.actual || check.message || 'N/A',
        severity: check.severity || (check.critical ? 'critical' : 'medium')
      });
    }
  }

  // Extract performance data if available
  const performance = resultData.performance
    ? resultData.performance.map((p: ResultPerformanceEntry) => ({
        step: p.step || p.name || 'unknown',
        duration: p.duration || p.time || 0
      }))
    : undefined;

  // Build trend data from storage if available
  // This would require additional storage service calls for historical data
  const trend = resultData.trend
    ? resultData.trend.map((t: ResultTrendEntry) => ({
        date: t.date || (t.timestamp != null ? new Date(t.timestamp).toLocaleDateString() : 'unknown'),
        passRate: t.passRate || 0
      }))
    : undefined;

  return {
    jobId,
    site,
    timestamp: resultData.timestamp || new Date().toISOString(),
    summary,
    failures,
    performance,
    trend
  };
}
