/**
 * JSON Storage with concurrency protection
 *
 * Provides atomic write operations and thread-safe JSON storage
 * to prevent data corruption under concurrent access.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Storage interface for key-value operations (synchronous for backward compatibility)
 */
export interface IStorage {
  /**
   * Get a value by key
   * @param key - Storage key
   * @returns unknown | null - Value or null if not found
   */
  get(key: string): unknown | null;

  /**
   * Set a value by key
   * @param key - Storage key
   * @param value - Value to store
   */
  set(key: string, value: unknown): void;

  /**
   * Delete a value by key
   * @param key - Storage key
   * @returns boolean - True if deleted, false if not found
   */
  delete(key: string): boolean;

  /**
   * List all keys with optional prefix
   * @param prefix - Optional key prefix to filter
   * @returns string[] - Array of keys
   */
  list(prefix?: string): string[];

  /**
   * Check if a key exists
   * @param key - Storage key
   * @returns boolean - True if key exists
   */
  has(key: string): boolean;
}

/**
 * JSON storage configuration
 */
export interface JsonStorageConfig {
  /** Storage directory */
  storageDir?: string;
  /** File extension for JSON files */
  fileExtension?: string;
  /** Whether to create directory if not exists */
  createDir?: boolean;
  /** Atomic write timeout (ms) */
  writeTimeout?: number;
}

/**
 * JSON Storage implementation with atomic writes
 * Uses write-file-atomic pattern: write to .tmp then rename for atomic replacement
 */
export class JsonStorage implements IStorage {
  private config: Required<JsonStorageConfig>;
  private storageDir: string;

  constructor(config: JsonStorageConfig = {}) {
    this.config = {
      storageDir: config.storageDir || './data',
      fileExtension: config.fileExtension || '.json',
      createDir: config.createDir !== false,
      writeTimeout: config.writeTimeout || 5000,
    };

    this.storageDir = this.config.storageDir;

    // Create storage directory if needed
    if (this.config.createDir) {
      this.ensureStorageDir();
    }
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Get file path for a key
   */
  private getFilePath(key: string): string {
    // Sanitize key to be valid filename
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageDir, `${sanitizedKey}${this.config.fileExtension}`);
  }

