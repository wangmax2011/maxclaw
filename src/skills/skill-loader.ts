// Skills Loader - Load and validate skills from filesystem

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { pathToFileURL } from 'url';
import { z } from 'zod';

import { logger } from '../logger.js';
import { DATA_DIR } from '../config.js';
import type { Skill, SkillManifest, SkillRecord, SkillLoadResult, SkillPermission } from './types.js';

// External skills directory
const EXTERNAL_SKILLS_DIR = path.join(DATA_DIR, 'skills');

// Built-in skills directory (relative to this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILTIN_SKILLS_DIR = path.join(__dirname, 'builtin');

// Zod schema for manifest validation
const SkillCommandArgSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
});

const SkillCommandOptionSchema = z.object({
  name: z.string(),
  alias: z.string().optional(),
  description: z.string(),
  type: z.enum(['string', 'number', 'boolean']),
  default: z.unknown().optional(),
});

const SkillCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  args: z.array(SkillCommandArgSchema).optional(),
  options: z.array(SkillCommandOptionSchema).optional(),
});

const SkillHookSchema = z.object({
  event: z.string(),
  handler: z.string(),
});

const SkillManifestSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1).max(500),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  commands: z.array(SkillCommandSchema).min(1),
  hooks: z.array(SkillHookSchema).optional(),
  permissions: z.array(z.enum(['db:read', 'db:write', 'fs:read', 'fs:write', 'exec', 'network', 'all'])).min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  dependencies: z.array(z.string()).optional(),
});

/**
 * Ensure external skills directory exists
 */
export function ensureExternalSkillsDir(): void {
  fs.mkdirSync(EXTERNAL_SKILLS_DIR, { recursive: true });
}

/**
 * Get external skills directory path
 */
export function getExternalSkillsDir(): string {
  ensureExternalSkillsDir();
  return EXTERNAL_SKILLS_DIR;
}

/**
 * Get built-in skills directory path
 */
export function getBuiltinSkillsDir(): string {
  return BUILTIN_SKILLS_DIR;
}

/**
 * Load built-in skills from TypeScript files
 */
export async function loadBuiltinSkills(): Promise<{
  loaded: SkillLoadResult[];
  failed: SkillLoadResult[];
}> {
  const loaded: SkillLoadResult[] = [];
  const failed: SkillLoadResult[] = [];

  if (!fs.existsSync(BUILTIN_SKILLS_DIR)) {
    return { loaded, failed };
  }

  const entries = fs.readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      const skillPath = path.join(BUILTIN_SKILLS_DIR, entry.name);
      const skillName = entry.name.replace(/\.(ts|js)$/, '');

      try {
        const fileUrl = pathToFileURL(skillPath).href;
        const module = (await import(fileUrl)) as Record<string, unknown>;
        const skillExport = module.default ?? module.skill;

        if (!skillExport) {
          failed.push({
            success: false,
            error: 'No default export or named export "skill" found',
            record: {
              id: skillName,
              name: skillName,
              version: 'unknown',
              source: 'builtin',
              path: skillPath,
              enabled: false,
              config: {},
              error: 'No export found',
            },
          });
          continue;
        }

        const skill = skillExport as Skill;

        if (!skill.manifest || typeof skill.activate !== 'function' || typeof skill.deactivate !== 'function' || typeof skill.execute !== 'function') {
          failed.push({
            success: false,
            error: 'Invalid skill interface',
            record: {
              id: skillName,
              name: skillName,
              version: 'unknown',
              source: 'builtin',
              path: skillPath,
              enabled: false,
              config: {},
              error: 'Invalid skill interface',
            },
          });
          continue;
        }

        loaded.push({
          success: true,
          skill,
          record: {
            id: skill.manifest.name,
            name: skill.manifest.name,
            version: skill.manifest.version,
            source: 'builtin',
            path: skillPath,
            enabled: true,
            config: skill.manifest.config ?? {},
            loadedAt: new Date().toISOString(),
            manifest: skill.manifest,
          },
        });
      } catch (error) {
        failed.push({
          success: false,
          error: `Failed to load module: ${error}`,
          record: {
            id: skillName,
            name: skillName,
            version: 'unknown',
            source: 'builtin',
            path: skillPath,
            enabled: false,
            config: {},
            error: String(error),
          },
        });
      }
    }
  }

  return { loaded, failed };
}

/**
 * Validate skill manifest
 */
export function validateManifest(manifest: unknown): { valid: boolean; manifest?: SkillManifest; error?: string } {
  try {
    const validated = SkillManifestSchema.parse(manifest);
    return { valid: true, manifest: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return { valid: false, error: `Manifest validation failed: ${issues}` };
    }
    return { valid: false, error: `Manifest validation failed: ${error}` };
  }
}

/**
 * Load manifest from skill.yaml file
 */
export function loadManifest(skillPath: string): { success: boolean; manifest?: SkillManifest; error?: string } {
  const yamlPath = path.join(skillPath, 'skill.yaml');
  const ymlPath = path.join(skillPath, 'skill.yml');

  let manifestPath: string | null = null;

  if (fs.existsSync(yamlPath)) {
    manifestPath = yamlPath;
  } else if (fs.existsSync(ymlPath)) {
    manifestPath = ymlPath;
  }

  if (!manifestPath) {
    return { success: false, error: 'No skill.yaml or skill.yml found' };
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = YAML.parse(content);
    const validation = validateManifest(parsed);

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    return { success: true, manifest: validation.manifest };
  } catch (error) {
    return { success: false, error: `Failed to parse manifest: ${error}` };
  }
}

