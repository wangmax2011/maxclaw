// E10: Agent Protocol - Agent Runtime
// Manages agent registration, lifecycle, and message routing

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { MessageBus, createMessage } from './message-bus.js';
import type {
  AgentInfo,
  AgentMessage,
  AgentStatus,
  MessageHandler,
  MessagePayload,
  RequestResponseResult,
  AgentDiscoveryResult,
} from './types.js';

/**
 * Agent runtime configuration
 */
export interface AgentRuntimeOptions {
  /** Enable auto-discovery */
  enableDiscovery?: boolean;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Message bus instance (uses default if not provided) */
  messageBus?: MessageBus;
}

/**
 * Agent interface that all agents must implement
 */
export interface IAgent {
  /** Unique agent identifier */
  readonly id: string;
  /** Agent name */
  readonly name: string;
  /** Agent description */
  readonly description?: string;
  /** Agent capabilities */
  readonly capabilities: string[];

  /** Initialize the agent */
  initialize(): Promise<void>;

  /** Handle incoming message */
  handleMessage(message: AgentMessage): Promise<unknown>;

  /** Shutdown the agent */
  shutdown(): Promise<void>;
}

/**
 * Agent wrapper for runtime management
 */
interface AgentWrapper {
  /** Agent instance */
  agent: IAgent;
  /** Agent info */
  info: AgentInfo;
  /** Inbox topic subscription ID */
  inboxSubscriptionId?: string;
  /** Broadcast subscription IDs */
  broadcastSubscriptionIds: string[];
  /** Is agent initialized */
  initialized: boolean;
}

/**
 * Agent Runtime - manages agent lifecycle and message routing
 */
export class AgentRuntime {
  /** Registered agents */
  private agents: Map<string, AgentWrapper> = new Map();

  /** Message bus instance */
  private messageBus: MessageBus;

  /** Heartbeat interval */
  private heartbeatInterval: number;

  /** Heartbeat timer */
  private heartbeatTimer?: NodeJS.Timeout;

  /** Is runtime running */
  private isRunning = false;

  constructor(options: AgentRuntimeOptions = {}) {
    this.messageBus = options.messageBus ?? new MessageBus();
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;

    logger.info('AgentRuntime initialized with heartbeat interval: %dms', this.heartbeatInterval);
  }

