import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

/**
 * Interface for parsed log entry
 */
export interface LogEntry {
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface for session log data
 */
export interface SessionLog {
  sessionId: string;
  projectPath: string;
  startedAt: string;
  endedAt?: string;
  entries: LogEntry[];
}

/**
 * Get the Claude Code logs directory for a project
 */
export function getClaudeLogsDir(projectPath: string): string {
  // Claude Code stores logs in ~/.claude/projects/{projectName}/logs/
  const projectName = path.basename(projectPath);
  return path.join(os.homedir(), '.claude', 'projects', projectName, 'logs');
}

/**
 * Find the latest log file in the logs directory
 */
export function findLatestLogFile(logsDir: string): string | null {
  try {
    if (!fs.existsSync(logsDir)) {
      logger.debug('Logs directory does not exist: %s', logsDir);
      return null;
    }

    const files = fs.readdirSync(logsDir);
    const logFiles = files
      .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.log'))
      .map((f) => {
        const fullPath = path.join(logsDir, f);
        const stats = fs.statSync(fullPath);
        return { name: f, path: fullPath, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (logFiles.length === 0) {
      logger.debug('No log files found in: %s', logsDir);
      return null;
    }

    return logFiles[0].path;
  } catch (error) {
    logger.error('Failed to find latest log file: %s', error);
    return null;
  }
}

/**
 * Parse a JSONL log file
 */
function parseJsonlLog(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.timestamp && parsed.message) {
        entries.push({
          timestamp: parsed.timestamp,
          role: parsed.role || 'system',
          content: parsed.message,
          metadata: parsed.metadata,
        });
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return entries;
}

/**
 * Parse a structured JSON log file
 */
function parseJsonLog(content: string): LogEntry[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry) => entry.timestamp && entry.message)
        .map((entry) => ({
          timestamp: entry.timestamp,
          role: entry.role || 'system',
          content: entry.message,
          metadata: entry.metadata,
        }));
    }
    if (parsed.entries && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch {
    // Not valid JSON, try other formats
  }
  return [];
}

/**
 * Parse a plain text log file
 */
function parseTextLog(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = content.split('\n');

  // Common log patterns to try
  const patterns = [
    // Pattern: [TIMESTAMP] [ROLE] Message
    /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\d\.]*)\]\s*\[(\w+)\]\s*(.+)/,
    // Pattern: TIMESTAMP [ROLE] Message
    /(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[\d\.]*)\s*\[(\w+)\]\s*(.+)/,
    // Pattern: [ROLE] Message
    /\[(\w+)\]\s*(.+)/,
  ];

  for (const line of lines) {
    if (!line.trim()) continue;

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const timestamp = match[1] || new Date().toISOString();
        const role = match[2] as 'user' | 'assistant' | 'system';
        const content = match[3] || match[2];

        if (['user', 'assistant', 'system'].includes(role)) {
          entries.push({
            timestamp,
            role,
            content,
          });
          break;
        }
      }
    }
  }

  return entries;
}

/**
 * Read and parse a session log file
 */
export function readSessionLog(logFilePath: string): LogEntry[] {
  try {
    if (!fs.existsSync(logFilePath)) {
      logger.debug('Log file does not exist: %s', logFilePath);
      return [];
    }

    const content = fs.readFileSync(logFilePath, 'utf-8');
    const ext = path.extname(logFilePath).toLowerCase();

    let entries: LogEntry[] = [];

    if (ext === '.jsonl') {
      entries = parseJsonlLog(content);
    } else if (ext === '.json') {
      entries = parseJsonLog(content);
    } else {
      // Try JSONL first, then JSON, then plain text
      entries = parseJsonlLog(content);
      if (entries.length === 0) {
        entries = parseJsonLog(content);
      }
      if (entries.length === 0) {
        entries = parseTextLog(content);
      }
    }

    logger.debug('Parsed %d entries from log file: %s', entries.length, logFilePath);
    return entries;
  } catch (error) {
    logger.error('Failed to read session log: %s', error);
    return [];
  }
}

/**
 * Extract conversation content from log entries
 */
export function extractConversation(entries: LogEntry[]): string {
  return entries
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => `[${entry.role.toUpperCase()}]: ${entry.content}`)
    .join('\n\n');
}

/**
 * Get session log for a project
 */
export function getSessionLogForProject(projectPath: string): SessionLog | null {
  const logsDir = getClaudeLogsDir(projectPath);
  const latestLogFile = findLatestLogFile(logsDir);

  if (!latestLogFile) {
    return null;
  }

  const entries = readSessionLog(latestLogFile);
  const stats = fs.statSync(latestLogFile);

  return {
    sessionId: path.basename(latestLogFile, path.extname(latestLogFile)),
    projectPath,
    startedAt: stats.birthtime.toISOString(),
    endedAt: stats.mtime.toISOString(),
    entries,
  };
}

/**
 * Check if session logs are available for a project
 */
export function hasSessionLogs(projectPath: string): boolean {
  const logsDir = getClaudeLogsDir(projectPath);
  return findLatestLogFile(logsDir) !== null;
}

/**
 * Get all available log files for a project
 */
export function listLogFiles(projectPath: string): string[] {
  const logsDir = getClaudeLogsDir(projectPath);

  try {
    if (!fs.existsSync(logsDir)) {
      return [];
    }

    return fs
      .readdirSync(logsDir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.log'))
      .map((f) => path.join(logsDir, f))
      .sort((a, b) => {
        const statsA = fs.statSync(a);
        const statsB = fs.statSync(b);
        return statsB.mtime.getTime() - statsA.mtime.getTime();
      });
  } catch (error) {
    logger.error('Failed to list log files: %s', error);
    return [];
  }
}
