// EPIC-006: Session Pool Manager
// Manages concurrent session limits and allocation

import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import { listActiveSessions, getProject } from '../db.js';
import type { Session } from '../types.js';
import {
  MultiplexingConfig,
  SessionPoolStatus,
  AllocationResult,
  DEFAULT_MULTIPLEXING_CONFIG,
} from './types.js';

/**
 * Session Pool Manager
 * Manages concurrent session limits and slot allocation
 */
export class SessionPool extends EventEmitter {
  private config: MultiplexingConfig;
  private activeSessions: Map<string, Session>;
  private sessionsByProject: Map<string, Set<string>>;

  constructor(config: Partial<MultiplexingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MULTIPLEXING_CONFIG, ...config };
    this.activeSessions = new Map();
    this.sessionsByProject = new Map();
  }

  /**
   * Initialize pool from database
   */
  async initialize(): Promise<void> {
    const activeSessions = listActiveSessions();

    for (const session of activeSessions) {
      this.activeSessions.set(session.id, session);

      if (!this.sessionsByProject.has(session.projectId)) {
        this.sessionsByProject.set(session.projectId, new Set());
      }
      this.sessionsByProject.get(session.projectId)!.add(session.id);
    }

    logger.info('Session pool initialized with %d active sessions', activeSessions.length);
  }

  /**
   * Check if a new session can be allocated
   */
  canAllocateSession(projectId: string): AllocationResult {
    // Check system-wide limit
    const currentActive = this.activeSessions.size;
    if (currentActive >= this.config.maxConcurrentSessions) {
      return {
        allocated: false,
        reason: `Maximum concurrent sessions reached (${this.config.maxConcurrentSessions})`,
        queuePosition: this.config.queueEnabled ? 1 : undefined,
      };
    }

    // Check per-project limit
    const projectSessions = this.sessionsByProject.get(projectId);
    const projectSessionCount = projectSessions?.size ?? 0;

    if (projectSessionCount >= this.config.maxSessionsPerProject) {
      return {
        allocated: false,
        reason: `Maximum sessions per project reached (${this.config.maxSessionsPerProject})`,
        queuePosition: this.config.queueEnabled ? 1 : undefined,
      };
    }

    // Calculate available slots
    const availableSystemSlots = this.config.maxConcurrentSessions - currentActive;
    const availableProjectSlots = this.config.maxSessionsPerProject - projectSessionCount;
    const availableSlots = Math.min(availableSystemSlots, availableProjectSlots);

    return {
      allocated: true,
    };
  }

  /**
   * Allocate a session slot
   */
  allocateSession(session: Session): boolean {
    const allocationCheck = this.canAllocateSession(session.projectId);

    if (!allocationCheck.allocated) {
      return false;
    }

    this.activeSessions.set(session.id, session);

    if (!this.sessionsByProject.has(session.projectId)) {
      this.sessionsByProject.set(session.projectId, new Set());
    }
    this.sessionsByProject.get(session.projectId)!.add(session.id);

    this.emit('session:allocated', session);
    logger.debug('Session slot allocated: %s', session.id);

    return true;
  }

  /**
   * Release a session slot
   */
  releaseSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      logger.warn('Attempted to release unknown session: %s', sessionId);
      return;
    }

    this.activeSessions.delete(sessionId);

    const projectSessions = this.sessionsByProject.get(session.projectId);
    if (projectSessions) {
      projectSessions.delete(sessionId);
      if (projectSessions.size === 0) {
        this.sessionsByProject.delete(session.projectId);
      }
    }

    this.emit('session:released', sessionId);
    logger.debug('Session slot released: %s', sessionId);
  }

  /**
   * Get pool status
   */
  getStatus(): SessionPoolStatus {
    const currentActive = this.activeSessions.size;
    const sessionsByProject = new Map<string, number>();

    for (const [projectId, sessions] of this.sessionsByProject.entries()) {
      sessionsByProject.set(projectId, sessions.size);
    }

    return {
      activeSessions: currentActive,
      maxConcurrentSessions: this.config.maxConcurrentSessions,
      availableSlots: this.config.maxConcurrentSessions - currentActive,
      utilizationPercent: Math.round((currentActive / this.config.maxConcurrentSessions) * 100),
      sessionsByProject,
    };
  }

  /**
   * Get sessions for a project
   */
  getProjectSessions(projectId: string): Session[] {
    const sessionIds = this.sessionsByProject.get(projectId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map(id => this.activeSessions.get(id))
      .filter((s): s is Session => s !== undefined);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MultiplexingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Session pool config updated: %O', config);
  }

  /**
   * Get current configuration
   */
  getConfig(): MultiplexingConfig {
    return { ...this.config };
  }

  /**
   * Clear all sessions (for shutdown)
   */
  clear(): void {
    this.activeSessions.clear();
    this.sessionsByProject.clear();
    logger.info('Session pool cleared');
  }
}
