import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatSessionDuration,
  getSessionHistory,
} from '../session-manager.js';
import {
  _initTestDatabase,
  createProject,
  createSession,
} from '../db.js';
import { Project, Session } from '../types.js';

describe('Session Manager', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  describe('formatSessionDuration', () => {
    it('should format duration in minutes', () => {
      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-01-01T10:00:00Z',
        endedAt: '2024-01-01T10:30:00Z',
        status: 'completed',
      };

      expect(formatSessionDuration(session)).toBe('30m');
    });

    it('should format duration in hours and minutes', () => {
      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-01-01T10:00:00Z',
        endedAt: '2024-01-01T12:45:00Z',
        status: 'completed',
      };

      expect(formatSessionDuration(session)).toBe('2h 45m');
    });

    it('should calculate duration from start to now for active sessions', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const session: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: oneHourAgo.toISOString(),
        status: 'active',
      };

      const duration = formatSessionDuration(session);
      expect(duration).toMatch(/1h \d+m/);
    });
  });

  describe('getSessionHistory', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/test',
      techStack: ['TypeScript'],
      discoveredAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      createProject(mockProject);
    });

    it('should return sessions ordered by start time', () => {
      createSession({
        id: 'sess-1',
        projectId: 'proj-1',
        startedAt: '2024-01-01T09:00:00Z',
        status: 'completed',
      });
      createSession({
        id: 'sess-2',
        projectId: 'proj-1',
        startedAt: '2024-01-01T10:00:00Z',
        status: 'completed',
      });

      const history = getSessionHistory('proj-1');
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('sess-2'); // Most recent first
      expect(history[1].id).toBe('sess-1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        createSession({
          id: `sess-${i}`,
          projectId: 'proj-1',
          startedAt: `2024-01-0${i + 1}T10:00:00Z`,
          status: 'completed',
        });
      }

      const history = getSessionHistory('proj-1', 5);
      expect(history).toHaveLength(5);
    });
  });
});
