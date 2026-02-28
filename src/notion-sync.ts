// Notion Sync Module for MaxClaw
// E5: Notion Integration - Sync functionality

import { getProject, getSession, listSessionsForProject, updateProject } from './db.js';
import { logger } from './logger.js';
import type { Project, Session } from './types.js';
import {
  getNotionClient,
  isNotionConfigured,
  createPage,
  updatePage,
  appendBlockChildren,
  createHeadingBlock,
  createParagraphBlock,
  createBulletBlock,
  createDividerBlock,
  createCodeBlock,
  withRetry,
} from './notion-client.js';

/**
 * Check if a project has Notion integration configured
 */
export function hasNotionIntegration(projectId: string): boolean {
  const project = getProject(projectId);
  return !!(project?.notionPageId && isNotionConfigured());
}

/**
 * Link a project to a Notion page
 */
export async function linkProjectToNotion(
  projectId: string,
  notionPageId: string
): Promise<boolean> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!isNotionConfigured()) {
    throw new Error('Notion integration not configured. Set NOTION_TOKEN environment variable.');
  }

  // Validate the page exists
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not initialized');
  }

  try {
    await withRetry(async () => {
      await client.pages.retrieve({ page_id: notionPageId });
    });
  } catch (error) {
    logger.error('Failed to verify Notion page %s: %s', notionPageId, error);
    throw new Error(`Notion page not found or not accessible: ${notionPageId}`);
  }

  // Update project with Notion page ID
  updateProject({
    id: projectId,
    notionPageId,
  });

  logger.info('Linked project %s to Notion page %s', project.name, notionPageId);
  return true;
}

/**
 * Unlink a project from Notion
 */
export async function unlinkProjectFromNotion(projectId: string): Promise<boolean> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.notionPageId) {
    logger.warn('Project %s is not linked to Notion', project.name);
    return false;
  }

  updateProject({
    id: projectId,
    notionPageId: '', // Clear the notion page ID
  });

  logger.info('Unlinked project %s from Notion', project.name);
  return true;
}

/**
 * Create a new Notion page for a project
 */
export async function createProjectPage(
  projectId: string,
  parentPageId?: string
): Promise<string | null> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!isNotionConfigured()) {
    throw new Error('Notion integration not configured. Set NOTION_TOKEN environment variable.');
  }

  // If parentPageId not provided, try to use environment variable
  const parentId = parentPageId || process.env.NOTION_PARENT_PAGE_ID;
  if (!parentId) {
    throw new Error(
      'Parent page ID required. Provide it as argument or set NOTION_PARENT_PAGE_ID environment variable.'
    );
  }

  try {
    const page = await withRetry(async () => {
      return createPage({
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [
              {
                type: 'text',
                text: { content: project.name },
              },
            ],
          },
        },
        children: buildProjectPageContent(project),
      });
    });

    if (!page) {
      throw new Error('Failed to create Notion page');
    }

    // Update project with the new page ID
    updateProject({
      id: projectId,
      notionPageId: page.id,
    });

    logger.info('Created Notion page %s for project %s', page.id, project.name);
    return page.id;
  } catch (error) {
    logger.error('Failed to create project page: %s', error);
    throw error;
  }
}

/**
 * Update the Notion page for a project
 */
export async function updateProjectPage(projectId: string): Promise<boolean> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.notionPageId) {
    throw new Error(`Project ${project.name} is not linked to a Notion page`);
  }

  if (!isNotionConfigured()) {
    throw new Error('Notion integration not configured');
  }

  try {
    // Update page title
    await withRetry(async () => {
      return updatePage(project.notionPageId!, {
        title: {
          title: [
            {
              type: 'text',
              text: { content: project.name },
            },
          ],
        },
      });
    });

    // Append updated content
    const content = buildProjectPageContent(project);
    await withRetry(async () => {
      return appendBlockChildren(project.notionPageId!, content);
    });

    logger.info('Updated Notion page for project %s', project.name);
    return true;
  } catch (error) {
    logger.error('Failed to update project page: %s', error);
    throw error;
  }
}

/**
 * Sync project metadata to Notion
 */
export async function syncProjectToNotion(projectId: string): Promise<boolean> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.notionPageId) {
    logger.warn('Project %s has no Notion page linked', project.name);
    return false;
  }

  return updateProjectPage(projectId);
}

/**
 * Sync session summary to Notion
 */
export async function syncSummaryToNotion(sessionId: string): Promise<boolean> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (!session.summary) {
    logger.warn('Session %s has no summary to sync', sessionId);
    return false;
  }

  const project = getProject(session.projectId);
  if (!project) {
    throw new Error(`Project not found: ${session.projectId}`);
  }

  if (!project.notionPageId) {
    logger.debug('Project %s has no Notion page linked, skipping sync', project.name);
    return false;
  }

  if (!isNotionConfigured()) {
    logger.debug('Notion not configured, skipping sync');
    return false;
  }

  try {
    const blocks = buildSessionSummaryBlocks(session, project);

    await withRetry(async () => {
      return appendBlockChildren(project.notionPageId!, blocks);
    });

    logger.info('Synced session %s summary to Notion for project %s', sessionId, project.name);
    return true;
  } catch (error) {
    logger.error('Failed to sync session summary to Notion: %s', error);
    return false;
  }
}