  /**
   * Get a value by key (synchronous for backward compatibility)
   */
  get(key: string): unknown | null {
    try {
      const filePath = this.getFilePath(key);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[JsonStorage] Error reading key '${key}':`, error);
      return null;
    }
  }

  /**
   * Get a value by key (async version)
   */
  async getAsync(key: string): Promise<unknown | null> {
    return this.get(key);
  }

  /**
   * Set a value by key with atomic write (synchronous for backward compatibility)
   */
  set(key: string, value: unknown): void {
    const filePath = this.getFilePath(key);
    const tempPath = `${filePath}.tmp`;

    try {
      // Ensure directory exists
      this.ensureStorageDir();

      // Write to temporary file
      const content = JSON.stringify(value, null, 2);
      fs.writeFileSync(tempPath, content, 'utf-8');

      // Atomic rename to actual file
      fs.renameSync(tempPath, filePath);

      // Verify write was successful
      if (fs.existsSync(tempPath)) {
        // Clean up temp file if rename failed
        fs.unlinkSync(tempPath);
      }
    } catch (error) {
      console.error(`[JsonStorage] Error writing key '${key}':`, error);

      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          console.error(`[JsonStorage] Error cleaning up temp file:`, cleanupError);
        }
      }

      return; // Graceful: log but don't throw
    }
  }

  /**
   * Set a value by key with atomic write (async version)
   */
  async setAsync(key: string, value: unknown): Promise<void> {
    this.set(key, value);
  }

  /**
   * Delete a value by key (synchronous for backward compatibility)
   */
  delete(key: string): boolean {
    try {
      const filePath = this.getFilePath(key);

      if (!fs.existsSync(filePath)) {
        return false;
      }

      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      console.error(`[JsonStorage] Error deleting key '${key}':`, error);
      return false;
    }
  }

  /**
   * List all keys with optional prefix (synchronous for backward compatibility)
   */
  list(prefix?: string): string[] {
    try {
      if (!fs.existsSync(this.storageDir)) {
        return [];
      }

      const files = fs.readdirSync(this.storageDir);
      const keys: string[] = [];

      for (const file of files) {
        if (file.endsWith(this.config.fileExtension)) {
          const key = file.slice(0, -this.config.fileExtension.length);

          if (!prefix || key.startsWith(prefix)) {
            keys.push(key);
          }
        }
      }

      return keys.sort();
    } catch (error) {
      console.error(`[JsonStorage] Error listing keys:`, error);
      return [];
    }
  }

  /**
   * Check if a key exists (synchronous for backward compatibility)
   */
  has(key: string): boolean {
    try {
      const filePath = this.getFilePath(key);
      return fs.existsSync(filePath);
    } catch (error) {
      console.error(`[JsonStorage] Error checking key '${key}':`, error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalKeys: number;
    storageSize: number;
    storageDir: string;
  } {
    let totalKeys = 0;
    let storageSize = 0;

    try {
      if (fs.existsSync(this.storageDir)) {
        const files = fs.readdirSync(this.storageDir);

        for (const file of files) {
          if (file.endsWith(this.config.fileExtension)) {
            totalKeys++;
            const filePath = path.join(this.storageDir, file);
            const stats = fs.statSync(filePath);
            storageSize += stats.size;
          }
        }
      }
    } catch (error) {
      console.error('[JsonStorage] Error getting stats:', error);
    }

    return {
      totalKeys,
      storageSize,
      storageDir: this.storageDir,
    };
  }

  /**
   * Clear all storage (use with caution)
   */
  async clear(): Promise<void> {
    try {
      if (!fs.existsSync(this.storageDir)) {
        return;
      }

      const files = fs.readdirSync(this.storageDir);

      for (const file of files) {
        if (file.endsWith(this.config.fileExtension)) {
          const filePath = path.join(this.storageDir, file);
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('[JsonStorage] Error clearing storage:', error);
      throw error;
    }
  }

  /**
   * Backup storage to a target directory
   */
  async backup(targetDir: string): Promise<void> {
    try {
      if (!fs.existsSync(this.storageDir)) {
        return;
      }

      // Create target directory
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const files = fs.readdirSync(this.storageDir);

      for (const file of files) {
        if (file.endsWith(this.config.fileExtension)) {
          const sourcePath = path.join(this.storageDir, file);
          const targetPath = path.join(targetDir, file);
          fs.copyFileSync(sourcePath, targetPath);
        }
      }

      console.log(`[JsonStorage] Backed up ${files.length} files to ${targetDir}`);
    } catch (error) {
      console.error('[JsonStorage] Error backing up storage:', error);
      throw error;
    }
  }

  /**
   * Restore storage from a backup directory
   */
  async restore(backupDir: string): Promise<void> {
    try {
      if (!fs.existsSync(backupDir)) {
        throw new Error(`Backup directory not found: ${backupDir}`);
      }

      const files = fs.readdirSync(backupDir);
      let restoredCount = 0;

      for (const file of files) {
        if (file.endsWith(this.config.fileExtension)) {
          const sourcePath = path.join(backupDir, file);
          const targetPath = path.join(this.storageDir, file);

          // Atomic restore
          const tempPath = `${targetPath}.tmp`;
          fs.copyFileSync(sourcePath, tempPath);
          fs.renameSync(tempPath, targetPath);

          restoredCount++;
        }
      }

      console.log(`[JsonStorage] Restored ${restoredCount} files from ${backupDir}`);
    } catch (error) {
      console.error('[JsonStorage] Error restoring storage:', error);
      throw error;
    }
  }
}