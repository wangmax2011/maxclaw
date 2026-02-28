import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  _initTestDatabase,
  createProject,
  getProject,
  getProjectByPath,
  updateProject,
  deleteProject,
  listProjects,
  createSession,
  getSession,
  updateSession,
  listActiveSessions,
  listSessionsForProject,
  createActivity,
  listActivitiesForProject,
  listRecentActivities,
} from '../db.js';
import { Project, Session, Activity } from '../types.js';

describe('Database Operations', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  describe('Project Operations', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/projects/test',
      description: 'A test project',
      techStack: ['TypeScript', 'Node.js'],
      discoveredAt: '2024-01-01T00:00:00Z',
      lastAccessed: '2024-01-02T00:00:00Z',
    };

    it('should create a project', () => {
      createProject(mockProject);
      const retrieved = getProject('proj-1');
      expect(retrieved).toEqual(mockProject);
    });

    it('should get project by path', () => {
      createProject(mockProject);
      const retrieved = getProjectByPath('/home/user/projects/test');
      expect(retrieved).toEqual(mockProject);
    });

    it('should return null for non-existent project', () => {
      const retrieved = getProject('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update project name', () => {
      createProject(mockProject);
      updateProject({ id: 'proj-1', name: 'Updated Name' });
      const retrieved = getProject('proj-1');
      expect(retrieved?.name).toBe('Updated Name');
    });

    it('should update project tech stack', () => {
      createProject(mockProject);
      updateProject({ id: 'proj-1', techStack: ['Python', 'Django'] });
      const retrieved = getProject('proj-1');
      expect(retrieved?.techStack).toEqual(['Python', 'Django']);
    });

    it('should list all projects ordered by last accessed', () => {
      const project2: Project = {
        id: 'proj-2',
        name: 'Second Project',
        path: '/home/user/projects/second',
        techStack: ['Rust'],
        discoveredAt: '2024-01-01T00:00:00Z',
        lastAccessed: '2024-01-03T00:00:00Z', // More recent
      };

      createProject(mockProject);
      createProject(project2);

      const projects = listProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0].id).toBe('proj-2'); // Most recent first
      expect(projects[1].id).toBe('proj-1');
    });

    it('should delete project and related data', () => {
      createProject(mockProject);
      deleteProject('proj-1');
      expect(getProject('proj-1')).toBeNull();
    });
  });

  describe('Session Operations', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/projects/test',
      techStack: ['TypeScript'],
      discoveredAt: '2024-01-01T00:00:00Z',
    };

    const mockSession: Session = {
      id: 'sess-1',
      projectId: 'proj-1',
      startedAt: '2024-01-01T10:00:00Z',
      status: 'active',
      pid: 12345,
    };

    beforeEach(() => {
      createProject(mockProject);
    });

    it('should create a session', () => {
      createSession(mockSession);
      const retrieved = getSession('sess-1');
      expect(retrieved).toEqual(mockSession);
    });

    it('should update session status', () => {
      createSession(mockSession);
      updateSession({
        id: 'sess-1',
        status: 'completed',
        endedAt: '2024-01-01T11:00:00Z',
      });
      const retrieved = getSession('sess-1');
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.endedAt).toBe('2024-01-01T11:00:00Z');
    });

    it('should list active sessions', () => {
      createSession(mockSession);
      createSession({
        id: 'sess-2',
        projectId: 'proj-1',
        startedAt: '2024-01-01T09:00:00Z',
        status: 'completed',
      });

      const active = listActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('sess-1');
    });

    it('should list sessions for project', () => {
      const project2: Project = {
        id: 'proj-2',
        name: 'Second Project',
        path: '/home/user/projects/second',
        techStack: ['Rust'],
        discoveredAt: '2024-01-01T00:00:00Z',
      };
      createProject(project2);

      createSession(mockSession);
      createSession({
        id: 'sess-2',
        projectId: 'proj-2',
        startedAt: '2024-01-01T09:00:00Z',
        status: 'active',
      });

      const sessions = listSessionsForProject('proj-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('sess-1');
    });
  });

  describe('Activity Operations', () => {
    const mockProject: Project = {
      id: 'proj-1',
      name: 'Test Project',
      path: '/home/user/projects/test',
      techStack: ['TypeScript'],
      discoveredAt: '2024-01-01T00:00:00Z',
    };

    const mockActivity: Activity = {
      id: 'act-1',
      projectId: 'proj-1',
      type: 'discover',
      timestamp: '2024-01-01T10:00:00Z',
      details: { indicators: ['git', 'package.json'] },
    };

    beforeEach(() => {
      createProject(mockProject);
    });

    it('should create an activity', () => {
      createActivity(mockActivity);
      const activities = listActivitiesForProject('proj-1');
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('discover');
    });

    it('should list activities with limit', () => {
      for (let i = 0; i < 10; i++) {
        createActivity({
          id: `act-${i}`,
          projectId: 'proj-1',
          type: 'start',
          timestamp: `2024-01-0${i + 1}T10:00:00Z`,
        });
      }

      const activities = listActivitiesForProject('proj-1', 5);
      expect(activities).toHaveLength(5);
    });

    it('should list recent activities across all projects', () => {
      const project2: Project = {
        id: 'proj-2',
        name: 'Second Project',
        path: '/home/user/projects/second',
        techStack: ['Rust'],
        discoveredAt: '2024-01-01T00:00:00Z',
      };
      createProject(project2);

      createActivity(mockActivity);
      createActivity({
        id: 'act-2',
        projectId: 'proj-2',
        type: 'start',
        timestamp: '2024-01-02T10:00:00Z',
      });

      const activities = listRecentActivities(10);
      expect(activities).toHaveLength(2);
    });
  });
});
