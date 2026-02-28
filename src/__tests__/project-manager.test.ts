import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  scanDirectoryForProjects,
  discoverProjects,
  registerProject,
  addManualProject,
  findProjectByName,
  getAllProjects,
} from '../project-manager.js';
import { _initTestDatabase } from '../db.js';
import { ProjectDiscoveryResult } from '../types.js';

describe('Project Manager', () => {
  let tempDir: string;

  beforeEach(() => {
    _initTestDatabase();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxclaw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('scanDirectoryForProjects', () => {
    it('should find project with package.json', () => {
      const projectPath = path.join(tempDir, 'node-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: 'test' }));

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('node-project');
      expect(results[0].techStack).toContain('Node.js');
    });

    it('should find project with .git directory', () => {
      const projectPath = path.join(tempDir, 'git-project');
      fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('git-project');
      expect(results[0].techStack).toContain('Git');
    });

    it('should find nested projects up to depth', () => {
      // Create sibling projects at the root level with nested subdirectories
      const project1 = path.join(tempDir, 'project1');
      const project2 = path.join(tempDir, 'project2');
      const nestedInProject1 = path.join(project1, 'nested');

      fs.mkdirSync(path.join(project1, '.git'), { recursive: true });
      fs.mkdirSync(path.join(project2, '.git'), { recursive: true });
      fs.mkdirSync(path.join(nestedInProject1, '.git'), { recursive: true });

      // depth=1: only scan root level projects
      const resultsDepth1 = scanDirectoryForProjects(tempDir, 1);
      expect(resultsDepth1).toHaveLength(2); // project1 and project2

      // Note: Scanner does NOT enter directories that are already projects
      // This is intentional - we don't want to find nested projects inside other projects
      // (e.g., node_modules inside a project should not be scanned for sub-projects)
      const resultsDepth2 = scanDirectoryForProjects(tempDir, 2);
      expect(resultsDepth2).toHaveLength(2); // Still just project1 and project2
    });

    it('should detect Python project', () => {
      const projectPath = path.join(tempDir, 'python-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'requirements.txt'), 'requests\n');

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].techStack).toContain('Python');
    });

    it('should detect Rust project', () => {
      const projectPath = path.join(tempDir, 'rust-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'Cargo.toml'), '[package]\nname = "test"');

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].techStack).toContain('Rust');
    });

    it('should detect Go project', () => {
      const projectPath = path.join(tempDir, 'go-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'go.mod'), 'module test\n');

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].techStack).toContain('Go');
    });

    it('should skip node_modules and hidden directories', () => {
      const projectPath = path.join(tempDir, 'project');
      fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'node_modules', 'some-pkg'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, '.hidden', '.git'), { recursive: true });

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('project');
    });

    it('should handle non-existent path', () => {
      const results = scanDirectoryForProjects('/non/existent/path', 2);
      expect(results).toHaveLength(0);
    });
  });

  describe('detectTechStack', () => {
    it('should detect React from package.json', () => {
      const projectPath = path.join(tempDir, 'react-app');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
        })
      );

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results[0].techStack).toContain('React');
      expect(results[0].techStack).toContain('Node.js');
    });

    it('should detect TypeScript from package.json', () => {
      const projectPath = path.join(tempDir, 'ts-app');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          devDependencies: { typescript: '^5.0.0' },
        })
      );

      const results = scanDirectoryForProjects(tempDir, 2);
      expect(results[0].techStack).toContain('TypeScript');
    });
  });

  describe('registerProject', () => {
    it('should register a discovered project', () => {
      const discovery: ProjectDiscoveryResult = {
        path: '/home/user/test-project',
        name: 'test-project',
        indicators: [{ type: 'git', path: '/home/user/test-project/.git' }],
        techStack: ['Git'],
      };

      const project = registerProject(discovery);
      expect(project.name).toBe('test-project');
      expect(project.techStack).toContain('Git');
    });

    it('should not duplicate projects', () => {
      const discovery: ProjectDiscoveryResult = {
        path: '/home/user/test-project',
        name: 'test-project',
        indicators: [{ type: 'git', path: '/home/user/test-project/.git' }],
        techStack: ['Git'],
      };

      registerProject(discovery);
      const second = registerProject(discovery);

      const allProjects = getAllProjects();
      expect(allProjects).toHaveLength(1);
    });
  });

  describe('addManualProject', () => {
    it('should add a manual project', () => {
      const projectPath = path.join(tempDir, 'manual-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

      const project = addManualProject(projectPath, 'My Manual Project', 'Description');
      expect(project.name).toBe('My Manual Project');
      expect(project.description).toBe('Description');
    });

    it('should throw if path does not exist', () => {
      expect(() => addManualProject('/non/existent')).toThrow('Path does not exist');
    });
  });

  describe('findProjectByName', () => {
    it('should find by exact match', () => {
      const discovery: ProjectDiscoveryResult = {
        path: '/home/user/test-project',
        name: 'test-project',
        indicators: [{ type: 'git', path: '/home/user/test-project/.git' }],
        techStack: ['Git'],
      };

      registerProject(discovery);
      const found = findProjectByName('test-project');
      expect(found).not.toBeNull();
    });

    it('should find by case-insensitive match', () => {
      const discovery: ProjectDiscoveryResult = {
        path: '/home/user/test-project',
        name: 'Test-Project',
        indicators: [{ type: 'git', path: '/home/user/test-project/.git' }],
        techStack: ['Git'],
      };

      registerProject(discovery);
      const found = findProjectByName('test-project');
      expect(found).not.toBeNull();
    });

    it('should find by partial match', () => {
      const discovery: ProjectDiscoveryResult = {
        path: '/home/user/my-awesome-project',
        name: 'my-awesome-project',
        indicators: [{ type: 'git', path: '/home/user/my-awesome-project/.git' }],
        techStack: ['Git'],
      };

      registerProject(discovery);
      const found = findProjectByName('awesome');
      expect(found).not.toBeNull();
    });

    it('should return null for non-existent project', () => {
      const found = findProjectByName('non-existent');
      expect(found).toBeNull();
    });
  });
});
