// E10: Built-in Agent - Scheduler Agent
// Manages scheduled tasks and cron-based automation

import { BaseAgent } from '../src/agent-protocol/agent-runtime.js';
import type { AgentMessage } from '../src/agent-protocol/types.js';
import { logger } from '../src/logger.js';
import { executeSchedule, getDueSchedules } from '../src/scheduler.js';
import {
  createSchedule,
  getSchedule,
  getSchedulesForProject,
  updateSchedule,
  deleteSchedule,
  listAllSchedules,
} from '../src/db.js';
import type { Schedule } from '../src/types.js';

/**
 * Scheduler Agent Configuration
 */
export interface SchedulerConfig {
  /** Enable automatic schedule execution */
  autoExecute?: boolean;
  /** Check interval in milliseconds */
  checkInterval?: number;
  /** Maximum concurrent executions */
  maxConcurrent?: number;
}

/**
 * Scheduler Agent Request Types
 */
export type SchedulerAction =
  | 'create_schedule'
  | 'delete_schedule'
  | 'execute_schedule'
  | 'list_schedules'
  | 'get_schedule'
  | 'enable_schedule'
  | 'disable_schedule'
  | 'get_due_schedules'
  | 'get_status';

/**
 * Scheduler Agent
 *
 * Capabilities:
 * - Create and manage scheduled tasks
 * - Execute schedules on demand
 * - Monitor and report schedule status
 * - Support cron-based scheduling
 */
export class SchedulerAgent extends BaseAgent {
  private config: Required<SchedulerConfig>;
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private checkTimer?: NodeJS.Timeout;
  private activeExecutions = 0;

  constructor(config: SchedulerConfig = {}) {
    super({
      name: 'scheduler',
      description: 'Schedule management agent for cron-based task automation',
      capabilities: [
        'create_schedule',
        'delete_schedule',
        'execute_schedule',
        'manage_schedules',
        'monitor_schedules',
      ],
    });

    this.config = {
      autoExecute: config.autoExecute ?? true,
      checkInterval: config.checkInterval ?? 60000, // 1 minute
      maxConcurrent: config.maxConcurrent ?? 5,
    };

    logger.info('SchedulerAgent created with config: %j', this.config);
  }

  async initialize(): Promise<void> {
    logger.info('SchedulerAgent [%s] initialized', this.id);

    if (this.config.autoExecute) {
      this.startScheduleMonitoring();
    }
  }

  async handleMessage(message: AgentMessage): Promise<unknown> {
    const action = message.payload.action as SchedulerAction;
    const data = message.payload.data;

    logger.debug('SchedulerAgent received action: %s', action);

    switch (action) {
      case 'create_schedule':
        return this.handleCreateSchedule(message);

      case 'delete_schedule':
        return this.handleDeleteSchedule(message);

      case 'execute_schedule':
        return this.handleExecuteSchedule(message);

      case 'list_schedules':
        return this.handleListSchedules(message);

      case 'get_schedule':
        return this.handleGetSchedule(message);

      case 'enable_schedule':
        return this.handleEnableSchedule(message);

      case 'disable_schedule':
        return this.handleDisableSchedule(message);

      case 'get_due_schedules':
        return this.handleGetDueSchedules(message);

      case 'get_status':
        return this.handleGetStatus(message);

      default:
        logger.warn('Unknown action for SchedulerAgent: %s', action);
        return { error: `Unknown action: ${action}` };
    }
  }

