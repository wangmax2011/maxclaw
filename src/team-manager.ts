import crypto from 'crypto';
import { logger } from './logger.js';
import {
  createTeam,
  getTeam,
  getTeamByName,
  listTeams,
  listTeamsForProject,
  updateTeam,
  deleteTeam,
  createTeamMember,
  getTeamMember,
  listTeamMembers,
  updateTeamMember,
  deleteTeamMember,
  createTeamSession,
  getTeamSession,
  updateTeamSession,
  listActiveTeamSessions,
  createTeamTask,
  listTeamTasksForSession,
  updateTeamTask,
  createTeamMessage,
  listTeamMessagesForSession,
  createActivity,
} from './db.js';
import { getProject } from './db.js';
import type {
  Team,
  TeamMember,
  TeamSession,
  TeamTask,
  TeamMessage,
  TeamRole,
  TeamConfig,
  TeamWithMembers,
  TaskAssignmentResult,
  TaskType,
  TaskPriority,
} from './types.js';

function generateId(): string {
  return crypto.randomUUID();
}

// ===== Team Operations =====

export async function createNewTeam(
  name: string,
  projectId: string,
  leadName: string,
  config?: TeamConfig
): Promise<TeamWithMembers> {
  // Check if team name already exists
  const existing = getTeamByName(name);
  if (existing) {
    throw new Error(`Team with name "${name}" already exists`);
  }

  // Verify project exists
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const teamId = generateId();
  const now = new Date().toISOString();

  // Create Team Lead member first
  const leadId = generateId();
  const lead: TeamMember = {
    id: leadId,
    name: leadName,
    role: 'lead',
    specialty: ['coordination', 'management'],
    status: 'idle',
    teamId,
  };

  // Create the team
  const team: Team = {
    id: teamId,
    name,
    projectId,
    leadId,
    memberIds: [leadId],
    status: 'idle',
    createdAt: now,
    config: config ?? { maxMembers: 5, coordinationMode: 'hierarchical', autoAssign: false },
  };

  createTeam(team);
  createTeamMember(lead);

  // Log activity
  createActivity({
    id: generateId(),
    projectId,
    type: 'command',
    timestamp: now,
    details: { command: 'team_create', teamName: name, leadName },
  });

  logger.info('Created team: %s with lead: %s', name, leadName);

  return {
    ...team,
    lead,
    members: [lead],
  };
}

export function getTeamWithMembers(teamId: string): TeamWithMembers | null {
  const team = getTeam(teamId);
  if (!team) return null;

  const members = listTeamMembers(teamId);
  const lead = members.find((m) => m.id === team.leadId);

  if (!lead) {
    throw new Error(`Team lead not found for team: ${teamId}`);
  }

  return {
    ...team,
    memberIds: members.map((m) => m.id),
    lead,
    members,
  };
}

export function getTeamByNameWithMembers(name: string): TeamWithMembers | null {
  const team = getTeamByName(name);
  if (!team) return null;
  return getTeamWithMembers(team.id);
}

export function listAllTeams(): TeamWithMembers[] {
  const teams = listTeams();
  return teams
    .map((t) => getTeamWithMembers(t.id))
    .filter((t): t is TeamWithMembers => t !== null);
}

export function listTeamsByProject(projectId: string): TeamWithMembers[] {
  const teams = listTeamsForProject(projectId);
  return teams
    .map((t) => getTeamWithMembers(t.id))
    .filter((t): t is TeamWithMembers => t !== null);
}

