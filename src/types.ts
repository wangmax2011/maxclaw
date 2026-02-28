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
  notionPageId?: string; // E5: Notion Integration - associated Notion page ID
  // E6: Notification configuration
  notificationWebhook?: string;
  notificationType?: NotificationType;
  notificationLevel?: NotificationLevel;
}

export interface Session {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
  summary?: string;
  summaryStatus?: SummaryStatus;
  summaryGeneratedAt?: string;
  pid?: number; // Process ID of running Claude Code
}

export type SummaryStatus = 'pending' | 'generated' | 'failed';

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
  ai?: AIConfig;
}

export interface AIConfig {
  summaryEnabled?: boolean;
  summaryModel?: string;
  apiKey?: string;
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
  // E7: Smart Task Assignment - new fields
  expertise?: string[]; // JSON array of skills like ["frontend", "backend", "ai"]
  maxConcurrentTasks?: number; // Default: 3
}

// E7: Task type for categorization
export type TaskType = 'feature' | 'bug' | 'review' | 'refactor' | 'docs' | 'test';

// E7: Task priority level (1-5, 5 being highest)
export type TaskPriority = 1 | 2 | 3 | 4 | 5;

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
  // E7: Smart Task Assignment - new fields
  type?: TaskType; // Task category: feature, bug, review, etc.
  requiredSkills?: string[]; // JSON array of required skills
  priority?: TaskPriority; // 1-5, 5 being highest priority
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

// E7: Smart Task Assignment - Task Assignment Result
export interface TaskAssignmentResult {
  member: TeamMember;
  skillMatchScore: number; // 0-1, percentage of required skills matched
  workloadFactor: number; // 0-1, remaining capacity ratio
  overallScore: number; // 0-1, weighted combination
  currentTasks: number; // Current number of active tasks
  maxTasks: number; // Maximum concurrent tasks allowed
}

// ===== E3: Schedule Types =====

export type ScheduleTaskType = 'reminder' | 'backup' | 'command' | 'skill' | 'github-sync';

export type ScheduleStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  cronExpression: string;
  taskType: ScheduleTaskType;
  command?: string; // For command type
  skillName?: string; // For skill type
  skillCommand?: string; // For skill type
  skillArgs?: string[]; // For skill type
  message?: string; // For reminder type
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleLog {
  id: string;
  scheduleId: string;
  status: ScheduleStatus;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
  duration?: number; // in milliseconds
}

// ===== E6: Notification Types =====

export type NotificationType = 'feishu' | 'wechat' | 'slack' | 'custom';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface NotificationMessage {
  title: string;
  content: string;
  level: NotificationLevel;
  timestamp: string;
  projectName?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationOptions {
  level?: NotificationLevel;
  metadata?: Record<string, unknown>;
}
