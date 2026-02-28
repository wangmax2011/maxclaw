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
      expertise TEXT, -- JSON array of skills ["frontend", "backend", "ai"]
      max_concurrent_tasks INTEGER DEFAULT 3,
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

    -- E10: Agent messages table for inter-agent communication
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      sender TEXT NOT NULL,
      receiver TEXT,
      topic TEXT,
      payload TEXT NOT NULL,
      headers TEXT,
      correlation_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_messages_sender ON agent_messages(sender);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_receiver ON agent_messages(receiver);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_topic ON agent_messages(topic);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);

    -- E3: Schedules table for scheduled tasks
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      cron_expression TEXT NOT NULL,
      task_type TEXT NOT NULL,
      command TEXT,
      skill_name TEXT,
      skill_command TEXT,
      skill_args TEXT,
      message TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_project ON schedules(project_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
    CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run);

    -- E3: Schedule logs table
    CREATE TABLE IF NOT EXISTS schedule_logs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      output TEXT,
      error TEXT,
      duration INTEGER,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_logs_schedule ON schedule_logs(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_logs_status ON schedule_logs(status);
  `);
}

export function initDatabase(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  createSchema(db);
  runMigrations(db);
  logger.debug('Database initialized at %s', DB_PATH);
}

/** @internal - for tests only */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
  runMigrations(db);
}

// E6: Database migrations
function runMigrations(database: Database.Database): void {
  // E6: Notification - Add notification columns to projects
  const projectsColumns = database
    .prepare("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  const hasNotificationWebhook = projectsColumns.some((col) => col.name === 'notification_webhook');
  const hasNotificationType = projectsColumns.some((col) => col.name === 'notification_type');
  const hasNotificationLevel = projectsColumns.some((col) => col.name === 'notification_level');

  if (!hasNotificationWebhook) {
    database.exec(`ALTER TABLE projects ADD COLUMN notification_webhook TEXT;`);
    logger.debug('Migration: Added notification_webhook column to projects');
  }

  if (!hasNotificationType) {
    database.exec(`ALTER TABLE projects ADD COLUMN notification_type TEXT DEFAULT 'custom';`);
    logger.debug('Migration: Added notification_type column to projects');
  }

  if (!hasNotificationLevel) {
    database.exec(`ALTER TABLE projects ADD COLUMN notification_level TEXT DEFAULT 'info';`);
    logger.debug('Migration: Added notification_level column to projects');
  }

  // E10: Agent Protocol - Check for agent_messages table
  const tableNames = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  const hasAgentMessages = tableNames.some((t) => t.name === 'agent_messages');

  if (!hasAgentMessages) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        sender TEXT NOT NULL,
        receiver TEXT,
        topic TEXT,
        payload TEXT NOT NULL,
        headers TEXT,
        correlation_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_messages_sender ON agent_messages(sender);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_receiver ON agent_messages(receiver);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_topic ON agent_messages(topic);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);
    `);
    logger.debug('Migration: Added agent_messages table');
  }

  // E3: Scheduler - Check for schedules and schedule_logs tables
  const hasSchedules = tableNames.some((t) => t.name === 'schedules');
  const hasScheduleLogs = tableNames.some((t) => t.name === 'schedule_logs');

  if (!hasSchedules) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        cron_expression TEXT NOT NULL,
        task_type TEXT NOT NULL,
        command TEXT,
        skill_name TEXT,
        skill_command TEXT,
        skill_args TEXT,
        message TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_schedules_project ON schedules(project_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
      CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run);
    `);
    logger.debug('Migration: Added schedules table');
  }

  if (!hasScheduleLogs) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schedule_logs (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        output TEXT,
        error TEXT,
        duration INTEGER,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id)
      );
      CREATE INDEX IF NOT EXISTS idx_schedule_logs_schedule ON schedule_logs(schedule_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_logs_status ON schedule_logs(status);
    `);
    logger.debug('Migration: Added schedule_logs table');
  }
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
        notion_page_id: string | null;
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
        specialty: string | null;
        expertise: string | null;
        max_concurrent_tasks: number | null;
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
    specialty: row.specialty ? JSON.parse(row.specialty) : [],
    expertise: row.expertise ? JSON.parse(row.expertise) : undefined,
    maxConcurrentTasks: row.max_concurrent_tasks ?? undefined,
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
    specialty: string | null;
    expertise: string | null;
    max_concurrent_tasks: number | null;
    status: 'idle' | 'busy' | 'offline';
    current_task: string | null;
    team_id: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role as TeamMember['role'],
    specialty: row.specialty ? JSON.parse(row.specialty) : [],
    expertise: row.expertise ? JSON.parse(row.expertise) : undefined,
    maxConcurrentTasks: row.max_concurrent_tasks ?? undefined,
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
  if (member.expertise !== undefined) {
    fields.push('expertise = ?');
    values.push(JSON.stringify(member.expertise));
  }
  if (member.maxConcurrentTasks !== undefined) {
    fields.push('max_concurrent_tasks = ?');
    values.push(member.maxConcurrentTasks);
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

// ===== E10: Agent Message Operations =====

import type { AgentMessage, MessagePayload, MessageHeader, MessageType, MessageStatus } from './agent-protocol/types.js';

export interface AgentMessageRecord {
  id: string;
  messageId: string;
  type: MessageType;
  sender: string;
  receiver: string | null;
  topic: string | null;
  payload: MessagePayload;
  headers: MessageHeader | null;
  correlationId: string | null;
  status: MessageStatus;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

/**
 * Create an agent message record
 */
export function createAgentMessage(message: AgentMessage, topic?: string): void {
  const stmt = db.prepare(`
    INSERT INTO agent_messages (id, message_id, type, sender, receiver, topic, payload, headers, correlation_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    message.id,
    message.type,
    message.sender,
    message.receiver ?? null,
    topic ?? null,
    JSON.stringify(message.payload),
    message.headers ? JSON.stringify(message.headers) : null,
    message.correlationId ?? null,
    message.status ?? 'pending',
    message.timestamp
  );
}

/**
 * Get an agent message by ID
 */
export function getAgentMessage(id: string): AgentMessageRecord | null {
  const row = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as
    | {
        id: string;
        message_id: string;
        type: string;
        sender: string;
        receiver: string | null;
        topic: string | null;
        payload: string;
        headers: string | null;
        correlation_id: string | null;
        status: string;
        created_at: string;
        delivered_at: string | null;
        read_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    messageId: row.message_id,
    type: row.type as MessageType,
    sender: row.sender,
    receiver: row.receiver,
    topic: row.topic,
    payload: JSON.parse(row.payload),
    headers: row.headers ? JSON.parse(row.headers) : null,
    correlationId: row.correlation_id,
    status: row.status as AgentMessageRecord['status'],
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
  };
}

/**
 * Get an agent message by message ID
 */
export function getAgentMessageByMessageId(messageId: string): AgentMessageRecord | null {
  const row = db.prepare('SELECT * FROM agent_messages WHERE message_id = ?').get(messageId) as
    | {
        id: string;
        message_id: string;
        type: string;
        sender: string;
        receiver: string | null;
        topic: string | null;
        payload: string;
        headers: string | null;
        correlation_id: string | null;
        status: string;
        created_at: string;
        delivered_at: string | null;
        read_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    messageId: row.message_id,
    type: row.type as MessageType,
    sender: row.sender,
    receiver: row.receiver,
    topic: row.topic,
    payload: JSON.parse(row.payload),
    headers: row.headers ? JSON.parse(row.headers) : null,
    correlationId: row.correlation_id,
    status: row.status as AgentMessageRecord['status'],
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
  };
}

/**
 * Update an agent message status
 */
export function updateAgentMessageStatus(messageId: string, status: 'delivered' | 'read' | 'failed'): void {
  const now = new Date().toISOString();
  const updates: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (status === 'delivered') {
    updates.push('delivered_at = ?');
    values.push(now);
  } else if (status === 'read') {
    updates.push('read_at = ?');
    values.push(now);
  }

  values.push(messageId);

  db.prepare(`UPDATE agent_messages SET ${updates.join(', ')} WHERE message_id = ?`).run(...values);
}

/**
 * List agent messages with optional filters
 */
export function listAgentMessages(options?: {
  sender?: string;
  receiver?: string;
  topic?: string;
  status?: string;
  limit?: number;
}): AgentMessageRecord[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options?.sender) {
    conditions.push('sender = ?');
    values.push(options.sender);
  }

  if (options?.receiver) {
    conditions.push('receiver = ?');
    values.push(options.receiver);
  }

  if (options?.topic) {
    conditions.push('topic = ?');
    values.push(options.topic);
  }

  if (options?.status) {
    conditions.push('status = ?');
    values.push(options.status);
  }

  const limit = options?.limit ?? 100;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM agent_messages ${whereClause} ORDER BY created_at DESC LIMIT ?`;
  values.push(limit);

  const rows = db.prepare(query).all(...values) as Array<{
    id: string;
    message_id: string;
    type: string;
    sender: string;
    receiver: string | null;
    topic: string | null;
    payload: string;
    headers: string | null;
    correlation_id: string | null;
    status: string;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    type: row.type as MessageType,
    sender: row.sender,
    receiver: row.receiver,
    topic: row.topic,
    payload: JSON.parse(row.payload),
    headers: row.headers ? JSON.parse(row.headers) : null,
    correlationId: row.correlation_id,
    status: row.status as AgentMessageRecord['status'],
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
  }));
}

/**
 * List pending agent messages for a receiver
 */
export function listPendingMessagesForAgent(receiver: string, limit = 50): AgentMessageRecord[] {
  return listAgentMessages({
    receiver,
    status: 'pending',
    limit,
  });
}

/**
 * Delete old agent messages
 */
export function deleteOldAgentMessages(olderThan: Date): number {
  const olderThanStr = olderThan.toISOString();
  const result = db.prepare('DELETE FROM agent_messages WHERE created_at < ?').run(olderThanStr);
  return result.changes;
}

// ===== E3: Schedule Operations =====

import type { Schedule, ScheduleLog, ScheduleStatus } from './types.js';

/**
 * Create a schedule
 */
export function createSchedule(schedule: Schedule): void {
  const stmt = db.prepare(`
    INSERT INTO schedules (id, project_id, name, description, cron_expression, task_type, command, skill_name, skill_command, skill_args, message, enabled, last_run, next_run, run_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    schedule.id,
    schedule.projectId,
    schedule.name,
    schedule.description ?? null,
    schedule.cronExpression,
    schedule.taskType,
    schedule.command ?? null,
    schedule.skillName ?? null,
    schedule.skillCommand ?? null,
    schedule.skillArgs ? JSON.stringify(schedule.skillArgs) : null,
    schedule.message ?? null,
    schedule.enabled ? 1 : 0,
    schedule.lastRun ?? null,
    schedule.nextRun ?? null,
    schedule.runCount,
    schedule.createdAt,
    schedule.updatedAt
  );
}

/**
 * Get a schedule by ID
 */
export function getSchedule(id: string): Schedule | null {
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
    | {
        id: string;
        project_id: string;
        name: string;
        description: string | null;
        cron_expression: string;
        task_type: string;
        command: string | null;
        skill_name: string | null;
        skill_command: string | null;
        skill_args: string | null;
        message: string | null;
        enabled: number;
        last_run: string | null;
        next_run: string | null;
        run_count: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    cronExpression: row.cron_expression,
    taskType: row.task_type as Schedule['taskType'],
    command: row.command ?? undefined,
    skillName: row.skill_name ?? undefined,
    skillCommand: row.skill_command ?? undefined,
    skillArgs: row.skill_args ? JSON.parse(row.skill_args) : undefined,
    message: row.message ?? undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update a schedule
 */
export function updateSchedule(schedule: Partial<Schedule> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (schedule.name !== undefined) {
    fields.push('name = ?');
    values.push(schedule.name);
  }
  if (schedule.description !== undefined) {
    fields.push('description = ?');
    values.push(schedule.description);
  }
  if (schedule.cronExpression !== undefined) {
    fields.push('cron_expression = ?');
    values.push(schedule.cronExpression);
  }
  if (schedule.taskType !== undefined) {
    fields.push('task_type = ?');
    values.push(schedule.taskType);
  }
  if (schedule.command !== undefined) {
    fields.push('command = ?');
    values.push(schedule.command);
  }
  if (schedule.skillName !== undefined) {
    fields.push('skill_name = ?');
    values.push(schedule.skillName);
  }
  if (schedule.skillCommand !== undefined) {
    fields.push('skill_command = ?');
    values.push(schedule.skillCommand);
  }
  if (schedule.skillArgs !== undefined) {
    fields.push('skill_args = ?');
    values.push(JSON.stringify(schedule.skillArgs));
  }
  if (schedule.message !== undefined) {
    fields.push('message = ?');
    values.push(schedule.message);
  }
  if (schedule.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(schedule.enabled ? 1 : 0);
  }
  if (schedule.lastRun !== undefined) {
    fields.push('last_run = ?');
    values.push(schedule.lastRun);
  }
  if (schedule.nextRun !== undefined) {
    fields.push('next_run = ?');
    values.push(schedule.nextRun);
  }
  if (schedule.runCount !== undefined) {
    fields.push('run_count = ?');
    values.push(schedule.runCount);
  }
  if (schedule.updatedAt !== undefined) {
    fields.push('updated_at = ?');
    values.push(schedule.updatedAt);
  }

  if (fields.length === 0) return;

  values.push(schedule.id);

  db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Delete a schedule and its logs
 */
export function deleteSchedule(id: string): void {
  // Delete associated logs first (foreign key constraint)
  db.prepare('DELETE FROM schedule_logs WHERE schedule_id = ?').run(id);
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

/**
 * List all schedules
 */
export function listAllSchedules(): Schedule[] {
  const rows = db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as Array<{
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    cron_expression: string;
    task_type: string;
    command: string | null;
    skill_name: string | null;
    skill_command: string | null;
    skill_args: string | null;
    message: string | null;
    enabled: number;
    last_run: string | null;
    next_run: string | null;
    run_count: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    cronExpression: row.cron_expression,
    taskType: row.task_type as Schedule['taskType'],
    command: row.command ?? undefined,
    skillName: row.skill_name ?? undefined,
    skillCommand: row.skill_command ?? undefined,
    skillArgs: row.skill_args ? JSON.parse(row.skill_args) : undefined,
    message: row.message ?? undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * List schedules for a project
 */
export function listSchedulesForProject(projectId: string): Schedule[] {
  const rows = db
    .prepare('SELECT * FROM schedules WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as Array<{
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    cron_expression: string;
    task_type: string;
    command: string | null;
    skill_name: string | null;
    skill_command: string | null;
    skill_args: string | null;
    message: string | null;
    enabled: number;
    last_run: string | null;
    next_run: string | null;
    run_count: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    cronExpression: row.cron_expression,
    taskType: row.task_type as Schedule['taskType'],
    command: row.command ?? undefined,
    skillName: row.skill_name ?? undefined,
    skillCommand: row.skill_command ?? undefined,
    skillArgs: row.skill_args ? JSON.parse(row.skill_args) : undefined,
    message: row.message ?? undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * List schedules (alias for listAllSchedules)
 */
export function listSchedules(): Schedule[] {
  return listAllSchedules();
}

/**
 * Get schedules for project (alias for listSchedulesForProject)
 */
export function getSchedulesForProject(projectId: string): Schedule[] {
  return listSchedulesForProject(projectId);
}

/**
 * List enabled schedules
 */
export function listEnabledSchedules(): Schedule[] {
  const rows = db
    .prepare('SELECT * FROM schedules WHERE enabled = 1 ORDER BY next_run ASC')
    .all() as Array<{
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    cron_expression: string;
    task_type: string;
    command: string | null;
    skill_name: string | null;
    skill_command: string | null;
    skill_args: string | null;
    message: string | null;
    enabled: number;
    last_run: string | null;
    next_run: string | null;
    run_count: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    cronExpression: row.cron_expression,
    taskType: row.task_type as Schedule['taskType'],
    command: row.command ?? undefined,
    skillName: row.skill_name ?? undefined,
    skillCommand: row.skill_command ?? undefined,
    skillArgs: row.skill_args ? JSON.parse(row.skill_args) : undefined,
    message: row.message ?? undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Create a schedule log
 */
export function createScheduleLog(log: Omit<ScheduleLog, 'id'> & { id: string }): void {
  const stmt = db.prepare(`
    INSERT INTO schedule_logs (id, schedule_id, status, started_at, completed_at, output, error, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    log.id,
    log.scheduleId,
    log.status,
    log.startedAt,
    log.completedAt ?? null,
    log.output ?? null,
    log.error ?? null,
    log.duration ?? null
  );
}

/**
 * Update a schedule log
 */
export function updateScheduleLog(log: Partial<ScheduleLog> & { id: string }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (log.status !== undefined) {
    fields.push('status = ?');
    values.push(log.status);
  }
  if (log.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(log.completedAt);
  }
  if (log.output !== undefined) {
    fields.push('output = ?');
    values.push(log.output);
  }
  if (log.error !== undefined) {
    fields.push('error = ?');
    values.push(log.error);
  }
  if (log.duration !== undefined) {
    fields.push('duration = ?');
    values.push(log.duration);
  }

  if (fields.length === 0) return;

  values.push(log.id);

  db.prepare(`UPDATE schedule_logs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Get schedule logs for a schedule
 */
export function getScheduleLogs(scheduleId: string, limit = 50): ScheduleLog[] {
  const rows = db
    .prepare('SELECT * FROM schedule_logs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(scheduleId, limit) as Array<{
    id: string;
    schedule_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    output: string | null;
    error: string | null;
    duration: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    status: row.status as ScheduleStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    duration: row.duration ?? undefined,
  }));
}

/**
 * List schedule logs
 */
export function listScheduleLogs(scheduleId: string): ScheduleLog[] {
  return getScheduleLogs(scheduleId, 100);
}

/**
 * Get the latest schedule log
 */
export function getLatestScheduleLog(scheduleId: string): ScheduleLog | null {
  const row = db
    .prepare('SELECT * FROM schedule_logs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(scheduleId) as
    | {
        id: string;
        schedule_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        output: string | null;
        error: string | null;
        duration: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    scheduleId: row.schedule_id,
    status: row.status as ScheduleStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    duration: row.duration ?? undefined,
  };
}
