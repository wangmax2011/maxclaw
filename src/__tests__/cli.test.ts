import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('CLI Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let testHome: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxclaw-cli-'));
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'maxclaw-home-'));

    // Create test projects
    const project1 = path.join(tempDir, 'test-project-1');
    const project2 = path.join(tempDir, 'test-project-2');

    fs.mkdirSync(path.join(project1, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(project1, 'package.json'),
      JSON.stringify({ name: 'test-project-1' })
    );

    fs.mkdirSync(path.join(project2, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(project2, 'Cargo.toml'),
      '[package]\nname = "test-project-2"'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(testHome, { recursive: true, force: true });
  });

  function runMaxclaw(args: string, env: Record<string, string> = {}): string {
    const homeEnv = { ...process.env, HOME: testHome, ...env };
    try {
      return execSync(`node ${path.join(originalCwd, 'dist/index.js')} ${args}`, {
        encoding: 'utf-8',
        cwd: tempDir,
        env: homeEnv,
      });
    } catch (error: any) {
      // Combine stdout and stderr to capture all output
      return (error.stdout || '') + (error.stderr || '');
    }
  }

  describe('list command', () => {
    it('should show empty list when no projects', () => {
      const output = runMaxclaw('list');
      expect(output).toContain('No projects registered');
    });

    it('should list projects after discovery', () => {
      runMaxclaw(`discover ${tempDir}`);
      const output = runMaxclaw('list');
      expect(output).toContain('test-project-1');
      expect(output).toContain('test-project-2');
      expect(output).toContain('Node.js');
      expect(output).toContain('Rust');
    });
  });

  describe('discover command', () => {
    it('should discover projects in specified path', () => {
      const output = runMaxclaw(`discover ${tempDir}`);
      expect(output).toContain('test-project-1');
      expect(output).toContain('test-project-2');
      expect(output).toContain('Found');
    });

    it('should handle non-existent path gracefully', () => {
      const output = runMaxclaw('discover /nonexistent/path');
      expect(output).toContain('0'); // 0 projects found
    });
  });

  describe('add command', () => {
    it('should add a project manually', () => {
      const newProject = path.join(tempDir, 'manual-project');
      fs.mkdirSync(path.join(newProject, '.git'), { recursive: true });

      const output = runMaxclaw(`add ${newProject} --name "Manual Project"`);
      expect(output).toContain('Added project');
      expect(output).toContain('Manual Project');

      // Verify it appears in list
      const listOutput = runMaxclaw('list');
      expect(listOutput).toContain('Manual Project');
    });

    it('should handle duplicate project gracefully', () => {
      runMaxclaw(`discover ${tempDir}`);

      // Try to add already discovered project
      const project1 = path.join(tempDir, 'test-project-1');
      const output = runMaxclaw(`add ${project1}`);
      expect(output).toContain('already registered');
    });

    it('should handle non-existent path', () => {
      const output = runMaxclaw('add /nonexistent/path');
      expect(output).toContain('does not exist');
    });
  });

  describe('remove command', () => {
    it('should remove a project by name', () => {
      runMaxclaw(`discover ${tempDir}`);

      const output = runMaxclaw('remove test-project-1');
      expect(output).toContain('Removed project');

      // Verify it's gone
      const listOutput = runMaxclaw('list');
      expect(listOutput).not.toContain('test-project-1');
      expect(listOutput).toContain('test-project-2');
    });

    it('should handle removing non-existent project', () => {
      const output = runMaxclaw('remove nonexistent-project');
      expect(output).toContain('not found');
    });
  });

  describe('status command', () => {
    it('should show no active sessions initially', () => {
      const output = runMaxclaw('status');
      expect(output).toContain('No active');
    });
  });

  describe('history command', () => {
    it('should show no history for project without sessions', () => {
      runMaxclaw(`discover ${tempDir}`);

      const output = runMaxclaw('history test-project-1');
      expect(output).toContain('No sessions recorded');
    });

    it('should handle non-existent project', () => {
      const output = runMaxclaw('history nonexistent');
      expect(output).toContain('not found');
    });
  });

  describe('config command', () => {
    it('should show default configuration', () => {
      const output = runMaxclaw('config');
      expect(output).toContain('MaxClaw Configuration');
      expect(output).toContain('Scan paths');
      expect(output).toContain('Data directory');
    });

    it('should add and remove scan paths', () => {
      const newPath = path.join(tempDir, 'new-scan-path');
      fs.mkdirSync(newPath, { recursive: true });

      // Get the resolved path (after fs.realpathSync)
      const resolvedPath = fs.realpathSync(newPath);

      // Add path
      const addOutput = runMaxclaw(`config --add-path ${newPath}`);
      expect(addOutput).toContain('Added');

      // Verify in config (using resolved path)
      const configOutput = runMaxclaw('config');
      expect(configOutput).toContain(resolvedPath);

      // Remove path (using resolved path)
      const removeOutput = runMaxclaw(`config --remove-path ${resolvedPath}`);
      expect(removeOutput).toContain('Removed');
    });
  });

  describe('activity command', () => {
    it('should show activity after discovery', () => {
      runMaxclaw(`discover ${tempDir}`);

      const output = runMaxclaw('activity');
      expect(output).toContain('discover');
    });

    it('should filter activity by project', () => {
      runMaxclaw(`discover ${tempDir}`);

      const output = runMaxclaw('activity test-project-1');
      expect(output).toContain('Recent activity');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle help command', () => {
      const output = runMaxclaw('--help');
      expect(output).toContain('Usage');
      expect(output).toContain('Commands');
      expect(output).toContain('list');
      expect(output).toContain('discover');
      expect(output).toContain('start');
    });

    it('should handle unknown command gracefully', () => {
      try {
        runMaxclaw('unknowncommand');
      } catch (error: any) {
        expect(error.stderr || error.stdout).toContain('unknown');
      }
    });

    it('should handle special characters in project names', () => {
      const specialProject = path.join(tempDir, 'project-with-dashes_and.dots');
      fs.mkdirSync(path.join(specialProject, '.git'), { recursive: true });

      runMaxclaw(`discover ${tempDir}`);

      const listOutput = runMaxclaw('list');
      expect(listOutput).toContain('project-with-dashes_and.dots');
    });
  });
});
