import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  validateManifest,
  loadManifest,
  scanSkillsDirectory,
  getSkillInfo,
  ensureExternalSkillsDir,
  getExternalSkillsDir,
} from '../skill-loader.js';
import type { SkillManifest } from '../types.js';

describe('Skill Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxclaw-skills-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateManifest', () => {
    it('should validate a correct manifest', () => {
      const manifest: SkillManifest = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        commands: [
          {
            name: 'test',
            description: 'Test command',
          },
        ],
        permissions: ['fs:read'],
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest!.name).toBe('test-skill');
    });

    it('should reject manifest with invalid name', () => {
      const manifest = {
        name: 'Test Skill', // Invalid: uppercase and space
        version: '1.0.0',
        description: 'A test skill',
        commands: [{ name: 'test', description: 'Test command' }],
        permissions: ['fs:read'],
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject manifest with invalid version', () => {
      const manifest = {
        name: 'test-skill',
        version: 'v1.0', // Invalid format
        description: 'A test skill',
        commands: [{ name: 'test', description: 'Test command' }],
        permissions: ['fs:read'],
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('should reject manifest without commands', () => {
      const manifest = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        commands: [], // Empty commands
        permissions: ['fs:read'],
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('should reject manifest without permissions', () => {
      const manifest = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        commands: [{ name: 'test', description: 'Test command' }],
        permissions: [], // Empty permissions
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });
  });

  describe('loadManifest', () => {
    it('should load manifest from skill.yaml', () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const manifest = `name: test-skill
version: 1.0.0
description: A test skill
commands:
  - name: test
    description: Test command
permissions:
  - fs:read
`;
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), manifest);

      const result = loadManifest(skillDir);
      expect(result.success).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest!.name).toBe('test-skill');
    });

    it('should load manifest from skill.yml', () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const manifest = `name: test-skill
version: 1.0.0
description: A test skill
commands:
  - name: test
    description: Test command
permissions:
  - fs:read
`;
      fs.writeFileSync(path.join(skillDir, 'skill.yml'), manifest);

      const result = loadManifest(skillDir);
      expect(result.success).toBe(true);
      expect(result.manifest).toBeDefined();
    });

    it('should return error when manifest file not found', () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const result = loadManifest(skillDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No skill.yaml');
    });

    it('should return error for invalid YAML', () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'invalid: yaml: content: [');

      const result = loadManifest(skillDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });
  });

  describe('scanSkillsDirectory', () => {
    it('should scan and find valid skills', () => {
      // Create multiple skills
      for (const name of ['skill-a', 'skill-b']) {
        const skillDir = path.join(tempDir, name);
        fs.mkdirSync(skillDir, { recursive: true });

        const manifest = `name: ${name}
version: 1.0.0
description: A test skill
commands:
  - name: test
    description: Test command
permissions:
  - fs:read
`;
        fs.writeFileSync(path.join(skillDir, 'skill.yaml'), manifest);
      }

      // Create a directory without manifest (should be ignored)
      fs.mkdirSync(path.join(tempDir, 'not-a-skill'), { recursive: true });

      const skills = scanSkillsDirectory(tempDir);
      expect(skills).toHaveLength(2);
      expect(skills).toContain(path.join(tempDir, 'skill-a'));
      expect(skills).toContain(path.join(tempDir, 'skill-b'));
    });

    it('should return empty array for non-existent directory', () => {
      const skills = scanSkillsDirectory('/non/existent/path');
      expect(skills).toHaveLength(0);
    });

    it('should return empty array for empty directory', () => {
      const skills = scanSkillsDirectory(tempDir);
      expect(skills).toHaveLength(0);
    });
  });

  describe('getSkillInfo', () => {
    it('should return skill info for valid skill', () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const manifest = `name: test-skill
version: 1.0.0
description: A test skill
commands:
  - name: test
    description: Test command
permissions:
  - fs:read
`;
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), manifest);

      const info = getSkillInfo(skillDir);
      expect(info.name).toBe('test-skill');
      expect(info.manifest).toBeDefined();
      expect(info.manifest!.version).toBe('1.0.0');
    });

    it('should return error for invalid skill', () => {
      const skillDir = path.join(tempDir, 'invalid-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const info = getSkillInfo(skillDir);
      expect(info.name).toBe('invalid-skill');
      expect(info.error).toBeDefined();
    });
  });
});
