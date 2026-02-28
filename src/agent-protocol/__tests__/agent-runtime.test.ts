// E10: Agent Protocol - Agent Runtime Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRuntime, BaseAgent } from '../agent-runtime.js';
import { MessageBus } from '../message-bus.js';
import type { AgentMessage, MessagePayload } from '../types.js';

// Mock agent for testing
class MockAgent extends BaseAgent {
  public readonly initializeHandler: ReturnType<typeof vi.fn>;
  public readonly messageHandler: ReturnType<typeof vi.fn>;
  public readonly shutdownHandler: ReturnType<typeof vi.fn>;

  constructor(
    id: string,
    name: string,
    capabilities: string[] = ['test'],
    initializeHandler?: ReturnType<typeof vi.fn>,
    messageHandler?: ReturnType<typeof vi.fn>,
    shutdownHandler?: ReturnType<typeof vi.fn>
  ) {
    super({
      id,
      name,
      description: 'Mock agent for testing',
      capabilities,
    });

    this.initializeHandler = initializeHandler ?? vi.fn();
    this.messageHandler = messageHandler ?? vi.fn();
    this.shutdownHandler = shutdownHandler ?? vi.fn();
  }

  async initialize(): Promise<void> {
    this.initializeHandler();
  }

  async handleMessage(message: AgentMessage): Promise<unknown> {
    return this.messageHandler(message);
  }

  async shutdown(): Promise<void> {
    this.shutdownHandler();
  }

  // Expose handlers for testing
  getInitializeHandler(): ReturnType<typeof vi.fn> {
    return this.initializeHandler;
  }

  getMessageHandler(): ReturnType<typeof vi.fn> {
    return this.messageHandler;
  }

