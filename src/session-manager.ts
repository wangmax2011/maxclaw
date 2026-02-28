import child_process from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';

import { getProjectMemoryPath, loadConfig } from './config.js';
import {
  createActivity,
  createSession,
  getProject,
  getSession,
  listActiveSessions,
  listSessionsForProject,
  updateProject,
  updateSession,
} from './db.js';
import { logger } from './logger.js';
import { Activity, RunningSession, Session } from './types.js';
import { generateSummary, isSummarizationEnabled } from './ai-summarizer.js';
import { getSessionLogForProject } from './session-logger.js';

const exec = util.promisify(child_process.exec);

function generateId(): string {
  return crypto.randomUUID();
}

function findClaudeCodeBinary(): string {
  // Check common locations
  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    'claude', // Assume in PATH
  ];

  for (const candidate of candidates) {
    try {
      if (candidate === 'claude') {
        // Just check if it's in PATH
        child_process.execSync('which claude', { stdio: 'ignore' });
        return candidate;
      }
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Default to 'claude' and hope it's in PATH
  return 'claude';
}

function ensureClaudeMd(projectId: string, projectPath: string): void {
  const memoryPath = getProjectMemoryPath(projectId);

  if (!fs.existsSync(memoryPath)) {
    const defaultContent = `# Project Memory: ${path.basename(projectPath)}

This file contains project-specific context for Claude Code sessions.

## Project Overview
- Path: ${projectPath}
- Added: ${new Date().toISOString()}

## Development Notes
(Add your notes here)

## Common Commands
(Add frequently used commands here)

## Architecture Decisions
(Record key decisions here)
`;
    fs.writeFileSync(memoryPath, defaultContent, 'utf-8');
    logger.debug('Created CLAUDE.md at %s', memoryPath);
  }
}

export async function startClaudeSession(
  projectId: string,
  options?: {
    allowedTools?: string[];
    initialPrompt?: string;
  }
): Promise<Session> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Check if there's already an active session for this project
  const activeSessions = listActiveSessions();
  const existingSession = activeSessions.find((s) => s.projectId === projectId);

  if (existingSession) {
    logger.warn('Active session already exists for %s (PID: %d)', project.name, existingSession.pid ?? 0);
    throw new Error(
      `Active session already exists. Use 'maxclaw status' to see running sessions.`
    );
  }

  // Update last accessed
  updateProject({
    id: projectId,
    lastAccessed: new Date().toISOString(),
  });

  // Ensure CLAUDE.md exists
  ensureClaudeMd(projectId, project.path);

  const sessionId = generateId();
  const startedAt = new Date().toISOString();

  const claudeBinary = findClaudeCodeBinary();

  // Build Claude Code arguments
  const args: string[] = [];

  // Add allowed tools if specified
  if (options?.allowedTools && options.allowedTools.length > 0) {
    for (const tool of options.allowedTools) {
      args.push('--allowedTools', tool);
    }
  }

  // Add initial prompt if provided
  if (options?.initialPrompt) {
    args.push('--prompt', options.initialPrompt);
  }

  // Spawn Claude Code process
  logger.info('Starting Claude Code in %s', project.path);

  try {
    const child = child_process.spawn(claudeBinary, args, {
      cwd: project.path,
      stdio: 'inherit', // Inherit stdin/stdout/stderr for interactive use
      detached: false,
      env: {
        ...process.env,
        MAXCLAW_SESSION_ID: sessionId,
        MAXCLAW_PROJECT_ID: projectId,
      },
    });

    const pid = child.pid;

    // Create session record
    const session: Session = {
      id: sessionId,
      projectId,
      startedAt,
      status: 'active',
      pid,
    };

    createSession(session);

    // Log activity
    const activity: Activity = {
      id: generateId(),
      projectId,
      sessionId,
      type: 'start',
      timestamp: startedAt,
      details: { pid, initialPrompt: options?.initialPrompt },
    };
    createActivity(activity);

    logger.info('Session started: %s (PID: %d)', sessionId, pid ?? 0);

    // Handle process exit
    child.on('exit', (code) => {
      const endedAt = new Date().toISOString();
      const status = code === 0 ? 'completed' : 'interrupted';

      updateSession({
        id: sessionId,
        endedAt,
        status,
      });

      logger.info('Session ended: %s (exit code: %d)', sessionId, code ?? -1);

      // Trigger summary generation asynchronously
      if (isSummarizationEnabled()) {
        generateSessionSummary(sessionId, project.path).catch((err) => {
          logger.error('Failed to generate summary for session %s: %s', sessionId, err);
        });
      }

      // E6: Send session summary notification
      import('./notifier.js').then(({ sendSessionSummary }) => {
        sendSessionSummary(sessionId).catch((err) => {
          logger.error('Failed to send session summary notification for session %s: %s', sessionId, err);
        });
      });
    });

    return session;
  } catch (error) {
    logger.error('Failed to start Claude Code: %s', error);
    throw new Error(`Failed to start Claude Code: ${error}`);
  }
}