/**
 * Auto-sync session summary to Notion (called after summary generation)
 */
export async function autoSyncSessionSummary(sessionId: string): Promise<boolean> {
  const session = getSession(sessionId);
  if (!session) {
    logger.error('Session not found for auto-sync: %s', sessionId);
    return false;
  }

  const project = getProject(session.projectId);
  if (!project) {
    logger.error('Project not found for auto-sync: %s', session.projectId);
    return false;
  }

  // Only sync if project has Notion integration
  if (!project.notionPageId) {
    logger.debug('Project %s has no Notion page, skipping auto-sync', project.name);
    return false;
  }

  // Only sync if summary is generated
  if (session.summaryStatus !== 'generated' || !session.summary) {
    logger.debug('Session %s summary not ready, skipping auto-sync', sessionId);
    return false;
  }

  return syncSummaryToNotion(sessionId);
}

// ===== Content Builders =====

/**
 * Build content blocks for a project page
 */
function buildProjectPageContent(project: Project): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    createHeadingBlock('Project Overview', 1),
    createDividerBlock(),
  ];

  // Description
  if (project.description) {
    blocks.push(createParagraphBlock(`**Description:** ${project.description}`));
  }

  // Path
  blocks.push(createParagraphBlock(`**Path:** ${project.path}`));

  // Tech Stack
  if (project.techStack.length > 0) {
    blocks.push(createHeadingBlock('Tech Stack', 2));
    for (const tech of project.techStack) {
      blocks.push(createBulletBlock(tech));
    }
  }

  // Discovered date
  blocks.push(
    createDividerBlock(),
    createParagraphBlock(`Discovered: ${new Date(project.discoveredAt).toLocaleDateString()}`)
  );

  if (project.lastAccessed) {
    blocks.push(
      createParagraphBlock(`Last Accessed: ${new Date(project.lastAccessed).toLocaleDateString()}`)
    );
  }

  // Session summaries section
  blocks.push(
    createDividerBlock(),
    createHeadingBlock('Session Summaries', 2)
  );

  return blocks;
}

/**
 * Build blocks for a session summary
 */
function buildSessionSummaryBlocks(
  session: Session,
  project: Project
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    createDividerBlock(),
    createHeadingBlock(`Session: ${new Date(session.startedAt).toLocaleString()}`, 3),
  ];

  // Session metadata
  const duration = session.endedAt
    ? calculateDuration(session.startedAt, session.endedAt)
    : 'In progress';

  blocks.push(
    createParagraphBlock(`**Status:** ${session.status}`),
    createParagraphBlock(`**Duration:** ${duration}`)
  );

  // Summary content
  if (session.summary) {
    blocks.push(createHeadingBlock('Summary', 3));

    // Split summary into paragraphs and create blocks
    const paragraphs = session.summary.split('\n\n');
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      // Check if it's a code block (starts with triple backticks)
      if (trimmed.startsWith('```')) {
        const codeMatch = trimmed.match(/```(\w+)?\n?([\s\S]*?)```/);
        if (codeMatch) {
          const language = codeMatch[1] || 'plain text';
          const code = codeMatch[2].trim();
          blocks.push(createCodeBlock(code, language));
        } else {
          blocks.push(createCodeBlock(trimmed.replace(/```/g, '').trim()));
        }
      }
      // Check if it's a list item
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const items = trimmed.split('\n').filter((line) => line.trim().startsWith('- ') || line.trim().startsWith('* '));
        for (const item of items) {
          const text = item.trim().replace(/^[-*]\s+/, '');
          blocks.push(createBulletBlock(text));
        }
      }
      // Regular paragraph
      else {
        blocks.push(createParagraphBlock(trimmed));
      }
    }
  }

  // Generated timestamp
  if (session.summaryGeneratedAt) {
    blocks.push(
      createParagraphBlock(
        `*Summary generated: ${new Date(session.summaryGeneratedAt).toLocaleString()}*`
      )
    );
  }

  return blocks;
}

/**
 * Calculate duration between two timestamps
 */
function calculateDuration(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const durationMs = end.getTime() - start.getTime();

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ===== Batch Operations =====

/**
 * Sync all sessions for a project to Notion
 */
export async function syncAllSessionsToNotion(projectId: string): Promise<{
  synced: number;
  failed: number;
}> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.notionPageId) {
    throw new Error(`Project ${project.name} is not linked to a Notion page`);
  }

  const sessions = listSessionsForProject(projectId).filter(
    (s) => s.summaryStatus === 'generated' && s.summary
  );

  let synced = 0;
  let failed = 0;

  for (const session of sessions) {
    try {
      const success = await syncSummaryToNotion(session.id);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    } catch (error) {
      logger.error('Failed to sync session %s: %s', session.id, error);
      failed++;
    }
  }

  logger.info('Synced %d sessions to Notion for project %s (%d failed)', synced, project.name, failed);
  return { synced, failed };
}
