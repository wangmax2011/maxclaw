// Notion API Client for MaxClaw
// E5: Notion Integration

import { Client } from '@notionhq/client';
import type {
  PageObjectResponse,
  DatabaseObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js';
import { logger } from './logger.js';

// Notion client instance
let notionClient: Client | null = null;

/**
 * Get or create Notion client instance
 */
export function getNotionClient(): Client | null {
  if (notionClient) {
    return notionClient;
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    logger.warn('NOTION_TOKEN environment variable not set');
    return null;
  }

  notionClient = new Client({ auth: token });
  return notionClient;
}

/**
 * Check if Notion integration is configured
 */
export function isNotionConfigured(): boolean {
  return !!process.env.NOTION_TOKEN;
}

/**
 * Reset client (useful for testing)
 */
export function resetNotionClient(): void {
  notionClient = null;
}

/**
 * Set custom token (useful for testing)
 */
export function setNotionToken(token: string): void {
  notionClient = new Client({ auth: token });
}

// ===== Page Operations =====

/**
 * Get a page by ID
 */
export async function getPage(pageId: string): Promise<PageObjectResponse | null> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    const response = await client.pages.retrieve({ page_id: pageId });
    return response as PageObjectResponse;
  } catch (error) {
    logger.error('Failed to get Notion page %s: %s', pageId, error);
    return null;
  }
}

/**
 * Create a new page
 */
export async function createPage(params: {
  parent: { database_id: string } | { page_id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any[];
}): Promise<PageObjectResponse | null> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    const response = await client.pages.create({
      parent: params.parent,
      properties: params.properties,
      children: params.children,
    });
    logger.info('Created Notion page: %s', response.id);
    return response as PageObjectResponse;
  } catch (error) {
    logger.error('Failed to create Notion page: %s', error);
    return null;
  }
}

/**
 * Update a page
 */
export async function updatePage(
  pageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
): Promise<PageObjectResponse | null> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    const response = await client.pages.update({
      page_id: pageId,
      properties,
    });
    logger.info('Updated Notion page: %s', pageId);
    return response as PageObjectResponse;
  } catch (error) {
    logger.error('Failed to update Notion page %s: %s', pageId, error);
    return null;
  }
}

/**
 * Archive (delete) a page
 */
export async function archivePage(pageId: string): Promise<boolean> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    await client.pages.update({
      page_id: pageId,
      archived: true,
    });
    logger.info('Archived Notion page: %s', pageId);
    return true;
  } catch (error) {
    logger.error('Failed to archive Notion page %s: %s', pageId, error);
    return false;
  }
}

// ===== Database Operations =====

/**
 * Query a database
 */
export async function queryDatabase(
  databaseId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>
): Promise<PageObjectResponse[]> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.databases as any).query({
      database_id: databaseId,
      filter,
      sorts,
    });
    return response.results as PageObjectResponse[];
  } catch (error) {
    logger.error('Failed to query Notion database %s: %s', databaseId, error);
    return [];
  }
}

/**
 * Get a database by ID
 */
export async function getDatabase(databaseId: string): Promise<DatabaseObjectResponse | null> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    const response = await client.databases.retrieve({ database_id: databaseId });
    return response as DatabaseObjectResponse;
  } catch (error) {
    logger.error('Failed to get Notion database %s: %s', databaseId, error);
    return null;
  }
}

// ===== Block Operations =====

/**
 * Get children blocks of a page or block
 */
export async function getBlockChildren(blockId: string): Promise<BlockObjectResponse[]> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    const response = await client.blocks.children.list({
      block_id: blockId,
    });
    return response.results as BlockObjectResponse[];
  } catch (error) {
    logger.error('Failed to get block children for %s: %s', blockId, error);
    return [];
  }
}

/**
 * Append children blocks to a page or block
 */
export async function appendBlockChildren(
  blockId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
): Promise<boolean> {
  const client = getNotionClient();
  if (!client) {
    throw new Error('Notion client not configured');
  }

  try {
    await client.blocks.children.append({
      block_id: blockId,
      children,
    });
    logger.debug('Appended %d blocks to %s', children.length, blockId);
    return true;
  } catch (error) {
    logger.error('Failed to append block children to %s: %s', blockId, error);
    return false;
  }
}

// ===== Helper Functions for Common Block Types =====

/**
 * Create a heading block
 */
export function createHeadingBlock(text: string, level: 1 | 2 | 3 = 1): Record<string, unknown> {
  const type = `heading_${level}` as const;
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
        },
      ],
    },
  };
}

/**
 * Create a paragraph block
 */
export function createParagraphBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
        },
      ],
    },
  };
}

/**
 * Create a bulleted list item block
 */
export function createBulletBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
        },
      ],
    },
  };
}

/**
 * Create a numbered list item block
 */
export function createNumberedBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
        },
      ],
    },
  };
}

/**
 * Create a code block
 */
export function createCodeBlock(code: string, language = 'plain text'): Record<string, unknown> {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [
        {
          type: 'text',
          text: { content: code },
        },
      ],
      language,
    },
  };
}

/**
 * Create a divider block
 */
export function createDividerBlock(): Record<string, unknown> {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

/**
 * Create page properties for a project
 */
export function createProjectPageProperties(params: {
  title: string;
  description?: string;
  techStack?: string[];
  path?: string;
}): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    title: {
      title: [
        {
          type: 'text',
          text: { content: params.title },
        },
      ],
    },
  };

  if (params.description) {
    properties['Description'] = {
      rich_text: [
        {
          type: 'text',
          text: { content: params.description },
        },
      ],
    };
  }

  if (params.techStack && params.techStack.length > 0) {
    properties['Tech Stack'] = {
      multi_select: params.techStack.map((tech) => ({ name: tech })),
    };
  }

  if (params.path) {
    properties['Path'] = {
      url: `file://${params.path}`,
    };
  }

  return properties;
}

// ===== Retry Logic =====

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on authentication errors
      if (lastError.message.includes('unauthorized') || lastError.message.includes('401')) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn('Notion API call failed (attempt %d/%d), retrying in %dms: %s', attempt, maxRetries, delay, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