export async function listRunningSessions(): Promise<RunningSession[]> {
  const sessions = listActiveSessions();
  const running: RunningSession[] = [];

  for (const session of sessions) {
    const project = getProject(session.projectId);
    if (!project || !session.pid) continue;

    // Check if process is actually running
    try {
      process.kill(session.pid, 0); // Signal 0 checks if process exists
      running.push({
        sessionId: session.id,
        projectId: session.projectId,
        projectName: project.name,
        projectPath: project.path,
        startedAt: session.startedAt,
        pid: session.pid,
      });
    } catch {
      // Process is not running, mark as interrupted
      updateSession({
        id: session.id,
        status: 'interrupted',
        endedAt: new Date().toISOString(),
      });
    }
  }

  return running;
}

export async function stopSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.status !== 'active') {
    throw new Error(`Session is not active: ${sessionId}`);
  }

  if (!session.pid) {
    throw new Error(`Session has no PID: ${sessionId}`);
  }

  try {
    process.kill(session.pid, 'SIGTERM');

    // Give it a moment to terminate gracefully
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if still running
    try {
      process.kill(session.pid, 0);
      // Still running, force kill
      process.kill(session.pid, 'SIGKILL');
    } catch {
      // Already terminated
    }

    const endedAt = new Date().toISOString();
    updateSession({
      id: sessionId,
      status: 'interrupted',
      endedAt,
    });

    // Log activity
    const activity: Activity = {
      id: generateId(),
      projectId: session.projectId,
      sessionId,
      type: 'complete',
      timestamp: endedAt,
      details: { reason: 'stopped', pid: session.pid },
    };
    createActivity(activity);

    logger.info('Session stopped: %s', sessionId);
  } catch (error) {
    logger.error('Failed to stop session: %s', error);
    throw new Error(`Failed to stop session: ${error}`);
  }
}

export function getSessionHistory(projectId: string, limit = 20): Session[] {
  return listSessionsForProject(projectId).slice(0, limit);
}

export function formatSessionDuration(session: Session): string {
  const start = new Date(session.startedAt);
  const end = session.endedAt ? new Date(session.endedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Generate and store summary for a session
 */
export async function generateSessionSummary(
  sessionId: string,
  projectPath: string
): Promise<Session | null> {
  const session = getSession(sessionId);
  if (!session) {
    logger.error('Session not found for summary generation: %s', sessionId);
    return null;
  }

  // Update status to pending
  updateSession({
    id: sessionId,
    summaryStatus: 'pending',
  });

  try {
    // Get session log
    const sessionLog = getSessionLogForProject(projectPath);

    if (!sessionLog || sessionLog.entries.length === 0) {
      logger.warn('No session log found for project: %s', projectPath);
      updateSession({
        id: sessionId,
        summaryStatus: 'failed',
      });
      return null;
    }

    // Generate summary
    const result = await generateSummary(sessionLog.entries);

    if (result.status === 'generated' && result.summary) {
      updateSession({
        id: sessionId,
        summary: result.summary,
        summaryStatus: 'generated',
        summaryGeneratedAt: new Date().toISOString(),
      });

      logger.info('Summary generated for session: %s', sessionId);

      return getSession(sessionId);
    } else {
      updateSession({
        id: sessionId,
        summaryStatus: 'failed',
      });

      logger.error('Failed to generate summary: %s', result.error);
      return null;
    }
  } catch (error) {
    logger.error('Error generating summary: %s', error);
    updateSession({
      id: sessionId,
      summaryStatus: 'failed',
    });
    return null;
  }
}

/**
 * Get session summary
 */
export function getSessionSummary(sessionId: string): string | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  return session.summary || null;
}

/**
 * Manually trigger summary generation for a session
 */
export async function regenerateSessionSummary(sessionId: string): Promise<Session | null> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const project = getProject(session.projectId);
  if (!project) {
    throw new Error(`Project not found: ${session.projectId}`);
  }

  return generateSessionSummary(sessionId, project.path);
}
