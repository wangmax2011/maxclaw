// E3: Scheduler Manager - Manages the scheduling system lifecycle

import { logger } from './logger.js';
import type { Schedule } from './types.js';
import {
  executeSchedule,
  getDueSchedules,
  calculateNextRun,
  initializeScheduleNextRun,
} from './scheduler.js';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  listSchedulesForProject,
} from './db.js';

// Default check interval in milliseconds (1 minute)
const DEFAULT_CHECK_INTERVAL = 60000;

// Scheduler state
interface SchedulerState {
  isRunning: boolean;
  checkInterval: number;
  timer: NodeJS.Timeout | null;
  lastCheck: Date | null;
}

const state: SchedulerState = {
  isRunning: false,
  checkInterval: DEFAULT_CHECK_INTERVAL,
  timer: null,
  lastCheck: null,
};

/**
 * Check and execute due schedules
 */
async function checkSchedules(): Promise<void> {
  if (!state.isRunning) return;

  state.lastCheck = new Date();
  logger.debug('Checking for due schedules...');

  try {
    const dueSchedules = getDueSchedules();

    if (dueSchedules.length > 0) {
      logger.info('Found %d due schedule(s)', dueSchedules.length);

      for (const schedule of dueSchedules) {
        // Execute schedule asynchronously (don't await to avoid blocking)
        executeSchedule(schedule.id).catch((error) => {
          logger.error('Failed to execute schedule %s: %s', schedule.id, error);
        });
      }
    }
  } catch (error) {
    logger.error('Error checking schedules: %s', error);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(options?: { checkInterval?: number }): void {
  if (state.isRunning) {
    logger.warn('Scheduler is already running');
    return;
  }

  state.checkInterval = options?.checkInterval ?? DEFAULT_CHECK_INTERVAL;
  state.isRunning = true;

  // Initial check
  checkSchedules();

  // Set up interval
  state.timer = setInterval(() => {
    checkSchedules();
  }, state.checkInterval);

  logger.info('Scheduler started (check interval: %dms)', state.checkInterval);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!state.isRunning) {
    logger.warn('Scheduler is not running');
    return;
  }

  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  state.isRunning = false;
  logger.info('Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  checkInterval: number;
  lastCheck: Date | null;
} {
  return {
    isRunning: state.isRunning,
    checkInterval: state.checkInterval,
    lastCheck: state.lastCheck,
  };
}

/**
 * Restart the scheduler with new options
 */
export function restartScheduler(options?: { checkInterval?: number }): void {
  stopScheduler();
  startScheduler(options);
}

// ===== Schedule CRUD Operations =====

export interface CreateScheduleInput {
  projectId: string;
  name: string;
  description?: string;
  cronExpression: string;
  taskType: Schedule['taskType'];
  command?: string;
  skillName?: string;
  skillCommand?: string;
  skillArgs?: string[];
  message?: string;
  enabled?: boolean;
}

/**
 * Create a new schedule
 */
export function createNewSchedule(input: CreateScheduleInput): Schedule {
  const now = new Date().toISOString();
  const id = `sched-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  let schedule: Schedule = {
    id,
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    cronExpression: input.cronExpression,
    taskType: input.taskType,
    command: input.command,
    skillName: input.skillName,
    skillCommand: input.skillCommand,
    skillArgs: input.skillArgs,
    message: input.message,
    enabled: input.enabled ?? true,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Calculate initial next_run
  schedule = initializeScheduleNextRun(schedule);

  createSchedule(schedule);
  logger.info('Created schedule: %s (%s)', schedule.name, schedule.id);

  return schedule;
}

/**
 * Enable a schedule
 */
export function enableSchedule(scheduleId: string): boolean {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    logger.error('Schedule not found: %s', scheduleId);
    return false;
  }

  if (schedule.enabled) {
    logger.info('Schedule %s is already enabled', scheduleId);
    return true;
  }

  // Recalculate next_run when enabling
  const nextRun = calculateNextRun(schedule.cronExpression);

  updateSchedule({
    id: scheduleId,
    enabled: true,
    nextRun: nextRun?.toISOString(),
  });

  logger.info('Enabled schedule: %s', scheduleId);
  return true;
}

/**
 * Disable a schedule
 */
export function disableSchedule(scheduleId: string): boolean {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    logger.error('Schedule not found: %s', scheduleId);
    return false;
  }

  if (!schedule.enabled) {
    logger.info('Schedule %s is already disabled', scheduleId);
    return true;
  }

  updateSchedule({
    id: scheduleId,
    enabled: false,
    nextRun: undefined,
  });

  logger.info('Disabled schedule: %s', scheduleId);
  return true;
}

/**
 * Remove a schedule
 */
export function removeSchedule(scheduleId: string): boolean {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    logger.error('Schedule not found: %s', scheduleId);
    return false;
  }

  deleteSchedule(scheduleId);
  logger.info('Removed schedule: %s', scheduleId);
  return true;
}

/**
 * Get a schedule by ID
 */
export function getScheduleById(scheduleId: string): Schedule | null {
  return getSchedule(scheduleId);
}

/**
 * List all schedules
 */
export function listAllSchedules(): Schedule[] {
  return listSchedules();
}

/**
 * List schedules for a project
 */
export function listProjectSchedules(projectId: string): Schedule[] {
  return listSchedulesForProject(projectId);
}

/**
 * Run a schedule immediately (manual execution)
 */
export async function runScheduleNow(scheduleId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    return {
      success: false,
      message: `Schedule not found: ${scheduleId}`,
    };
  }

  logger.info('Manually executing schedule: %s', schedule.name);

  try {
    const result = await executeSchedule(scheduleId);

    if (result.success) {
      return {
        success: true,
        message: `Schedule executed successfully${result.output ? `: ${result.output}` : ''}`,
      };
    } else {
      return {
        success: false,
        message: `Schedule execution failed: ${result.error}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Schedule execution error: ${error}`,
    };
  }
}

/**
 * Auto-start scheduler on system startup
 * Call this function when the application starts
 */
export function autoStartScheduler(): void {
  const shouldAutoStart = process.env.MAXCLAW_SCHEDULER_AUTOSTART !== 'false';

  if (shouldAutoStart) {
    logger.info('Auto-starting scheduler...');
    startScheduler();
  } else {
    logger.info('Scheduler auto-start disabled');
  }
}
