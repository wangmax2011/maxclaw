// E10: Built-in Agent - Notifier Agent
// Handles notifications across multiple channels (Feishu, WeChat, Slack, custom webhooks)

import { BaseAgent } from '../src/agent-protocol/agent-runtime.js';
import type { AgentMessage } from '../src/agent-protocol/types.js';
import { logger } from '../src/logger.js';
import {
  sendNotification,
  sendSessionSummary,
  sendTaskCompleted,
  sendErrorAlert,
  sendScheduleNotification,
  sendTestNotification,
  configureNotification,
} from '../src/notifier.js';
import { getProject } from '../src/db.js';
import type { NotificationType, NotificationLevel } from '../src/types.js';

/**
 * Notifier Agent Configuration
 */
export interface NotifierConfig {
  /** Default notification type */
  defaultType?: NotificationType;
  /** Default notification level filter */
  defaultLevel?: NotificationLevel;
  /** Enable notification queueing */
  enableQueueing?: boolean;
  /** Maximum queue size */
  maxQueueSize?: number;
}

/**
 * Notifier Agent Request Types
 */
export type NotifierAction =
  | 'send_notification'
  | 'send_session_summary'
  | 'send_task_completed'
  | 'send_error_alert'
  | 'send_schedule_notification'
  | 'send_test_notification'
  | 'configure_notification'
  | 'get_status';

/**
 * Notification queue item
 */
interface QueuedNotification {
  id: string;
  projectId: string;
  message: string;
  level: NotificationLevel;
  timestamp: string;
  retryCount: number;
}

/**
 * Notifier Agent
 *
 * Capabilities:
 * - Send notifications via multiple channels
 * - Support notification queuing and retry
 * - Configure notification preferences
 * - Handle different notification types
 */
export class NotifierAgent extends BaseAgent {
  private config: Required<NotifierConfig>;
  private notificationQueue: QueuedNotification[] = [];
  private processedCount = 0;
  private failedCount = 0;
  private isProcessing = false;

  constructor(config: NotifierConfig = {}) {
    super({
      name: 'notifier',
      description: 'Multi-channel notification agent supporting Feishu, WeChat, Slack, and custom webhooks',
      capabilities: [
        'send_notification',
        'send_session_summary',
        'send_task_completed',
        'send_error_alert',
        'send_schedule_notification',
        'configure_notification',
      ],
    });

    this.config = {
      defaultType: config.defaultType ?? 'custom',
      defaultLevel: config.defaultLevel ?? 'info',
      enableQueueing: config.enableQueueing ?? true,
      maxQueueSize: config.maxQueueSize ?? 100,
    };

    logger.info('NotifierAgent created with config: %j', this.config);
  }

  async initialize(): Promise<void> {
    logger.info('NotifierAgent [%s] initialized', this.id);

    // Start processing queued notifications
    if (this.config.enableQueueing) {
      this.startQueueProcessing();
    }
  }

  async handleMessage(message: AgentMessage): Promise<unknown> {
    const action = message.payload.action as NotifierAction;
    const data = message.payload.data;

    logger.debug('NotifierAgent received action: %s', action);

    switch (action) {
      case 'send_notification':
        return this.handleSendNotification(message);

      case 'send_session_summary':
        return this.handleSendSessionSummary(message);

      case 'send_task_completed':
        return this.handleSendTaskCompleted(message);

      case 'send_error_alert':
        return this.handleSendErrorAlert(message);

      case 'send_schedule_notification':
        return this.handleSendScheduleNotification(message);

      case 'send_test_notification':
        return this.handleSendTestNotification(message);

      case 'configure_notification':
        return this.handleConfigureNotification(message);

      case 'get_status':
        return this.handleGetStatus(message);

      default:
        logger.warn('Unknown action for NotifierAgent: %s', action);
        return { error: `Unknown action: ${action}` };
    }
  }

