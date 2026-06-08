import * as fs from 'fs';
import * as path from 'path';
import { Artifact, ArtifactType, ArtifactDirectoryStructure } from '../types';
import { DEFAULT_ARTIFACT_DIRECTORIES } from '../config/execution-config';

/**
 * Artifact Manager for standardized artifact collection and storage
 */
export class ArtifactManager {
  private directories: ArtifactDirectoryStructure;

  constructor(artifactRoot?: string) {
    this.directories = artifactRoot
      ? this.createDirectories(artifactRoot)
      : DEFAULT_ARTIFACT_DIRECTORIES;
    this.ensureDirectories();
  }

  private createDirectories(root: string): ArtifactDirectoryStructure {
    return {
      root,
      screenshots: path.join(root, 'screenshots'),
      traces: path.join(root, 'traces'),
      console: path.join(root, 'console'),
      network: path.join(root, 'network'),
      dom: path.join(root, 'dom'),
      videos: path.join(root, 'videos')
    };
  }

  private ensureDirectories(): void {
    for (const dir of Object.values(this.directories)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Generate a unique artifact filename with timestamp and task context
   */
  private generateFilename(
    type: ArtifactType,
    taskId: string,
    scenarioId: string,
    stepId?: string,
    extension = 'json'
  ): string {
    const timestamp = Date.now();
    const stepSuffix = stepId ? `-${stepId}` : '';
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeScenarioId = scenarioId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeStepId = stepSuffix.replace(/[^a-zA-Z0-9-_]/g, '_');

    return `${safeTaskId}-${safeScenarioId}${safeStepId}-${timestamp}.${extension}`;
  }

  /**
   * Get the appropriate directory for an artifact type
   */
  private getDirectoryForType(type: ArtifactType): string {
    const dirMap: Record<ArtifactType, string> = {
      screenshot: this.directories.screenshots,
      trace: this.directories.traces,
      'console-log': this.directories.console,
      'network-log': this.directories.network,
      'dom-snapshot': this.directories.dom,
      video: this.directories.videos,
      'performance-metrics': this.directories.root
    };
    return dirMap[type] || this.directories.root;
  }

  /**
   * Save an artifact and return the Artifact metadata
   */
  async saveArtifact(
    type: ArtifactType,
    content: string | Buffer,
    taskId: string,
    scenarioId: string,
    stepId?: string,
    extension?: string
  ): Promise<Artifact> {
    const directory = this.getDirectoryForType(type);
    const filename = this.generateFilename(type, taskId, scenarioId, stepId, extension);
    const filepath = path.join(directory, filename);

    await fs.promises.writeFile(filepath, content, 'utf-8');

    const stats = await fs.promises.stat(filepath);

    return {
      type,
      path: filepath,
      timestamp: new Date(stats.mtime).toISOString(),
      size: stats.size,
      metadata: {
        taskId,
        scenarioId,
        stepId
      }
    };
  }

  /**
   * Save a screenshot artifact
   */
  async saveScreenshot(
    buffer: Buffer,
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    return this.saveArtifact('screenshot', buffer, taskId, scenarioId, stepId, 'png');
  }

  /**
   * Save console logs as artifact
   */
  async saveConsoleLogs(
    logs: unknown[],
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    return this.saveArtifact('console-log', JSON.stringify(logs, null, 2), taskId, scenarioId, stepId, 'json');
  }

  /**
   * Save network logs as artifact
   */
  async saveNetworkLogs(
    logs: unknown[],
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    return this.saveArtifact('network-log', JSON.stringify(logs, null, 2), taskId, scenarioId, stepId, 'json');
  }

  /**
   * Save DOM snapshot as artifact
   */
  async saveDomSnapshot(
    html: string,
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    return this.saveArtifact('dom-snapshot', html, taskId, scenarioId, stepId, 'html');
  }

  /**
   * Save trace/chrome trace as artifact
   */
  async saveTrace(
    traceData: string,
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    return this.saveArtifact('trace', traceData, taskId, scenarioId, stepId, 'json');
  }

  /**
   * Save video artifact
   */
  async saveVideo(
    videoPath: string,
    taskId: string,
    scenarioId: string,
    stepId?: string
  ): Promise<Artifact> {
    const filename = this.generateFilename('video', taskId, scenarioId, stepId, 'webm');
    const targetPath = path.join(this.directories.videos, filename);

    await fs.promises.copyFile(videoPath, targetPath);

    const stats = await fs.promises.stat(targetPath);

    return {
      type: 'video',
      path: targetPath,
      timestamp: new Date(stats.mtime).toISOString(),
      size: stats.size,
      metadata: {
        taskId,
        scenarioId,
        stepId
      }
    };
  }

  /**
   * Get all artifacts for a specific task
   */
  async getArtifactsForTask(taskId: string): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];

    for (const dir of Object.values(this.directories)) {
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          if (file.startsWith(taskId.replace(/[^a-zA-Z0-9-_]/g, '_'))) {
            const filepath = path.join(dir, file);
            const stats = await fs.promises.stat(filepath);
            const type = this.inferTypeFromDir(dir);

            artifacts.push({
              type,
              path: filepath,
              timestamp: new Date(stats.mtime).toISOString(),
              size: stats.size
            });
          }
        }
      } catch {
        // Directory may not exist
      }
    }

    return artifacts;
  }

  /**
   * Get all artifacts for a specific scenario
   */
  async getArtifactsForScenario(taskId: string, scenarioId: string): Promise<Artifact[]> {
    const taskArtifacts = await this.getArtifactsForTask(taskId);
    const safeScenarioId = scenarioId.replace(/[^a-zA-Z0-9-_]/g, '_');

    return taskArtifacts.filter(a => path.basename(a.path).includes(safeScenarioId));
  }

  /**
   * Clean up old artifacts (older than specified days)
   */
  async cleanupOldArtifacts(daysToKeep = 7): Promise<number> {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const dir of Object.values(this.directories)) {
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const filepath = path.join(dir, file);
          try {
            const stats = await fs.promises.stat(filepath);

            if (stats.mtimeMs < cutoff) {
              await fs.promises.unlink(filepath);
              deletedCount++;
            }
          } catch {
            // File may have been deleted
          }
        }
      } catch {
        // Directory may not exist
      }
    }

    return deletedCount;
  }

  /**
   * Get total size of all artifacts
   */
  async getTotalArtifactSize(): Promise<number> {
    let totalSize = 0;

    for (const dir of Object.values(this.directories)) {
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const filepath = path.join(dir, file);
          try {
            const stats = await fs.promises.stat(filepath);
            totalSize += stats.size;
          } catch {
            // File may have been deleted
          }
        }
      } catch {
        // Directory may not exist
      }
    }

    return totalSize;
  }

  /**
   * Get artifact directory structure
   */
  getDirectories(): ArtifactDirectoryStructure {
    return { ...this.directories };
  }

  /**
   * Infer artifact type from directory path
   */
  private inferTypeFromDir(dir: string): ArtifactType {
    if (dir === this.directories.screenshots) return 'screenshot';
    if (dir === this.directories.traces) return 'trace';
    if (dir === this.directories.console) return 'console-log';
    if (dir === this.directories.network) return 'network-log';
    if (dir === this.directories.dom) return 'dom-snapshot';
    if (dir === this.directories.videos) return 'video';
    return 'screenshot';
  }

  /**
   * Create a compressed bundle of all artifacts for a task
   */
  async createArtifactBundle(taskId: string, outputPath?: string): Promise<string> {
    // This is a placeholder for future implementation
    // Would require a compression library
    throw new Error('Artifact bundle creation not yet implemented');
  }
}

/**
 * Global artifact manager instance
 */
let globalArtifactManager: ArtifactManager | null = null;

/**
 * Get or create the global artifact manager
 */
export function getArtifactManager(artifactRoot?: string): ArtifactManager {
  if (!globalArtifactManager || artifactRoot) {
    globalArtifactManager = new ArtifactManager(artifactRoot);
  }
  return globalArtifactManager;
}
