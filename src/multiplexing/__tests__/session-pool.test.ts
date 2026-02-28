// Tests for Session Pool

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { SessionPool } from '../session-pool.js';
import type { Session } from '../../types.js';

describe('SessionPool', () => {
  let pool: SessionPool;

  beforeEach(() => {
    pool = new SessionPool({
      maxConcurrentSessions: 5,
      maxSessionsPerProject: 2,
    });
  });

  afterEach(() => {
    pool.clear();
  });

  it('should create pool with default config', () => {
    const defaultPool = new SessionPool();
    const config = defaultPool.getConfig();
    expect(config.maxConcurrentSessions).toBe(5);
    expect(config.maxSessionsPerProject).toBe(2);
    expect(config.queueEnabled).toBe(true);
  });

  it('should create pool with custom config', () => {
    const customPool = new SessionPool({
      maxConcurrentSessions: 10,
      maxSessionsPerProject: 3,
    });
    const config = customPool.getConfig();
    expect(config.maxConcurrentSessions).toBe(10);
    expect(config.maxSessionsPerProject).toBe(3);
  });

  it('should allow allocation when under limits', () => {
    const result = pool.canAllocateSession('project-1');
    expect(result.allocated).toBe(true);
  });

  it('should reject allocation when system limit reached', () => {
    for (let i = 0; i < 5; i++) {
      pool.allocateSession({
        id: `session-${i}`,
        projectId: `project-${i}`,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    }
    const result = pool.canAllocateSession('project-new');
    expect(result.allocated).toBe(false);
    expect(result.reason).toContain('Maximum concurrent sessions');
  });

  it('should reject allocation when project limit reached', () => {
    pool.allocateSession({ id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    pool.allocateSession({ id: 'session-2', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    const result = pool.canAllocateSession('project-1');
    expect(result.allocated).toBe(false);
    expect(result.reason).toContain('Maximum sessions per project');
  });

  it('should allocate session successfully', () => {
    const session: Session = { id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' };
    const result = pool.allocateSession(session);
    expect(result).toBe(true);
  });

  it('should emit session:allocated event', () => {
    let emittedSession: Session | undefined;
    pool.on('session:allocated', (session) => { emittedSession = session; });
    const session: Session = { id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' };
    pool.allocateSession(session);
    expect(emittedSession?.id).toBe('session-1');
  });

  it('should release session successfully', () => {
    const session: Session = { id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' };
    pool.allocateSession(session);
    pool.releaseSession('session-1');
    const status = pool.getStatus();
    expect(status.activeSessions).toBe(0);
  });

  it('should return correct pool status', () => {
    pool.allocateSession({ id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    const status = pool.getStatus();
    expect(status.activeSessions).toBe(1);
    expect(status.maxConcurrentSessions).toBe(5);
    expect(status.availableSlots).toBe(4);
    expect(status.utilizationPercent).toBe(20);
  });

  it('should track sessions by project', () => {
    pool.allocateSession({ id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    pool.allocateSession({ id: 'session-2', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    pool.allocateSession({ id: 'session-3', projectId: 'project-2', startedAt: new Date().toISOString(), status: 'active' });
    const status = pool.getStatus();
    expect(status.sessionsByProject.get('project-1')).toBe(2);
    expect(status.sessionsByProject.get('project-2')).toBe(1);
  });

  it('should return sessions for a project', () => {
    pool.allocateSession({ id: 'session-1', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    pool.allocateSession({ id: 'session-2', projectId: 'project-1', startedAt: new Date().toISOString(), status: 'active' });
    pool.allocateSession({ id: 'session-3', projectId: 'project-2', startedAt: new Date().toISOString(), status: 'active' });
    const project1Sessions = pool.getProjectSessions('project-1');
    expect(project1Sessions.length).toBe(2);
  });

  it('should return empty array for unknown project', () => {
    const sessions = pool.getProjectSessions('unknown-project');
    expect(sessions.length).toBe(0);
  });

  it('should update configuration', () => {
    pool.updateConfig({ maxConcurrentSessions: 10, maxSessionsPerProject: 5 });
    const config = pool.getConfig();
    expect(config.maxConcurrentSessions).toBe(10);
    expect(config.maxSessionsPerProject).toBe(5);
  });
});