  /**
   * Handle send notification request
   */
  private async handleSendNotification(
    message: AgentMessage<{
      projectId: string;
      message: string;
      level?: NotificationLevel;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const { projectId, message: notificationMessage, level, metadata } = message.payload.data ?? {};

    if (!projectId || !notificationMessage) {
      return {
        success: false,
        error: 'Project ID and message are required',
      };
    }

    // Check if queueing is enabled and queue is full
    if (this.config.enableQueueing && this.notificationQueue.length >= this.config.maxQueueSize) {
      // Queue full, try to send directly
      logger.warn('Notification queue full, sending directly');
    }

    try {
      const result = await sendNotification(projectId, notificationMessage, {
        level: level ?? this.config.defaultLevel,
        metadata,
      });

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;

        // Queue for retry if queueing is enabled
        if (this.config.enableQueueing) {
          this.queueNotification({
            projectId,
            message: notificationMessage,
            level: level ?? this.config.defaultLevel,
          });
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send notification: %s', errorMessage);
      this.failedCount++;

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle send session summary request
   */
  private async handleSendSessionSummary(
    message: AgentMessage<{ sessionId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const { sessionId } = message.payload.data ?? {};

    if (!sessionId) {
      return {
        success: false,
        error: 'Session ID is required',
      };
    }

    try {
      const result = await sendSessionSummary(sessionId);

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send session summary: %s', errorMessage);
      this.failedCount++;

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle send task completed request
   */
  private async handleSendTaskCompleted(
    message: AgentMessage<{ taskId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const { taskId } = message.payload.data ?? {};

    if (!taskId) {
      return {
        success: false,
        error: 'Task ID is required',
      };
    }

    try {
      const result = await sendTaskCompleted(taskId);

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send task completed notification: %s', errorMessage);
      this.failedCount++;

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle send error alert request
   */
  private async handleSendErrorAlert(
    message: AgentMessage<{
      projectId: string;
      error: string;
      context?: string;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const { projectId, error: errorMessage, context } = message.payload.data ?? {};

    if (!projectId || !errorMessage) {
      return {
        success: false,
        error: 'Project ID and error message are required',
      };
    }

    try {
      const result = await sendErrorAlert(projectId, errorMessage, context);

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;
      }

      return result;
    } catch (error) {
      const errorStr = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send error alert: %s', errorStr);
      this.failedCount++;

      return {
        success: false,
        error: errorStr,
      };
    }
  }

  /**
   * Handle send schedule notification request
   */
  private async handleSendScheduleNotification(
    message: AgentMessage<{
      scheduleId: string;
      status: 'completed' | 'failed';
      output?: string;
      error?: string;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const { scheduleId, status, output, error } = message.payload.data ?? {};

    if (!scheduleId) {
      return {
        success: false,
        error: 'Schedule ID is required',
      };
    }

    try {
      // Import schedule module to get schedule details
      const { getSchedule } = await import('../src/db.js');
      const schedule = getSchedule(scheduleId);

      if (!schedule) {
        return {
          success: false,
          error: `Schedule not found: ${scheduleId}`,
        };
      }

      const result = await sendScheduleNotification(schedule, status, output, error);

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send schedule notification: %s', errorMessage);
      this.failedCount++;

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle send test notification request
   */
  private async handleSendTestNotification(
    message: AgentMessage<{ projectId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const { projectId } = message.payload.data ?? {};

    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required',
      };
    }

    const project = getProject(projectId);

    if (!project) {
      return {
        success: false,
        error: `Project not found: ${projectId}`,
      };
    }

    try {
      const result = await sendTestNotification(project);

      if (result.success) {
        this.processedCount++;
      } else {
        this.failedCount++;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send test notification: %s', errorMessage);
      this.failedCount++;

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle configure notification request
   */
  private async handleConfigureNotification(
    message: AgentMessage<{
      projectId: string;
      webhook?: string;
      type?: NotificationType;
      level?: NotificationLevel;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const { projectId, webhook, type, level } = message.payload.data ?? {};

    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required',
      };
    }

    try {
      const result = await configureNotification(projectId, {
        webhook,
        type,
        level,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to configure notification: %s', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle get status request
   */
  private handleGetStatus(): Promise<{
    processedCount: number;
    failedCount: number;
    queueLength: number;
    maxQueueSize: number;
    isProcessing: boolean;
    config: Required<NotifierConfig>;
  }> {
    return Promise.resolve({
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      queueLength: this.notificationQueue.length,
      maxQueueSize: this.config.maxQueueSize,
      isProcessing: this.isProcessing,
      config: this.config,
    });
  }

  /**
   * Queue a notification for later processing
   */
  private queueNotification(notification: Omit<QueuedNotification, 'id' | 'timestamp' | 'retryCount'>): void {
    if (this.notificationQueue.length >= this.config.maxQueueSize) {
      // Remove oldest notification
      this.notificationQueue.shift();
    }

    this.notificationQueue.push({
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });

    logger.debug('Notification queued: %s', notification.message);
  }

  /**
   * Start processing queued notifications
   */
  private startQueueProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    const processQueue = async () => {
      while (this.notificationQueue.length > 0) {
        const notification = this.notificationQueue.shift();
        if (!notification) continue;

        try {
          const result = await sendNotification(notification.projectId, notification.message, {
            level: notification.level,
          });

          if (result.success) {
            this.processedCount++;
            logger.debug('Queued notification sent: %s', notification.id);
          } else {
            this.failedCount++;

            // Retry if retry count is less than 3
            if (notification.retryCount < 3) {
              notification.retryCount++;
              this.notificationQueue.push(notification);
              logger.debug('Notification retry queued (%d/3): %s', notification.retryCount, notification.id);
            }
          }
        } catch (error) {
          logger.error('Failed to process queued notification: %s', error);
          this.failedCount++;
        }

        // Small delay between processing
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      this.isProcessing = false;
    };

    // Check queue every 5 seconds
    setInterval(() => {
      if (!this.isProcessing && this.notificationQueue.length > 0) {
        processQueue();
      }
    }, 5000);

    logger.info('NotifierAgent queue processing started');
  }

  async shutdown(): Promise<void> {
    logger.info(
      'NotifierAgent [%s] shutdown. Processed: %d, Failed: %d, Queued: %d',
      this.id,
      this.processedCount,
      this.failedCount,
      this.notificationQueue.length
    );
    this.notificationQueue = [];
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.notificationQueue.length;
  }
}

/**
 * Create and export a singleton instance
 */
export const notifierAgent = new NotifierAgent();
