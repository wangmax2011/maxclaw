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

    -- Teams table
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL,
      config TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_teams_project ON teams(project_id);
    CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);

    -- Team members table
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      specialty TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task TEXT,
      team_id TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

    -- Team sessions table
    CREATE TABLE IF NOT EXISTS team_sessions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      goal TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_sessions_team ON team_sessions(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_sessions_status ON team_sessions(status);

    -- Team tasks table
    CREATE TABLE IF NOT EXISTS team_tasks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      assignee_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      dependencies TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      result TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (session_id) REFERENCES team_sessions(id),
      FOREIGN KEY (assignee_id) REFERENCES team_members(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_tasks_session ON team_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_team_tasks_assignee ON team_tasks(assignee_id);

    -- Team messages table
    CREATE TABLE IF NOT EXISTS team_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES team_sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_messages_session ON team_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_team_messages_timestamp ON team_messages(timestamp);
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

// ===== Team Operations =====

import type { Team, TeamMember, TeamSession, TeamTask, TeamMessage } from './types.js';

export function createTeam(team: Team): void {
  const stmt = db.prepare(`
    INSERT INTO teams (id, name, project_id, lead_id, status, created_at, config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    team.id,
    team.name,
    team.projectId,
    team.leadId,
    team.status,
    team.createdAt,
    team.config ? JSON.stringify(team.config) : null
  );
}

export function getTeam(id: string): Team | null {
  const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        project_id: string;
        lead_id: string;
        status: 'idle' | 'active' | 'completed';
        created_at: string;
        config: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    leadId: row.lead_id,
    memberIds: [], // Will be populated separately
    status: row.status,
    createdAt: row.created_at,
    config: row.config ? JSON.parse(row.config) : undefined,
  };
}

export function getTeamByName(name: string): Team | null {
  const row = db.prepare('SELECT * FROM teams WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        project_id: string;
        lead_id: string;
        status: 'idle' | 'active' | 'completed';
        created_at: string;
        config: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    leadId: row.lead_id,
    memberIds: [],
    status: row.status,
    createdAt: row.created_at,
    config: row.config ? JSON.parse(row.config) : undefined,
  };
}

export function listTeams(): Team[] {
  const rows = db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all() as Array<{
    id: string;
    name: string;
    project_id: string;
    lead_id: string;
    status: 'idle' | 'active' | 'completed';
    created_at: string;
    config: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    leadId: row.lead_id,
    memberIds: [],
    status: row.status,
    createdAt: row.created_at,
    config: row.config ? JSON.parse(row.config) : undefined,
  }));
}

export function listTeamsForProject(projectId: string): Team[] {
  const rows = db.prepare('SELECT * FROM teams WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Array<{
    id: string;
    name: string;
    project_id: string;
    lead_id: string;
    status: 'idle' | 'active' | 'completed';
    created_at: string;
    config: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    leadId: row.lead_id,
    memberIds: [],
    status: row.status,
    createdAt: row.created_at,
    config: row.config ? JSON.parse(row.config) : undefined,
  }));
}

export function updateTeam(team: Partial<Team> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (team.name !== undefined) {
    fields.push('name = ?');
    values.push(team.name);
  }
  if (team.status !== undefined) {
    fields.push('status = ?');
    values.push(team.status);
  }
  if (team.leadId !== undefined) {
    fields.push('lead_id = ?');
    values.push(team.leadId);
  }
  if (team.config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(team.config));
  }

  if (fields.length === 0) return;

  values.push(team.id);
  db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTeam(id: string): void {
  // Cascade delete will handle members, tasks, and messages
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
}

// Team Member Operations

export function createTeamMember(member: TeamMember): void {
  const stmt = db.prepare(`
    INSERT INTO team_members (id, name, role, specialty, status, current_task, team_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    member.id,
    member.name,
    member.role,
    JSON.stringify(member.specialty),
    member.status,
    member.currentTask ?? null,
    member.teamId
  );
}

export function getTeamMember(id: string): TeamMember | null {
  const row = db.prepare('SELECT * FROM team_members WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        role: string;
        specialty: string;
        status: 'idle' | 'busy' | 'offline';
        current_task: string | null;
        team_id: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    role: row.role as TeamMember['role'],
    specialty: JSON.parse(row.specialty),
    status: row.status,
    currentTask: row.current_task ?? undefined,
    teamId: row.team_id,
  };
}

export function listTeamMembers(teamId: string): TeamMember[] {
  const rows = db.prepare('SELECT * FROM team_members WHERE team_id = ?').all(teamId) as Array<{
    id: string;
    name: string;
    role: string;
    specialty: string;
    status: 'idle' | 'busy' | 'offline';
    current_task: string | null;
    team_id: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role as TeamMember['role'],
    specialty: JSON.parse(row.specialty),
    status: row.status,
    currentTask: row.current_task ?? undefined,
    teamId: row.team_id,
  }));
}

export function updateTeamMember(member: Partial<TeamMember> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (member.status !== undefined) {
    fields.push('status = ?');
    values.push(member.status);
  }
  if (member.currentTask !== undefined) {
    fields.push('current_task = ?');
    values.push(member.currentTask);
  }
  if (member.role !== undefined) {
    fields.push('role = ?');
    values.push(member.role);
  }
  if (member.specialty !== undefined) {
    fields.push('specialty = ?');
    values.push(JSON.stringify(member.specialty));
  }

  if (fields.length === 0) return;

  values.push(member.id);
  db.prepare(`UPDATE team_members SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTeamMember(id: string): void {
  db.prepare('DELETE FROM team_members WHERE id = ?').run(id);
}

// Team Session Operations

export function createTeamSession(session: TeamSession): void {
  const stmt = db.prepare(`
    INSERT INTO team_sessions (id, team_id, project_id, started_at, ended_at, status, goal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    session.id,
    session.teamId,
    session.projectId,
    session.startedAt,
    session.endedAt ?? null,
    session.status,
    session.goal ?? null
  );
}

export function getTeamSession(id: string): TeamSession | null {
  const row = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(id) as
    | {
        id: string;
        team_id: string;
        project_id: string;
        started_at: string;
        ended_at: string | null;
        status: 'active' | 'completed' | 'interrupted';
        goal: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    goal: row.goal ?? undefined,
    tasks: [],
  };
}

export function updateTeamSession(session: Partial<TeamSession> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (session.status !== undefined) {
    fields.push('status = ?');
    values.push(session.status);
  }
  if (session.endedAt !== undefined) {
    fields.push('ended_at = ?');
    values.push(session.endedAt);
  }
  if (session.goal !== undefined) {
    fields.push('goal = ?');
    values.push(session.goal);
  }

  if (fields.length === 0) return;

  values.push(session.id);
  db.prepare(`UPDATE team_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function listActiveTeamSessions(): TeamSession[] {
  const rows = db.prepare('SELECT * FROM team_sessions WHERE status = ? ORDER BY started_at DESC').all('active') as Array<{
    id: string;
    team_id: string;
    project_id: string;
    started_at: string;
    ended_at: string | null;
    status: 'active' | 'completed' | 'interrupted';
    goal: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    goal: row.goal ?? undefined,
    tasks: [],
  }));
}

// Team Task Operations

export function createTeamTask(task: TeamTask): void {
  const stmt = db.prepare(`
    INSERT INTO team_tasks (id, team_id, session_id, assignee_id, title, description, status, dependencies, created_at, completed_at, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    task.id,
    task.teamId,
    task.sessionId,
    task.assigneeId,
    task.title,
    task.description ?? null,
    task.status,
    JSON.stringify(task.dependencies),
    task.createdAt,
    task.completedAt ?? null,
    task.result ?? null
  );
}

export function getTeamTask(id: string): TeamTask | null {
  const row = db.prepare('SELECT * FROM team_tasks WHERE id = ?').get(id) as
    | {
        id: string;
        team_id: string;
        session_id: string;
        assignee_id: string;
        title: string;
        description: string | null;
        status: 'pending' | 'in_progress' | 'completed' | 'blocked';
        dependencies: string;
        created_at: string;
        completed_at: string | null;
        result: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    teamId: row.team_id,
    sessionId: row.session_id,
    assigneeId: row.assignee_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    dependencies: JSON.parse(row.dependencies),
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    result: row.result ?? undefined,
  };
}

export function listTeamTasksForSession(sessionId: string): TeamTask[] {
  const rows = db.prepare('SELECT * FROM team_tasks WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as Array<{
    id: string;
    team_id: string;
    session_id: string;
    assignee_id: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    dependencies: string;
    created_at: string;
    completed_at: string | null;
    result: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    sessionId: row.session_id,
    assigneeId: row.assignee_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    dependencies: JSON.parse(row.dependencies),
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    result: row.result ?? undefined,
  }));
}

export function updateTeamTask(task: Partial<TeamTask> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (task.status !== undefined) {
    fields.push('status = ?');
    values.push(task.status);
  }
  if (task.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(task.completedAt);
  }
  if (task.result !== undefined) {
    fields.push('result = ?');
    values.push(task.result);
  }
  if (task.assigneeId !== undefined) {
    fields.push('assignee_id = ?');
    values.push(task.assigneeId);
  }

  if (fields.length === 0) return;

  values.push(task.id);
  db.prepare(`UPDATE team_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// Team Message Operations

export function createTeamMessage(message: TeamMessage): void {
  const stmt = db.prepare(`
    INSERT INTO team_messages (id, session_id, from_id, to_id, type, content, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.sessionId,
    message.fromId,
    message.toId ?? null,
    message.type,
    message.content,
    message.timestamp,
    message.metadata ? JSON.stringify(message.metadata) : null
  );
}

export function listTeamMessagesForSession(sessionId: string, limit = 100): TeamMessage[] {
  const rows = db.prepare('SELECT * FROM team_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?').all(sessionId, limit) as Array<{
    id: string;
    session_id: string;
    from_id: string;
    to_id: string | null;
    type: string;
    content: string;
    timestamp: string;
    metadata: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fromId: row.from_id,
    toId: row.to_id ?? undefined,
    type: row.type as TeamMessage['type'],
    content: row.content,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}
