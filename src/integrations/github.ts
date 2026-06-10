/**
 * GitHub Integration service
 * Handles commit status updates and PR comments for CI/CD integration
 */

import { Job, JobStatus } from '../scheduler/types';

/**
 * GitHub commit status states
 */
export type GitHubCommitStatusState = 'pending' | 'success' | 'error' | 'failure';

/**
 * GitHub commit status response
 */
export interface GitHubCommitStatusResponse {
  id: number;
  state: GitHubCommitStatusState;
  description: string;
  targetUrl?: string;
  context: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GitHub PR comment response
 */
export interface GitHubPRCommentResponse {
  id: number;
  body: string;
  user: {
    login: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * GitHub Integration class
 */
export class GitHubIntegration {
  private token: string;
  private apiBaseUrl: string = 'https://api.github.com';
  private userAgent: string = 'e2e-verifier-github-integration/1.0';

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || '';
    if (!this.token) {
      console.warn('[GitHub] No GITHUB_TOKEN provided - GitHub API calls will fail');
    }

    // Support GitHub Enterprise Server
    if (process.env.GITHUB_API_URL) {
      this.apiBaseUrl = process.env.GITHUB_API_URL;
      console.log(`[GitHub] Using custom API URL: ${this.apiBaseUrl}`);
    }
  }

  /**
   * Create or update commit status
   */
  async createCommitStatus(
    repo: string,
    sha: string,
    state: GitHubCommitStatusState,
    description: string,
    targetUrl?: string,
    context: string = 'e2e-verifier'
  ): Promise<GitHubCommitStatusResponse | null> {
    try {
      const [owner, repoName] = this.parseRepo(repo);
      const url = `${this.apiBaseUrl}/repos/${owner}/${repoName}/statuses/${sha}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': this.userAgent,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          state,
          description,
          target_url: targetUrl,
          context
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${error}`);
      }

      const data = await response.json();
      console.log(`[GitHub] Created commit status for ${owner}/${repoName} SHA ${sha}: ${state}`);

      return data;
    } catch (error) {
      console.error('[GitHub] Error creating commit status:', error);
      return null;
    }
  }

  /**
   * Comment on a pull request
   */
  async commentOnPR(
    repo: string,
    prNumber: number,
    body: string
  ): Promise<GitHubPRCommentResponse | null> {
    try {
      const [owner, repoName] = this.parseRepo(repo);
      const url = `${this.apiBaseUrl}/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': this.userAgent,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ body })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${error}`);
      }

      const data = await response.json();
      console.log(`[GitHub] Created comment on PR #${prNumber} in ${owner}/${repoName}`);