export function removeTeam(teamId: string): void {
  const team = getTeam(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  deleteTeam(teamId);

  createActivity({
    id: generateId(),
    projectId: team.projectId,
    type: 'command',
    timestamp: new Date().toISOString(),
    details: { command: 'team_remove', teamId, teamName: team.name },
  });

  logger.info('Removed team: %s', team.name);
}

// ===== Team Member Operations =====

export function addMemberToTeam(
  teamId: string,
  name: string,
  role: TeamRole = 'developer',
  specialty: string[] = []
): TeamMember {
  const team = getTeam(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Check if team is at capacity
  const currentMembers = listTeamMembers(teamId);
  const maxMembers = team.config?.maxMembers ?? 5;
  if (currentMembers.length >= maxMembers) {
    throw new Error(`Team is at capacity (${maxMembers} members)`);
  }

  // Check if member name already exists in team
  if (currentMembers.some((m) => m.name === name)) {
    throw new Error(`Team member "${name}" already exists in this team`);
  }

  const member: TeamMember = {
    id: generateId(),
    name,
    role,
    specialty,
    status: 'idle',
    teamId,
  };

  createTeamMember(member);

  // Update team's member list
  updateTeam({
    id: teamId,
    memberIds: [...currentMembers.map((m) => m.id), member.id],
  });

  createActivity({
    id: generateId(),
    projectId: team.projectId,
    type: 'command',
    timestamp: new Date().toISOString(),
    details: { command: 'team_add_member', teamId, memberName: name, role },
  });

  logger.info('Added member %s (%s) to team %s', name, role, team.name);

  return member;
}

export function removeMemberFromTeam(teamId: string, memberId: string): void {
  const team = getTeam(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const member = getTeamMember(memberId);
  if (!member || member.teamId !== teamId) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  // Cannot remove the team lead
  if (member.id === team.leadId) {
    throw new Error('Cannot remove the team lead. Transfer leadership first or delete the team.');
  }

  deleteTeamMember(memberId);

  createActivity({
    id: generateId(),
    projectId: team.projectId,
    type: 'command',
    timestamp: new Date().toISOString(),
    details: { command: 'team_remove_member', teamId, memberId, memberName: member.name },
  });

  logger.info('Removed member %s from team %s', member.name, team.name);
}

export function updateMemberRole(memberId: string, newRole: TeamRole): void {
  const member = getTeamMember(memberId);
  if (!member) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  updateTeamMember({ id: memberId, role: newRole });

  logger.info('Updated member %s role to %s', member.name, newRole);
}

export function updateMemberSpecialty(memberId: string, specialty: string[]): void {
  const member = getTeamMember(memberId);
  if (!member) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  updateTeamMember({ id: memberId, specialty });

  logger.info('Updated member %s specialties: %s', member.name, specialty.join(', '));
}

// ===== Team Session Operations =====

export async function startTeamSession(
  teamId: string,
  goal?: string
): Promise<TeamSession> {
  const team = getTeamWithMembers(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  if (team.status === 'active') {
    throw new Error(`Team ${team.name} already has an active session`);
  }

  const sessionId = generateId();
  const now = new Date().toISOString();

  const session: TeamSession = {
    id: sessionId,
    teamId,
    projectId: team.projectId,
    startedAt: now,
    status: 'active',
    goal,
    tasks: [],
  };

  createTeamSession(session);

  // Update team status
  updateTeam({ id: teamId, status: 'active' });

  // Set all members to idle status initially
  for (const member of team.members) {
    updateTeamMember({ id: member.id, status: 'idle', currentTask: undefined });
  }

  // Create coordination message
  const message: TeamMessage = {
    id: generateId(),
    sessionId,
    fromId: team.leadId,
    type: 'coordination',
    content: goal ? `Team session started. Goal: ${goal}` : 'Team session started.',
    timestamp: now,
  };
  createTeamMessage(message);

  createActivity({
    id: generateId(),
    projectId: team.projectId,
    type: 'start',
    timestamp: now,
    details: { command: 'team_start_session', teamId, teamName: team.name, goal },
  });

  logger.info('Started team session for %s (goal: %s)', team.name, goal ?? 'none');

  return session;
}

export function stopTeamSession(teamId: string, summary?: string): void {
  const team = getTeam(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const sessions = listActiveTeamSessions();
  const session = sessions.find((s) => s.teamId === teamId);

  if (!session) {
    throw new Error(`No active session for team: ${team.name}`);
  }

  const now = new Date().toISOString();

  updateTeamSession({
    id: session.id,
    status: 'completed',
    endedAt: now,
  });

  // Update team status
  updateTeam({ id: teamId, status: 'idle' });

  // Set all members to idle
  const members = listTeamMembers(teamId);
  for (const member of members) {
    updateTeamMember({ id: member.id, status: 'idle', currentTask: undefined });
  }

  // Create summary message
  const message: TeamMessage = {
    id: generateId(),
    sessionId: session.id,
    fromId: team.leadId,
    type: 'coordination',
    content: summary ? `Team session completed. Summary: ${summary}` : 'Team session completed.',
    timestamp: now,
  };
  createTeamMessage(message);

  createActivity({
    id: generateId(),
    projectId: team.projectId,
    type: 'complete',
    timestamp: now,
    details: { command: 'team_stop_session', teamId, teamName: team.name, summary },
  });

  logger.info('Stopped team session for %s', team.name);
}

export function getActiveTeamSession(teamId: string): TeamSession | null {
  const sessions = listActiveTeamSessions();
  return sessions.find((s) => s.teamId === teamId) ?? null;
}

// ===== Team Task Operations =====

export function assignTaskToMember(
  sessionId: string,
  assigneeId: string,
  title: string,
  description?: string,
  dependencies: string[] = []
): TeamTask {
  const session = getTeamSession(sessionId);
  if (!session) {
    throw new Error(`Team session not found: ${sessionId}`);
  }

  const member = getTeamMember(assigneeId);
  if (!member) {
    throw new Error(`Team member not found: ${assigneeId}`);
  }

  if (member.teamId !== session.teamId) {
    throw new Error(`Member ${member.name} is not part of this team`);
  }

  const taskId = generateId();
  const now = new Date().toISOString();

  const task: TeamTask = {
    id: taskId,
    teamId: session.teamId,
    sessionId,
    assigneeId,
    title,
    description,
    status: 'pending',
    dependencies,
    createdAt: now,
  };

  createTeamTask(task);

  // Update member status
  updateTeamMember({ id: assigneeId, status: 'busy', currentTask: taskId });

  // Create assignment message
  const message: TeamMessage = {
    id: generateId(),
    sessionId,
    fromId: session.teamId, // From team/system
    toId: assigneeId,
    type: 'task_assigned',
    content: `New task assigned: ${title}`,
    timestamp: now,
    metadata: { taskId },
  };
  createTeamMessage(message);

  logger.info('Assigned task "%s" to %s', title, member.name);

  return task;
}

export function completeTask(
  taskId: string,
  result?: string
): void {
  const task = listTeamTasksForSession('') // Need to get from all sessions
    .find((t) => t.id === taskId);

  // Get task from specific session
  const sessions = listActiveTeamSessions();
  let foundTask: TeamTask | undefined;
  for (const session of sessions) {
    const tasks = listTeamTasksForSession(session.id);
    foundTask = tasks.find((t) => t.id === taskId);
    if (foundTask) break;
  }

  if (!foundTask) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const now = new Date().toISOString();

  updateTeamTask({
    id: taskId,
    status: 'completed',
    completedAt: now,
    result,
  });

  // Free up the member
  updateTeamMember({
    id: foundTask.assigneeId,
    status: 'idle',
    currentTask: undefined,
  });

  // Create result message
  const message: TeamMessage = {
    id: generateId(),
    sessionId: foundTask.sessionId,
    fromId: foundTask.assigneeId,
    type: 'result',
    content: result ? `Task completed: ${foundTask.title}\nResult: ${result}` : `Task completed: ${foundTask.title}`,
    timestamp: now,
    metadata: { taskId, result },
  };
  createTeamMessage(message);

  logger.info('Completed task: %s', foundTask.title);

  // E6: Send task completion notification
  const session = getTeamSession(foundTask.sessionId);
  if (session) {
    const team = getTeam(session.teamId);
    if (team) {
      const project = getProject(team.projectId);
      if (project?.notificationWebhook) {
        void import('./notifier.js').then(({ sendTaskCompleted }) => {
          sendTaskCompleted(taskId).catch((err) => {
            logger.error('Failed to send task completion notification: %s', err);
          });
        });
      }
    }
  }
}

export function updateTaskStatus(
  taskId: string,
  status: TeamTask['status']
): void {
  const sessions = listActiveTeamSessions();
  let foundTask: TeamTask | undefined;
  for (const session of sessions) {
    const tasks = listTeamTasksForSession(session.id);
    foundTask = tasks.find((t) => t.id === taskId);
    if (foundTask) break;
  }

  if (!foundTask) {
    throw new Error(`Task not found: ${taskId}`);
  }

  updateTeamTask({ id: taskId, status });

  // Create status update message
  const message: TeamMessage = {
    id: generateId(),
    sessionId: foundTask.sessionId,
    fromId: foundTask.assigneeId,
    type: 'status_update',
    content: `Task "${foundTask.title}" status updated to: ${status}`,
    timestamp: new Date().toISOString(),
    metadata: { taskId, status },
  };
  createTeamMessage(message);

  logger.info('Updated task %s status to %s', foundTask.title, status);
}

// ===== Team Communication =====

export function sendTeamMessage(
  sessionId: string,
  fromId: string,
  content: string,
  toId?: string,
  type: TeamMessage['type'] = 'coordination'
): TeamMessage {
  const session = getTeamSession(sessionId);
  if (!session) {
    throw new Error(`Team session not found: ${sessionId}`);
  }

  const message: TeamMessage = {
    id: generateId(),
    sessionId,
    fromId,
    toId,
    type,
    content,
    timestamp: new Date().toISOString(),
  };

  createTeamMessage(message);

  return message;
}

export function getTeamCommunicationLog(sessionId: string, limit = 50): TeamMessage[] {
  return listTeamMessagesForSession(sessionId, limit);
}

// ===== Utility Functions =====

export function getAvailableMembers(teamId: string): TeamMember[] {
  const members = listTeamMembers(teamId);
  return members.filter((m) => m.status === 'idle');
}

export function getMemberWorkload(teamId: string): { member: TeamMember; taskCount: number }[] {
  const members = listTeamMembers(teamId);
  const sessions = listActiveTeamSessions();

  return members.map((member) => {
    let taskCount = 0;
    for (const session of sessions) {
      if (session.teamId === teamId) {
        const tasks = listTeamTasksForSession(session.id);
        taskCount += tasks.filter((t) => t.assigneeId === member.id && t.status !== 'completed').length;
      }
    }
    return { member, taskCount };
  });
}

/**
 * E7: Smart Task Assignment Algorithm
 *
 * Calculates the best member for a task based on:
 * - Skill Match Score (60%): How well member's expertise matches required skills
 * - Workload Factor (40%): Remaining capacity of the member
 *
 * Formula:
 *   Match Score = (Skill Match * 0.6) + (Workload Factor * 0.4)
 *
 * Where:
 *   Skill Match = Matched Skills / Total Required Skills
 *   Workload Factor = 1 - (Current Tasks / Max Concurrent Tasks)
 *
 * Members at full capacity are filtered out.
 * Team leads (role='lead') are also excluded as they are for coordination only.
 */
export function suggestSmartTaskAssignment(
  teamId: string,
  requiredSkills: string[] = [],
  taskType?: TaskType
): TaskAssignmentResult[] {
  const members = listTeamMembers(teamId);
  const sessions = listActiveTeamSessions();

  // Calculate results for all active members (excluding team leads)
  const results: TaskAssignmentResult[] = [];

  for (const member of members) {
    // Skip team leads - they are for coordination only
    if (member.role === 'lead') continue;

    // Skip offline members
    if (member.status === 'offline') continue;

    // Count current active tasks for this member
    let currentTasks = 0;
    for (const session of sessions) {
      if (session.teamId === teamId) {
        const tasks = listTeamTasksForSession(session.id);
        currentTasks += tasks.filter(
          (t) => t.assigneeId === member.id && t.status !== 'completed' && t.status !== 'blocked'
        ).length;
      }
    }

    const maxTasks = member.maxConcurrentTasks ?? 3;

    // Skip members at full capacity
    if (currentTasks >= maxTasks) {
      continue;
    }

    // Calculate skill match score
    let skillMatchScore = 0;
    if (requiredSkills.length === 0) {
      // No specific skills required, everyone is equally matched
      skillMatchScore = 1;
    } else {
      // Use expertise if available and non-empty, otherwise fall back to specialty
      const memberExpertise = (member.expertise && member.expertise.length > 0)
        ? member.expertise
        : (member.specialty || []);
      const matchedSkills = requiredSkills.filter((skill) =>
        memberExpertise.some((exp) => exp.toLowerCase() === skill.toLowerCase())
      );
      skillMatchScore = matchedSkills.length / requiredSkills.length;
    }

    // Calculate workload factor (remaining capacity)
    const workloadFactor = 1 - currentTasks / maxTasks;

    // Calculate overall score using weighted formula
    // Skill Match: 60%, Workload Factor: 40%
    const overallScore = skillMatchScore * 0.6 + workloadFactor * 0.4;

    results.push({
      member,
      skillMatchScore,
      workloadFactor,
      overallScore,
      currentTasks,
      maxTasks,
    });
  }

  // Sort by overall score descending
  return results.sort((a, b) => b.overallScore - a.overallScore);
}

/**
 * Legacy function - kept for backward compatibility
 * Returns the best available member or null
 */
export function suggestTaskAssignment(teamId: string): TeamMember | null {
  const recommendations = suggestSmartTaskAssignment(teamId);
  return recommendations.length > 0 ? recommendations[0].member : null;
}

/**
 * E7: Get detailed workload distribution for a team
 */
export function getTeamWorkloadDistribution(teamId: string): {
  member: TeamMember;
  currentTasks: number;
  maxTasks: number;
  utilization: number; // 0-1 percentage
}[] {
  const members = listTeamMembers(teamId);
  const sessions = listActiveTeamSessions();

  return members.map((member) => {
    let currentTasks = 0;
    for (const session of sessions) {
      if (session.teamId === teamId) {
        const tasks = listTeamTasksForSession(session.id);
        currentTasks += tasks.filter(
          (t) => t.assigneeId === member.id && t.status !== 'completed' && t.status !== 'blocked'
        ).length;
      }
    }

    const maxTasks = member.maxConcurrentTasks ?? 3;
    const utilization = currentTasks / maxTasks;

    return {
      member,
      currentTasks,
      maxTasks,
      utilization,
    };
  });
}

/**
 * E7: Update member expertise
 */
export function updateMemberExpertise(memberId: string, expertise: string[]): void {
  const member = getTeamMember(memberId);
  if (!member) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  updateTeamMember({ id: memberId, expertise });

  logger.info('Updated member %s expertise: %s', member.name, expertise.join(', '));
}

/**
 * E7: Update member capacity (max concurrent tasks)
 */
export function updateMemberCapacity(memberId: string, maxTasks: number): void {
  const member = getTeamMember(memberId);
  if (!member) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  if (maxTasks < 1 || maxTasks > 10) {
    throw new Error('Max concurrent tasks must be between 1 and 10');
  }

  updateTeamMember({ id: memberId, maxConcurrentTasks: maxTasks });

  logger.info('Updated member %s max concurrent tasks to %d', member.name, maxTasks);
}

/**
 * E7: Create a task with smart assignment support
 */
export function createTaskWithSmartAssignment(
  sessionId: string,
  title: string,
  options: {
    description?: string;
    type?: TaskType;
    requiredSkills?: string[];
    priority?: TaskPriority;
    assigneeId?: string;
    autoAssign?: boolean;
  } = {}
): TeamTask {
  const session = getTeamSession(sessionId);
  if (!session) {
    throw new Error(`Team session not found: ${sessionId}`);
  }

  const teamId = session.teamId;
  let assigneeId: string;

  // If auto-assign is enabled and no assignee specified, use smart assignment
  if (options.autoAssign && !options.assigneeId) {
    const recommendations = suggestSmartTaskAssignment(
      teamId,
      options.requiredSkills,
      options.type
    );
    if (recommendations.length === 0) {
      throw new Error('No available team members for task assignment');
    }
    assigneeId = recommendations[0].member.id;
  } else if (options.assigneeId) {
    // Verify the specified assignee exists and is part of the team
    const member = getTeamMember(options.assigneeId);
    if (!member) {
      throw new Error(`Team member not found: ${options.assigneeId}`);
    }
    if (member.teamId !== teamId) {
      throw new Error(`Member ${member.name} is not part of this team`);
    }
    assigneeId = options.assigneeId;
  } else {
    throw new Error('Either assigneeId or autoAssign must be specified');
  }

  const taskId = generateId();
  const now = new Date().toISOString();

  const task: TeamTask = {
    id: taskId,
    teamId,
    sessionId,
    assigneeId,
    title,
    description: options.description,
    status: 'pending',
    dependencies: [],
    createdAt: now,
    type: options.type ?? 'feature',
    requiredSkills: options.requiredSkills,
    priority: options.priority ?? 3,
  };

  createTeamTask(task);

  // Update member status
  updateTeamMember({ id: assigneeId, status: 'busy', currentTask: taskId });

  // Create assignment message
  const member = getTeamMember(assigneeId);
  const message: TeamMessage = {
    id: generateId(),
    sessionId,
    fromId: teamId, // From team/system
    toId: assigneeId,
    type: 'task_assigned',
    content: `New task assigned: ${title}`,
    timestamp: now,
    metadata: { taskId, type: options.type, priority: options.priority },
  };
  createTeamMessage(message);

  logger.info('Assigned task "%s" to %s', title, member?.name ?? 'Unknown');

  // E6: Send task assignment notification
  const taskTeam = getTeam(teamId);
  if (taskTeam) {
    const project = getProject(taskTeam.projectId);
    if (project?.notificationWebhook) {
      void import('./notifier.js').then(({ sendNotification }) => {
        const priorityText = options.priority ? ` (Priority: ${options.priority}/5)` : '';
        const typeText = options.type ? ` [${options.type}]` : '';
        return sendNotification(
          project.id,
          `**Task Assigned${typeText}${priorityText}**\n\n**${title}**\n${options.description ?? 'No description'}\n\n**Assigned to:** ${member?.name ?? 'Unknown'}`,
          {
            level: 'info',
            metadata: {
              taskId,
              assigneeId,
              type: options.type,
              priority: options.priority,
            },
          }
        );
      }).catch((err) => {
        logger.error('Failed to send task assignment notification: %s', err);
      });
    }
  }

  return task;
}
