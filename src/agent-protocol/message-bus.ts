// E10: Agent Protocol - Message Bus
// Implements publish/subscribe and request/response patterns

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import type {
  AgentMessage,
  MessageHandler,
  MessagePayload,
  RequestResponseResult,
  MessageHeader,
  MessageType,
  QueuedMessage,
} from './types.js';

/**
 * Subscription record
 */
interface Subscription {
  /** Subscription ID */
  id: string;
  /** Topic to subscribe to */
  topic: string;
  /** Handler function */
  handler: MessageHandler;
  /** Subscriber ID */
  subscriberId?: string;
}

/**
 * Pending request for request-response pattern
 */
interface PendingRequest {
  /** Correlation ID */
  correlationId: string;
  /** Resolve function */
  resolve: (value: unknown) => void;
  /** Reject function */
  reject: (reason: Error) => void;
  /** Timeout timer */
  timeoutTimer: NodeJS.Timeout;
  /** Target agent ID */
  target: string;
}

/**
 * Message Bus configuration
 */
export interface MessageBusOptions {
  /** Enable message persistence */
  persistMessages?: boolean;
  /** Default timeout for request-response (ms) */
  defaultTimeout?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
}

/**
 * Message Bus - Central hub for agent communication
 * Supports both synchronous and asynchronous messaging
 */
export class MessageBus {
  /** Topic subscriptions map */
  private subscriptions: Map<string, Subscription[]> = new Map();

  /** Pending requests for request-response pattern */
  private pendingRequests: Map<string, PendingRequest> = new Map();

  /** Message queue for persistence */
  private messageQueue: QueuedMessage[] = [];

  /** Message history for debugging */
  private messageHistory: AgentMessage[] = [];

  /** Configuration options */
  private options: Required<MessageBusOptions>;

  /** Event listeners for message events */
  private messageListeners: Array<(message: AgentMessage) => void> = [];

  constructor(options: MessageBusOptions = {}) {
    this.options = {
      persistMessages: options.persistMessages ?? false,
      defaultTimeout: options.defaultTimeout ?? 30000,
      maxQueueSize: options.maxQueueSize ?? 1000,
    };

    logger.info('MessageBus initialized with options: %j', this.options);
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return uuidv4();
  }

  /**
   * Publish a message to a topic
   * @param topic - Topic to publish to
   * @param message - Message to publish
   * @returns The published message
   */
  async publish<T>(topic: string, message: AgentMessage<T>): Promise<AgentMessage<T>> {
    // Update message status
    message.status = 'sent';
    message.timestamp = new Date().toISOString();

    // Add to history
    this.addToHistory(message);

    // Persist message if enabled
    if (this.options.persistMessages) {
      await this.persistMessage(message, topic);
    }

    // Notify global listeners
    this.notifyListeners(message);

    // Find subscribers for this topic
    const subscribers = this.subscriptions.get(topic) ?? [];

    if (subscribers.length === 0) {
      logger.debug('No subscribers for topic: %s', topic);
      return message;
    }

    // Deliver message to all subscribers asynchronously
    const deliveryPromises = subscribers.map(async (sub) => {
      try {
        await sub.handler(message);
        logger.debug('Message delivered to subscriber %s for topic %s', sub.subscriberId, topic);
      } catch (error) {
        logger.error('Error delivering message to subscriber %s: %s', sub.subscriberId, error);
        message.status = 'failed';
      }
    });

    await Promise.allSettled(deliveryPromises);

    logger.info('Published message %s to topic %s with %d subscribers', message.id, topic, subscribers.length);

    return message;
  }

  /**
   * Subscribe to a topic
   * @param topic - Topic to subscribe to
   * @param handler - Message handler function
   * @param subscriberId - Optional subscriber ID
   * @returns Subscription ID
   */
  subscribe<T>(topic: string, handler: MessageHandler<T>, subscriberId?: string): string {
    const subscriptionId = subscriberId ?? this.generateId();
    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler: handler as MessageHandler,
      subscriberId: subscriberId || undefined,
    };

    const subscribers = this.subscriptions.get(topic) ?? [];
    subscribers.push(subscription);
    this.subscriptions.set(topic, subscribers);

