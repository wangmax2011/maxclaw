import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';

// Mock database for testing
import { _initTestDatabase, createProject, createSession, updateSession } from '../db.js';
import { formatSessionDuration, getSessionDetails, listSessions } from '../session-manager.js';
import type { Session } from '../types.js';

describe('EPIC-002: Smart Session Management', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  afterEach(() => {
    // Cleanup is automatic for in-memory database
  });

  describe('formatSessionDuration', () => {
    it('should format session duration in minutes', () => {
      const session: Session = {
        id: 'test-1',
        projectId: 'proj-1',
        startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        status: 'active',
      };

      const duration = formatSessionDuration(session);
      expect(duration).toMatch(/\d+m/);
    });

    it('should format session duration in hours and minutes', () => {
      const session: Session = {
        id: 'test-2',
        projectId: 'proj-1',
        startedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
        status: 'active',
      };

      const duration = formatSessionDuration(session);
      expect(duration).toMatch(/\d+h \d+m/);
    });

    it('should use endedAt if provided', () => {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const endedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago

      const session: Session = {
        id: 'test-3',
        projectId: 'proj-1',
        startedAt,
        endedAt,
        status: 'completed',
      };

      const duration = formatSessionDuration(session);
      expect(duration).toBe('30m');
    });
  });

  describe('listSessions', () => {
    beforeEach(() => {
      // Create test project
      createProject({
        id: 'proj-1',
        name: 'Test Project',
        path: '/tmp/test-project',
        techStack: [],
        discoveredAt: new Date().toISOString(),
      });
    });

    it('should return all sessions when no filters provided', () => {
      // Create test sessions
      createSession({
        id: 'session-1',
        projectId: 'proj-1',
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      createSession({
        id: 'session-2',
        projectId: 'proj-1',
        startedAt: new Date().toISOString(),
        status: 'completed',
      });

      const sessions = listSessions();
      expect(sessions.length).toBe(2);
    });

    it('should filter by status', () => {
      createSession({
        id: 'session-1',
        projectId: 'proj-1',
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      createSession({
        id: 'session-2',
        projectId: 'proj-1',
        startedAt: new Date().toISOString(),
        status: 'completed',
      });

      const activeSessions = listSessions({ status: 'active' });
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].status).toBe('active');

      const completedSessions = listSessions({ status: 'completed' });
      expect(completedSessions.length).toBe(1);
      expect(completedSessions[0].status).toBe('completed');
    });

    it('should filter by projectId', () => {
      // Create second project
      createProject({
        id: 'proj-2',
        name: 'Test Project 2',
        path: '/tmp/test-project-2',
        techStack: [],
        discoveredAt: new Date().toISOString(),
      });

      createSession({
        id: 'session-1',
        projectId: 'proj-1',
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      createSession({
        id: 'session-2',
        projectId: 'proj-2',
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      const proj1Sessions = listSessions({ projectId: 'proj-1' });
      expect(proj1Sessions.length).toBe(1);
      expect(proj1Sessions[0].projectId).toBe('proj-1');
    });

    it('should respect limit option', () => {
      // Create multiple sessions
      for (let i = 0; i < 10; i++) {
        createSession({
          id: `session-${i}`,
          projectId: 'proj-1',
          startedAt: new Date().toISOString(),
          status: 'active',
        });
      }

      const limited = listSessions({ limit: 5 });
      expect(limited.length).toBe(5);
    });
  });
});
