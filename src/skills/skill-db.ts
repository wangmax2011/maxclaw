// Skills Database Operations

import type Database from 'better-sqlite3';
import type { SkillRecord } from './types.js';

/**
 * Create skills table schema
 */
export function createSkillsSchema(db: Database.Database): void {
  db.exec(`
    -- Skills table
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('builtin', 'external')),
      path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT, -- JSON
      loaded_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  `);
}

/**
 * Save or update a skill record
 */
export function saveSkillRecord(db: Database.Database, record: SkillRecord): void {
  const stmt = db.prepare(`
    INSERT INTO skills (id, name, version, source, path, enabled, config, loaded_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      version = excluded.version,
      source = excluded.source,
      path = excluded.path,
      enabled = excluded.enabled,
      config = excluded.config,
      loaded_at = excluded.loaded_at,
      error = excluded.error
  `);

  stmt.run(
    record.id,
    record.name,
    record.version,
    record.source,
    record.path,
    record.enabled ? 1 : 0,
    JSON.stringify(record.config),
    record.loadedAt ?? null,
    record.error ?? null
  );
}

/**
 * Get a skill record by name
 */
export function getSkillRecord(db: Database.Database, name: string): SkillRecord | null {
  const row = db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        version: string;
        source: 'builtin' | 'external';
        path: string;
        enabled: number;
        config: string | null;
        loaded_at: string | null;
        error: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    path: row.path,
    enabled: row.enabled === 1,
    config: row.config ? JSON.parse(row.config) : {},
    loadedAt: row.loaded_at ?? undefined,
    error: row.error ?? undefined,
  };
}

/**
 * Get all skill records
 */
export function listSkillRecords(db: Database.Database): SkillRecord[] {
  const rows = db.prepare('SELECT * FROM skills ORDER BY name ASC').all() as Array<{
    id: string;
    name: string;
    version: string;
    source: 'builtin' | 'external';
    path: string;
    enabled: number;
    config: string | null;
    loaded_at: string | null;
    error: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    path: row.path,
    enabled: row.enabled === 1,
    config: row.config ? JSON.parse(row.config) : {},
    loadedAt: row.loaded_at ?? undefined,
    error: row.error ?? undefined,
  }));
}

/**
 * Update skill enabled status
 */
export function setSkillEnabled(db: Database.Database, name: string, enabled: boolean): boolean {
  const result = db.prepare('UPDATE skills SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
  return result.changes > 0;
}

/**
 * Update skill config
 */
export function updateSkillConfig(
  db: Database.Database,
  name: string,
  config: Record<string, unknown>
): boolean {
  const result = db.prepare('UPDATE skills SET config = ? WHERE name = ?').run(JSON.stringify(config), name);
  return result.changes > 0;
}

/**
 * Delete a skill record
 */
export function deleteSkillRecord(db: Database.Database, name: string): boolean {
  const result = db.prepare('DELETE FROM skills WHERE name = ?').run(name);
  return result.changes > 0;
}

/**
 * Check if a skill exists
 */
export function skillExists(db: Database.Database, name: string): boolean {
  const row = db.prepare('SELECT 1 FROM skills WHERE name = ?').get(name) as { '1': number } | undefined;
  return row !== undefined;
}
