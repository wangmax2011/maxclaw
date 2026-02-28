import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SkillRegistry } from '../skill-registry.js';
import type { Skill, SkillContext, SkillManifest, SkillRecord } from '../types.js';

describe('Skill Registry', () => {
  let db: Database.Database;
  let registry: SkillRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create skills table
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT,
        loaded_at TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    registry = new SkillRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  const createMockSkill = (name: string): Skill => {
    const manifest: SkillManifest = {
      name,
      version: '1.0.0',
      description: `Test skill ${name}`,
      commands: [
        { name: 'test', description: 'Test command' },
        { name: 'echo', description: 'Echo command' },
      ],
      permissions: ['fs:read'],
    };

    return {
      manifest,
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockImplementation((commandName: string, args: string[]) => {
        if (commandName === 'echo') {
          return Promise.resolve(args.join(' '));
        }
        return Promise.resolve(`Executed ${commandName}`);
      }),
    };
  };

  const createMockRecord = (name: string, source: 'builtin' | 'external' = 'builtin'): SkillRecord => ({
    id: name,
    name,
    version: '1.0.0',
    source,
    path: `/test/skills/${name}`,
    enabled: true,
    config: {},
  });

  describe('register', () => {
    it('should register a skill successfully', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      const result = await registry.register(skill, record);

      expect(result).toBe(true);
      expect(skill.activate).toHaveBeenCalled();
      expect(registry.has('test-skill')).toBe(true);
      expect(registry.get('test-skill')).toBe(skill);
    });

    it('should not register duplicate skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const result = await registry.register(skill, record);

      expect(result).toBe(false);
    });

    it('should handle activation errors', async () => {
      const skill = createMockSkill('failing-skill');
      skill.activate = vi.fn().mockRejectedValue(new Error('Activation failed'));
      const record = createMockRecord('failing-skill');

      const result = await registry.register(skill, record);

      expect(result).toBe(false);
      expect(registry.has('failing-skill')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should unregister a skill successfully', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const result = await registry.unregister('test-skill');

      expect(result).toBe(true);
      expect(skill.deactivate).toHaveBeenCalled();
      expect(registry.has('test-skill')).toBe(false);
    });

    it('should return false for non-existent skill', async () => {
      const result = await registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should enable a skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');
      record.enabled = false;

      await registry.register(skill, record);
      const result = await registry.enable('test-skill');

      expect(result).toBe(true);
      expect(registry.isEnabled('test-skill')).toBe(true);
    });

    it('should disable a skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const result = await registry.disable('test-skill');

      expect(result).toBe(true);
      expect(registry.isEnabled('test-skill')).toBe(false);
      expect(registry.has('test-skill')).toBe(false);
    });

    it('should return false when enabling non-existent skill', async () => {
      const result = await registry.enable('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute a command successfully', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const result = await registry.execute('test-skill', 'echo', ['hello', 'world']);

      expect(result).toBe('hello world');
      expect(skill.execute).toHaveBeenCalledWith('echo', ['hello', 'world'], {});
    });

    it('should throw error for non-existent skill', async () => {
      await expect(registry.execute('non-existent', 'test')).rejects.toThrow('not found');
    });

    it('should throw error for disabled skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      await registry.disable('test-skill');

      await expect(registry.execute('test-skill', 'test')).rejects.toThrow('disabled');
    });

    it('should throw error for unknown command', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);

      await expect(registry.execute('test-skill', 'unknown-command')).rejects.toThrow('not found');
    });
  });

  describe('getCommands', () => {
    it('should return commands for a skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const commands = registry.getCommands('test-skill');

      expect(commands).toHaveLength(2);
      expect(commands![0].name).toBe('test');
      expect(commands![1].name).toBe('echo');
    });

    it('should return undefined for non-existent skill', () => {
      const commands = registry.getCommands('non-existent');
      expect(commands).toBeUndefined();
    });
  });

  describe('getAll / getAllRecords', () => {
    it('should return all registered skills', async () => {
      const skill1 = createMockSkill('skill-1');
      const skill2 = createMockSkill('skill-2');

      await registry.register(skill1, createMockRecord('skill-1'));
      await registry.register(skill2, createMockRecord('skill-2'));

      const allSkills = registry.getAll();
      expect(allSkills).toHaveLength(2);
    });

    it('should return all skill records', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);

      const allRecords = registry.getAllRecords();
      expect(allRecords).toHaveLength(1);
      expect(allRecords[0].name).toBe('test-skill');
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled skills', async () => {
      const skill1 = createMockSkill('skill-1');
      const skill2 = createMockSkill('skill-2');

      await registry.register(skill1, createMockRecord('skill-1'));
      await registry.register(skill2, createMockRecord('skill-2'));
      await registry.disable('skill-2');

      const enabledSkills = registry.getEnabled();
      expect(enabledSkills).toHaveLength(1);
      expect(enabledSkills[0].manifest.name).toBe('skill-1');
    });
  });

  describe('getHelp', () => {
    it('should return help text for a skill', async () => {
      const skill = createMockSkill('test-skill');
      const record = createMockRecord('test-skill');

      await registry.register(skill, record);
      const help = registry.getHelp('test-skill');

      expect(help).toContain('test-skill');
      expect(help).toContain('v1.0.0');
      expect(help).toContain('Test command');
      expect(help).toContain('fs:read');
    });

    it('should return error message for non-existent skill', () => {
      const help = registry.getHelp('non-existent');
      expect(help).toContain('not found');
    });
  });

  describe('triggerHook', () => {
    it('should trigger hook on skills that have registered for it', async () => {
      const skill = createMockSkill('test-skill');
      skill.manifest.hooks = [{ event: 'test:event', handler: 'onTestEvent' }];
      skill.handleHook = vi.fn().mockResolvedValue(undefined);

      await registry.register(skill, createMockRecord('test-skill'));
      await registry.triggerHook('test:event', { foo: 'bar' });

      expect(skill.handleHook).toHaveBeenCalledWith('test:event', { foo: 'bar' });
    });

    it('should not trigger hook on skills without matching hook', async () => {
      const skill = createMockSkill('test-skill');
      skill.handleHook = vi.fn().mockResolvedValue(undefined);

      await registry.register(skill, createMockRecord('test-skill'));
      await registry.triggerHook('other:event', {});

      expect(skill.handleHook).not.toHaveBeenCalled();
    });

    it('should not trigger hook on disabled skills', async () => {
      const skill = createMockSkill('test-skill');
      skill.manifest.hooks = [{ event: 'test:event', handler: 'onTestEvent' }];
      skill.handleHook = vi.fn().mockResolvedValue(undefined);

      await registry.register(skill, createMockRecord('test-skill'));
      await registry.disable('test-skill');
      await registry.triggerHook('test:event', {});

      expect(skill.handleHook).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit skill:loaded event', async () => {
      const handler = vi.fn();
      registry.on('skill:loaded', handler);

      const skill = createMockSkill('test-skill');
      await registry.register(skill, createMockRecord('test-skill'));

      expect(handler).toHaveBeenCalledWith({ skillName: 'test-skill' });
    });

    it('should emit skill:unloaded event', async () => {
      const handler = vi.fn();
      registry.on('skill:unloaded', handler);

      const skill = createMockSkill('test-skill');
      await registry.register(skill, createMockRecord('test-skill'));
      await registry.unregister('test-skill');

      expect(handler).toHaveBeenCalledWith({ skillName: 'test-skill' });
    });

    it('should emit command:executed event', async () => {
      const handler = vi.fn();
      registry.on('command:executed', handler);

      const skill = createMockSkill('test-skill');
      await registry.register(skill, createMockRecord('test-skill'));
      await registry.execute('test-skill', 'test');

      expect(handler).toHaveBeenCalledWith({
        skillName: 'test-skill',
        commandName: 'test',
        result: expect.any(String),
      });
    });
  });
});