      return data;
    } catch (error) {
      console.error('[GitHub] Error creating PR comment:', error);
      return null;
    }
  }

  /**
   * Format job results as markdown table
   */
  formatJobResultsMarkdown(job: Job, includeDetails: boolean = true): string {
    const statusEmoji = this.getStatusEmoji(job.status);
    const statusText = this.getStatusText(job.status);

    let markdown = `## ${statusEmoji} E2E Verification Results\n\n`;
    markdown += `**Job ID:** \`${job.id}\`\n`;
    markdown += `**Status:** ${statusText}\n`;
    markdown += `**Type:** ${job.type}\n`;

    if (job.startedAt && job.completedAt) {
      const duration = Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 1000);
      markdown += `**Duration:** ${duration}s\n`;
    }

    if (job.priority !== 'normal') {
      markdown += `**Priority:** ${job.priority}\n`;
    }

    markdown += `\n`;

    // Add results if job completed successfully
    if (job.status === 'completed' && job.result && includeDetails) {
      markdown += this.formatResultDetails(job.result);
    }

    // Add error if job failed
    if (job.status === 'failed' && job.error) {
      markdown += `### ❌ Error\n\n\`\`\`\n${job.error}\n\`\`\`\n\n`;
    }

    // Add retry information
    if (job.retryCount > 0) {
      markdown += `**Retries:** ${job.retryCount}/${job.maxRetries}\n\n`;
    }

    return markdown;
  }

  /**
   * Format result details as markdown
   */
  private formatResultDetails(result: any): string {
    let markdown = `### ✅ Results\n\n`;

    // Handle different result types
    if (typeof result === 'object') {
      // Fast verify results
      if ('passed' in result) {
        const passed = result.passed ? '✅ Passed' : '❌ Failed';
        markdown += `**Overall Status:** ${passed}\n\n`;

        if (result.checks && Array.isArray(result.checks)) {
          markdown += `| Check | Status | Details |\n`;
          markdown += `|-------|--------|----------|\n`;

          for (const check of result.checks) {
            const checkStatus = check.passed ? '✅' : '❌';
            const details = check.details || (check.passed ? 'Success' : 'Failed');
            markdown += `| ${check.name} | ${checkStatus} | ${details} |\n`;
          }

          markdown += `\n`;
        }

        // Add performance metrics if available
        if (result.performanceMetrics) {
          markdown += `### 📊 Performance\n\n`;
          markdown += `| Metric | Value |\n`;
          markdown += `|--------|-------|\n`;

          const metrics = result.performanceMetrics;
          if (metrics.loadTime) {
            markdown += `| Load Time | ${Math.round(metrics.loadTime)}ms |\n`;
          }
          if (metrics.domContentLoaded) {
            markdown += `| DOM Content Loaded | ${Math.round(metrics.domContentLoaded)}ms |\n`;
          }
          if (metrics.firstContentfulPaint) {
            markdown += `| First Contentful Paint | ${Math.round(metrics.firstContentfulPaint)}ms |\n`;
          }

          markdown += `\n`;
        }

        // Add screenshots if available
        if (result.screenshots && Array.isArray(result.screenshots) && result.screenshots.length > 0) {
          markdown += `### 📸 Screenshots\n\n`;
          for (const screenshot of result.screenshots) {
            if (screenshot.path) {
              markdown += `**${screenshot.name || 'Screenshot'}:** \`${screenshot.path}\`\n\n`;
            }
          }
        }
      }

      // Matrix results
      if ('summary' in result && 'combinations' in result) {
        const summary = result.summary;
        markdown += `**Total Combinations:** ${summary.total}\n`;
        markdown += `**Passed:** ${summary.passed} ✅\n`;
        markdown += `**Failed:** ${summary.failed} ❌\n\n`;

        if (result.combinations && Array.isArray(result.combinations)) {
          markdown += `| Browser | Viewport | Locale | Status | Duration |\n`;
          markdown += `|---------|----------|--------|--------|----------|\n`;

          for (const combo of result.combinations) {
            const status = combo.passed ? '✅' : '❌';
            const viewport = combo.viewport ? `${combo.viewport.width}x${combo.viewport.height}` : 'default';
            const locale = combo.locale || 'default';
            const duration = combo.duration ? `${Math.round(combo.duration)}ms` : 'N/A';

            markdown += `| ${combo.browser} | ${viewport} | ${locale} | ${status} | ${duration} |\n`;
          }

          markdown += `\n`;
        }
      }

      // Orchestrated results
      if ('results' in result && Array.isArray(result.results)) {
        markdown += `| Site | Status | Checks | Failed |\n`;
        markdown += `|------|--------|--------|--------|\n`;

        for (const siteResult of result.results) {
          const status = siteResult.passed ? '✅' : '❌';
          const totalChecks = siteResult.totalChecks || 0;
          const failedChecks = siteResult.failedChecks || 0;

          markdown += `| ${siteResult.name} | ${status} | ${totalChecks} | ${failedChecks} |\n`;
        }

        markdown += `\n`;
      }

      // Agent/deep verify results
      if ('finalAnswer' in result || 'steps' in result) {
        markdown += `### 🤖 Agent Execution\n\n`;

        if (result.finalAnswer) {
          markdown += `**Final Answer:**\n\n${result.finalAnswer}\n\n`;
        }

        if (result.steps && Array.isArray(result.steps)) {
          markdown += `**Steps Taken:** ${result.steps.length}\n\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Parse repo string into owner and repo name
   */
  private parseRepo(repo: string): [string, string] {
    const parts = repo.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repo format: ${repo}. Expected format: 'owner/repo'`);
    }
    return [parts[0], parts[1]];
  }

  /**
   * Get status emoji for job status
   */
  private getStatusEmoji(status: JobStatus): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'running':
        return '🔄';
      case 'pending':
        return '⏳';
      case 'cancelled':
        return '🚫';
      default:
        return '❓';
    }
  }

  /**
   * Get status text for job status
   */
  private getStatusText(status: JobStatus): string {
    switch (status) {
      case 'completed':
        return 'Passed ✅';
      case 'failed':
        return 'Failed ❌';
      case 'running':
        return 'Running 🔄';
      case 'pending':
        return 'Pending ⏳';
      case 'cancelled':
        return 'Cancelled 🚫';
      default:
        return 'Unknown ❓';
    }
  }

  /**
   * Update GitHub status for job
   */
  async updateJobStatus(
    repo: string,
    sha: string,
    job: Job,
    targetUrl?: string
  ): Promise<GitHubCommitStatusResponse | null> {
    let state: GitHubCommitStatusState;
    let description: string;

    switch (job.status) {
      case 'completed':
        state = 'success';
        description = 'E2E verification passed';
        break;
      case 'failed':
        state = 'failure';
        description = 'E2E verification failed';
        break;
      case 'running':
        state = 'pending';
        description = 'E2E verification in progress';
        break;
      case 'pending':
        state = 'pending';
        description = 'E2E verification queued';
        break;
      default:
        state = 'error';
        description = 'E2E verification error';
    }

    return this.createCommitStatus(repo, sha, state, description, targetUrl);
  }

  /**
   * Post job results as PR comment
   */
  async postJobResults(
    repo: string,
    prNumber: number,
    job: Job
  ): Promise<GitHubPRCommentResponse | null> {
    const body = this.formatJobResultsMarkdown(job);
    return this.commentOnPR(repo, prNumber, body);
  }

  /**
   * Check if GitHub integration is properly configured
   */
  isConfigured(): boolean {
    return !!this.token;
  }
}