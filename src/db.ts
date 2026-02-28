import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { DATA_DIR, DB_PATH } from './config.js';
import { logger } from './logger.js';
import { Activity, Project, Session } from './types.js';

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      tech_stack TEXT, -- JSON array
      discovered_at TEXT NOT NULL,
      last_accessed TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
    CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      pid INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

    -- Activities table
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT, -- JSON
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id);
    CREATE INDEX IF NOT EXISTS idx_activities_session ON activities(session_id);
    CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
  `);
}

export function initDatabase(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  createSchema(db);
  logger.debug('Database initialized at %s', DB_PATH);
}

/** @internal - for tests only */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

// Project operations

export function createProject(project: Project): void {
  const stmt = db.prepare(`
    INSERT INTO projects (id, name, path, description, tech_stack, discovered_at, last_accessed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    project.id,
    project.name,
    project.path,
    project.description ?? null,
    JSON.stringify(project.techStack),
    project.discoveredAt,
    project.lastAccessed ?? null
  );
}

export function getProject(id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        path: string;
        description: string | null;
        tech_stack: string;
        discovered_at: string;
        last_accessed: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? undefined,
    techStack: JSON.parse(row.tech_stack),
    discoveredAt: row.discovered_at,
    lastAccessed: row.last_accessed ?? undefined,
  };
}

export function getProjectByPath(path: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
    | {
        id: string;
        name: string;
        path: string;
        description: string | null;
        tech_stack: string;
        discovered_at: string;
        last_accessed: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? undefined,
    techStack: JSON.parse(row.tech_stack),
    discoveredAt: row.discovered_at,
    lastAccessed: row.last_accessed ?? undefined,
  };
}

export function updateProject(project: Partial<Project> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (project.name !== undefined) {
    fields.push('name = ?');
    values.push(project.name);
  }
  if (project.description !== undefined) {
    fields.push('description = ?');
    values.push(project.description);
  }
  if (project.techStack !== undefined) {
    fields.push('tech_stack = ?');
    values.push(JSON.stringify(project.techStack));
  }
  if (project.lastAccessed !== undefined) {
    fields.push('last_accessed = ?');
    values.push(project.lastAccessed);
  }

  if (fields.length === 0) return;

  values.push(project.id);

  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM activities WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY last_accessed DESC, name ASC').all() as Array<{
    id: string;
    name: string;
    path: string;
    description: string | null;
    tech_stack: string;
    discovered_at: string;
    last_accessed: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? undefined,
    techStack: JSON.parse(row.tech_stack),
    discoveredAt: row.discovered_at,
    lastAccessed: row.last_accessed ?? undefined,
  }));
}

// Session operations

export function createSession(session: Session): void {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, project_id, started_at, ended_at, status, summary, pid)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    session.id,
    session.projectId,
    session.startedAt,
    session.endedAt ?? null,
    session.status,
    session.summary ?? null,
    session.pid ?? null
  );
}

export function getSession(id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    | {
        id: string;
        project_id: string;
        started_at: string;
        ended_at: string | null;
        status: 'active' | 'completed' | 'interrupted';
        summary: string | null;
        pid: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    summary: row.summary ?? undefined,
    pid: row.pid ?? undefined,
  };
}

export function updateSession(session: Partial<Session> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (session.endedAt !== undefined) {
    fields.push('ended_at = ?');
    values.push(session.endedAt);
  }
  if (session.status !== undefined) {
    fields.push('status = ?');
    values.push(session.status);
  }
  if (session.summary !== undefined) {
    fields.push('summary = ?');
    values.push(session.summary);
  }
  if (session.pid !== undefined) {
    fields.push('pid = ?');
    values.push(session.pid);
  }

  if (fields.length === 0) return;

  values.push(session.id);

  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function listActiveSessions(): Session[] {
  const rows = db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY started_at DESC').all('active') as Array<{
    id: string;
    project_id: string;
    started_at: string;
    ended_at: string | null;
    status: 'active' | 'completed' | 'interrupted';
    summary: string | null;
    pid: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    summary: row.summary ?? undefined,
    pid: row.pid ?? undefined,
  }));
}

export function listSessionsForProject(projectId: string): Session[] {
  const rows = db
    .prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC')
    .all(projectId) as Array<{
    id: string;
    project_id: string;
    started_at: string;
    ended_at: string | null;
    status: 'active' | 'completed' | 'interrupted';
    summary: string | null;
    pid: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    summary: row.summary ?? undefined,
    pid: row.pid ?? undefined,
  }));
}

// Activity operations

export function createActivity(activity: Activity): void {
  const stmt = db.prepare(`
    INSERT INTO activities (id, project_id, session_id, type, timestamp, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    activity.id,
    activity.projectId,
    activity.sessionId ?? null,
    activity.type,
    activity.timestamp,
    activity.details ? JSON.stringify(activity.details) : null
  );
}

export function listActivitiesForProject(projectId: string, limit = 50): Activity[] {
  const rows = db
    .prepare('SELECT * FROM activities WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?')
    .all(projectId, limit) as Array<{
    id: string;
    project_id: string;
    session_id: string | null;
    type: string;
    timestamp: string;
    details: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id ?? undefined,
    type: row.type as Activity['type'],
    timestamp: row.timestamp,
    details: row.details ? JSON.parse(row.details) : undefined,
  }));
}

export function listRecentActivities(limit = 20): Activity[] {
  const rows = db
    .prepare('SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{
    id: string;
    project_id: string;
    session_id: string | null;
    type: string;
    timestamp: string;
    details: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id ?? undefined,
    type: row.type as Activity['type'],
    timestamp: row.timestamp,
    details: row.details ? JSON.parse(row.details) : undefined,
  }));
}