  /**
   * Register an agent with the runtime
   * @param agent - Agent instance to register
   * @param subscriptions - Topics to subscribe to
   * @returns Agent info
   */
  async registerAgent(
    agent: IAgent,
    subscriptions: string[] = []
  ): Promise<AgentInfo> {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} is already registered`);
    }

    const agentInfo: AgentInfo = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: 'idle',
      subscriptions,
      capabilities: agent.capabilities,
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };

    const wrapper: AgentWrapper = {
      agent,
      info: agentInfo,
      broadcastSubscriptionIds: [],
      initialized: false,
    };

    // Subscribe to agent's inbox
    const inboxTopic = `agent:${agent.id}:inbox`;
    const inboxHandler = async (message: AgentMessage) => {
      await this.routeMessageToAgent(agent.id, message);
    };
    wrapper.inboxSubscriptionId = this.messageBus.subscribe(inboxTopic, inboxHandler, agent.id);
    logger.info('Subscribed agent %s to inbox topic: %s', agent.id, inboxTopic);

    // Subscribe to broadcast topics
    for (const topic of subscriptions) {
      const subscriptionId = this.messageBus.subscribe(topic, inboxHandler, `${agent.id}:${topic}`);
      wrapper.broadcastSubscriptionIds.push(subscriptionId);
      logger.info('Subscribed agent %s to broadcast topic: %s', agent.id, topic);
    }

    this.agents.set(agent.id, wrapper);
    logger.info('Agent %s (%s) registered successfully', agent.id, agent.name);

    // Initialize the agent
    await this.initializeAgent(agent.id);

    return agentInfo;
  }

  /**
   * Unregister an agent from the runtime
   * @param agentId - Agent ID to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const wrapper = this.agents.get(agentId);
    if (!wrapper) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Shutdown the agent first
    if (wrapper.initialized) {
      await this.shutdownAgent(agentId);
    }

    // Unsubscribe from inbox
    if (wrapper.inboxSubscriptionId) {
      const inboxTopic = `agent:${agentId}:inbox`;
      this.messageBus.unsubscribe(inboxTopic, wrapper.inboxSubscriptionId);
    }

    // Unsubscribe from broadcast topics
    for (const topic of wrapper.info.subscriptions) {
      const subscriptionId = wrapper.broadcastSubscriptionIds.shift();
      if (subscriptionId) {
        this.messageBus.unsubscribe(topic, subscriptionId);
      }
    }

    this.agents.delete(agentId);
    logger.info('Agent %s unregistered', agentId);
  }

  /**
   * Initialize an agent
   * @param agentId - Agent ID to initialize
   */
  async initializeAgent(agentId: string): Promise<void> {
    const wrapper = this.agents.get(agentId);
    if (!wrapper) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (wrapper.initialized) {
      logger.debug('Agent %s is already initialized', agentId);
      return;
    }

    try {
      wrapper.info.status = 'busy';
      await wrapper.agent.initialize();
      wrapper.initialized = true;
      wrapper.info.status = 'idle';
      logger.info('Agent %s initialized successfully', agentId);
    } catch (error) {
      wrapper.info.status = 'error';
      logger.error('Failed to initialize agent %s: %s', agentId, error);
      throw error;
    }
  }

  /**
   * Shutdown an agent
   * @param agentId - Agent ID to shutdown
   */
  async shutdownAgent(agentId: string): Promise<void> {
    const wrapper = this.agents.get(agentId);
    if (!wrapper) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!wrapper.initialized) {
      logger.debug('Agent %s is not initialized', agentId);
      return;
    }

    try {
      wrapper.info.status = 'busy';
      await wrapper.agent.shutdown();
      wrapper.initialized = false;
      wrapper.info.status = 'offline';
      logger.info('Agent %s shutdown successfully', agentId);
    } catch (error) {
      wrapper.info.status = 'error';
      logger.error('Failed to shutdown agent %s: %s', agentId, error);
      throw error;
    }
  }

  /**
   * Route a message to an agent
   * @param agentId - Target agent ID
   * @param message - Message to route
   */
  private async routeMessageToAgent(agentId: string, message: AgentMessage): Promise<void> {
    const wrapper = this.agents.get(agentId);
    if (!wrapper) {
      logger.warn('Cannot route message to unknown agent: %s', agentId);
      return;
    }

    if (!wrapper.initialized) {
      logger.warn('Agent %s is not initialized, cannot route message', agentId);
      return;
    }

    try {
      wrapper.info.status = 'busy';
      wrapper.info.lastHeartbeat = new Date().toISOString();

      const result = await wrapper.agent.handleMessage(message);

      // Send response if this was a request
      if (message.correlationId && message.type === 'query') {
        await this.messageBus.sendResponse(message, result);
      }

      wrapper.info.status = 'idle';
      logger.debug('Message %s processed by agent %s', message.id, agentId);
    } catch (error) {
      wrapper.info.status = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Agent %s failed to handle message: %s', agentId, errorMessage);

      // Send error response if this was a request
      if (message.correlationId) {
        await this.messageBus.sendErrorResponse(message, errorMessage);
      }

      // Attempt to recover
      try {
        await wrapper.agent.initialize();
        wrapper.info.status = 'idle';
      } catch (recoveryError) {
        logger.error('Failed to recover agent %s: %s', agentId, recoveryError);
        wrapper.info.status = 'error';
      }
    }
  }

  /**
   * Send a message to an agent
   * @param targetId - Target agent ID
   * @param payload - Message payload
   * @param senderId - Sender agent ID
   * @param type - Message type
   * @returns Promise resolving to result
   */
  async sendMessage<T, R>(
    targetId: string,
    payload: MessagePayload<T>,
    senderId: string,
    type: 'task' | 'query' | 'notification' = 'notification'
  ): Promise<RequestResponseResult<R> | void> {
    const wrapper = this.agents.get(targetId);
    if (!wrapper) {
      return {
        success: false,
        error: `Agent ${targetId} not found`,
        responseTime: 0,
      };
    }

    const message = createMessage<T>(senderId, type, payload, {
      receiver: targetId,
    });

    if (type === 'query' || type === 'task') {
      // Request-response pattern
      return this.messageBus.requestResponse<T, R>(targetId, message);
    } else {
      // One-way notification
      const topic = `agent:${targetId}:inbox`;
      await this.messageBus.publish(topic, message);
    }
  }

  /**
   * Broadcast a message to all agents subscribed to a topic
   * @param topic - Topic to broadcast to
   * @param payload - Message payload
   * @param senderId - Sender agent ID
   */
  async broadcast<T>(topic: string, payload: MessagePayload<T>, senderId: string): Promise<void> {
    await this.messageBus.broadcast(topic, payload, senderId);
    logger.info('Broadcast message to topic %s from agent %s', topic, senderId);
  }

  /**
   * Discover available agents
   * @param filter - Optional filter by capability
   * @returns Discovery result
   */
  discoverAgents(filter?: { capability?: string; status?: AgentStatus }): AgentDiscoveryResult {
    let agents = Array.from(this.agents.values()).map((w) => w.info);

    if (filter?.capability) {
      agents = agents.filter((a) => a.capabilities.includes(filter.capability!));
    }

    if (filter?.status) {
      agents = agents.filter((a) => a.status === filter.status!);
    }

    return {
      agents,
      discoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Get agent info by ID
   * @param agentId - Agent ID
   * @returns Agent info or null if not found
   */
  getAgentInfo(agentId: string): AgentInfo | null {
    const wrapper = this.agents.get(agentId);
    return wrapper?.info ?? null;
  }

  /**
   * Get all registered agents
   * @returns Array of agent info
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((w) => w.info);
  }

  /**
   * Get agent by name
   * @param name - Agent name
   * @returns Agent info or null if not found
   */
  getAgentByName(name: string): AgentInfo | null {
    for (const wrapper of this.agents.values()) {
      if (wrapper.info.name === name) {
        return wrapper.info;
      }
    }
    return null;
  }

  /**
   * Start the runtime (begin heartbeats)
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('AgentRuntime is already running');
      return;
    }

    this.isRunning = true;
    this.startHeartbeat();
    logger.info('AgentRuntime started');
  }

  /**
   * Stop the runtime
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.stopHeartbeat();

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.keys()).map((id) =>
      this.unregisterAgent(id).catch((error) => {
        logger.error('Error shutting down agent %s: %s', id, error);
      })
    );

    await Promise.allSettled(shutdownPromises);

    this.isRunning = false;
    logger.info('AgentRuntime stopped');
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.heartbeatInterval);

    logger.debug('Heartbeat timer started with interval %dms', this.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
      logger.debug('Heartbeat timer stopped');
    }
  }

  /**
   * Perform heartbeat - update lastHeartbeat for all agents
   */
  private performHeartbeat(): void {
    for (const [agentId, wrapper] of this.agents.entries()) {
      if (wrapper.initialized && wrapper.info.status !== 'error') {
        wrapper.info.lastHeartbeat = new Date().toISOString();
        logger.debug('Heartbeat for agent %s', agentId);
      }
    }
  }

  /**
   * Get the message bus instance
   */
  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  /**
   * Get runtime statistics
   */
  getStats(): {
    totalAgents: number;
    initializedAgents: number;
    activeAgents: number;
    errorAgents: number;
    messageQueueSize: number;
    pendingRequests: number;
  } {
    const agents = Array.from(this.agents.values());
    return {
      totalAgents: agents.length,
      initializedAgents: agents.filter((a) => a.initialized).length,
      activeAgents: agents.filter((a) => a.info.status === 'idle' || a.info.status === 'busy').length,
      errorAgents: agents.filter((a) => a.info.status === 'error').length,
      messageQueueSize: this.messageBus.getQueueSize(),
      pendingRequests: this.messageBus.getPendingRequestCount(),
    };
  }
}

/**
 * Base agent class that can be extended
 */
export abstract class BaseAgent implements IAgent {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: string[];

  constructor(config: {
    id?: string;
    name: string;
    description?: string;
    capabilities: string[];
  }) {
    this.id = config.id ?? uuidv4();
    this.name = config.name;
    this.description = config.description;
    this.capabilities = config.capabilities;
  }

  abstract initialize(): Promise<void>;
  abstract handleMessage(message: AgentMessage): Promise<unknown>;
  abstract shutdown(): Promise<void>;
}

/**
 * Default agent runtime instance
 */
export const defaultAgentRuntime = new AgentRuntime();

// Re-export createMessage from message-bus for convenience
export { createMessage } from './message-bus.js';