  /**
   * Handle create schedule request
   */
  private handleCreateSchedule(
    message: AgentMessage<{
      projectId: string;
      name: string;
      cronExpression: string;
      taskType: string;
      description?: string;
      command?: string;
      skillName?: string;
      skillCommand?: string;
      message?: string;
    }>
  ): Promise<{ success: boolean; schedule?: Schedule; error?: string }> {
    try {
      const { projectId, name, cronExpression, taskType, description, command, skillName, skillCommand, message } =
        message.payload.data ?? {};

      if (!projectId || !name || !cronExpression || !taskType) {
        return Promise.resolve({
          success: false,
          error: 'Missing required fields: projectId, name, cronExpression, taskType',
        });
      }

      const schedule: Schedule = {
        id: `sched-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        projectId,
        name,
        description,
        cronExpression,
        taskType: taskType as Schedule['taskType'],
        command,
        skillName,
        skillCommand,
        skillArgs: [],
        message,
        enabled: true,
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      createSchedule(schedule);

      logger.info('Created schedule: %s (%s)', schedule.id, schedule.name);

      return Promise.resolve({
        success: true,
        schedule,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create schedule: %s', errorMessage);

      return Promise.resolve({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle delete schedule request
   */
  private handleDeleteSchedule(
    message: AgentMessage<{ scheduleId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { scheduleId } = message.payload.data ?? {};

      if (!scheduleId) {
        return Promise.resolve({
          success: false,
          error: 'Schedule ID is required',
        });
      }

      deleteSchedule(scheduleId);

      // Clear any pending execution timer
      const timer = this.executionTimers.get(scheduleId);
      if (timer) {
        clearTimeout(timer);
        this.executionTimers.delete(scheduleId);
      }

      logger.info('Deleted schedule: %s', scheduleId);

      return Promise.resolve({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete schedule: %s', errorMessage);

      return Promise.resolve({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle execute schedule request
   */
  private async handleExecuteSchedule(
    message: AgentMessage<{ scheduleId: string }>
  ): Promise<{ success: boolean; output?: string; error?: string; duration?: number }> {
    const { scheduleId } = message.payload.data ?? {};

    if (!scheduleId) {
      return {
        success: false,
        error: 'Schedule ID is required',
      };
    }

    // Check concurrent execution limit
    if (this.activeExecutions >= this.config.maxConcurrent) {
      return {
        success: false,
        error: `Maximum concurrent executions (${this.config.maxConcurrent}) reached`,
      };
    }

    this.activeExecutions++;

    try {
      const result = await executeSchedule(scheduleId);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        duration: result.duration,
      };
    } finally {
      this.activeExecutions--;
    }
  }

  /**
   * Handle list schedules request
   */
  private handleListSchedules(
    message: AgentMessage<{ projectId?: string }>
  ): Promise<{ schedules: Schedule[] }> {
    const { projectId } = message.payload.data ?? {};

    let schedules: Schedule[];

    if (projectId) {
      schedules = getSchedulesForProject(projectId);
    } else {
      schedules = listAllSchedules();
    }

    return Promise.resolve({ schedules });
  }

  /**
   * Handle get schedule request
   */
  private handleGetSchedule(
    message: AgentMessage<{ scheduleId: string }>
  ): Promise<{ schedule?: Schedule; error?: string }> {
    const { scheduleId } = message.payload.data ?? {};

    if (!scheduleId) {
      return Promise.resolve({
        error: 'Schedule ID is required',
      });
    }

    const schedule = getSchedule(scheduleId);

    if (!schedule) {
      return Promise.resolve({
        error: `Schedule not found: ${scheduleId}`,
      });
    }

    return Promise.resolve({ schedule });
  }

  /**
   * Handle enable schedule request
   */
  private handleEnableSchedule(
    message: AgentMessage<{ scheduleId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { scheduleId } = message.payload.data ?? {};

      if (!scheduleId) {
        return Promise.resolve({
          success: false,
          error: 'Schedule ID is required',
        });
      }

      updateSchedule({
        id: scheduleId,
        enabled: true,
      });

      logger.info('Enabled schedule: %s', scheduleId);

      return Promise.resolve({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to enable schedule: %s', errorMessage);

      return Promise.resolve({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle disable schedule request
   */
  private handleDisableSchedule(
    message: AgentMessage<{ scheduleId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { scheduleId } = message.payload.data ?? {};

      if (!scheduleId) {
        return Promise.resolve({
          success: false,
          error: 'Schedule ID is required',
        });
      }

      updateSchedule({
        id: scheduleId,
        enabled: false,
      });

      logger.info('Disabled schedule: %s', scheduleId);

      return Promise.resolve({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to disable schedule: %s', errorMessage);

      return Promise.resolve({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle get due schedules request
   */
  private handleGetDueSchedules(): Promise<{ schedules: Schedule[] }> {
    const dueSchedules = getDueSchedules();
    return Promise.resolve({ schedules: dueSchedules });
  }

  /**
   * Handle get status request
   */
  private handleGetStatus(): Promise<{
    isRunning: boolean;
    activeExecutions: number;
    maxConcurrent: number;
    checkInterval: number;
    pendingTimers: number;
  }> {
    return Promise.resolve({
      isRunning: this.isRunning,
      activeExecutions: this.activeExecutions,
      maxConcurrent: this.config.maxConcurrent,
      checkInterval: this.config.checkInterval,
      pendingTimers: this.executionTimers.size,
    });
  }

  /**
   * Start monitoring schedules for execution
   */
  private startScheduleMonitoring(): void {
    if (this.checkTimer) {
      return;
    }

    this.isRunning = true;

    this.checkTimer = setInterval(async () => {
      try {
        const dueSchedules = getDueSchedules();

        for (const schedule of dueSchedules) {
          if (this.activeExecutions < this.config.maxConcurrent) {
            this.executeScheduleInternal(schedule.id);
          } else {
            logger.warn('Skipping schedule %s: max concurrent executions reached', schedule.id);
          }
        }
      } catch (error) {
        logger.error('Error in schedule monitoring: %s', error);
      }
    }, this.config.checkInterval);

    logger.info('SchedulerAgent started monitoring with interval %dms', this.config.checkInterval);
  }

  /**
   * Execute a schedule internally
   */
  private async executeScheduleInternal(scheduleId: string): Promise<void> {
    this.activeExecutions++;

    try {
      await executeSchedule(scheduleId);
    } catch (error) {
      logger.error('Failed to execute schedule %s: %s', scheduleId, error);
    } finally {
      this.activeExecutions--;
    }
  }

  /**
   * Stop monitoring schedules
   */
  private stopScheduleMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    this.isRunning = false;
    logger.info('SchedulerAgent stopped monitoring');
  }

  async shutdown(): Promise<void> {
    this.stopScheduleMonitoring();

    // Clear all execution timers
    for (const [scheduleId, timer] of this.executionTimers.entries()) {
      clearTimeout(timer);
      logger.debug('Cleared timer for schedule %s', scheduleId);
    }
    this.executionTimers.clear();

    logger.info('SchedulerAgent [%s] shutdown', this.id);
  }

  /**
   * Get active execution count
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions;
  }
}

/**
 * Create and export a singleton instance
 */
export const schedulerAgent = new SchedulerAgent();
