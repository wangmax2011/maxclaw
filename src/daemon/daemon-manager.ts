import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { logger } from '../logger.js';
import {
  DaemonConfig,
  DaemonStatus,
  DaemonSession,
  SessionContext,
} from '../types.js';
import { IPCServer } from './ipc-server.js';
import { checkExistingDaemon, writePidFile, removePidFile, getDaemonPid } from './pid-manager.js';
import { getSocketPath, cleanupSocket, ensureSocketDir } from './socket-manager.js';
import {
  getSession,
  createSession,
  updateSession,
  listActiveSessions,
  getProject,
} from '../db.js';

const DEFAULT_CONFIG: DaemonConfig = {
  pidFile: '/daemon.pid',
  socketPath: getSocketPath(),
  logFile: '/daemon.log',
  heartbeatInterval: 30000, // 30 seconds
  sessionTimeout: 300000, // 5 minutes
};

/**
 * Daemon Manager - Main daemon process controller
 */
export class DaemonManager extends EventEmitter {
  private config: DaemonConfig;
  private ipcServer: IPCServer;
  private sessions: Map<string, DaemonSession>;
  private sessionProcesses: Map<string, ChildProcess>;
  private heartbeatTimer?: NodeJS.Timeout;
  private running: boolean;
  private startedAt?: string;
  private totalSessionsHandled: number;

  constructor(config?: Partial<DaemonConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ipcServer = new IPCServer(this.config.socketPath);
    this.sessions = new Map();
    this.sessionProcesses = new Map();
    this.running = false;
    this.totalSessionsHandled = 0;

    this.registerIPCHandlers();
  }

  private registerIPCHandlers(): void {
    // session.start
    this.ipcServer.registerHandler('session.start', async (params) => {
      const { projectId, options } = params as {
        projectId: string;
        options?: { allowedTools?: string[]; initialPrompt?: string };
      };
      return this.startSession(projectId, options);
    });

    // session.stop
    this.ipcServer.registerHandler('session.stop', async (params) => {
      const { sessionId } = params as { sessionId: string };
      return this.stopSession(sessionId);
    });

    // session.status
    this.ipcServer.registerHandler('session.status', async (params) => {
      const { sessionId } = params as { sessionId: string };
      return this.getSessionStatus(sessionId);
    });

    // session.list
    this.ipcServer.registerHandler('session.list', async () => {
      return this.listSessions();
    });

    // session.resume
    this.ipcServer.registerHandler('session.resume', async (params) => {
      const { projectId } = params as { projectId?: string };
      return this.resumeSession(projectId);
    });

    // daemon.status
    this.ipcServer.registerHandler('daemon.status', async () => {
      return this.getStatus();
    });

    // daemon.stop
    this.ipcServer.registerHandler('daemon.stop', async () => {
      await this.stop();
      return { success: true };
    });
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    // Check if already running
    const existing = checkExistingDaemon();
    if (existing.running) {
      throw new Error(`Daemon is already running (PID: ${existing.pid})`);
    }

    // Clean up any stale socket
    ensureSocketDir();
    if (checkSocketExists()) {
      cleanupSocket();
    }

    // Write PID file
    writePidFile(process.pid);

    // Start IPC server
    await this.ipcServer.start();

    // Recover any active sessions from database
    await this.recoverSessions();

    // Start heartbeat
    this.startHeartbeat();

    this.running = true;
    this.startedAt = new Date().toISOString();

    logger.info('Daemon started (PID: %d)', process.pid);

    // Handle process signals
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('exit', () => this.cleanup());
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    logger.info('Daemon stopping...');
    this.running = false;

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Stop IPC server
    await this.ipcServer.stop();

    // Stop all sessions gracefully
    for (const [sessionId, session] of this.sessions.entries()) {
      try {
        await this.stopSession(sessionId);
      } catch (error) {
        logger.error('Error stopping session %s: %s', sessionId, error);
      }
    }

    // Remove PID file
    removePidFile();

    logger.info('Daemon stopped');
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    logger.info('Graceful shutdown initiated');
    await this.stop();
    process.exit(0);
  }

  /**
   * Cleanup on exit
   */
  private cleanup(): void {
    removePidFile();
    cleanupSocket();
  }

