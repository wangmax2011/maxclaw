// Skills Plugin System - Type Definitions

import type { Logger } from 'pino';
import type Database from 'better-sqlite3';

// ===== Permission Types =====

export type SkillPermission =
  | 'db:read'
  | 'db:write'
  | 'fs:read'
  | 'fs:write'
  | 'exec'
  | 'network'
  | 'all';

// ===== Skill Manifest =====

export interface SkillCommand {
  name: string;
  description: string;
  args?: SkillCommandArg[];
  options?: SkillCommandOption[];
}

export interface SkillCommandArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface SkillCommandOption {
  name: string;
  alias?: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  default?: unknown;
}

export interface SkillHook {
  event: string;
  handler: string; // Name of the handler function
}

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  commands: SkillCommand[];
  hooks?: SkillHook[];
  permissions: SkillPermission[];
  config?: Record<string, unknown>;
  dependencies?: string[]; // Other skill names this skill depends on
}

// ===== Skill Context =====

export interface SkillContext {
  // Database access
  db: Database.Database;

  // Configuration
  config: Record<string, unknown>;
  dataDir: string;

  // Logging
  logger: Logger;

  // Permission check
  hasPermission: (permission: SkillPermission) => boolean;

  // Utility functions
  getProjectPath: (projectId: string) => string | undefined;
  getSkillDir: () => string;

  // Event emitter for hooks
  emit: (event: string, data: unknown) => void;
}

// ===== Skill Interface =====

export interface Skill {
  manifest: SkillManifest;

  /**
   * Called when the skill is loaded and activated
   */
  activate: (context: SkillContext) => Promise<void> | void;

  /**
   * Called when the skill is being unloaded or disabled
   */
  deactivate: () => Promise<void> | void;

  /**
   * Execute a command provided by this skill
   */
  execute: (commandName: string, args: string[], options: Record<string, unknown>) => Promise<unknown>;

  /**
   * Handle a hook event
   */
  handleHook?: (event: string, data: unknown) => Promise<void> | void;
}

// ===== Skill Record (Database) =====

export interface SkillRecord {
  id: string;
  name: string;
  version: string;
  source: 'builtin' | 'external';
  path: string;
  enabled: boolean;
  config: Record<string, unknown>;
  loadedAt?: string;
  error?: string;
  manifest?: SkillManifest;
}

// ===== Skill Load Result =====

export interface SkillLoadResult {
  success: boolean;
  skill?: Skill;
  record?: SkillRecord;
  error?: string;
}

// ===== Skill Registry Events =====

export type SkillRegistryEvent =
  | { type: 'skill:loaded'; skillName: string }
  | { type: 'skill:unloaded'; skillName: string }
  | { type: 'skill:enabled'; skillName: string }
  | { type: 'skill:disabled'; skillName: string }
  | { type: 'skill:error'; skillName: string; error: string }
  | { type: 'command:executed'; skillName: string; commandName: string; result: unknown }
  | { type: 'hook:triggered'; event: string; data: unknown };
