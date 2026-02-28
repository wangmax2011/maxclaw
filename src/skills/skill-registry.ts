// Skills Registry - Manage loaded skills and execute commands

import { EventEmitter } from 'events';
import type Database from 'better-sqlite3';

import { logger } from '../logger.js';
import { DATA_DIR } from '../config.js';
import type {
  Skill,
  SkillRecord,
  SkillContext,
  SkillPermission,
  SkillRegistryEvent,
  SkillCommand,
} from './types.js';
import { getProject } from '../db.js';

/**
 * Skills Registry - Manages all loaded skills
 */
export class SkillRegistry extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private records: Map<string, SkillRecord> = new Map();
  private contexts: Map<string, SkillContext> = new Map();
  private db: Database.Database;
  private skillPermissions: Map<string, Set<SkillPermission>> = new Map();

  constructor(db: Database.Database) {
    super();
    this.db = db;
  }

  /**
   * Create a skill context with appropriate permissions
   */
  private createContext(record: SkillRecord): SkillContext {
    const permissions = new Set(record.manifest?.permissions ?? []);
    this.skillPermissions.set(record.name, permissions);

    const context: SkillContext = {
      db: this.db,
      config: record.config,
      dataDir: DATA_DIR,
      logger: logger.child({ skill: record.name }),
      hasPermission: (permission: SkillPermission) => {
        if (permissions.has('all')) return true;
        return permissions.has(permission);
      },
      getProjectPath: (projectId: string) => {
        if (!permissions.has('fs:read') && !permissions.has('all')) {
          throw new Error('Skill does not have fs:read permission');
        }
        const project = getProject(projectId);
        return project?.path;
      },
      getSkillDir: () => record.path,
      emit: (event: string, data: unknown) => {
        this.emit('hook:triggered', { event, data, skillName: record.name });
      },
    };

    return context;
  }

  /**
   * Register a skill
   */
  async register(skill: Skill, record: SkillRecord): Promise<boolean> {
    const name = skill.manifest.name;

    if (this.skills.has(name)) {
      logger.warn('Skill "%s" is already registered', name);
      return false;
    }

    try {
      // Create context for the skill
      const context = this.createContext(record);

      // Activate the skill
      await skill.activate(context);

      // Store references
      this.skills.set(name, skill);
      this.records.set(name, record);
      this.contexts.set(name, context);

      // Update record with loaded time
      record.loadedAt = new Date().toISOString();

      this.emit('skill:loaded', { skillName: name });
      logger.info('Skill "%s" v%s registered successfully', name, record.version);

      return true;
    } catch (error) {
      logger.error('Failed to activate skill "%s": %s', name, error);
      this.emit('skill:error', { skillName: name, error: String(error) });
      return false;
    }
  }

  /**
   * Unregister a skill
   */
  async unregister(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) {
      logger.warn('Skill "%s" is not registered', name);
      return false;
    }

    try {
      // Deactivate the skill
      await skill.deactivate();

      // Clean up
      this.skills.delete(name);
      this.records.delete(name);
      this.contexts.delete(name);
      this.skillPermissions.delete(name);

      this.emit('skill:unloaded', { skillName: name });
      logger.info('Skill "%s" unregistered', name);

      return true;
    } catch (error) {
      logger.error('Failed to deactivate skill "%s": %s', name, error);
      return false;
    }
  }

  /**
   * Enable a skill (register if not already)
   */
  async enable(name: string): Promise<boolean> {
    const record = this.records.get(name);
    if (!record) {
      logger.warn('Skill "%s" not found', name);
      return false;
    }

    if (record.enabled) {
      logger.info('Skill "%s" is already enabled', name);
      return true;
    }

    const skill = this.skills.get(name);
    if (!skill) {
      logger.error('Skill "%s" has record but no loaded instance', name);
      return false;
    }

    record.enabled = true;
    this.emit('skill:enabled', { skillName: name });
    logger.info('Skill "%s" enabled', name);

    return true;
  }

  /**
   * Disable a skill (unregister but keep record)
   */
  async disable(name: string): Promise<boolean> {
    const record = this.records.get(name);
    if (!record) {
      logger.warn('Skill "%s" not found', name);
      return false;
    }

    if (!record.enabled) {
      logger.info('Skill "%s" is already disabled', name);
      return true;
    }

    // Deactivate the skill but keep the record
    const skill = this.skills.get(name);
    if (skill) {
      try {
        await skill.deactivate();
        this.skills.delete(name);
        this.contexts.delete(name);
        this.skillPermissions.delete(name);
        this.emit('skill:unloaded', { skillName: name });
        logger.info('Skill "%s" deactivated', name);
      } catch (error) {
        logger.error('Failed to deactivate skill "%s": %s', name, error);
        return false;
      }
    }

    record.enabled = false;
    this.emit('skill:disabled', { skillName: name });
    logger.info('Skill "%s" disabled', name);
    return true;
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get a skill record by name
   */
  getRecord(name: string): SkillRecord | undefined {
    return this.records.get(name);
  }

  /**
   * Get all registered skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all skill records
   */
  getAllRecords(): SkillRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get enabled skills only
   */
  getEnabled(): Skill[] {
    return this.getAll().filter((skill) => {
      const record = this.records.get(skill.manifest.name);
      return record?.enabled ?? false;
    });
  }

  /**
   * Check if a skill is registered
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Check if a skill is enabled
   */
  isEnabled(name: string): boolean {
    const record = this.records.get(name);
    return record?.enabled ?? false;
  }

  /**
   * Get skill commands
   */
  getCommands(name: string): SkillCommand[] | undefined {
    const skill = this.skills.get(name);
    return skill?.manifest.commands;
  }

  /**
   * Execute a skill command
   */
  async execute(
    skillName: string,
    commandName: string,
    args: string[] = [],
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    const record = this.records.get(skillName);
    if (!record) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    if (!record.enabled) {
      throw new Error(`Skill "${skillName}" is disabled`);
    }

    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    // Verify command exists
    const command = skill.manifest.commands.find((c) => c.name === commandName);
    if (!command) {
      throw new Error(`Command "${commandName}" not found in skill "${skillName}"`);
    }

    try {
      logger.debug('Executing command "%s" from skill "%s"', commandName, skillName);
      const result = await skill.execute(commandName, args, options);
      this.emit('command:executed', { skillName, commandName, result });
      return result;
    } catch (error) {
      logger.error('Command execution failed: %s', error);
      throw error;
    }
  }

  /**
   * Trigger a hook event on all skills that have registered for it
   */
  async triggerHook(event: string, data: unknown): Promise<void> {
    for (const [name, skill] of this.skills.entries()) {
      const record = this.records.get(name);
      if (!record?.enabled) continue;

      // Check if skill has registered for this hook
      const hasHook = skill.manifest.hooks?.some((h) => h.event === event);
      if (!hasHook) continue;

      if (skill.handleHook) {
        try {
          await skill.handleHook(event, data);
        } catch (error) {
          logger.error('Hook handler failed for skill "%s": %s', name, error);
        }
      }
    }

    this.emit('hook:triggered', { event, data });
  }

  /**
   * Get skill help text
   */
  getHelp(name: string): string {
    const skill = this.skills.get(name);
    if (!skill) {
      return `Skill "${name}" not found`;
    }

    const manifest = skill.manifest;
    let help = `\n${manifest.name} v${manifest.version}\n`;
    help += `${manifest.description}\n`;

    if (manifest.author) {
      help += `Author: ${manifest.author}\n`;
    }

    help += '\nCommands:\n';
    for (const cmd of manifest.commands) {
      help += `  ${cmd.name} - ${cmd.description}\n`;
      if (cmd.args && cmd.args.length > 0) {
        help += `    Args: ${cmd.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(' ')}\n`;
      }
    }

    help += '\nPermissions:\n';
    for (const perm of manifest.permissions) {
      help += `  - ${perm}\n`;
    }

    return help;
  }

  /**
   * Clear all registered skills
   */
  async clear(): Promise<void> {
    const names = Array.from(this.skills.keys());
    for (const name of names) {
      await this.unregister(name);
    }
  }
}

// Singleton instance
let registry: SkillRegistry | null = null;

/**
 * Initialize the skill registry
 */
export function initSkillRegistry(db: Database.Database): SkillRegistry {
  if (!registry) {
    registry = new SkillRegistry(db);
  }
  return registry;
}

/**
 * Get the skill registry instance
 */
export function getSkillRegistry(): SkillRegistry {
  if (!registry) {
    throw new Error('Skill registry not initialized. Call initSkillRegistry first.');
  }
  return registry;
}
