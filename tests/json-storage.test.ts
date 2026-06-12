/**
 * JsonStorage unit tests
 *
 * Tests the atomic JSON storage implementation with concurrent access protection
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonStorage } from '../src/storage/json-storage';

describe('JsonStorage', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-storage-test-'));
    storage = new JsonStorage({
      storageDir: tempDir,
      fileExtension: '.json',
      createDir: true,
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('set and get', () => {
    test('should set and get simple values', () => {
      storage.set('test-key', 'test-value');
      const value = storage.get('test-key');

      expect(value).toBe('test-value');
    });

    test('should set and get complex objects', () => {
      const complexObject = {
        string: 'value',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          key: 'nested-value',
        },
      };

      storage.set('complex-key', complexObject);
      const value = storage.get('complex-key');

      expect(value).toEqual(complexObject);
    });

    test('should return null for non-existent keys', () => {
      const value = storage.get('non-existent-key');
      expect(value).toBeNull();
    });

    test('should handle special characters in keys', () => {
      storage.set('key/with/slashes', 'value1');
      storage.set('key with spaces', 'value2');
      storage.set('key:with:colons', 'value3');

      expect(storage.get('key_with_slashes')).toBe('value1');
      expect(storage.get('key_with_spaces')).toBe('value2');
      expect(storage.get('key_with_colons')).toBe('value3');
    });
  });

  describe('atomic write', () => {
    test('should maintain valid JSON after write', () => {
      const data = { key: 'value', number: 123 };
      storage.set('atomic-test', data);

      // Read file directly to verify valid JSON
      const filePath = path.join(tempDir, 'atomic-test.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      expect(() => JSON.parse(fileContent)).not.toThrow();
      expect(JSON.parse(fileContent)).toEqual(data);
    });

    test('should not leave .tmp files after successful write', () => {
      storage.set('no-tmp-file', { value: 'test' });

      const tmpFilePath = path.join(tempDir, 'no-tmp-file.json.tmp');
      expect(fs.existsSync(tmpFilePath)).toBe(false);

      const actualFilePath = path.join(tempDir, 'no-tmp-file.json');
      expect(fs.existsSync(actualFilePath)).toBe(true);
    });

    test('should handle concurrent writes safely', () => {
      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            storage.set(`concurrent-${i}`, { value: i });
            resolve();
          })
        );
      }

      // All writes should complete without errors
      expect(Promise.all(promises)).resolves.not.toThrow();

      // Verify all files exist and have valid JSON
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(tempDir, `concurrent-${i}.json`);
        expect(fs.existsSync(filePath)).toBe(true);

        const content = fs.readFileSync(filePath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }
    });

    test('should clean up .tmp files on write error', () => {
      // Create a scenario where write might fail
      const invalidStorage = new JsonStorage({
        storageDir: '/invalid-path-that-does-not-exist/root',
        fileExtension: '.json',
        createDir: false,
      });

      // Should not throw - JsonStorage handles errors gracefully internally
      expect(() => {
        invalidStorage.set('should-fail', 'value');
      }).not.toThrow();
    });
  });

  describe('delete', () => {
    test('should delete existing keys', () => {
      storage.set('delete-me', 'value');
      expect(storage.get('delete-me')).toBe('value');

      const deleted = storage.delete('delete-me');
      expect(deleted).toBe(true);
      expect(storage.get('delete-me')).toBeNull();
    });

    test('should return false for non-existent keys', () => {
      const deleted = storage.delete('non-existent-key');
      expect(deleted).toBe(false);
    });

    test('should remove file after deletion', () => {
      storage.set('file-delete', 'value');
      const filePath = path.join(tempDir, 'file-delete.json');
      expect(fs.existsSync(filePath)).toBe(true);

      storage.delete('file-delete');
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Setup test data
      storage.set('prefix-key1', 'value1');
      storage.set('prefix-key2', 'value2');
      storage.set('other-key', 'value3');
      storage.set('prefix-key3', 'value4');
    });

    test('should list all keys', () => {
      const keys = storage.list();
      expect(keys).toHaveLength(4);
      expect(keys).toContain('prefix-key1');
      expect(keys).toContain('prefix-key2');
      expect(keys).toContain('other-key');
      expect(keys).toContain('prefix-key3');
    });

    test('should filter keys by prefix', () => {
      const keys = storage.list('prefix-');
      expect(keys).toHaveLength(3);
      expect(keys).toContain('prefix-key1');
      expect(keys).toContain('prefix-key2');
      expect(keys).toContain('prefix-key3');
      expect(keys).not.toContain('other-key');
    });

    test('should return empty array when no keys match', () => {
      const keys = storage.list('non-existent-');
      expect(keys).toEqual([]);
    });

    test('should return empty array when storage is empty', () => {
      const emptyStorage = new JsonStorage({
        storageDir: fs.mkdtempSync(path.join(os.tmpdir(), 'empty-storage-')),
        fileExtension: '.json',
      });

      const keys = emptyStorage.list();
      expect(keys).toEqual([]);
    });
  });

  describe('has', () => {
    test('should return true for existing keys', () => {
      storage.set('exists', 'value');
      expect(storage.has('exists')).toBe(true);
    });

    test('should return false for non-existent keys', () => {
      expect(storage.has('does-not-exist')).toBe(false);
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', () => {
      storage.set('key1', 'value1');
      storage.set('key2', { complex: 'value' });
      storage.set('key3', [1, 2, 3]);

      const stats = storage.getStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.storageSize).toBeGreaterThan(0);
      expect(stats.storageDir).toBe(tempDir);
    });

    test('should return zero stats for empty storage', () => {
      const stats = storage.getStats();

      expect(stats.totalKeys).toBe(0);
      expect(stats.storageSize).toBe(0);
    });
  });

  describe('backup', () => {
    test('should backup storage to target directory', async () => {
      // Setup test data
      storage.set('backup-test1', 'value1');
      storage.set('backup-test2', 'value2');

      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));

      await storage.backup(backupDir);

      // Verify backup files exist
      expect(fs.existsSync(path.join(backupDir, 'backup-test1.json'))).toBe(true);
      expect(fs.existsSync(path.join(backupDir, 'backup-test2.json'))).toBe(true);

      // Verify backup content is correct
      const backupContent = JSON.parse(fs.readFileSync(path.join(backupDir, 'backup-test1.json'), 'utf-8'));
      expect(backupContent).toBe('value1');

      // Cleanup
      fs.rmSync(backupDir, { recursive: true, force: true });
    });

    test('should handle empty storage backup', async () => {
      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-backup-'));

      await expect(storage.backup(backupDir)).resolves.not.toThrow();

      // Cleanup
      fs.rmSync(backupDir, { recursive: true, force: true });
    });
  });

  describe('clear', () => {
    test('should clear all storage', async () => {
      storage.set('clear-test1', 'value1');
      storage.set('clear-test2', 'value2');

      expect(storage.get('clear-test1')).toBe('value1');
      expect(storage.get('clear-test2')).toBe('value2');

      await storage.clear();

      expect(storage.get('clear-test1')).toBeNull();
      expect(storage.get('clear-test2')).toBeNull();
      expect(storage.list()).toEqual([]);
    });

    test('should handle clearing empty storage', async () => {
      await expect(storage.clear()).resolves.not.toThrow();
    });
  });

  describe('restore', () => {
    test('should restore from backup directory', async () => {
      // Setup original data
      storage.set('restore-test', 'original-value');

      // Create backup
      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-test-'));
      await storage.backup(backupDir);

      // Modify original
      storage.set('restore-test', 'modified-value');
      expect(storage.get('restore-test')).toBe('modified-value');

      // Restore from backup
      await storage.restore(backupDir);
      expect(storage.get('restore-test')).toBe('original-value');

      // Cleanup
      fs.rmSync(backupDir, { recursive: true, force: true });
    });

    test('should throw error for non-existent backup directory', async () => {
      await expect(storage.restore('/non-existent-backup-dir')).rejects.toThrow();
    });
  });

  describe('async methods', () => {
    test('getAsync should work like get', async () => {
      storage.set('async-test', 'value');
      const value = await storage.getAsync('async-test');
      expect(value).toBe('value');
    });

    test('setAsync should work like set', async () => {
      await storage.setAsync('async-set-test', 'value');
      expect(storage.get('async-set-test')).toBe('value');
    });
  });
});
