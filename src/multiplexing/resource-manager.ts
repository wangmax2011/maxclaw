// EPIC-006: Resource Manager
// Combines session pool, queue, and resource monitoring

import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import { SessionPool } from './session-pool.js';
import { SessionQueue } from './session-queue.js';
import { ResourceMonitor } from './resource-monitor.js';
import type { Session } from '../types.js';
import type {
  MultiplexingConfig,
  ResourceConstraints,
  AllocationResult,
  QueueItem,
  SessionOptions,
} from './types.js';

/**
 * Resource Manager
 * Combines session pool, queue, and resource monitoring
 */
export class ResourceManager extends EventEmitter {
  private pool: SessionPool;
  private queue: SessionQueue;
  private monitor: ResourceMonitor;
  private started: boolean;

  constructor(
    poolConfig: Partial<MultiplexingConfig> = {},
    resourceConfig: Partial<ResourceConstraints> = {}
  ) {
    super();
    this.pool = new SessionPool(poolConfig);
    this.queue = new SessionQueue();
    this.monitor = new ResourceMonitor(resourceConfig);
    this.started = false;
  }

  /**
   * Initialize and start the resource manager
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn('Resource manager already started');
      return;
    }

    logger.info('Starting resource manager...');

    // Initialize session pool from database
    await this.pool.initialize();

    // Start resource monitoring
    await this.monitor.start();

    // Wire up event handlers
    this.setupEventHandlers();

    this.started = true;
    logger.info('Resource manager started');
  }

  /**
   * Stop the resource manager
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    logger.info('Stopping resource manager...');

    this.monitor.stop();
    this.queue.clear();
    this.pool.clear();

    this.started = false;
    logger.info('Resource manager stopped');
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle throttle state changes
    this.monitor.on('throttle:change', (state, metrics) => {
      this.emit('throttle:change', state, metrics);
    });

    // Handle pool events
    this.pool.on('session:allocated', (session) => {
      this.emit('session:allocated', session);
      this.processQueue();
    });

    this.pool.on('session:released', (sessionId) => {
      this.emit('session:released', sessionId);
      this.processQueue();
    });

    // Handle queue events
    this.queue.on('item:queued', (item) => {
      this.emit('queue:item:queued', item);
    });

    this.queue.on('item:dequeued', (item) => {
      this.emit('queue:item:dequeued', item);
    });

    this.queue.on('item:cancelled', (itemId) => {
      this.emit('queue:item:cancelled', itemId);
    });
  }

  /**
   * Request a session slot (with queuing if needed)
   */
  requestSession(
    projectId: string,
    priority: number = 3,
    options?: SessionOptions
  ): AllocationResult & { queueItem?: QueueItem } {
    // Check if we can allocate
    const allocation = this.pool.canAllocateSession(projectId);

    if (!allocation.allocated) {
      // Check if queue is enabled
      const poolConfig = this.pool.getConfig();
      if (!poolConfig.queueEnabled) {
        return allocation;
      }

      // Check resource constraints
      if (!this.monitor.canStartSession()) {
        return {
          allocated: false,
          reason: `System resources constrained (throttle state: ${this.monitor.getThrottleState()})`,
          queuePosition: 1,
        };
      }

      // Add to queue
      const queueItem = this.queue.enqueue(projectId, priority, options);

      if (!queueItem) {
        return {
          allocated: false,
          reason: 'Session queue is full',
        };
      }

      return {
        allocated: false,
        reason: 'Added to session queue',
        queuePosition: queueItem.position,
        queueItem,
      };
    }

    return allocation;
  }

  /**
   * Allocate a session slot
   */
  allocateSession(session: Session): boolean {
    // First check resource constraints
    if (!this.monitor.canStartSession()) {
      logger.warn('Cannot allocate session: resources constrained');
      return false;
    }

    // Allocate in pool
    const success = this.pool.allocateSession(session);

    if (success) {
      logger.info('Session allocated: %s', session.id);
    }

    return success;
  }

  /**
   * Release a session slot
   */
  releaseSession(sessionId: string): void {
    this.pool.releaseSession(sessionId);
  }

  /**
   * Process the next item in the queue
   */
  private processQueue(): void {
    // Check if we have capacity
    const poolStatus = this.pool.getStatus();
    if (poolStatus.availableSlots === 0) {
      return;
    }

    // Check resource constraints
    if (!this.monitor.canStartSession()) {
      logger.debug('Skipping queue processing: resources constrained');
      return;
    }

    // Get next item from queue
    const nextItem = this.queue.dequeue();

    if (nextItem) {
      logger.info('Processing queued session request: %s (project: %s)',
        nextItem.id, nextItem.projectName);
      this.emit('queue:process', nextItem);
    }
  }

  /**
   * Cancel a queued session request
   */
  cancelQueuedSession(itemId: string): boolean {
    return this.queue.cancel(itemId);
  }

  /**
   * Get pool status
   */
  getPoolStatus() {
    return this.pool.getStatus();
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return this.queue.getStats();
  }

  /**
   * Get resource status
   */
  getResourceStatus() {
    return this.monitor.getStatus();
  }

  /**
   * Get full status
   */
  getStatus() {
    return {
      pool: this.getPoolStatus(),
      queue: this.getQueueStatus(),
      resources: this.getResourceStatus(),
      started: this.started,
    };
  }

  /**
   * Get queued items
   */
  getQueuedItems(): QueueItem[] {
    return this.queue.listQueue();
  }

  /**
   * Update pool configuration
   */
  updatePoolConfig(config: Partial<MultiplexingConfig>): void {
    this.pool.updateConfig(config);
  }

  /**
   * Get pool configuration
   */
  getPoolConfig(): MultiplexingConfig {
    return this.pool.getConfig();
  }
}