  /**
   * Recover sessions from database
   */
  private async recoverSessions(): Promise<void> {
    try {
      const activeSessions = listActiveSessions();

      for (const session of activeSessions) {
        // Mark sessions for recovery (they need to be re-spawned)
        logger.info('Recovering session: %s', session.id);

        updateSession({
          id: session.id,
          status: 'active',
        });

        this.sessions.set(session.id, {
          ...session,
          daemonInstanceId: randomUUID(),
        } as DaemonSession);

        this.totalSessionsHandled++;
      }

      logger.info('Recovered %d sessions', activeSessions.length);
    } catch (error) {
      logger.error('Error recovering sessions: %s', error);
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Heartbeat - update session health
   */
  private heartbeat(): void {
    const now = new Date().toISOString();

    for (const [sessionId, session] of this.sessions.entries()) {
      const proc = this.sessionProcesses.get(sessionId);

      if (proc && !proc.killed) {
        // Update heartbeat in database
        try {
          updateSession({
            id: sessionId,
            // Add heartbeat tracking if we extend the schema
          });
        } catch (error) {
          logger.error('Heartbeat update failed for %s: %s', sessionId, error);
        }
      }
    }
  }

  /**
   * Start a new session
   */
  private async startSession(
    projectId: string,
    options?: { allowedTools?: string[]; initialPrompt?: string }
  ): Promise<{ sessionId: string; status: string }> {
    const project = getProject(projectId);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Check if there's already an active session for this project
    const activeSessions = listActiveSessions();
    const existingSession = activeSessions.find((s) => s.projectId === projectId);

    if (existingSession) {
      throw new Error(
        `Active session already exists for ${project.name}. Use 'maxclaw session stop ${existingSession.id}' to end it first.`
      );
    }

    // Spawn Claude Code process
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();

    const claudeBinary = process.env.CLAUDE_BINARY || 'claude';
    const args: string[] = [];

    if (options?.allowedTools && options.allowedTools.length > 0) {
      for (const tool of options.allowedTools) {
        args.push('--allowedTools', tool);
      }
    }

    if (options?.initialPrompt) {
      args.push('--prompt', options.initialPrompt);
    }

    logger.info('Spawning Claude Code session %s for project %s', sessionId, project.name);

    const child = spawn(claudeBinary, args, {
      cwd: project.path,
      stdio: 'pipe', // Don't inherit - daemon manages this
      detached: false,
      env: {
        ...process.env,
        MAXCLAW_SESSION_ID: sessionId,
        MAXCLAW_PROJECT_ID: projectId,
      },
    });

    // Store session
    const session: DaemonSession = {
      id: sessionId,
      projectId,
      startedAt,
      status: 'active',
      pid: child.pid,
      daemonInstanceId: randomUUID(),
      context: {
        initialPrompt: options?.initialPrompt,
        allowedTools: options?.allowedTools,
        workingDirectory: project.path,
      },
    };

    this.sessions.set(sessionId, session);
    this.sessionProcesses.set(sessionId, child);

    // Create in database
    createSession({
      id: sessionId,
      projectId,
      startedAt,
      status: 'active',
      pid: child.pid,
    });

    this.totalSessionsHandled++;

    // Handle process exit
    child.on('exit', (code) => {
      const endedAt = new Date().toISOString();
      const status = code === 0 ? 'completed' : 'interrupted';

      updateSession({
        id: sessionId,
        endedAt,
        status,
      });

      this.sessions.delete(sessionId);
      this.sessionProcesses.delete(sessionId);

      logger.info('Session %s ended (exit code: %d)', sessionId, code ?? -1);
    });

    return { sessionId, status: 'started' };
  }

  /**
   * Stop a session
   */
  private async stopSession(sessionId: string): Promise<{ success: boolean }> {
    const session = getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId}`);
    }

    const proc = this.sessionProcesses.get(sessionId);

    if (proc) {
      // Send SIGTERM first
      proc.kill('SIGTERM');

      // Wait briefly for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }

    // Update database
    const endedAt = new Date().toISOString();
    updateSession({
      id: sessionId,
      status: 'interrupted',
      endedAt,
    });

    this.sessions.delete(sessionId);
    this.sessionProcesses.delete(sessionId);

    logger.info('Session %s stopped', sessionId);

    return { success: true };
  }

  /**
   * Get session status
   */
  private getSessionStatus(sessionId: string): { status: string; pid?: number } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      status: session.status,
      pid: session.pid,
    };
  }

  /**
   * List all active sessions
   */
  private listSessions(): unknown[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      projectId: session.projectId,
      startedAt: session.startedAt,
      status: session.status,
      pid: session.pid,
    }));
  }

  /**
   * Resume a session
   */
  private async resumeSession(projectId?: string): Promise<{ sessionId: string; status: string }> {
    if (!projectId) {
      // Resume last session
      const activeSessions = listActiveSessions();

      if (activeSessions.length === 0) {
        throw new Error('No active sessions to resume');
      }

      // Get the most recent session
      const lastSession = activeSessions[activeSessions.length - 1];
      projectId = lastSession.projectId;
    }

    // Start a new session for the project
    return this.startSession(projectId);
  }

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus {
    return {
      running: this.running,
      pid: process.pid,
      startedAt: this.startedAt || '',
      uptime: this.startedAt
        ? Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000)
        : 0,
      activeSessions: this.sessions.size,
      totalSessionsHandled: this.totalSessionsHandled,
    };
  }
}

// Need to import for cleanupSocket
import { checkSocketExists } from './socket-manager.js';