/**
 * Load skill module from index.ts or index.js
 */
export async function loadSkillModule(
  skillPath: string,
  manifest: SkillManifest
): Promise<{ success: boolean; skill?: Skill; error?: string }> {
  const tsPath = path.join(skillPath, 'index.ts');
  const jsPath = path.join(skillPath, 'index.js');
  const mjsPath = path.join(skillPath, 'index.mjs');

  let entryPoint: string | null = null;

  if (fs.existsSync(tsPath)) {
    entryPoint = tsPath;
  } else if (fs.existsSync(jsPath)) {
    entryPoint = jsPath;
  } else if (fs.existsSync(mjsPath)) {
    entryPoint = mjsPath;
  }

  if (!entryPoint) {
    return { success: false, error: 'No index.ts, index.js, or index.mjs found' };
  }

  try {
    // Convert path to file URL for ES Module import
    const fileUrl = pathToFileURL(entryPoint).href;

    // Dynamic import
    const module = (await import(fileUrl)) as Record<string, unknown>;

    // Check for default export or named export 'skill'
    const skillExport = module.default ?? module.skill;

    if (!skillExport) {
      return { success: false, error: 'No default export or named export "skill" found' };
    }

    // Validate skill interface
    const skill = skillExport as Partial<Skill>;

    if (typeof skill.activate !== 'function') {
      return { success: false, error: 'Skill must have an "activate" method' };
    }

    if (typeof skill.deactivate !== 'function') {
      return { success: false, error: 'Skill must have a "deactivate" method' };
    }

    if (typeof skill.execute !== 'function') {
      return { success: false, error: 'Skill must have an "execute" method' };
    }

    // Ensure manifest is attached
    const completeSkill: Skill = {
      manifest,
      activate: skill.activate.bind(skillExport),
      deactivate: skill.deactivate.bind(skillExport),
      execute: skill.execute.bind(skillExport),
      handleHook: skill.handleHook?.bind(skillExport),
    };

    return { success: true, skill: completeSkill };
  } catch (error) {
    logger.error('Failed to load skill module from %s: %s', entryPoint, error);
    return { success: false, error: `Failed to load module: ${error}` };
  }
}

/**
 * Scan a directory for skills
 */
export function scanSkillsDirectory(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const skills: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dirPath, entry.name);
        const manifestResult = loadManifest(skillPath);

        if (manifestResult.success) {
          skills.push(skillPath);
        } else {
          logger.debug('Skipping %s: %s', skillPath, manifestResult.error);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to scan skills directory %s: %s', dirPath, error);
  }

  return skills;
}

/**
 * Load a single skill from path
 */
export async function loadSkill(
  skillPath: string,
  source: 'builtin' | 'external'
): Promise<SkillLoadResult> {
  const manifestResult = loadManifest(skillPath);

  if (!manifestResult.success || !manifestResult.manifest) {
    return {
      success: false,
      error: manifestResult.error,
      record: {
        id: path.basename(skillPath),
        name: path.basename(skillPath),
        version: 'unknown',
        source,
        path: skillPath,
        enabled: false,
        config: {},
        error: manifestResult.error,
      },
    };
  }

  const manifest = manifestResult.manifest;
  const moduleResult = await loadSkillModule(skillPath, manifest);

  if (!moduleResult.success || !moduleResult.skill) {
    return {
      success: false,
      error: moduleResult.error,
      record: {
        id: manifest.name,
        name: manifest.name,
        version: manifest.version,
        source,
        path: skillPath,
        enabled: false,
        config: manifest.config ?? {},
        error: moduleResult.error,
      },
    };
  }

  return {
    success: true,
    skill: moduleResult.skill,
    record: {
      id: manifest.name,
      name: manifest.name,
      version: manifest.version,
      source,
      path: skillPath,
      enabled: true,
      config: manifest.config ?? {},
      loadedAt: new Date().toISOString(),
      manifest,
    },
  };
}

/**
 * Load all skills from both builtin and external directories
 */
export async function loadAllSkills(): Promise<{
  loaded: SkillLoadResult[];
  failed: SkillLoadResult[];
}> {
  const loaded: SkillLoadResult[] = [];
  const failed: SkillLoadResult[] = [];

  // Load builtin skills from TypeScript files
  const builtinResults = await loadBuiltinSkills();
  loaded.push(...builtinResults.loaded);
  failed.push(...builtinResults.failed);

  // Scan external skills
  const externalPaths = scanSkillsDirectory(EXTERNAL_SKILLS_DIR);
  for (const skillPath of externalPaths) {
    const result = await loadSkill(skillPath, 'external');
    if (result.success) {
      loaded.push(result);
    } else {
      failed.push(result);
    }
  }

  return { loaded, failed };
}

/**
 * Get skill info without loading the full module
 */
export function getSkillInfo(skillPath: string): {
  name: string;
  manifest?: SkillManifest;
  error?: string;
} {
  const result = loadManifest(skillPath);

  if (result.success && result.manifest) {
    return {
      name: result.manifest.name,
      manifest: result.manifest,
    };
  }

  return {
    name: path.basename(skillPath),
    error: result.error,
  };
}
