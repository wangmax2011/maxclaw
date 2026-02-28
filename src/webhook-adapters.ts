// E6: Webhook Adapters - Format messages for different notification platforms

import type { NotificationMessage, NotificationType } from './types.js';

/**
 * Webhook payload for different platforms
 */
export interface WebhookPayload {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Format message for Feishu (Lark) webhook
 * https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
 */
export function formatFeishuMessage(message: NotificationMessage): unknown {
  const colorMap = {
    info: 'blue',
    warning: 'orange',
    error: 'red',
  };

  const title = message.projectName
    ? `[${message.projectName}] ${message.title}`
    : message.title;

  return {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: title,
        },
        template: colorMap[message.level],
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: message.content,
          },
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `Level: ${message.level.toUpperCase()} | Time: ${new Date(message.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Format message for WeChat Work (企业微信) webhook
 * https://developer.work.weixin.qq.com/document/path/91770
 */
export function formatWechatMessage(message: NotificationMessage): unknown {
  const title = message.projectName
    ? `[${message.projectName}] ${message.title}`
    : message.title;

  const colorMap = {
    info: 'info',
    warning: 'warning',
    error: 'error',
  };

  return {
    msgtype: 'markdown',
    markdown: {
      content: `**${title}**\n\n${message.content}\n\n---\n*Level: ${message.level.toUpperCase()} | Time: ${new Date(message.timestamp).toLocaleString()}*`,
    },
  };
}

/**
 * Format message for Slack Incoming Webhook
 * https://api.slack.com/messaging/webhooks
 */
export function formatSlackMessage(message: NotificationMessage): unknown {
  const colorMap = {
    info: '#36a64f',
    warning: '#ff9900',
    error: '#ff0000',
  };

  const title = message.projectName
    ? `[${message.projectName}] ${message.title}`
    : message.title;

  return {
    attachments: [
      {
        color: colorMap[message.level],
        title,
        text: message.content,
        footer: 'MaxClaw',
        ts: Math.floor(new Date(message.timestamp).getTime() / 1000),
        fields: [
          {
            title: 'Level',
            value: message.level.toUpperCase(),
            short: true,
          },
        ],
      },
    ],
  };
}

/**
 * Format message for custom webhook (generic JSON)
 */
export function formatCustomMessage(message: NotificationMessage): unknown {
  return {
    title: message.title,
    content: message.content,
    level: message.level,
    timestamp: message.timestamp,
    projectName: message.projectName,
    metadata: message.metadata,
  };
}

/**
 * Get the appropriate formatter for a notification type
 */
export function getMessageFormatter(type: NotificationType) {
  switch (type) {
    case 'feishu':
      return formatFeishuMessage;
    case 'wechat':
      return formatWechatMessage;
    case 'slack':
      return formatSlackMessage;
    case 'custom':
    default:
      return formatCustomMessage;
  }
}

/**
 * Format a message for the specified notification type
 */
export function formatMessage(
  message: NotificationMessage,
  type: NotificationType
): unknown {
  const formatter = getMessageFormatter(type);
  return formatter(message);
}

/**
 * Get headers for webhook request based on notification type
 */
export function getWebhookHeaders(type: NotificationType): Record<string, string> {
  const baseHeaders = {
    'Content-Type': 'application/json',
  };

  switch (type) {
    case 'feishu':
      return {
        ...baseHeaders,
      };
    case 'wechat':
      return {
        ...baseHeaders,
      };
    case 'slack':
      return {
        ...baseHeaders,
      };
    case 'custom':
    default:
      return baseHeaders;
  }
}

/**
 * Create a complete webhook payload
 */
export function createWebhookPayload(
  url: string,
  message: NotificationMessage,
  type: NotificationType
): WebhookPayload {
  return {
    url,
    headers: getWebhookHeaders(type),
    body: formatMessage(message, type),
  };
}
