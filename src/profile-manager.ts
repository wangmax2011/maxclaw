import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from './logger.js';
import type { SessionProfile, ProfileConfig } from './types.js';

const PROFILES_PATH = path.join(os.homedir(), '.maxclaw', 'profiles.yaml');

/**
 * Parse simple YAML (basic parser for our specific format)
 */
function parseSimpleYaml(content: string): ProfileConfig {
  const result: ProfileConfig = { profiles: {} };
  let currentProfile: string | null = null;
  let inProfilesSection = false;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for sections
    if (line.startsWith('profiles:')) {
      inProfilesSection = true;
      continue;
    }

    if (line.startsWith('defaultProfile:')) {
      result.defaultProfile = line.split(':')[1].trim();
      continue;
    }

    if (inProfilesSection) {
      // Check for profile name (2 spaces indent)
      if (line.startsWith('  ') && !line.startsWith('    ') && trimmed.endsWith(':')) {
        currentProfile = trimmed.slice(0, -1);
        result.profiles[currentProfile] = { name: currentProfile };
        continue;
      }

      // Check for profile property (4 spaces indent)
      if (line.startsWith('    ') && currentProfile && trimmed.includes(':')) {
        const [key, value] = trimmed.split(':');
        const propKey = key.trim() as keyof SessionProfile;
        let propValue = value.trim();

        // Handle quotes
        if (propValue.startsWith('"') && propValue.endsWith('"')) {
          propValue = propValue.slice(1, -1);
        }

        // Handle arrays (simple single-line format)
        if (propValue.startsWith('[') && propValue.endsWith(']')) {
          propValue = propValue.slice(1, -1);
          (result.profiles[currentProfile] as any)[propKey] = propValue.split(',').map((s) => s.trim());
          continue;
        }

        // Handle booleans
        if (propValue === 'true') {
          (result.profiles[currentProfile] as any)[propKey] = true;
          continue;
        }
        if (propValue === 'false') {
          (result.profiles[currentProfile] as any)[propKey] = false;
          continue;
        }

        // Handle numbers
        const numValue = parseInt(propValue, 10);
        if (!isNaN(numValue) && propKey === 'sessionTimeout') {
          (result.profiles[currentProfile] as any)[propKey] = numValue;
          continue;
        }

        // Handle strings
        (result.profiles[currentProfile] as any)[propKey] = propValue;
      }
    }
  }

  return result;
}

/**
 * Convert ProfileConfig to YAML string
 */
function toYamlString(config: ProfileConfig): string {
  let yaml = 'profiles:\n';

  for (const [name, profile] of Object.entries(config.profiles)) {
    yaml += `  ${name}:\n`;
    yaml += `    name: "${profile.name}"\n`;

    if (profile.description) {
      yaml += `    description: "${profile.description}"\n`;
    }
    if (profile.defaultModel) {
      yaml += `    defaultModel: "${profile.defaultModel}"\n`;
    }
    if (profile.allowedTools && profile.allowedTools.length > 0) {
      yaml += `    allowedTools: [${profile.allowedTools.join(', ')}]\n`;
    }
    if (profile.sessionTimeout) {
      yaml += `    sessionTimeout: ${profile.sessionTimeout}\n`;
    }
    if (profile.autoResume !== undefined) {
      yaml += `    autoResume: ${profile.autoResume}\n`;
    }
    if (profile.workspace) {
      yaml += `    workspace: "${profile.workspace}"\n`;
    }
  }

  if (config.defaultProfile) {
    yaml += `\ndefaultProfile: "${config.defaultProfile}"\n`;
  }

  return yaml;
}

/**
 * Load profiles from file
 */
export function loadProfiles(): ProfileConfig {
  if (!fs.existsSync(PROFILES_PATH)) {
    return { profiles: {} };
  }

  try {
    const content = fs.readFileSync(PROFILES_PATH, 'utf-8');
    return parseSimpleYaml(content);
  } catch (error) {
    logger.error('Failed to load profiles: %s', error);
    return { profiles: {} };
  }
}

/**
 * Save profiles to file
 */
export function saveProfiles(config: ProfileConfig): void {
  const dir = path.dirname(PROFILES_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const yamlContent = toYamlString(config);
  fs.writeFileSync(PROFILES_PATH, yamlContent, 'utf-8');
  logger.info('Profiles saved to %s', PROFILES_PATH);
}

/**
 * Create a new profile
 */
export function createProfile(name: string, profile: Omit<SessionProfile, 'name'>): SessionProfile {
  const config = loadProfiles();

  if (config.profiles[name]) {
    throw new Error(`Profile already exists: ${name}`);
  }

  config.profiles[name] = { name, ...profile };
  saveProfiles(config);

  logger.info('Created profile: %s', name);
  return config.profiles[name];
}

/**
 * Get a profile by name
 */
export function getProfile(name: string): SessionProfile | null {
  const config = loadProfiles();
  return config.profiles[name] || null;
}

/**
 * List all profiles
 */
export function listAllProfiles(): SessionProfile[] {
  const config = loadProfiles();
  return Object.values(config.profiles);
}

/**
 * Delete a profile
 */
export function deleteProfile(name: string): void {
  const config = loadProfiles();

  if (!config.profiles[name]) {
    throw new Error(`Profile not found: ${name}`);
  }

  delete config.profiles[name];

  // Also update default if it was the deleted profile
  if (config.defaultProfile === name) {
    config.defaultProfile = undefined;
  }

  saveProfiles(config);
  logger.info('Deleted profile: %s', name);
}

/**
 * Set the default profile
 */
export function setDefaultProfile(name: string): void {
  const config = loadProfiles();

  if (!config.profiles[name]) {
    throw new Error(`Profile not found: ${name}`);
  }

  config.defaultProfile = name;
  saveProfiles(config);
  logger.info('Set default profile: %s', name);
}

/**
 * Get the default profile
 */
export function getDefaultProfile(): SessionProfile | null {
  const config = loadProfiles();

  if (!config.defaultProfile) {
    return null;
  }

  return config.profiles[config.defaultProfile] || null;
}

/**
 * Get profile file path
 */
export function getProfilesPath(): string {
  return PROFILES_PATH;
}
