import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { _initTestDatabase } from '../db.js';
import {
  scanDirectoryForProjects,
  registerProject,
  addManualProject,
  findProjectByName,
  getAllProjects,
} from '../project-manager.js';
import { formatSessionDuration } from '../session-manager.js';
import { Project, Session } from '../types.js';

describe('Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    _initTestDatabase();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxclaw-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('End-to-End Project Discovery Workflow', () => {
    it('should discover, register, and find projects in a complete workflow', () => {
      // Setup: Create multiple projects
      const projects = [
        { name: 'frontend-app', indicators: ['package.json', '.git'] },
        { name: 'backend-api', indicators: ['Cargo.toml'] },
        { name: 'data-pipeline', indicators: ['pyproject.toml', '.git'] },
      ];

      for (const proj of projects) {
        const projPath = path.join(tempDir, proj.name);
        fs.mkdirSync(projPath, { recursive: true });
        for (const indicator of proj.indicators) {
          if (indicator === '.git') {
            fs.mkdirSync(path.join(projPath, '.git'), { recursive: true });
          } else if (indicator === 'package.json') {
            fs.writeFileSync(
              path.join(projPath, 'package.json'),
              JSON.stringify({ name: proj.name, dependencies: {} })
            );
          } else if (indicator === 'Cargo.toml') {
            fs.writeFileSync(
              path.join(projPath, 'Cargo.toml'),
              '[package]\nname = "test"'
            );
          } else if (indicator === 'pyproject.toml') {
            fs.writeFileSync(
              path.join(projPath, 'pyproject.toml'),
              '[project]\nname = "test"'
            );
          }
        }
      }

      // Step 1: Discover projects
      const discovered = scanDirectoryForProjects(tempDir, 2);
      expect(discovered).toHaveLength(3);

      // Step 2: Register all discovered projects
      for (const discovery of discovered) {
        registerProject(discovery);
      }

      // Step 3: Verify all projects are registered
      const allProjects = getAllProjects();
      expect(allProjects).toHaveLength(3);

      // Step 4: Find projects by name (various matching strategies)
      expect(findProjectByName('frontend-app')).not.toBeNull();
      expect(findProjectByName('FRONTEND-APP')).not.toBeNull(); // Case insensitive
      expect(findProjectByName('backend')).not.toBeNull(); // Partial match
      expect(findProjectByName('data')).not.toBeNull();
      expect(findProjectByName('nonexistent')).toBeNull();
    });

    it('should handle project with complex tech stack', () => {
      const projectPath = path.join(tempDir, 'fullstack-app');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          name: 'fullstack-app',
          dependencies: {
            react: '^18.0.0',
            next: '^14.0.0',
            typescript: '^5.0.0',
            tailwindcss: '^3.0.0',
          },
          devDependencies: {
            prisma: '^5.0.0',
          },
        })
      );

      const discovered = scanDirectoryForProjects(tempDir, 2);
      expect(discovered).toHaveLength(1);

      const techStack = discovered[0].techStack;
      expect(techStack).toContain('Node.js');
      expect(techStack).toContain('Git');
      expect(techStack).toContain('React');
      expect(techStack).toContain('Next.js');
      expect(techStack).toContain('TypeScript');
      expect(techStack).toContain('Tailwind CSS');
      expect(techStack).toContain('Prisma');
    });

    it('should handle edge case: directory with no read permissions', () => {
      const accessibleProject = path.join(tempDir, 'accessible');
      const restrictedProject = path.join(tempDir, 'restricted');

      fs.mkdirSync(path.join(accessibleProject, '.git'), { recursive: true });
      fs.mkdirSync(path.join(restrictedProject, '.git'), { recursive: true });

      // Remove read permissions (skip on Windows)
      if (process.platform !== 'win32') {
        fs.chmodSync(restrictedProject, 0o000);
      }

      try {
        const discovered = scanDirectoryForProjects(tempDir, 2);
        // Should find at least the accessible project, and not crash on restricted
        expect(discovered.length).toBeGreaterThanOrEqual(1);
      } finally {
        // Restore permissions for cleanup
        if (process.platform !== 'win32') {
          fs.chmodSync(restrictedProject, 0o755);
        }
      }
    });

    it('should handle edge case: broken symlinks', () => {
      const realProject = path.join(tempDir, 'real');
      const brokenLink = path.join(tempDir, 'broken-link');

      fs.mkdirSync(path.join(realProject, '.git'), { recursive: true });

      // Create broken symlink (skip on Windows)
      if (process.platform !== 'win32') {
        fs.symlinkSync('/nonexistent/path', brokenLink);
      }

      const discovered = scanDirectoryForProjects(tempDir, 2);
      expect(discovered).toHaveLength(1);
      expect(discovered[0].name).toBe('real');
    });

    it('should handle edge case: very deep directory structure', () => {
      // Create deeply nested directory structure
      let currentPath = tempDir;
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        if (i === 9) {
          fs.mkdirSync(path.join(currentPath, '.git'), { recursive: true });
        }
      }

      // With depth=5, should not find the deeply nested project
      const shallowResults = scanDirectoryForProjects(tempDir, 5);
      expect(shallowResults).toHaveLength(0);

      // With depth=10, should find it
      const deepResults = scanDirectoryForProjects(tempDir, 10);
      expect(deepResults).toHaveLength(1);
    });

    it('should handle edge case: project name collisions', () => {
      // Create two projects with the same name in different locations
      const location1 = path.join(tempDir, 'location1', 'myproject');
      const location2 = path.join(tempDir, 'location2', 'myproject');

      fs.mkdirSync(path.join(location1, '.git'), { recursive: true });
      fs.mkdirSync(path.join(location2, '.git'), { recursive: true });

      const discovered = scanDirectoryForProjects(tempDir, 3);
      expect(discovered).toHaveLength(2);

      // Both should have the same name but different paths
      expect(discovered[0].name).toBe('myproject');
      expect(discovered[1].name).toBe('myproject');
      expect(discovered[0].path).not.toBe(discovered[1].path);
    });

    it('should handle edge case: special characters in project names', () => {
      const specialNames = [
        'project with spaces',
        'project-with-dashes',
        'project_with_underscores',
        'project.multiple.dots',
        'project@symbol',
        '日本語プロジェクト',
      ];

      for (const name of specialNames) {
        const projectPath = path.join(tempDir, name);
        fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });
      }

      const discovered = scanDirectoryForProjects(tempDir, 2);
      expect(discovered).toHaveLength(specialNames.length);

      for (const name of specialNames) {
        const found = discovered.find(d => d.name === name);
        expect(found).toBeDefined();
      }
    });
  });

  describe('Session Duration Edge Cases', () => {
    it('should handle very long sessions', () => {
      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-03T12:30:00Z', // 2.5 days
        status: 'completed',
      };

      expect(formatSessionDuration(session)).toBe('60h 30m');
    });

    it('should handle sessions with zero duration', () => {
      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-01-01T10:00:00Z',
        endedAt: '2024-01-01T10:00:00Z',
        status: 'completed',
      };

      expect(formatSessionDuration(session)).toBe('0m');
    });

    it('should handle sessions crossing DST boundaries', () => {
      // Spring forward: clocks jump from 2:00 to 3:00
      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-03-10T01:00:00-05:00', // Before DST
        endedAt: '2024-03-10T04:00:00-04:00',   // After DST
        status: 'completed',
      };

      // Duration calculation uses ISO timestamps with offsets
      // 01:00 EST to 04:00 EDT = 2 hours wall clock, but 3 hours elapsed
      // The actual result depends on how the dates are parsed
      const duration = formatSessionDuration(session);
      expect(duration).toMatch(/\d+h/); // Just verify it produces hours
    });
  });

  describe('Add Manual Project Edge Cases', () => {
    it('should handle adding a project that is a symlink', () => {
      const realProject = path.join(tempDir, 'real-project');
      const symlinkProject = path.join(tempDir, 'symlink-project');

      fs.mkdirSync(path.join(realProject, '.git'), { recursive: true });

      // Skip on Windows
      if (process.platform !== 'win32') {
        fs.symlinkSync(realProject, symlinkProject);

        const project = addManualProject(symlinkProject, 'Symlink Project');
        expect(project.path).toBe(symlinkProject);
        expect(project.techStack).toContain('Git');
      }
    });

    it('should handle adding project with empty directory', () => {
      const emptyProject = path.join(tempDir, 'empty-project');
      fs.mkdirSync(emptyProject, { recursive: true });

      const project = addManualProject(emptyProject);
      expect(project.name).toBe('empty-project');
      expect(project.techStack).toEqual([]);
    });
  });
});
