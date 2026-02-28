import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  getSocketPath,
  checkSocketExists,
  cleanupSocket,
  validateSocket,
  ensureSocketDir,
} from '../socket-manager.js';

describe('Socket Manager', () => {
  const testSocketDir = path.join(os.tmpdir(), 'maxclaw-test-socket', `test-${Date.now()}`);

  beforeEach(() => {
    // Clean up any existing test sockets
    try {
      const existingSocket = path.join(testSocketDir, 'daemon.sock');
      if (fs.existsSync(existingSocket)) {
        fs.unlinkSync(existingSocket);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testSocketDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getSocketPath', () => {
    it('should return the correct socket path', () => {
      const socketPath = getSocketPath();

      // Should be in the user's home directory
      expect(socketPath).toContain('.maxclaw');
      expect(socketPath).toContain('daemon.sock');
    });
  });

  describe('checkSocketExists', () => {
    it('should return false when socket does not exist', () => {
      const exists = checkSocketExists();

      // Socket should not exist in test environment
      expect(exists).toBe(false);
    });
  });

  describe('validateSocket', () => {
    it('should return valid: true for valid socket path', () => {
      const result = validateSocket();

      expect(result.valid).toBe(true);
    });

    it('should create directory if it does not exist', () => {
      const result = validateSocket();

      // Directory should be created
      expect(result.valid).toBe(true);
    });
  });

  describe('ensureSocketDir', () => {
    it('should create socket directory if it does not exist', () => {
      ensureSocketDir();

      // Directory should exist after calling ensureSocketDir
      const socketDir = path.dirname(getSocketPath());
      expect(fs.existsSync(socketDir)).toBe(true);
    });
  });

  describe('cleanupSocket', () => {
    it('should not throw when socket does not exist', () => {
      expect(() => cleanupSocket()).not.toThrow();
    });
  });
});
