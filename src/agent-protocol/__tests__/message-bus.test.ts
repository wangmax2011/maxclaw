// E10: Agent Protocol - Message Bus Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus, createMessage } from '../message-bus.js';
import type { AgentMessage, MessagePayload } from '../types.js';

describe('MessageBus', () => {
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = new MessageBus();
  });

  afterEach(() => {
    messageBus.clearHistory();
    messageBus.clearQueue();
  });

  describe('constructor', () => {
    it('should create a message bus with default options', () => {
      expect(messageBus).toBeDefined();
      expect(messageBus.getQueueSize()).toBe(0);
      expect(messageBus.getPendingRequestCount()).toBe(0);
    });

    it('should create a message bus with custom options', () => {
      const customBus = new MessageBus({
        persistMessages: true,
        defaultTimeout: 60000,
        maxQueueSize: 500,
      });

      expect(customBus).toBeDefined();
      expect(customBus.getQueueSize()).toBe(0);
    });
  });

  describe('publish', () => {
    it('should publish a message to a topic', async () => {
      const message = createMessage('sender-1', 'notification', {
        action: 'test',
        data: { value: 42 },
      });

      const result = await messageBus.publish('test-topic', message);

      expect(result).toBeDefined();
      expect(result.id).toBe(message.id);
      expect(result.status).toBe('sent');
      expect(result.timestamp).toBeDefined();
    });

    it('should deliver message to subscribers', async () => {
      const receivedMessages: AgentMessage[] = [];

      messageBus.subscribe('test-topic', async (msg) => {
        receivedMessages.push(msg);
      });

      const message = createMessage('sender-1', 'notification', {
        action: 'test',
        data: { value: 42 },
      });

      await messageBus.publish('test-topic', message);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].id).toBe(message.id);
    });

    it('should deliver message to multiple subscribers', async () => {
      const receivedMessages1: AgentMessage[] = [];
      const receivedMessages2: AgentMessage[] = [];

      messageBus.subscribe('test-topic', async (msg) => {
        receivedMessages1.push(msg);
      });

      messageBus.subscribe('test-topic', async (msg) => {
        receivedMessages2.push(msg);
      });

      const message = createMessage('sender-1', 'notification', {
        action: 'test',
        data: { value: 42 },
      });

      await messageBus.publish('test-topic', message);

      expect(receivedMessages1).toHaveLength(1);
      expect(receivedMessages2).toHaveLength(1);
    });

    it('should handle subscriber errors gracefully', async () => {
      const workingMessages: AgentMessage[] = [];

      messageBus.subscribe('test-topic', async () => {
        throw new Error('Subscriber error');
      });

      messageBus.subscribe('test-topic', async (msg) => {
        workingMessages.push(msg);
      });

      const message = createMessage('sender-1', 'notification', {
        action: 'test',
        data: { value: 42 },
      });

      await messageBus.publish('test-topic', message);

      expect(workingMessages).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to a topic and return subscription ID', () => {
      const handler = vi.fn();
      const subscriptionId = messageBus.subscribe('test-topic', handler);

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
    });

    it('should allow multiple subscriptions to the same topic', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const sub1 = messageBus.subscribe('test-topic', handler1);
      const sub2 = messageBus.subscribe('test-topic', handler2);

      expect(sub1).not.toBe(sub2);
    });

    it('should use custom subscriber ID if provided', () => {
      const handler = vi.fn();
      const subscriptionId = messageBus.subscribe('test-topic', handler, 'custom-subscriber');

      expect(subscriptionId).toBe('custom-subscriber');
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from a topic', () => {
      const handler = vi.fn();
      const subscriptionId = messageBus.subscribe('test-topic', handler);

      const result = messageBus.unsubscribe('test-topic', subscriptionId);

      expect(result).toBe(true);
      expect(messageBus.getSubscriptions('test-topic')).not.toContain(subscriptionId);
    });

    it('should return false for invalid subscription ID', () => {
      const result = messageBus.unsubscribe('test-topic', 'invalid-id');
      expect(result).toBe(false);
    });

    it('should remove topic when last subscriber unsubscribes', () => {
      const handler = vi.fn();
      const subscriptionId = messageBus.subscribe('test-topic', handler);

      messageBus.unsubscribe('test-topic', subscriptionId);

      expect(messageBus.getAllTopics()).not.toContain('test-topic');
    });
  });

  describe('requestResponse', () => {
    it('should send request and receive response', async () => {
      // Setup a responder
      messageBus.subscribe('agent:responder-1:inbox', async (msg) => {
        if (msg.correlationId) {
          await messageBus.sendResponse(msg, { result: 'success' });
        }
      });

      const request = createMessage('requester-1', 'query', {
        action: 'test',
        data: { query: 'test' },
      });

      const result = await messageBus.requestResponse<unknown, { result: string }>(
        'responder-1',
        request,
        5000
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
      expect(result.responseTime).toBeLessThan(5000);
    });

    it('should timeout if no response received', async () => {
      const request = createMessage('requester-1', 'query', {
        action: 'test',
        data: { query: 'test' },
      });

      const result = await messageBus.requestResponse('non-existent-agent', request, 100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should handle error responses', async () => {
      messageBus.subscribe('agent:error-agent:inbox', async (msg) => {
        if (msg.correlationId) {
          await messageBus.sendErrorResponse(msg, 'Test error');
        }
      });

      const request = createMessage('requester-1', 'query', {
        action: 'test',
        data: { query: 'test' },
      });

      const result = await messageBus.requestResponse('error-agent', request, 5000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });
  });

  describe('broadcast', () => {
    it('should broadcast a message to all subscribers', async () => {
      const receivedMessages: AgentMessage[] = [];

      messageBus.subscribe('broadcast-topic', async (msg) => {
        receivedMessages.push(msg);
      });

      messageBus.subscribe('broadcast-topic', async (msg) => {
        receivedMessages.push(msg);
      });

      await messageBus.broadcast(
        'broadcast-topic',
        { action: 'broadcast', data: { message: 'hello' } },
        'broadcaster'
      );

      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0].type).toBe('notification');
      expect(receivedMessages[0].sender).toBe('broadcaster');
    });
  });

  describe('sendResponse', () => {
    it('should send a response to a request', async () => {
      const receivedResponses: AgentMessage[] = [];

      messageBus.subscribe('agent:requester-1:inbox', async (msg) => {
        receivedResponses.push(msg);
      });

      const request = createMessage('requester-1', 'query', {
        action: 'test',
        data: { query: 'test' },
      });
      request.correlationId = 'test-correlation-id';
      request.receiver = 'responder-1';

      await messageBus.sendResponse(request, { data: 'response-data' });

      expect(receivedResponses).toHaveLength(1);
      expect(receivedResponses[0].type).toBe('response');
      expect(receivedResponses[0].correlationId).toBe('test-correlation-id');
    });

    it('should throw error if no correlation ID', async () => {
      const request = createMessage('requester-1', 'query', {
        action: 'test',
        data: { query: 'test' },
      });

      await expect(messageBus.sendResponse(request, {})).rejects.toThrow(
        'Cannot send response: original message has no correlation ID'
      );
    });
  });

  describe('getMessageHistory', () => {
    it('should return message history', async () => {
      const message1 = createMessage('sender-1', 'notification', { action: 'test1' });
      const message2 = createMessage('sender-1', 'notification', { action: 'test2' });

      await messageBus.publish('topic1', message1);
      await messageBus.publish('topic1', message2);

      const history = messageBus.getMessageHistory();

      expect(history).toHaveLength(2);
      expect(history[0].payload.action).toBe('test1');
      expect(history[1].payload.action).toBe('test2');
    });

    it('should limit history size', async () => {
      for (let i = 0; i < 150; i++) {
        const message = createMessage('sender-1', 'notification', { action: `test-${i}` });
        await messageBus.publish('topic1', message);
      }

      const history = messageBus.getMessageHistory(100);
      expect(history).toHaveLength(100);
    });
  });

  describe('addMessageListener', () => {
    it('should call registered listeners on message publish', async () => {
      const listener = vi.fn();
      messageBus.addMessageListener(listener);

      const message = createMessage('sender-1', 'notification', { action: 'test' });
      await messageBus.publish('topic1', message);

      expect(listener).toHaveBeenCalledWith(message);
    });

    it('should remove listener when removed', async () => {
      const listener = vi.fn();
      messageBus.addMessageListener(listener);
      messageBus.removeMessageListener(listener);

      const message = createMessage('sender-1', 'notification', { action: 'test' });
      await messageBus.publish('topic1', message);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getQueuedMessages', () => {
    it('should return queued messages when persistence is enabled', async () => {
      const persistingBus = new MessageBus({ persistMessages: true });

      const message = createMessage('sender-1', 'notification', { action: 'test' });
      await persistingBus.publish('topic1', message);

      const queued = persistingBus.getQueuedMessages();

      expect(queued).toHaveLength(1);
      expect(queued[0].messageId).toBe(message.id);

      persistingBus.clearQueue();
    });
  });

  describe('createMessage', () => {
    it('should create a message with default values', () => {
      const message = createMessage('sender-1', 'notification', {
        action: 'test',
        data: { value: 42 },
      });

      expect(message.id).toBeDefined();
      expect(message.sender).toBe('sender-1');
      expect(message.type).toBe('notification');
      expect(message.payload.action).toBe('test');
      expect(message.payload.data).toEqual({ value: 42 });
      expect(message.status).toBe('pending');
      expect(message.timestamp).toBeDefined();
    });

    it('should override default values with options', () => {
      const message = createMessage(
        'sender-1',
        'task',
        { action: 'test' },
        {
          receiver: 'receiver-1',
          topic: 'custom-topic',
          correlationId: 'custom-correlation',
          status: 'sent',
        }
      );

      expect(message.type).toBe('task');
      expect(message.receiver).toBe('receiver-1');
      expect(message.topic).toBe('custom-topic');
      expect(message.correlationId).toBe('custom-correlation');
      expect(message.status).toBe('sent');
    });
  });
});
