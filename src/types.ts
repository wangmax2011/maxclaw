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
  type: 'start' | 'command' | 'complete' | 'discover' | 'add' | 'remove';
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
