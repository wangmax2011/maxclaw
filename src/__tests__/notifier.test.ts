// E6: Notification System Tests

// Set TEST_MODE to reduce retry delays
process.env.TEST_MODE = 'true';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NotificationMessage, NotificationType, Project, Session, Schedule } from '../types.js';
import {
  formatFeishuMessage,
  formatWechatMessage,
  formatSlackMessage,
  formatCustomMessage,
  formatMessage,
  getWebhookHeaders,
  createWebhookPayload,
} from '../webhook-adapters.js';

// Mock fetch for webhook tests
global.fetch = vi.fn();

describe('Webhook Adapters', () => {
  const mockMessage: NotificationMessage = {
    title: 'Test Notification',
    content: 'This is a test message',
    level: 'info',
    timestamp: '2024-01-15T10:30:00.000Z',
    projectName: 'Test Project',
    metadata: { test: true },
  };

  describe('formatFeishuMessage', () => {
    it('should format message for Feishu webhook', () => {
      const formatted = formatFeishuMessage(mockMessage) as Record<string, unknown>;

      expect(formatted).toHaveProperty('msg_type', 'interactive');
      expect(formatted).toHaveProperty('card');
      const card = formatted.card as Record<string, unknown>;
      expect(card).toHaveProperty('header');
      const header = card.header as Record<string, unknown>;
      const title = header.title as Record<string, string>;
      expect(title.content).toContain('Test Project');
      expect(title.content).toContain('Test Notification');
    });

    it('should use correct color for info level', () => {
      const formatted = formatFeishuMessage({ ...mockMessage, level: 'info' }) as Record<string, unknown>;
      const card = formatted.card as Record<string, unknown>;
      const header = card.header as Record<string, string>;
      expect(header.template).toBe('blue');
    });

    it('should use correct color for warning level', () => {
      const formatted = formatFeishuMessage({ ...mockMessage, level: 'warning' }) as Record<string, unknown>;
      const card = formatted.card as Record<string, unknown>;
      const header = card.header as Record<string, string>;
      expect(header.template).toBe('orange');
    });

    it('should use correct color for error level', () => {
      const formatted = formatFeishuMessage({ ...mockMessage, level: 'error' }) as Record<string, unknown>;
      const card = formatted.card as Record<string, unknown>;
      const header = card.header as Record<string, string>;
      expect(header.template).toBe('red');
    });
  });

  describe('formatWechatMessage', () => {
    it('should format message for WeChat webhook', () => {
      const formatted = formatWechatMessage(mockMessage) as Record<string, unknown>;

      expect(formatted).toHaveProperty('msgtype', 'markdown');
      expect(formatted).toHaveProperty('markdown');
      const markdown = formatted.markdown as Record<string, string>;
      expect(markdown.content).toContain('Test Project');
      expect(markdown.content).toContain('Test Notification');
      expect(markdown.content).toContain('This is a test message');
    });
  });

  describe('formatSlackMessage', () => {
    it('should format message for Slack webhook', () => {
      const formatted = formatSlackMessage(mockMessage) as Record<string, unknown>;

      expect(formatted).toHaveProperty('attachments');
      const attachments = formatted.attachments as Array<Record<string, unknown>>;
      expect(attachments).toHaveLength(1);
      expect(attachments[0].title).toContain('Test Project');
      expect(attachments[0].text).toBe('This is a test message');
    });

    it('should use correct color for info level', () => {
      const formatted = formatSlackMessage({ ...mockMessage, level: 'info' }) as Record<string, unknown>;
      const attachments = formatted.attachments as Array<Record<string, string>>;
      expect(attachments[0].color).toBe('#36a64f');
    });

    it('should use correct color for warning level', () => {
      const formatted = formatSlackMessage({ ...mockMessage, level: 'warning' }) as Record<string, unknown>;
      const attachments = formatted.attachments as Array<Record<string, string>>;
      expect(attachments[0].color).toBe('#ff9900');
    });

    it('should use correct color for error level', () => {
      const formatted = formatSlackMessage({ ...mockMessage, level: 'error' }) as Record<string, unknown>;
      const attachments = formatted.attachments as Array<Record<string, string>>;
      expect(attachments[0].color).toBe('#ff0000');
    });
  });

  describe('formatCustomMessage', () => {
    it('should format message for custom webhook', () => {
      const formatted = formatCustomMessage(mockMessage) as Record<string, unknown>;

      expect(formatted).toHaveProperty('title', 'Test Notification');
      expect(formatted).toHaveProperty('content', 'This is a test message');
      expect(formatted).toHaveProperty('level', 'info');
      expect(formatted).toHaveProperty('projectName', 'Test Project');
      expect(formatted).toHaveProperty('metadata');
    });
  });

  describe('formatMessage', () => {
    it('should use Feishu formatter for feishu type', () => {
      const formatted = formatMessage(mockMessage, 'feishu') as Record<string, unknown>;
      expect(formatted).toHaveProperty('msg_type', 'interactive');
    });

    it('should use WeChat formatter for wechat type', () => {
      const formatted = formatMessage(mockMessage, 'wechat') as Record<string, unknown>;
      expect(formatted).toHaveProperty('msgtype', 'markdown');
    });

    it('should use Slack formatter for slack type', () => {
      const formatted = formatMessage(mockMessage, 'slack') as Record<string, unknown>;
      expect(formatted).toHaveProperty('attachments');
    });

    it('should use custom formatter for custom type', () => {
      const formatted = formatMessage(mockMessage, 'custom') as Record<string, unknown>;
      expect(formatted).toHaveProperty('title', 'Test Notification');
    });
  });

  describe('getWebhookHeaders', () => {
    it('should return JSON content type header', () => {
      const headers = getWebhookHeaders('custom');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should return same headers for all notification types', () => {
      const types: NotificationType[] = ['feishu', 'wechat', 'slack', 'custom'];
      for (const type of types) {
        const headers = getWebhookHeaders(type);
        expect(headers['Content-Type']).toBe('application/json');
      }
    });
  });

  describe('createWebhookPayload', () => {
    it('should create complete webhook payload', () => {
      const url = 'https://example.com/webhook';
      const payload = createWebhookPayload(url, mockMessage, 'custom');

      expect(payload).toHaveProperty('url', url);
      expect(payload).toHaveProperty('headers');
      expect(payload).toHaveProperty('body');
      const body = payload.body as Record<string, unknown>;
      expect(body).toHaveProperty('title', 'Test Notification');
    });
  });
});

