// Template Engine Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  substituteVariables,
  checkCondition,
  loadTemplateConfig,
  copyFileWithSubstitution,
  createGitignore,
  processTemplate,
  listAvailableTemplates,
  getTemplateDirByName,
  getTemplatesDir,
  getCustomTemplatesDir,
  TemplateCondition,
  TemplateConfig,
} from '../template-engine.js';

describe('Template Engine', () => {
  describe('substituteVariables', () => {
    it('should replace simple variables', () => {
      const content = 'Hello {{name}}, welcome to {{project_name}}!';
      const variables = { name: 'World', project_name: 'MyProject' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Hello World, welcome to MyProject!');
    });

    it('should replace variables multiple times', () => {
      const content = '{{name}} likes {{name}}';
      const variables = { name: 'Alice' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Alice likes Alice');
    });

    it('should keep unreplaced variables', () => {
      const content = 'Hello {{name}}, welcome to {{unknown}}!';
      const variables = { name: 'World' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Hello World, welcome to {{unknown}}!');
    });

    it('should handle empty content', () => {
      expect(substituteVariables('', { name: 'Test' })).toBe('');
    });

    it('should handle content without variables', () => {
      const content = 'Hello World!';
      expect(substituteVariables(content, {})).toBe(content);
    });

    it('should handle complex variable names', () => {
      const content = '{{project_name_kebab}}/{{project_name_pascal}}';
      const variables = { project_name_kebab: 'my-project', project_name_pascal: 'MyProject' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('my-project/MyProject');
    });
  });

  describe('checkCondition', () => {
    it('should return true for undefined condition', () => {
      expect(checkCondition(undefined, {})).toBe(true);
    });

    it('should check equals condition', () => {
      const condition: TemplateCondition = { variable: 'type', equals: 'react' };
      expect(checkCondition(condition, { type: 'react' })).toBe(true);
      expect(checkCondition(condition, { type: 'vue' })).toBe(false);
    });

    it('should check exists condition (true)', () => {
      const condition: TemplateCondition = { variable: 'author', exists: true };
      expect(checkCondition(condition, { author: 'John' })).toBe(true);
      expect(checkCondition(condition, {})).toBe(false);
    });

    it('should check exists condition (false)', () => {
      const condition: TemplateCondition = { variable: 'optional', exists: false };
      expect(checkCondition(condition, {})).toBe(true);
      expect(checkCondition(condition, { optional: 'value' })).toBe(false);
    });
  });

  describe('loadTemplateConfig', () => {
    it('should load valid template config', () => {
      const templateDir = path.join(getTemplatesDir(), 'nodejs-ts');
      const config = loadTemplateConfig(templateDir);
      expect(config).not.toBeNull();
      expect(config?.name).toBe('nodejs-ts');
      expect(config?.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return null for non-existent directory', () => {
      const config = loadTemplateConfig('/non/existent/path');
      expect(config).toBeNull();
    });

    it('should return null if template.yaml is missing', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-test-'));
      try {
        const config = loadTemplateConfig(emptyDir);
        expect(config).toBeNull();
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('createGitignore', () => {
    it('should create .gitignore file', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test-'));
      try {
        const entries = ['node_modules/', '*.log', '.env'];
        createGitignore(testDir, entries);

        const gitignorePath = path.join(testDir, '.gitignore');
        expect(fs.existsSync(gitignorePath)).toBe(true);

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toBe('node_modules/\n*.log\n.env\n');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should handle empty entries', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test-'));
      try {
        createGitignore(testDir, []);
        const gitignorePath = path.join(testDir, '.gitignore');
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        expect(content).toBe('\n');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('listAvailableTemplates', () => {
    it('should list builtin templates', () => {
      const templates = listAvailableTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);

      const templateNames = templates.map((t) => t.name);
      expect(templateNames).toContain('nodejs-ts');
      expect(templateNames).toContain('react-app');
      expect(templateNames).toContain('nextjs');
      expect(templateNames).toContain('python');
    });

    it('should include template metadata', () => {
      const templates = listAvailableTemplates();
      for (const template of templates) {
        expect(template.name).toBeTruthy();
        expect(template.version).toBeTruthy();
        expect(template.description).toBeTruthy();
        // Custom templates may exist, so just check that source is valid
        expect(['builtin', 'custom']).toContain(template.source);
      }
    });
  });

  describe('getTemplateDirByName', () => {
    it('should find builtin template directories', () => {
      expect(getTemplateDirByName('nodejs-ts')).toBeTruthy();
      expect(getTemplateDirByName('react-app')).toBeTruthy();
      expect(getTemplateDirByName('nextjs')).toBeTruthy();
      expect(getTemplateDirByName('python')).toBeTruthy();
    });

    it('should return null for non-existent template', () => {
      expect(getTemplateDirByName('non-existent-template')).toBeNull();
    });
  });

  describe('getTemplatesDir', () => {
    it('should return existing templates directory', () => {
      const dir = getTemplatesDir();
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    });
  });

  describe('getCustomTemplatesDir', () => {
    it('should return custom templates directory path', () => {
      const dir = getCustomTemplatesDir();
      expect(dir).toContain(os.homedir());
      expect(dir).toContain('.maxclaw');
    });
  });

  describe('processTemplate', () => {
    it('should create project from nodejs-ts template', async () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-process-'));
      const targetPath = path.join(testDir, 'test-project');

      try {
        const result = await processTemplate(
          path.join(getTemplatesDir(), 'nodejs-ts'),
          {
            projectName: 'test-project',
            projectPath: targetPath,
            author: 'Test Author',
            description: 'Test Description',
            initGit: false,
            registerToMaxClaw: false,
            installDeps: false,
          }
        );

        expect(result.success).toBe(true);
        expect(result.filesCreated.length).toBeGreaterThan(0);
        expect(fs.existsSync(targetPath)).toBe(true);

        // Check specific files
        expect(fs.existsSync(path.join(targetPath, 'package.json'))).toBe(true);
        expect(fs.existsSync(path.join(targetPath, 'tsconfig.json'))).toBe(true);
        expect(fs.existsSync(path.join(targetPath, '.gitignore'))).toBe(true);

        // Check variable substitution in package.json
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(targetPath, 'package.json'), 'utf-8')
        );
        expect(packageJson.name).toBe('test-project');

        // Check .gitignore content
        const gitignore = fs.readFileSync(path.join(targetPath, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('node_modules/');
        expect(gitignore).toContain('dist/');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should create project with custom name', async () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-custom-'));
      const targetPath = path.join(testDir, 'my-custom-project');

      try {
        const result = await processTemplate(
          path.join(getTemplatesDir(), 'nodejs-ts'),
          {
            projectName: 'my-custom-project',
            projectPath: targetPath,
            initGit: false,
            registerToMaxClaw: false,
            installDeps: false,
          }
        );

        expect(result.success).toBe(true);

        const packageJson = JSON.parse(
          fs.readFileSync(path.join(targetPath, 'package.json'), 'utf-8')
        );
        expect(packageJson.name).toBe('my-custom-project');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should handle template errors gracefully', async () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-error-'));

      try {
        const result = await processTemplate(
          '/non/existent/template',
          {
            projectName: 'test',
            projectPath: path.join(testDir, 'test'),
            initGit: false,
            registerToMaxClaw: false,
            installDeps: false,
          }
        );

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Integration Tests', () => {
    it('should handle full workflow for nodejs-ts template', async () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-integration-'));
      const targetPath = path.join(testDir, 'integration-test');

      try {
        // Create project
        const result = await processTemplate(
          path.join(getTemplatesDir(), 'nodejs-ts'),
          {
            projectName: 'integration-test',
            projectPath: targetPath,
            author: 'Integration Tester',
            description: 'Integration Test Project',
            initGit: false,
            registerToMaxClaw: false,
            installDeps: false,
          }
        );

        expect(result.success).toBe(true);
        expect(result.errors.length).toBe(0);

        // Verify all expected files exist
        const expectedFiles = [
          'package.json',
          'tsconfig.json',
          'README.md',
          'src/index.ts',
          'src/logger.ts',
          '.gitignore',
        ];

        for (const file of expectedFiles) {
          expect(fs.existsSync(path.join(targetPath, file))).toBe(true);
        }

        // Verify variable substitution in README
        const readme = fs.readFileSync(path.join(targetPath, 'README.md'), 'utf-8');
        expect(readme).toContain('integration-test');
        expect(readme).toContain('Integration Test Project');
        expect(readme).toContain('Integration Tester');

        // Verify package.json structure
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(targetPath, 'package.json'), 'utf-8')
        );
        expect(packageJson.name).toBe('integration-test');
        expect(packageJson.scripts).toBeDefined();
        expect(packageJson.scripts.build).toBe('tsc');
        expect(packageJson.scripts.dev).toBe('tsx src/index.ts');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
