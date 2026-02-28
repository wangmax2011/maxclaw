// Tests for Notion Client
// E5: Notion Integration

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNotionClient,
  isNotionConfigured,
  resetNotionClient,
  setNotionToken,
  createHeadingBlock,
  createParagraphBlock,
  createBulletBlock,
  createNumberedBlock,
  createCodeBlock,
  createDividerBlock,
  withRetry,
} from '../notion-client.js';

describe('Notion Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetNotionClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetNotionClient();
  });

  describe('Configuration', () => {
    it('should return null when NOTION_TOKEN is not set', () => {
      delete process.env.NOTION_TOKEN;
      const client = getNotionClient();
      expect(client).toBeNull();
    });

    it('should return client when NOTION_TOKEN is set', () => {
      process.env.NOTION_TOKEN = 'test-token';
      const client = getNotionClient();
      expect(client).not.toBeNull();
    });

    it('should return same client instance on multiple calls', () => {
      process.env.NOTION_TOKEN = 'test-token';
      const client1 = getNotionClient();
      const client2 = getNotionClient();
      expect(client1).toBe(client2);
    });

    it('should check if Notion is configured', () => {
      delete process.env.NOTION_TOKEN;
      expect(isNotionConfigured()).toBe(false);

      process.env.NOTION_TOKEN = 'test-token';
      expect(isNotionConfigured()).toBe(true);
    });

    it('should allow setting custom token', () => {
      setNotionToken('custom-token');
      const client = getNotionClient();
      expect(client).not.toBeNull();
    });
  });

  describe('Block Helpers', () => {
    it('should create heading block level 1', () => {
      const block = createHeadingBlock('Test Heading', 1);
      expect(block).toEqual({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Test Heading' },
            },
          ],
        },
      });
    });

    it('should create heading block level 2', () => {
      const block = createHeadingBlock('Test Heading', 2);
      expect(block.type).toBe('heading_2');
      expect(block.heading_2).toBeDefined();
    });

    it('should create heading block level 3', () => {
      const block = createHeadingBlock('Test Heading', 3);
      expect(block.type).toBe('heading_3');
      expect(block.heading_3).toBeDefined();
    });

    it('should create paragraph block', () => {
      const block = createParagraphBlock('Test paragraph');
      expect(block).toEqual({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Test paragraph' },
            },
          ],
        },
      });
    });

    it('should create bullet list item block', () => {
      const block = createBulletBlock('Bullet item');
      expect(block).toEqual({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Bullet item' },
            },
          ],
        },
      });
    });

    it('should create numbered list item block', () => {
      const block = createNumberedBlock('Numbered item');
      expect(block).toEqual({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Numbered item' },
            },
          ],
        },
      });
    });

    it('should create code block', () => {
      const block = createCodeBlock('const x = 1;', 'javascript');
      expect(block).toEqual({
        object: 'block',
        type: 'code',
        code: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'const x = 1;' },
            },
          ],
          language: 'javascript',
        },
      });
    });

    it('should create code block with default language', () => {
      const block = createCodeBlock('some code');
      expect((block as { code?: { language?: string } }).code?.language).toBe('plain text');
    });

    it('should create divider block', () => {
      const block = createDividerBlock();
      expect(block).toEqual({
        object: 'block',
        type: 'divider',
        divider: {},
      });
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, 3);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, 3);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));
      await expect(withRetry(fn, 3)).rejects.toThrow('Persistent error');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('unauthorized'));
      await expect(withRetry(fn, 3)).rejects.toThrow('unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
      await expect(withRetry(fn, 3)).rejects.toThrow('401 Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Client Reset', () => {
    it('should reset client to null', () => {
      process.env.NOTION_TOKEN = 'test-token';
      const client1 = getNotionClient();
      expect(client1).not.toBeNull();

      resetNotionClient();
      delete process.env.NOTION_TOKEN;

      const client2 = getNotionClient();
      expect(client2).toBeNull();
    });
  });
});
