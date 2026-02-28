# MaxClaw Agent Team Feature Design

## Overview
Add multi-agent team support to MaxClaw, enabling teams with a Team Lead and multiple Team Members.

## Core Concepts

### Team
- A named group of agents working together
- Has exactly one Team Lead
- Has one or more Team Members
- Associated with a specific project

### Team Lead
- Coordinates team activities
- Assigns tasks to team members
- Aggregates results from members
- Reports overall progress

### Team Member
- Has a specific role/specialty
- Receives tasks from Team Lead
- Executes tasks independently
- Reports status back to Team Lead

## Data Model

### Team
```typescript
interface Team {
  id: string;
  name: string;
  projectId: string;      // Associated project
  leadId: string;         // Team Lead agent ID
  memberIds: string[];    // Team Member agent IDs
  status: 'idle' | 'active' | 'completed';
  createdAt: string;
  config?: TeamConfig;
}
```

### TeamMember
```typescript
interface TeamMember {
  id: string;
  name: string;
  role: 'lead' | 'developer' | 'architect' | 'qa' | 'pm';
  specialty: string[];    // e.g., ['frontend', 'react', 'typescript']
  status: 'idle' | 'busy' | 'offline';
  currentTask?: string;
  teamId: string;
}
```

### TeamTask
```typescript
interface TeamTask {
  id: string;
  teamId: string;
  assigneeId: string;     // Assigned team member
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependencies: string[]; // Other task IDs this task depends on
  createdAt: string;
  completedAt?: string;
  result?: string;        // Task execution result
}
```

### TeamSession
```typescript
interface TeamSession {
  id: string;
  teamId: string;
  projectId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
  tasks: TeamTask[];
  coordinationLog: TeamMessage[];
}
```

### TeamMessage (Communication)
```typescript
interface TeamMessage {
  id: string;
  sessionId: string;
  fromId: string;         // Sender member ID
  toId?: string;          // Recipient (null = broadcast)
  type: 'task_assigned' | 'status_update' | 'result' | 'question' | 'coordination';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
```

## CLI Commands

### Team Management
```bash
# Create a new team
maxclaw team create <name> --project <project-id> --lead <lead-name>

# List all teams
maxclaw team list

# Show team details
maxclaw team show <team-name>

# Delete a team
maxclaw team remove <team-name>
```

### Team Member Management
```bash
# Add member to team
maxclaw team member-add <team-name> <member-name> --role <role> --specialty <specialty1,specialty2>

# Remove member from team
maxclaw team member-remove <team-name> <member-name>

# List team members
maxclaw team members <team-name>
```

### Team Session
```bash
# Start a team session on a project
maxclaw team start <team-name> <project-id> --goal <goal-description>

# Show team session status
maxclaw team status <team-name>

# Show team coordination log
maxclaw team log <team-name> [--session <session-id>]

# Stop team session
maxclaw team stop <team-name>
```

## Implementation Plan

### Phase 1: Database Schema (P0)
- Add team tables to SQLite schema
- Migration script for existing databases

### Phase 2: Core Team Module (P0)
- Team CRUD operations
- Team member management
- Validation logic

### Phase 3: Team Session Module (P1)
- Team session lifecycle
- Task assignment algorithm
- Status tracking

### Phase 4: Communication Protocol (P1)
- Message passing system
- Coordination log
- Broadcast mechanism

### Phase 5: CLI Integration (P0)
- Add `team` subcommand
- All team-related commands
- Output formatting

## Database Schema Additions

```sql
-- Teams table
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TEXT NOT NULL,
  config TEXT  -- JSON
);

-- Team members table
CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  specialty TEXT,  -- JSON array
  status TEXT NOT NULL DEFAULT 'idle',
  current_task TEXT,
  team_id TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- Team sessions table
CREATE TABLE team_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  goal TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- Team tasks table
CREATE TABLE team_tasks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  dependencies TEXT,  -- JSON array
  created_at TEXT NOT NULL,
  completed_at TEXT,
  result TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (session_id) REFERENCES team_sessions(id)
);

-- Team messages table
CREATE TABLE team_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT,  -- JSON
  FOREIGN KEY (session_id) REFERENCES team_sessions(id)
);
```

## Integration Points

### With Existing Project System
- Team is associated with existing Project
- Team session leverages existing session tracking
- Activities logged to existing activity table

### With Session Manager
- Team session extends individual session concept
- Team Lead's session is the primary session
- Member sessions are child sessions

## Error Handling

- Team name uniqueness validation
- Member role validation
- Circular dependency detection in tasks
- Team session lifecycle validation