  getShutdownHandler(): ReturnType<typeof vi.fn> {
    return this.shutdownHandler;
  }
}

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = new MessageBus();
    runtime = new AgentRuntime({
      messageBus,
      heartbeatInterval: 1000,
    });
  });

  afterEach(async () => {
    await runtime.stop();
  });

  describe('constructor', () => {
    it('should create runtime with default options', () => {
      const defaultRuntime = new AgentRuntime();
      expect(defaultRuntime).toBeDefined();
    });

    it('should create runtime with custom options', () => {
      const customRuntime = new AgentRuntime({
        enableDiscovery: true,
        heartbeatInterval: 5000,
      });
      expect(customRuntime).toBeDefined();
    });
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      const agentInfo = await runtime.registerAgent(agent);

      expect(agentInfo).toBeDefined();
      expect(agentInfo.id).toBe('agent-1');
      expect(agentInfo.name).toBe('TestAgent');
      expect(agentInfo.status).toBe('idle');
    });

    it('should subscribe agent to inbox topic', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);

      const topics = messageBus.getAllTopics();
      expect(topics).toContain('agent:agent-1:inbox');
    });

    it('should subscribe agent to broadcast topics', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent', ['test']);

      await runtime.registerAgent(agent, ['broadcast-topic', 'another-topic']);

      const agentInfo = runtime.getAgentInfo('agent-1');
      expect(agentInfo?.subscriptions).toContain('broadcast-topic');
      expect(agentInfo?.subscriptions).toContain('another-topic');
    });

    it('should throw error for duplicate registration', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);

      await expect(runtime.registerAgent(agent)).rejects.toThrow(
        'Agent agent-1 is already registered'
      );
    });

    it('should initialize agent after registration', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);

      expect(agent.getInitializeHandler()).toHaveBeenCalled();
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister an agent successfully', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);
      await runtime.unregisterAgent('agent-1');

      expect(runtime.getAgentInfo('agent-1')).toBeNull();
    });

    it('should shutdown agent before unregistering', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);
      await runtime.unregisterAgent('agent-1');

      expect(agent.getShutdownHandler()).toHaveBeenCalled();
    });

    it('should throw error for unknown agent', async () => {
      await expect(runtime.unregisterAgent('unknown-agent')).rejects.toThrow(
        'Agent unknown-agent not found'
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message to an agent', async () => {
      const receivedMessages: AgentMessage[] = [];

      const agent = new MockAgent('agent-1', 'TestAgent', ['test'], undefined, (msg: AgentMessage) => {
        receivedMessages.push(msg);
        return { received: true };
      });

      await runtime.registerAgent(agent);

      const result = await runtime.sendMessage('agent-1', { action: 'test', data: { value: 42 } }, 'sender-1', 'notification');

      expect(result).toBeUndefined(); // notification doesn't return result
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].payload.action).toBe('test');
    });

    it('should return error for unknown target agent', async () => {
      const result = await runtime.sendMessage(
        'unknown-agent',
        { action: 'test' },
        'sender-1',
        'query'
      );

      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('not found');
    });

    it('should use request-response pattern for query type', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent', ['test'], undefined, (msg: AgentMessage) => {
        return { result: 'success' };
      });

      await runtime.registerAgent(agent);

      const result = await runtime.sendMessage<{ query: string }, { result: string }>(
        'agent-1',
        { action: 'query', data: { query: 'test' } },
        'sender-1',
        'query'
      );

      expect(result?.success).toBe(true);
      expect(result?.data).toEqual({ result: 'success' });
    });
  });

  describe('broadcast', () => {
    it('should broadcast a message to all subscribers', async () => {
      const receivedMessages: AgentMessage[] = [];

      const agent = new MockAgent('agent-1', 'TestAgent', ['test'], undefined, (msg: AgentMessage) => {
        receivedMessages.push(msg);
      });

      await runtime.registerAgent(agent, ['broadcast-topic']);

      await runtime.broadcast('broadcast-topic', { action: 'broadcast' }, 'sender-1');

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].payload.action).toBe('broadcast');
    });
  });

  describe('discoverAgents', () => {
    it('should discover all registered agents', async () => {
      const agent1 = new MockAgent('agent-1', 'TestAgent1');
      const agent2 = new MockAgent('agent-2', 'TestAgent2', ['special']);

      await runtime.registerAgent(agent1);
      await runtime.registerAgent(agent2);

      const result = runtime.discoverAgents();

      expect(result.agents).toHaveLength(2);
      expect(result.agents.map((a) => a.id)).toContain('agent-1');
      expect(result.agents.map((a) => a.id)).toContain('agent-2');
    });

    it('should filter agents by capability', async () => {
      const agent1 = new MockAgent('agent-1', 'TestAgent1', ['common']);
      const agent2 = new MockAgent('agent-2', 'TestAgent2', ['special']);

      await runtime.registerAgent(agent1);
      await runtime.registerAgent(agent2);

      const result = runtime.discoverAgents({ capability: 'special' });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].id).toBe('agent-2');
    });

    it('should filter agents by status', async () => {
      const agent1 = new MockAgent('agent-1', 'TestAgent1');

      await runtime.registerAgent(agent1);

      const result = runtime.discoverAgents({ status: 'idle' });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].id).toBe('agent-1');
    });
  });

  describe('getAgentInfo', () => {
    it('should return agent info by ID', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);

      const info = runtime.getAgentInfo('agent-1');

      expect(info).toBeDefined();
      expect(info?.name).toBe('TestAgent');
    });

    it('should return null for unknown agent', () => {
      const info = runtime.getAgentInfo('unknown-agent');
      expect(info).toBeNull();
    });
  });

  describe('getAllAgents', () => {
    it('should return all registered agents', async () => {
      const agent1 = new MockAgent('agent-1', 'TestAgent1');
      const agent2 = new MockAgent('agent-2', 'TestAgent2');

      await runtime.registerAgent(agent1);
      await runtime.registerAgent(agent2);

      const agents = runtime.getAllAgents();

      expect(agents).toHaveLength(2);
    });

    it('should return empty array when no agents registered', () => {
      const agents = runtime.getAllAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('getAgentByName', () => {
    it('should return agent info by name', async () => {
      const agent = new MockAgent('agent-1', 'UniqueName');

      await runtime.registerAgent(agent);

      const info = runtime.getAgentByName('UniqueName');

      expect(info).toBeDefined();
      expect(info?.id).toBe('agent-1');
    });

    it('should return null for unknown name', () => {
      const info = runtime.getAgentByName('UnknownName');
      expect(info).toBeNull();
    });
  });

  describe('start/stop', () => {
    it('should start the runtime', async () => {
      runtime.start();

      // Give some time for heartbeat
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = runtime.getStats();
      expect(stats).toBeDefined();
    });

    it('should stop the runtime and shutdown all agents', async () => {
      const agent = new MockAgent('agent-1', 'TestAgent');

      await runtime.registerAgent(agent);
      runtime.start();
      await runtime.stop();

      expect(agent.getShutdownHandler()).toHaveBeenCalled();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await runtime.stop();
      await runtime.stop(); // Should not throw
    });
  });

  describe('getStats', () => {
    it('should return runtime statistics', async () => {
      const agent1 = new MockAgent('agent-1', 'TestAgent1');
      const agent2 = new MockAgent('agent-2', 'TestAgent2');

      await runtime.registerAgent(agent1);
      await runtime.registerAgent(agent2);

      const stats = runtime.getStats();

      expect(stats.totalAgents).toBe(2);
      expect(stats.initializedAgents).toBe(2);
      expect(stats.activeAgents).toBeGreaterThanOrEqual(0);
      expect(stats.errorAgents).toBe(0);
    });
  });

  describe('getMessageBus', () => {
    it('should return the message bus instance', () => {
      const bus = runtime.getMessageBus();
      expect(bus).toBe(messageBus);
    });
  });

  describe('BaseAgent', () => {
    it('should create agent with generated ID', () => {
      const agent = new MockAgent('test-id', 'TestAgent');
      expect(agent.id).toBe('test-id');
    });

    it('should create agent with provided capabilities', () => {
      const agent = new MockAgent('test-id', 'TestAgent', ['cap1', 'cap2']);
      expect(agent.capabilities).toEqual(['cap1', 'cap2']);
    });

    it('should have description property', () => {
      const agent = new MockAgent('test-id', 'TestAgent');
      expect(agent.description).toBe('Mock agent for testing');
    });
  });

  describe('Message routing', () => {
    it('should route messages to correct agent', async () => {
      const agent1Messages: AgentMessage[] = [];
      const agent2Messages: AgentMessage[] = [];

      const agent1 = new MockAgent('agent-1', 'TestAgent1', undefined, undefined, (msg: AgentMessage) => {
        agent1Messages.push(msg);
        return { agent: 'agent-1' };
      });

      const agent2 = new MockAgent('agent-2', 'TestAgent2', undefined, undefined, (msg: AgentMessage) => {
        agent2Messages.push(msg);
        return { agent: 'agent-2' };
      });

      await runtime.registerAgent(agent1);
      await runtime.registerAgent(agent2);

      await runtime.sendMessage('agent-1', { action: 'test1' }, 'sender', 'notification');
      await runtime.sendMessage('agent-2', { action: 'test2' }, 'sender', 'notification');

      expect(agent1Messages).toHaveLength(1);
      expect(agent2Messages).toHaveLength(1);
      expect(agent1Messages[0].payload.action).toBe('test1');
      expect(agent2Messages[0].payload.action).toBe('test2');
    });
  });
});
