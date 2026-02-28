import os from 'os';
import path from 'path';
import fs from 'fs';
import YAML from 'yaml';

import { MaxClawConfig } from './types.js';

export const ASSISTANT_NAME = 'MaxClaw';
export const VERSION = '0.1.0';

// Data directory - all local storage
export const DATA_DIR = path.join(os.homedir(), '.maxclaw');
export const DB_PATH = path.join(DATA_DIR, 'data.db');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.yaml');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Default configuration
export const DEFAULT_CONFIG: MaxClawConfig = {
  scanPaths: [
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'workspace'),
    path.join(os.homedir(), 'code'),
    path.join(os.homedir(), 'src'),
  ],
  defaultOptions: {
    timeout: 300000, // 5 minutes
  },
  dataDir: DATA_DIR,
  ai: {
    summaryEnabled: true,
    summaryModel: 'claude-3-sonnet-20240229',
    // apiKey is not set by default - use ANTHROPIC_API_KEY env var
  },
  multiplex: {
    maxSessions: 5,
    maxSessionsPerProject: 2,
  },
  tui: {
    refreshInterval: 3000,
  },
};

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export function loadConfig(): MaxClawConfig {
  ensureDataDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = YAML.parse(content) as Partial<MaxClawConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: MaxClawConfig): void {
  ensureDataDir();
  const yaml = YAML.stringify(config);
  fs.writeFileSync(CONFIG_PATH, yaml, 'utf-8');
}

export function getProjectMemoryPath(projectId: string): string {
  const dir = path.join(PROJECTS_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'CLAUDE.md');
}