describe('Notifier Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mock the db module
  vi.mock('../db.js', () => ({
    getProject: vi.fn(),
    getSession: vi.fn(),
    getTeamTask: vi.fn(),
    getTeamMember: vi.fn(),
    getTeam: vi.fn(),
    updateProject: vi.fn(),
  }));

  describe('sendNotification', () => {
    it('should return error if project not found', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue(null);

      const { sendNotification } = await import('../notifier.js');
      const result = await sendNotification('non-existent-id', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not found');
    });

    it('should return error if no webhook configured', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
      } as Project);

      const { sendNotification } = await import('../notifier.js');
      const result = await sendNotification('test-id', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No webhook configured');
    });

    it('should filter notifications below configured level', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
        notificationLevel: 'error',
      } as Project);

      const { sendNotification } = await import('../notifier.js');
      const result = await sendNotification('test-id', 'Test message', { level: 'info' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filtered by level');
    });
  });

  describe('sendSessionSummary', () => {
    it('should return error if session not found', async () => {
      const { getSession } = await import('../db.js');
      vi.mocked(getSession).mockReturnValue(null);

      const { sendSessionSummary } = await import('../notifier.js');
      const result = await sendSessionSummary('non-existent-session');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should format session duration correctly', async () => {
      const { getSession, getProject } = await import('../db.js');
      vi.mocked(getSession).mockReturnValue({
        id: 'session-id',
        projectId: 'project-id',
        startedAt: '2024-01-15T10:00:00.000Z',
        endedAt: '2024-01-15T11:30:00.000Z',
        status: 'completed',
        summary: 'Test summary',
      } as Session);
      vi.mocked(getProject).mockReturnValue({
        id: 'project-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      } as Project);

      const { sendSessionSummary } = await import('../notifier.js');
      await sendSessionSummary('session-id');

      expect(fetch).toHaveBeenCalled();
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string) as Record<string, string>;
      expect(body.content).toContain('1h 30m');
    });
  });

  describe('sendScheduleNotification', () => {
    it('should return error if project not found', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue(null);

      const { sendScheduleNotification } = await import('../notifier.js');
      const schedule: Schedule = {
        id: 'schedule-id',
        projectId: 'non-existent-project',
        name: 'Test Schedule',
        cronExpression: '0 0 * * *',
        taskType: 'reminder',
        enabled: true,
        runCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const result = await sendScheduleNotification(schedule, 'completed');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not found');
    });

    it('should send notification for completed schedule', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'project-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      } as Project);

      const { sendScheduleNotification } = await import('../notifier.js');
      const schedule: Schedule = {
        id: 'schedule-id',
        projectId: 'project-id',
        name: 'Test Schedule',
        cronExpression: '0 0 * * *',
        taskType: 'reminder',
        enabled: true,
        runCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const result = await sendScheduleNotification(schedule, 'completed', 'Test output');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalled();
    });

    it('should send notification with error level for failed schedule', async () => {
      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'project-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      } as Project);

      const { sendScheduleNotification } = await import('../notifier.js');
      const schedule: Schedule = {
        id: 'schedule-id',
        projectId: 'project-id',
        name: 'Test Schedule',
        cronExpression: '0 0 * * *',
        taskType: 'reminder',
        enabled: true,
        runCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const result = await sendScheduleNotification(schedule, 'failed', undefined, 'Error message');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalled();
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string) as Record<string, string>;
      expect(body.level).toBe('error');
    });
  });

  describe('sendTestNotification', () => {
    it('should return error if no webhook configured', async () => {
      const { sendTestNotification } = await import('../notifier.js');
      const project: Project = {
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
      };
      const result = await sendTestNotification(project);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No webhook configured');
    });

    it('should send test notification successfully', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const { sendTestNotification } = await import('../notifier.js');
      const project: Project = {
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      };
      const result = await sendTestNotification(project);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Retry logic', () => {
    it('should retry on failure', async () => {
      // First two calls fail, third succeeds
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
        } as Response);

      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      } as Project);

      const { sendNotification } = await import('../notifier.js');
      const result = await sendNotification('test-id', 'Test message');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const { getProject } = await import('../db.js');
      vi.mocked(getProject).mockReturnValue({
        id: 'test-id',
        name: 'Test Project',
        path: '/test',
        techStack: [],
        discoveredAt: '2024-01-01T00:00:00.000Z',
        notificationWebhook: 'https://example.com/webhook',
        notificationType: 'custom',
      } as Project);

      const { sendNotification } = await import('../notifier.js');
      const result = await sendNotification('test-id', 'Test message');

      expect(result.success).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });
});
