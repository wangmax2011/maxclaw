import { getSession, getProject, listActivitiesForProject, getBookmarksForSession } from './db.js';
import { logger } from './logger.js';
import type { Session } from './types.js';

/**
 * Export a session to markdown format
 */
export function exportSessionToMarkdown(sessionId: string): string {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const project = getProject(session.projectId);
  const bookmarks = getBookmarksForSession(sessionId);

  let markdown = `# Session Export: ${session.id}\n\n`;
  markdown += `## Session Information\n\n`;
  markdown += `- **Project:** ${project?.name || 'Unknown'}\n`;
  markdown += `- **Session ID:** ${session.id}\n`;
  markdown += `- **Started:** ${new Date(session.startedAt).toLocaleString()}\n`;

  if (session.endedAt) {
    markdown += `- **Ended:** ${new Date(session.endedAt).toLocaleString()}\n`;
  }

  markdown += `- **Status:** ${session.status}\n`;
  markdown += `- **Duration:** ${formatSessionDuration(session)}\n`;

  if (session.summary) {
    markdown += `\n## Session Summary\n\n`;
    markdown += `${session.summary}\n`;
  }

  if (bookmarks.length > 0) {
    markdown += `\n## Bookmarks\n\n`;
    for (const bookmark of bookmarks) {
      markdown += `- **${new Date(bookmark.createdAt).toLocaleString()}**: ${bookmark.message}\n`;
      if (bookmark.context) {
        markdown += `  > ${bookmark.context}\n`;
      }
    }
  }

  markdown += `\n---\n*Exported from MaxClaw*\n`;

  return markdown;
}

/**
 * Export a session to JSON format
 */
export function exportSessionToJson(sessionId: string): string {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const project = getProject(session.projectId);
  const bookmarks = getBookmarksForSession(sessionId);
  const activities = listActivitiesForProject(session.projectId, 100);

  const exportData = {
    session: {
      id: session.id,
      projectId: session.projectId,
      projectName: project?.name,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      summary: session.summary,
      duration: formatSessionDuration(session),
    },
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      message: b.message,
      context: b.context,
      createdAt: b.createdAt,
    })),
    recentActivities: activities.slice(0, 50).map((a) => ({
      id: a.id,
      type: a.type,
      timestamp: a.timestamp,
      details: a.details,
    })),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Format session duration
 */
function formatSessionDuration(session: Session): string {
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
 * Create a bookmark for a session
 */
export function createBookmarkForSession(
  sessionId: string,
  message: string,
  context?: string
): { id: string; sessionId: string; message: string; createdAt: string; context?: string } {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { createBookmark } = require('./db.js');
  const crypto = require('crypto');

  const bookmark = {
    id: crypto.randomUUID(),
    sessionId,
    message,
    context: context ?? undefined,
    createdAt: new Date().toISOString(),
  };

  createBookmark(bookmark);
  logger.info('Created bookmark for session: %s', sessionId);

  return bookmark;
}

/**
 * Get session details for continue functionality
 */
export function getSessionContextForContinue(sessionId: string): {
  session: Session;
  projectName: string;
  projectPath: string;
  lastBookmark?: { message: string; context?: string };
  summary?: string;
} | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const project = getProject(session.projectId);
  if (!project) {
    return null;
  }

  const latestBookmark = getBookmarksForSession(sessionId)[0];

  return {
    session,
    projectName: project.name,
    projectPath: project.path,
    lastBookmark: latestBookmark
      ? { message: latestBookmark.message, context: latestBookmark.context }
      : undefined,
    summary: session.summary ?? undefined,
  };
}