    logger.info('Subscriber %s subscribed to topic: %s', subscriptionId, topic);

    return subscriptionId;
  }

  /**
   * Unsubscribe from a topic
   * @param topic - Topic to unsubscribe from
   * @param subscriptionId - Subscription ID to remove
   * @returns True if unsubscribed successfully
   */
  unsubscribe(topic: string, subscriptionId: string): boolean {
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers) {
      return false;
    }

    const index = subscribers.findIndex((sub) => sub.id === subscriptionId);
    if (index === -1) {
      return false;
    }

    subscribers.splice(index, 1);

    if (subscribers.length === 0) {
      this.subscriptions.delete(topic);
    }

    logger.info('Subscription %s removed from topic: %s', subscriptionId, topic);

    return true;
  }

  /**
   * Send a request and wait for response (request-response pattern)
   * @param target - Target agent ID
   * @param message - Request message
   * @param timeout - Optional timeout in ms
   * @returns Promise resolving to response
   */
  async requestResponse<T, R>(
    target: string,
    message: AgentMessage<T>,
    timeout?: number
  ): Promise<RequestResponseResult<R>> {
    const correlationId = this.generateId();
    const actualTimeout = timeout ?? this.options.defaultTimeout;

    // Create correlation ID for this request
    message.correlationId = correlationId;
    message.receiver = target;
    message.type = 'query';

    const startTime = Date.now();

    // Create promise for the response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        logger.warn('Request %s to %s timed out after %dms', correlationId, target, actualTimeout);
        reject(new Error(`Request timed out after ${actualTimeout}ms`));
      }, actualTimeout);

      this.pendingRequests.set(correlationId, {
        correlationId,
        resolve,
        reject,
        timeoutTimer,
        target,
      });
    });

    // Publish the request to the target's topic
    const requestTopic = `agent:${target}:inbox`;
    await this.publish(requestTopic, message);

    try {
      const response = await responsePromise;
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: response as R,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        responseTime,
      };
    }
  }

  /**
   * Send a response to a request
   * @param originalMessage - Original request message
   * @param responseData - Response data
   * @returns The response message
   */
  async sendResponse<T>(originalMessage: AgentMessage<T>, responseData: unknown): Promise<AgentMessage> {
    if (!originalMessage.correlationId) {
      throw new Error('Cannot send response: original message has no correlation ID');
    }

    const pendingRequest = this.pendingRequests.get(originalMessage.correlationId);
    if (!pendingRequest) {
      logger.warn('No pending request found for correlation ID: %s', originalMessage.correlationId);
      // Still create and send the response message
    }

    // Create response message
    const responseMessage: AgentMessage = {
      id: this.generateId(),
      type: 'response',
      sender: originalMessage.receiver ?? 'unknown',
      receiver: originalMessage.sender,
      topic: originalMessage.topic,
      correlationId: originalMessage.correlationId,
      payload: {
        action: originalMessage.payload.action ? `response_${originalMessage.payload.action}` : 'response',
        data: responseData,
      },
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    // Resolve the pending request if exists
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeoutTimer);
      this.pendingRequests.delete(originalMessage.correlationId);
      pendingRequest.resolve(responseData);
    }

    // Publish response to sender's inbox
    const responseTopic = `agent:${originalMessage.sender}:inbox`;
    await this.publish(responseTopic, responseMessage);

    return responseMessage;
  }

  /**
   * Send an error response to a request
   * @param originalMessage - Original request message
   * @param error - Error message
   * @returns The error response message
   */
  async sendErrorResponse<T>(originalMessage: AgentMessage<T>, error: string): Promise<AgentMessage> {
    if (!originalMessage.correlationId) {
      throw new Error('Cannot send error response: original message has no correlation ID');
    }

    const pendingRequest = this.pendingRequests.get(originalMessage.correlationId);

    // Create error response message
    const errorMessage: AgentMessage = {
      id: this.generateId(),
      type: 'error',
      sender: originalMessage.receiver ?? 'unknown',
      receiver: originalMessage.sender,
      topic: originalMessage.topic,
      correlationId: originalMessage.correlationId,
      payload: {
        action: 'error',
        data: { error },
      },
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    // Reject the pending request if exists
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeoutTimer);
      this.pendingRequests.delete(originalMessage.correlationId);
      pendingRequest.reject(new Error(error));
    }

    // Publish error to sender's inbox
    const errorTopic = `agent:${originalMessage.sender}:inbox`;
    await this.publish(errorTopic, errorMessage);

    return errorMessage;
  }

  /**
   * Broadcast a message to all subscribers of a topic
   * @param topic - Topic to broadcast to
   * @param payload - Message payload
   * @param sender - Sender agent ID
   * @returns The broadcast message
   */
  async broadcast<T>(topic: string, payload: MessagePayload<T>, sender: string): Promise<AgentMessage<T>> {
    const message: AgentMessage<T> = {
      id: this.generateId(),
      type: 'notification',
      sender,
      topic,
      payload,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    return this.publish(topic, message);
  }

  /**
   * Get all subscriptions for a topic
   * @param topic - Topic to query
   * @returns Array of subscription IDs
   */
  getSubscriptions(topic: string): string[] {
    const subscribers = this.subscriptions.get(topic);
    return subscribers?.map((sub) => sub.id) ?? [];
  }

  /**
   * Get all topics
   * @returns Array of topic names
   */
  getAllTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get message history
   * @param limit - Maximum number of messages to return
   * @returns Array of messages
   */
  getMessageHistory(limit = 100): AgentMessage[] {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Register a global message listener
   * @param listener - Listener function
   */
  addMessageListener(listener: (message: AgentMessage) => void): void {
    this.messageListeners.push(listener);
    logger.debug('Added global message listener');
  }

  /**
   * Remove a global message listener
   * @param listener - Listener function to remove
   */
  removeMessageListener(listener: (message: AgentMessage) => void): void {
    const index = this.messageListeners.indexOf(listener);
    if (index !== -1) {
      this.messageListeners.splice(index, 1);
      logger.debug('Removed global message listener');
    }
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
    logger.debug('Message history cleared');
  }

  /**
   * Get pending request count
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Add message to history with size limit
   */
  private addToHistory(message: AgentMessage): void {
    this.messageHistory.push(message);

    // Trim history if exceeds max size
    if (this.messageHistory.length > this.options.maxQueueSize) {
      this.messageHistory = this.messageHistory.slice(-this.options.maxQueueSize);
    }
  }

  /**
   * Persist message to queue
   */
  private async persistMessage<T>(message: AgentMessage<T>, topic?: string): Promise<void> {
    const queuedMessage: QueuedMessage = {
      id: this.generateId(),
      messageId: message.id,
      type: message.type,
      sender: message.sender,
      receiver: message.receiver,
      topic,
      payload: JSON.stringify(message.payload),
      headers: message.headers ? JSON.stringify(message.headers) : '',
      status: message.status ?? 'pending',
      createdAt: message.timestamp,
    };

    this.messageQueue.push(queuedMessage);

    // Trim queue if exceeds max size
    if (this.messageQueue.length > this.options.maxQueueSize) {
      this.messageQueue = this.messageQueue.slice(-this.options.maxQueueSize);
    }

    logger.debug('Message %s persisted to queue', message.id);
  }

  /**
   * Notify all registered listeners
   */
  private notifyListeners(message: AgentMessage): void {
    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (error) {
        logger.error('Error in message listener: %s', error);
      }
    }
  }

  /**
   * Get queued messages
   * @param limit - Maximum messages to return
   * @returns Array of queued messages
   */
  getQueuedMessages(limit = 100): QueuedMessage[] {
    return this.messageQueue.slice(-limit);
  }

  /**
   * Clear the message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
    logger.debug('Message queue cleared');
  }
}

/**
 * Default message bus instance
 */
export const defaultMessageBus = new MessageBus();

/**
 * Create a new message with default values
 */
export function createMessage<T>(
  sender: string,
  type: MessageType,
  payload: MessagePayload<T>,
  options?: Partial<AgentMessage<T>>
): AgentMessage<T> {
  return {
    id: uuidv4(),
    type,
    sender,
    payload,
    timestamp: new Date().toISOString(),
    status: 'pending',
    ...options,
  };
}
