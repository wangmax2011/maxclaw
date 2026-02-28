// E3: Schedule Task Scheduler - Core scheduling logic

import type { CronExpression } from 'cron-parser';
import * as CronParser from 'cron-parser';
import { logger } from './logger.js';
import type { Schedule, ScheduleLog, ScheduleTaskType } from './types.js';
import {
  getSchedule,
  updateSchedule,
  createScheduleLog,
  updateScheduleLog,
  listEnabledSchedules,
} from './db.js';
import { getSkillRegistry } from './skills/skill-registry.js';

// Task execution result
export interface TaskExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

// Task executor interface
export type TaskExecutor = (schedule: Schedule) => Promise<TaskExecutionResult>;

// Task executors registry
const taskExecutors: Map<ScheduleTaskType, TaskExecutor> = new Map();

/**
 * Calculate next run time from cron expression
 */
export function calculateNextRun(cronExpression: string, fromDate?: Date): Date | null {
  try {
    const interval = CronParser.CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate ?? new Date(),
    });
    return interval.next().toDate();
  } catch (error) {
    logger.error('Failed to parse cron expression "%s": %s', cronExpression, error);
    return null;
  }
}

/**
 * Validate cron expression
 */
export function validateCronExpression(expression: string): boolean {
  // Empty or whitespace-only strings are invalid
  if (!expression || expression.trim() === '') {
    return false;
  }
  // Must have 5 parts (minute, hour, day of month, month, day of week)
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  try {
    CronParser.CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a task executor
 */
export function registerTaskExecutor(type: ScheduleTaskType, executor: TaskExecutor): void {
  taskExecutors.set(type, executor);
  logger.debug('Registered task executor for type: %s', type);
}

/**
 * Execute a reminder task
 */
async function executeReminderTask(schedule: Schedule): Promise<TaskExecutionResult> {
  const startTime = Date.now();
  const message = schedule.message ?? 'Reminder from MaxClaw';

  // Log the reminder
  logger.info('[%s] Reminder: %s', schedule.name, message);

  return {
    success: true,
    output: message,
    duration: Date.now() - startTime,
  };
}

/**
 * Execute a backup task
 */
async function executeBackupTask(schedule: Schedule): Promise<TaskExecutionResult> {
  const startTime = Date.now();

  try {
    // Import backup functionality dynamically
    const { getProject } = await import('./db.js');
    const project = getProject(schedule.projectId);

    if (!project) {
      return {
        success: false,
        error: `Project not found: ${schedule.projectId}`,
        duration: Date.now() - startTime,
      };
    }

    // Create backup directory
    const fs = await import('fs');
    const path = await import('path');
    const { DATA_DIR } = await import('./config.js');

    const backupDir = path.join(DATA_DIR, 'backups', schedule.projectId);
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

    // Collect project data
    const backup = {
      project,
      timestamp: new Date().toISOString(),
      scheduleId: schedule.id,
      scheduleName: schedule.name,
    };

    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    return {
      success: true,
      output: `Backup created: ${backupPath}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute a command task
 */
async function executeCommandTask(schedule: Schedule): Promise<TaskExecutionResult> {
  const startTime = Date.now();

  if (!schedule.command) {
    return {
      success: false,
      error: 'No command specified',
      duration: 0,
    };
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { getProject } = await import('./db.js');
    const project = getProject(schedule.projectId);
    const cwd = project?.path ?? process.cwd();

    const { stdout, stderr } = await execAsync(schedule.command, { cwd });

    return {
      success: true,
      output: stdout || 'Command executed successfully',
      error: stderr || undefined,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute a skill task
 */
async function executeSkillTask(schedule: Schedule): Promise<TaskExecutionResult> {
  const startTime = Date.now();

  if (!schedule.skillName || !schedule.skillCommand) {
    return {
      success: false,
      error: 'Skill name or command not specified',
      duration: 0,
    };
  }

  try {
    const registry = getSkillRegistry();
    const result = await registry.execute(
      schedule.skillName,
      schedule.skillCommand,
      schedule.skillArgs ?? [],
      {}
    );

    return {
      success: true,
      output: String(result),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

// Register default task executors
registerTaskExecutor('reminder', executeReminderTask);
registerTaskExecutor('backup', executeBackupTask);
registerTaskExecutor('command', executeCommandTask);
registerTaskExecutor('skill', executeSkillTask);

/**
 * Execute a single schedule task
 */
export async function executeSchedule(scheduleId: string): Promise<TaskExecutionResult> {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    return {
      success: false,
      error: `Schedule not found: ${scheduleId}`,
      duration: 0,
    };
  }

  if (!schedule.enabled) {
    return {
      success: false,
      error: 'Schedule is disabled',
      duration: 0,
    };
  }

  const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const startedAt = new Date().toISOString();

  // Create initial log entry
  createScheduleLog({
    id: logId,
    scheduleId,
    status: 'running',
    startedAt,
  });

  logger.info('Executing schedule: %s (%s)', schedule.name, schedule.taskType);

  const executor = taskExecutors.get(schedule.taskType);
  if (!executor) {
    const error = `No executor registered for task type: ${schedule.taskType}`;
    updateScheduleLog({
      id: logId,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
      duration: 0,
    });
    return {
      success: false,
      error,
      duration: 0,
    };
  }

  try {
    const result = await executor(schedule);

    // Update log with result
    updateScheduleLog({
      id: logId,
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      output: result.output,
      error: result.error,
      duration: result.duration,
    });

    // Update schedule stats
    const nextRun = calculateNextRun(schedule.cronExpression);
    updateSchedule({
      id: scheduleId,
      lastRun: startedAt,
      nextRun: nextRun?.toISOString(),
      runCount: schedule.runCount + 1,
    });

    if (result.success) {
      logger.info('Schedule completed: %s (took %dms)', schedule.name, result.duration);
    } else {
      logger.error('Schedule failed: %s - %s', schedule.name, result.error);
    }

    // E6: Send schedule notification
    const { sendScheduleNotification } = await import('./notifier.js');
    sendScheduleNotification(
      schedule,
      result.success ? 'completed' : 'failed',
      result.output,
      result.error
    ).catch((err) => {
      logger.error('Failed to send schedule notification for %s: %s', schedule.name, err);
    });

    return result;
  } catch (error) {
    const errorMessage = String(error);

    updateScheduleLog({
      id: logId,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: errorMessage,
      duration: Date.now() - new Date(startedAt).getTime(),
    });

    logger.error('Schedule execution error: %s - %s', schedule.name, errorMessage);

    // E6: Send schedule notification for error
    const { sendScheduleNotification } = await import('./notifier.js');
    sendScheduleNotification(schedule, 'failed', undefined, errorMessage).catch((err) => {
      logger.error('Failed to send schedule notification for %s: %s', schedule.name, err);
    });

    return {
      success: false,
      error: errorMessage,
      duration: Date.now() - new Date(startedAt).getTime(),
    };
  }
}

/**
 * Check if a schedule is due to run
 */
export function isScheduleDue(schedule: Schedule): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.nextRun) return true;

  const nextRun = new Date(schedule.nextRun);
  const now = new Date();

  return nextRun <= now;
}

/**
 * Get all due schedules
 */
export function getDueSchedules(): Schedule[] {
  const schedules = listEnabledSchedules();
  return schedules.filter(isScheduleDue);
}

/**
 * Initialize next_run for a new schedule
 */
export function initializeScheduleNextRun(schedule: Schedule): Schedule {
  // Only calculate next_run if schedule is enabled
  if (!schedule.enabled) {
    return schedule;
  }
  const nextRun = calculateNextRun(schedule.cronExpression);
  return {
    ...schedule,
    nextRun: nextRun?.toISOString(),
  };
}
