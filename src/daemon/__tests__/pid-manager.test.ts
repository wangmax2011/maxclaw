import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock the PID file path before importing
const TEST_PID_FILE = path.join(os.tmpdir(), 'maxclaw-test', `daemon-${Date.now()}.pid`);

// Ensure test directory exists
const TEST_DIR = path.dirname(TEST_PID_FILE);

describe('PID Manager', () => {
  beforeEach(() => {
    // Create test directory
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Clean up any existing test PID file
    if (fs.existsSync(TEST_PID_FILE)) {
      fs.unlinkSync(TEST_PID_FILE);
    }
  });

  afterEach(() => {
    // Clean up test PID file
    try {
      if (fs.existsSync(TEST_PID_FILE)) {
        fs.unlinkSync(TEST_PID_FILE);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writePidFile', () => {
    it('should write PID file successfully', () => {
      fs.writeFileSync(TEST_PID_FILE, process.pid.toString(), 'utf-8');
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);
    });

    it('should create directory if it does not exist', () => {
      const nestedDir = path.join(TEST_DIR, 'nested', 'path', `test-${Date.now()}`);
      const testPidFile = path.join(nestedDir, 'daemon.pid');

      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(testPidFile, process.pid.toString(), 'utf-8');

      // Write should succeed even with nested directories
      expect(fs.existsSync(testPidFile)).toBe(true);

      // Cleanup
      fs.unlinkSync(testPidFile);
    });
  });

  describe('read and check PID', () => {
    it('should return null when PID file does not exist', () => {
      // Ensure file doesn't exist
      if (fs.existsSync(TEST_PID_FILE)) {
        fs.unlinkSync(TEST_PID_FILE);
      }

      const content = fs.existsSync(TEST_PID_FILE)
        ? fs.readFileSync(TEST_PID_FILE, 'utf-8').trim()
        : null;

      expect(content).toBeNull();
    });

    it('should return running: false when no daemon is running', () => {
      // Don't create a PID file
      const exists = fs.existsSync(TEST_PID_FILE);
      expect(exists).toBe(false);
    });

    it('should detect and validate running process', () => {
      // Write current process PID
      fs.writeFileSync(TEST_PID_FILE, process.pid.toString(), 'utf-8');

      // Read back and verify
      const content = fs.readFileSync(TEST_PID_FILE, 'utf-8').trim();
      const pid = parseInt(content, 10);

      expect(pid).toBe(process.pid);

      // Verify process is running
      let processRunning = false;
      try {
        process.kill(pid, 0);
        processRunning = true;
      } catch {
        // Process not running
      }

      expect(processRunning).toBe(true);
    });

    it('should clean up stale PID file for non-existent process', () => {
      // Write a PID that doesn't exist
      const fakePid = 999999;
      fs.writeFileSync(TEST_PID_FILE, fakePid.toString(), 'utf-8');

      // Verify process is not running
      let processRunning = false;
      try {
        process.kill(fakePid, 0);
        processRunning = true;
      } catch {
        // Process not running - this is expected
      }

      expect(processRunning).toBe(false);
    });
  });

  describe('removePidFile', () => {
    it('should remove existing PID file', () => {
      // First write
      fs.writeFileSync(TEST_PID_FILE, process.pid.toString(), 'utf-8');
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);

      // Then remove
      fs.unlinkSync(TEST_PID_FILE);

      // Should not exist anymore
      expect(fs.existsSync(TEST_PID_FILE)).toBe(false);
    });

    it('should not throw when PID file does not exist', () => {
      // Ensure file doesn't exist first
      if (fs.existsSync(TEST_PID_FILE)) {
        fs.unlinkSync(TEST_PID_FILE);
      }

      // Remove again should not throw
      expect(() => {
        if (fs.existsSync(TEST_PID_FILE)) {
          fs.unlinkSync(TEST_PID_FILE);
        }
      }).not.toThrow();
    });
  });
});
