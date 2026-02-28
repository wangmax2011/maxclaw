import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _initTestDatabase,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedules,
  listSchedulesForProject,
  listEnabledSchedules,
  createScheduleLog,
  listScheduleLogs,
  getLatestScheduleLog,
  createProject,
} from '../db.js';
import {
  calculateNextRun,
  validateCronExpression,
  isScheduleDue,
  initializeScheduleNextRun,
  registerTaskExecutor,
} from '../scheduler.js';
import {
  createNewSchedule,
  enableSchedule,
  disableSchedule,
  removeSchedule,
  getScheduleById,
  listAllSchedules,
  listProjectSchedules,
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
} from '../scheduler-manager.js';
import type { Schedule, Project } from '../types.js';

describe('Scheduler System', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  afterEach(() => {
    stopScheduler();
  });

  describe('Cron Expression Utilities', () => {
    it('should validate correct cron expressions', () => {
      expect(validateCronExpression('0 9 * * *')).toBe(true);
      expect(validateCronExpression('*/5 * * * *')).toBe(true);
      expect(validateCronExpression('0 0 * * 0')).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(validateCronExpression('invalid')).toBe(false);
      expect(validateCronExpression('')).toBe(false);
      expect(validateCronExpression('* * *')).toBe(false);
    });

    it('should calculate next run time', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const nextRun = calculateNextRun('0 9 * * *', now);

      expect(nextRun).not.toBeNull();
      expect(nextRun!.getHours()).toBe(9);
      expect(nextRun!.getDate()).toBe(1);
    });

    it('should return null for invalid cron expression', () => {
      const nextRun = calculateNextRun('invalid');
      expect(nextRun).toBeNull();
    });
  });

  describe('Schedule Due Check', () => {
    it('should detect due schedule', () => {
      const schedule: Schedule = {
        id: 'test-1',
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: true,
        nextRun: new Date(Date.now() - 1000).toISOString(), // 1 second ago
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(isScheduleDue(schedule)).toBe(true);
    });

    it('should not detect future schedule as due', () => {
      const schedule: Schedule = {
        id: 'test-1',
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: true,
        nextRun: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(isScheduleDue(schedule)).toBe(false);
    });

    it('should not detect disabled schedule as due', () => {
      const schedule: Schedule = {
        id: 'test-1',
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: false,
        nextRun: new Date(Date.now() - 1000).toISOString(),
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(isScheduleDue(schedule)).toBe(false);
    });

    it('should treat schedule without nextRun as due', () => {
      const schedule: Schedule = {
        id: 'test-1',
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: true,
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(isScheduleDue(schedule)).toBe(true);
    });
  });

  describe('Database Operations', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/projects/test',
      techStack: ['TypeScript'],
      discoveredAt: '2024-01-01T00:00:00Z',
    };

    const mockSchedule: Schedule = {
      id: 'sched-1',
      projectId: 'proj-1',
      name: 'Daily Reminder',
      description: 'A daily reminder',
      cronExpression: '0 9 * * *',
      taskType: 'reminder',
      message: 'Daily standup',
      enabled: true,
      runCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      createProject(mockProject);
    });

    it('should create a schedule', () => {
      createSchedule(mockSchedule);
      const retrieved = getSchedule('sched-1');
      expect(retrieved).toEqual(mockSchedule);
    });

    it('should update a schedule', () => {
      createSchedule(mockSchedule);
      updateSchedule({
        id: 'sched-1',
        name: 'Updated Name',
        enabled: false,
      });

      const retrieved = getSchedule('sched-1');
      expect(retrieved?.name).toBe('Updated Name');
      expect(retrieved?.enabled).toBe(false);
    });

    it('should delete a schedule and its logs', () => {
      createSchedule(mockSchedule);
      createScheduleLog({
        id: 'log-1',
        scheduleId: 'sched-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
      });

      deleteSchedule('sched-1');
      expect(getSchedule('sched-1')).toBeNull();
      expect(listScheduleLogs('sched-1')).toHaveLength(0);
    });

    it('should list schedules for a project', () => {
      createSchedule(mockSchedule);

      const project2: Project = {
        id: 'proj-2',
        name: 'Second Project',
        path: '/home/user/projects/second',
        techStack: ['Rust'],
        discoveredAt: '2024-01-01T00:00:00Z',
      };
      createProject(project2);

      const schedule2: Schedule = {
        id: 'sched-2',
        projectId: 'proj-2',
        name: 'Backup',
        cronExpression: '0 0 * * 0',
        taskType: 'backup',
        enabled: true,
        runCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      createSchedule(schedule2);

      const proj1Schedules = listSchedulesForProject('proj-1');
      expect(proj1Schedules).toHaveLength(1);
      expect(proj1Schedules[0].id).toBe('sched-1');
    });

    it('should list enabled schedules', () => {
      createSchedule(mockSchedule);

      const disabledSchedule: Schedule = {
        id: 'sched-2',
        projectId: 'proj-1',
        name: 'Disabled Schedule',
        cronExpression: '0 0 * * *',
        taskType: 'reminder',
        enabled: false,
        runCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      createSchedule(disabledSchedule);

      const enabled = listEnabledSchedules();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('sched-1');
    });

    it('should create and retrieve schedule logs', () => {
      createSchedule(mockSchedule);

      createScheduleLog({
        id: 'log-1',
        scheduleId: 'sched-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:01Z',
        output: 'Success',
        duration: 1000,
      });

      const logs = listScheduleLogs('sched-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('completed');
      expect(logs[0].output).toBe('Success');
    });

    it('should get latest schedule log', () => {
      createSchedule(mockSchedule);

      createScheduleLog({
        id: 'log-1',
        scheduleId: 'sched-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
      });

      createScheduleLog({
        id: 'log-2',
        scheduleId: 'sched-1',
        status: 'failed',
        startedAt: '2024-01-02T00:00:00Z',
      });

      const latest = getLatestScheduleLog('sched-1');
      expect(latest?.status).toBe('failed');
    });
  });

  describe('Scheduler Manager', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/projects/test',
      techStack: ['TypeScript'],
      discoveredAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      createProject(mockProject);
    });

    it('should create a new schedule with calculated next run', () => {
      const schedule = createNewSchedule({
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        message: 'Test message',
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.name).toBe('Test Schedule');
      expect(schedule.nextRun).toBeDefined();
      expect(schedule.enabled).toBe(true);

      const retrieved = getScheduleById(schedule.id);
      expect(retrieved).not.toBeNull();
    });

    it('should enable a disabled schedule', () => {
      const schedule = createNewSchedule({
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: false,
      });

      // Disable first
      disableSchedule(schedule.id);
      let retrieved = getScheduleById(schedule.id);
      expect(retrieved?.enabled).toBe(false);
      expect(retrieved?.nextRun).toBeUndefined();

      // Then enable
      enableSchedule(schedule.id);
      retrieved = getScheduleById(schedule.id);
      expect(retrieved?.enabled).toBe(true);
      expect(retrieved?.nextRun).toBeDefined();
    });

    it('should disable an enabled schedule', () => {
      const schedule = createNewSchedule({
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
      });

      disableSchedule(schedule.id);
      const retrieved = getScheduleById(schedule.id);
      expect(retrieved?.enabled).toBe(false);
    });

    it('should remove a schedule', () => {
      const schedule = createNewSchedule({
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
      });

      const success = removeSchedule(schedule.id);
      expect(success).toBe(true);
      expect(getScheduleById(schedule.id)).toBeNull();
    });

    it('should list all schedules', () => {
      createNewSchedule({
        projectId: 'proj-1',
        name: 'Schedule 1',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
      });

      createNewSchedule({
        projectId: 'proj-1',
        name: 'Schedule 2',
        cronExpression: '0 10 * * *',
        taskType: 'backup',
      });

      const schedules = listAllSchedules();
      expect(schedules).toHaveLength(2);
    });

    it('should list schedules for a project', () => {
      const project2: Project = {
        id: 'proj-2',
        name: 'Second Project',
        path: '/home/user/projects/second',
        techStack: ['Rust'],
        discoveredAt: '2024-01-01T00:00:00Z',
      };
      createProject(project2);

      createNewSchedule({
        projectId: 'proj-1',
        name: 'Schedule 1',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
      });

      createNewSchedule({
        projectId: 'proj-2',
        name: 'Schedule 2',
        cronExpression: '0 10 * * *',
        taskType: 'backup',
      });

      const proj1Schedules = listProjectSchedules('proj-1');
      expect(proj1Schedules).toHaveLength(1);
      expect(proj1Schedules[0].name).toBe('Schedule 1');
    });

    it('should start and stop scheduler', () => {
      startScheduler({ checkInterval: 1000 });
      const status = getSchedulerStatus();

      expect(status.isRunning).toBe(true);
      expect(status.checkInterval).toBe(1000);

      stopScheduler();
      const stoppedStatus = getSchedulerStatus();
      expect(stoppedStatus.isRunning).toBe(false);
    });
  });

  describe('Initialize Schedule Next Run', () => {
    it('should calculate next run for new schedule', () => {
      const schedule: Schedule = {
        id: 'test-1',
        projectId: 'proj-1',
        name: 'Test Schedule',
        cronExpression: '0 9 * * *',
        taskType: 'reminder',
        enabled: true,
        runCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const initialized = initializeScheduleNextRun(schedule);
      expect(initialized.nextRun).toBeDefined();
    });
  });

  describe('Task Executors', () => {
    it('should register custom task executor', () => {
      const customExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: 'Custom executed',
        duration: 100,
      });

      registerTaskExecutor('reminder', customExecutor);
      // The executor is registered, we can't easily test it's being used
      // without executing, but we can verify no errors
    });
  });
});
