// E6: Notification Service - Send notifications via webhooks

import { logger } from './logger.js';
import { getProject, getSession, getTeamTask, getTeamMember, getTeam } from './db.js';
import type { Schedule } from './types.js';
import type {
  NotificationMessage,
  NotificationType,
  NotificationLevel,
  NotificationOptions,
  Project,
} from './types.js';
import { createWebhookPayload, formatMessage, getWebhookHeaders } from './webhook-adapters.js';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = parseInt(process.env.TEST_MODE ? '10' : '1000', 10); // 10ms in test mode, 1000ms otherwise
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Check if notification should be sent based on level filter
 */
function shouldNotify(
  messageLevel: NotificationLevel,
  projectLevel: NotificationLevel | undefined
): boolean {
  const levelPriority: Record<NotificationLevel, number> = {
    info: 1,
    warning: 2,
    error: 3,
  };

  const configPriority = levelPriority[projectLevel ?? 'info'];
  const messagePriority = levelPriority[messageLevel];

  return messagePriority >= configPriority;
}

/**
 * Send HTTP POST request with timeout and retry logic
 */
async function sendWebhookRequest(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  retryCount = 0
): Promise<{ success: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Retry on network errors or 5xx server errors
    if (retryCount < MAX_RETRIES) {
      logger.warn('Webhook request failed, retrying (%d/%d): %s', retryCount + 1, MAX_RETRIES, errorMessage);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
      return sendWebhookRequest(url, body, headers, retryCount + 1);
    }

    logger.error('Webhook request failed after %d retries: %s', MAX_RETRIES, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a notification to a project's configured webhook
 */
export async function sendNotification(
  projectId: string,
  message: string,
  options: NotificationOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const project = getProject(projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${projectId}` };
  }

  if (!project.notificationWebhook) {
    logger.debug('No webhook configured for project: %s', project.name);
    return { success: false, error: 'No webhook configured' };
  }

  const level = options.level ?? 'info';

  // Check if we should send based on notification level
  if (!shouldNotify(level, project.notificationLevel)) {
    logger.debug('Notification level %s filtered out by project config %s', level, project.notificationLevel);
    return { success: false, error: 'Notification filtered by level' };
  }

  const notificationMessage: NotificationMessage = {
    title: 'MaxClaw Notification',
    content: message,
    level,
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: options.metadata,
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, notificationMessage, type);

  logger.info('Sending %s notification to project: %s', level, project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Send a session summary notification when a session ends
 */
export async function sendSessionSummary(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` };
  }

  const project = getProject(session.projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${session.projectId}` };
  }

  if (!project.notificationWebhook) {
    return { success: false, error: 'No webhook configured' };
  }

  // Calculate session duration
  const startTime = new Date(session.startedAt);
  const endTime = session.endedAt ? new Date(session.endedAt) : new Date();
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.floor(durationMs / (1000 * 60));
  const durationHours = Math.floor(durationMinutes / 60);
  const durationText = durationHours > 0
    ? `${durationHours}h ${durationMinutes % 60}m`
    : `${durationMinutes}m`;

  const summary = session.summary ?? 'No summary available';

  const message: NotificationMessage = {
    title: 'Session Completed',
    content: `**Session Duration:** ${durationText}\n\n**Summary:**\n${summary}`,
    level: 'info',
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: {
      sessionId,
      duration: durationText,
      status: session.status,
    },
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, message, type);

  logger.info('Sending session summary notification for project: %s', project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Send a task completed notification
 */
export async function sendTaskCompleted(taskId: string): Promise<{ success: boolean; error?: string }> {
  const task = getTeamTask(taskId);
  if (!task) {
    return { success: false, error: `Task not found: ${taskId}` };
  }

  const team = getTeam(task.teamId);
  if (!team) {
    return { success: false, error: `Team not found: ${task.teamId}` };
  }

  const project = getProject(team.projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${team.projectId}` };
  }

  if (!project.notificationWebhook) {
    return { success: false, error: 'No webhook configured' };
  }

  const assignee = getTeamMember(task.assigneeId);
  const assigneeName = assignee?.name ?? 'Unknown';

  const message: NotificationMessage = {
    title: 'Task Completed',
    content: `**${task.title}**\n\n${task.description ?? 'No description'}\n\n**Assigned to:** ${assigneeName}\n**Result:** ${task.result ?? 'No result provided'}`,
    level: 'info',
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: {
      taskId,
      assigneeId: task.assigneeId,
      teamId: task.teamId,
      completedAt: task.completedAt,
    },
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, message, type);

  logger.info('Sending task completed notification for project: %s', project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Send an error alert notification
 */
export async function sendErrorAlert(
  projectId: string,
  error: Error | string,
  context?: string
): Promise<{ success: boolean; error?: string }> {
  const project = getProject(projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${projectId}` };
  }

  if (!project.notificationWebhook) {
    return { success: false, error: 'No webhook configured' };
  }

  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  const message: NotificationMessage = {
    title: 'Error Alert',
    content: context
      ? `**Context:** ${context}\n\n**Error:** ${errorMessage}${errorStack ? `\n\n**Stack:**\n\`\`\`\n${errorStack}\n\`\`\`` : ''}`
      : `**Error:** ${errorMessage}${errorStack ? `\n\n**Stack:**\n\`\`\`\n${errorStack}\n\`\`\`` : ''}`,
    level: 'error',
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: {
      context,
      errorType: error instanceof Error ? error.name : 'Unknown',
    },
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, message, type);

  logger.info('Sending error alert notification for project: %s', project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Send a schedule execution notification
 */
export async function sendScheduleNotification(
  schedule: Schedule,
  status: 'completed' | 'failed',
  output?: string,
  error?: string
): Promise<{ success: boolean; error?: string }> {
  const project = getProject(schedule.projectId);
  if (!project) {
    return { success: false, error: `Project not found: ${schedule.projectId}` };
  }

  if (!project.notificationWebhook) {
    return { success: false, error: 'No webhook configured' };
  }

  const level: NotificationLevel = status === 'failed' ? 'error' : 'info';

  const message: NotificationMessage = {
    title: `Scheduled Task ${status === 'completed' ? 'Completed' : 'Failed'}`,
    content: `**Schedule:** ${schedule.name}\n**Type:** ${schedule.taskType}\n\n${output ? `**Output:**\n${output}` : ''}${error ? `**Error:**\n${error}` : ''}`,
    level,
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      taskType: schedule.taskType,
      status,
    },
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, message, type);

  logger.info('Sending schedule notification for project: %s', project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Send a test notification to verify webhook configuration
 */
export async function sendTestNotification(
  project: Project
): Promise<{ success: boolean; error?: string }> {
  if (!project.notificationWebhook) {
    return { success: false, error: 'No webhook configured for this project' };
  }

  const message: NotificationMessage = {
    title: 'Test Notification',
    content: 'This is a test notification from MaxClaw. Your webhook is configured correctly!',
    level: 'info',
    timestamp: new Date().toISOString(),
    projectName: project.name,
    metadata: {
      type: 'test',
      notificationType: project.notificationType,
    },
  };

  const type = project.notificationType ?? 'custom';
  const payload = createWebhookPayload(project.notificationWebhook, message, type);

  logger.info('Sending test notification to project: %s', project.name);

  return sendWebhookRequest(payload.url, payload.body, payload.headers);
}

/**
 * Configure notification settings for a project
 */
export async function configureNotification(
  projectId: string,
  config: {
    webhook?: string;
    type?: NotificationType;
    level?: NotificationLevel;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { updateProject } = await import('./db.js');

    updateProject({
      id: projectId,
      notificationWebhook: config.webhook,
      notificationType: config.type,
      notificationLevel: config.level,
    });

    logger.info('Updated notification config for project: %s', projectId);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to configure notification: %s', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Re-export types for convenience
export type { NotificationMessage, NotificationType, NotificationLevel, NotificationOptions };
