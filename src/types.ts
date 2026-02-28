// MaxClaw Types - Project and Session Management

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  techStack: string[];
  discoveredAt: string;
  lastAccessed?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
  summary?: string;
  pid?: number; // Process ID of running Claude Code
}

export interface Activity {
  id: string;
  projectId: string;
  sessionId?: string;
  type: 'start' | 'command' | 'complete' | 'discover' | 'add' | 'remove' | 'team_start' | 'team_stop';
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ProjectDiscoveryResult {
  path: string;
  name: string;
  indicators: ProjectIndicator[];
  techStack: string[];
}

export type ProjectIndicator =
  | { type: 'git'; path: string }
  | { type: 'package.json'; path: string }
  | { type: 'Cargo.toml'; path: string }
  | { type: 'pyproject.toml'; path: string }
  | { type: 'go.mod'; path: string }
  | { type: 'Dockerfile'; path: string }
  | { type: 'CLAUDE.md'; path: string }
  | { type: 'other'; file: string; path: string };

export interface MaxClawConfig {
  scanPaths: string[];
  defaultOptions: {
    allowedTools?: string[];
    timeout?: number;
  };
  dataDir: string;
}

export interface RunningSession {
  sessionId: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  startedAt: string;
  pid: number;
}

// ===== Team Management Types =====

export interface Team {
  id: string;
  name: string;
  projectId: string;
  leadId: string;
  memberIds: string[];
  status: 'idle' | 'active' | 'completed';
  createdAt: string;
  config?: TeamConfig;
}

export interface TeamConfig {
  maxMembers?: number;
  coordinationMode?: 'hierarchical' | 'flat';
  autoAssign?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  specialty: string[];
  status: 'idle' | 'busy' | 'offline';
  currentTask?: string;
  teamId: string;
}

export type TeamRole = 'lead' | 'developer' | 'architect' | 'qa' | 'pm' | 'analyst';

export interface TeamSession {
  id: string;
  teamId: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
  goal?: string;
  tasks: TeamTask[];
}

export interface TeamTask {
  id: string;
  teamId: string;
  sessionId: string;
  assigneeId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependencies: string[];
  createdAt: string;
  completedAt?: string;
  result?: string;
}

export interface TeamMessage {
  id: string;
  sessionId: string;
  fromId: string;
  toId?: string;
  type: TeamMessageType;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type TeamMessageType =
  | 'task_assigned'
  | 'status_update'
  | 'result'
  | 'question'
  | 'coordination'
  | 'broadcast';

export interface TeamWithMembers extends Team {
  lead: TeamMember;
  members: TeamMember[];
}
