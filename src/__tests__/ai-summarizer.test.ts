import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateSummary,
  generateSummaryFromText,
  parseStructuredSummary,
  formatSummary,
  isSummarizationEnabled,
  type SummaryResult,
  type SessionSummary,
} from '../ai-summarizer.js';
import { loadConfig } from '../config.js';
import type { LogEntry } from '../session-logger.js';

// Mock the config module
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AI Summarizer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');

    // Default mock config
    vi.mocked(loadConfig).mockReturnValue({
      scanPaths: [],
      defaultOptions: {},
      dataDir: '/tmp/test',
      ai: {
        summaryEnabled: true,
        summaryModel: 'claude-3-sonnet-20240229',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isSummarizationEnabled', () => {
    it('should return true when summaryEnabled is not explicitly set', () => {
      vi.mocked(loadConfig).mockReturnValue({
        scanPaths: [],
        defaultOptions: {},
        dataDir: '/tmp/test',
      });

      expect(isSummarizationEnabled()).toBe(true);
    });

    it('should return true when summaryEnabled is true', () => {
      vi.mocked(loadConfig).mockReturnValue({
        scanPaths: [],
        defaultOptions: {},
        dataDir: '/tmp/test',
        ai: {
          summaryEnabled: true,
        },
      });

      expect(isSummarizationEnabled()).toBe(true);
    });

    it('should return false when summaryEnabled is false', () => {
      vi.mocked(loadConfig).mockReturnValue({
        scanPaths: [],
        defaultOptions: {},
        dataDir: '/tmp/test',
        ai: {
          summaryEnabled: false,
        },
      });

      expect(isSummarizationEnabled()).toBe(false);
    });
  });

  describe('generateSummary', () => {
    it('should return failed status when summarization is disabled', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        scanPaths: [],
        defaultOptions: {},
        dataDir: '/tmp/test',
        ai: {
          summaryEnabled: false,
        },
      });

      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T10:00:00Z', role: 'user', content: 'Hello' },
      ];

      const result = await generateSummary(entries);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('disabled');
    });

    it('should return failed status when no entries provided', async () => {
      const result = await generateSummary([]);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No log entries');
    });

    it('should return failed status when no API key is available', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.mocked(loadConfig).mockReturnValue({
        scanPaths: [],
        defaultOptions: {},
        dataDir: '/tmp/test',
        ai: {},
      });

      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T10:00:00Z', role: 'user', content: 'Hello' },
      ];

      const result = await generateSummary(entries);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('API key');
    });

    it('should successfully generate summary from log entries', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '## Overview\nTest overview\n\n## Tasks Completed\n- Task 1\n\n## Key Decisions\n- Decision 1',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T10:00:00Z', role: 'user', content: 'Create a function' },
        { timestamp: '2024-01-01T10:01:00Z', role: 'assistant', content: 'I will create that function' },
        { timestamp: '2024-01-01T10:02:00Z', role: 'user', content: 'Thanks' },
      ];

      const result = await generateSummary(entries);

      expect(result.status).toBe('generated');
      expect(result.summary).toContain('Overview');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the API call
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers).toHaveProperty('x-api-key', 'test-api-key');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      // Mock retry attempts
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T10:00:00Z', role: 'user', content: 'Hello' },
      ];

      const result = await generateSummary(entries);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('API request failed');
    });

    it('should retry on rate limit errors', async () => {
      // First call returns rate limit
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Summary after retry' }],
        }),
      });

      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T10:00:00Z', role: 'user', content: 'Hello' },
      ];

      const result = await generateSummary(entries);

      expect(result.status).toBe('generated');
      expect(result.summary).toBe('Summary after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateSummaryFromText', () => {
    it('should generate summary from text input', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '## Overview\nText summary',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await generateSummaryFromText('User: Hello\nAssistant: Hi there');

      expect(result.status).toBe('generated');
      expect(result.summary).toContain('Overview');
    });

    it('should return failed status for empty text', async () => {
      const result = await generateSummaryFromText('');

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No conversation content');
    });
  });

  describe('parseStructuredSummary', () => {
    it('should parse a well-formatted summary', () => {
      const summaryText = `## Overview
This is the overview.

## Tasks Completed
- Task 1
- Task 2
- Task 3

## Key Decisions
- Decision A
- Decision B

## Code Changes
- Changed file.ts

## Errors and Issues
- Error 1

## Next Steps
- Step 1`;

      const result = parseStructuredSummary(summaryText);

      expect(result.overview).toBe('This is the overview.');
      expect(result.tasksCompleted).toHaveLength(3);
      expect(result.tasksCompleted).toContain('Task 1');
      expect(result.decisions).toHaveLength(2);
      expect(result.codeChanges).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.nextSteps).toHaveLength(1);
    });

    it('should handle missing sections gracefully', () => {
      const summaryText = `## Overview
Only overview here.`;

      const result = parseStructuredSummary(summaryText);

      expect(result.overview).toBe('Only overview here.');
      expect(result.tasksCompleted).toHaveLength(0);
      expect(result.decisions).toHaveLength(0);
      expect(result.codeChanges).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.nextSteps).toBeUndefined();
    });

    it('should handle bullet points with asterisks', () => {
      const summaryText = `## Tasks Completed
* Task with asterisk
- Task with dash`;

      const result = parseStructuredSummary(summaryText);

      expect(result.tasksCompleted).toHaveLength(2);
      expect(result.tasksCompleted).toContain('Task with asterisk');
      expect(result.tasksCompleted).toContain('Task with dash');
    });
  });

  describe('formatSummary', () => {
    it('should format a complete summary', () => {
      const summary: SessionSummary = {
        overview: 'Test overview',
        tasksCompleted: ['Task 1', 'Task 2'],
        decisions: ['Decision 1'],
        codeChanges: ['Change 1'],
        errors: ['Error 1'],
        nextSteps: ['Step 1'],
      };

      const result = formatSummary(summary);

      expect(result).toContain('Overview:');
      expect(result).toContain('Test overview');
      expect(result).toContain('Tasks Completed:');
      expect(result).toContain('- Task 1');
      expect(result).toContain('Key Decisions:');
      expect(result).toContain('Code Changes:');
      expect(result).toContain('Errors and Issues:');
      expect(result).toContain('Next Steps:');
    });

    it('should skip empty sections', () => {
      const summary: SessionSummary = {
        overview: 'Only overview',
        tasksCompleted: [],
        decisions: [],
        codeChanges: [],
        errors: [],
      };

      const result = formatSummary(summary);

      expect(result).toContain('Overview:');
      expect(result).not.toContain('Tasks Completed:');
      expect(result).not.toContain('Key Decisions:');
    });

    it('should handle summary without overview', () => {
      const summary: SessionSummary = {
        overview: '',
        tasksCompleted: ['Task 1'],
        decisions: [],
        codeChanges: [],
        errors: [],
      };

      const result = formatSummary(summary);

      expect(result).not.toContain('Overview:');
      expect(result).toContain('Tasks Completed:');
    });
  });
});
