// EPIC-006: Session Queue Manager
// Manages session queuing when resource limits are reached

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { getProject } from '../db.js';
import type {
  QueueItem,
  SessionOptions,
} from './types.js';

/**
 * Session Queue Manager
 * Handles queuing of sessions when limits are reached
 */
export class SessionQueue extends EventEmitter {
  private queue: Map<string, QueueItem>;
  private processedQueue: Map<string, QueueItem>; // Recently processed items
  private maxQueueSize: number;
  private maxProcessedHistory: number;

  constructor(maxQueueSize: number = 100, maxProcessedHistory: number = 50) {
    super();
    this.queue = new Map();
    this.processedQueue = new Map();
    this.maxQueueSize = maxQueueSize;
    this.maxProcessedHistory = maxProcessedHistory;
  }

  /**
   * Add a session to the queue
   */
  enqueue(
    projectId: string,
    priority: number = 3,
    options?: SessionOptions
  ): QueueItem | null {
    // Check queue size limit
    if (this.queue.size >= this.maxQueueSize) {
      logger.warn('Session queue is full, rejecting new entries');
      return null;
    }

    const project = getProject(projectId);
    if (!project) {
      logger.error('Project not found: %s', projectId);
      return null;
    }

    const queueItem: QueueItem = {
      id: randomUUID(),
      projectId,
      projectName: project.name,
      requestedAt: new Date().toISOString(),
      priority,
      options,
      status: 'queued',
      position: this.queue.size + 1,
    };

    this.queue.set(queueItem.id, queueItem);
    this.updatePositions();

    logger.info('Session queued: %s (project: %s, position: %d)',
      queueItem.id, project.name, queueItem.position ?? 1);

    this.emit('item:queued', queueItem);

    return queueItem;
  }

  /**
   * Get the next item from the queue (highest priority, oldest first)
   */
  dequeue(): QueueItem | null {
    if (this.queue.size === 0) {
      return null;
    }

    // Find highest priority item (among those with same priority, oldest first)
    let nextItem: QueueItem | null = null;
    let highestPriority = -1;

    for (const item of this.queue.values()) {
      if (item.priority > highestPriority ||
          (item.priority === highestPriority &&
           (!nextItem || item.requestedAt < nextItem.requestedAt))) {
        highestPriority = item.priority;
        nextItem = item;
      }
    }

    if (!nextItem) {
      return null;
    }

    this.queue.delete(nextItem.id);
    nextItem.status = 'running';
    nextItem.position = undefined;

    // Add to processed history
    this.addToProcessed(nextItem);

    this.updatePositions();

    logger.info('Session dequeued: %s (priority: %d)', nextItem.id, highestPriority);
    this.emit('item:dequeued', nextItem);

    return nextItem;
  }

  /**
   * Cancel a queued item
   */
  cancel(itemId: string): boolean {
    const item = this.queue.get(itemId);

    if (!item) {
      logger.warn('Queued item not found: %s', itemId);
      return false;
    }

    item.status = 'cancelled';
    this.queue.delete(itemId);
    this.updatePositions();

    // Add to processed history
    this.addToProcessed(item);

    logger.info('Queued item cancelled: %s', itemId);
    this.emit('item:cancelled', itemId);

    return true;
  }

  /**
   * Mark an item as completed
   */
  complete(itemId: string): void {
    const item = this.queue.get(itemId);

    if (item) {
      item.status = 'completed';
      this.queue.delete(itemId);
      this.addToProcessed(item);
    }
  }

  /**
   * Get queue position for an item
   */
  getPosition(itemId: string): number | undefined {
    const item = this.queue.get(itemId);
    return item?.position;
  }

  /**
   * List all queued items
   */
  listQueue(): QueueItem[] {
    return Array.from(this.queue.values())
      .sort((a, b) => {
        // Sort by priority (descending), then by requestedAt (ascending)
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      });
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    totalQueued: number;
    byPriority: Map<number, number>;
    averageWaitTime: number; // milliseconds
  } {
    const byPriority = new Map<number, number>();
    let totalWaitTime = 0;

    for (const item of this.queue.values()) {
      byPriority.set(item.priority, (byPriority.get(item.priority) ?? 0) + 1);
      totalWaitTime += Date.now() - new Date(item.requestedAt).getTime();
    }

    return {
      totalQueued: this.queue.size,
      byPriority,
      averageWaitTime: this.queue.size > 0
        ? Math.round(totalWaitTime / this.queue.size)
        : 0,
    };
  }

  /**
   * Update positions after queue change
   */
  private updatePositions(): void {
    // Sort queue to determine positions
    const sorted = Array.from(this.queue.values())
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      });

    sorted.forEach((item, index) => {
      item.position = index + 1;
    });
  }

  /**
   * Add item to processed history
   */
  private addToProcessed(item: QueueItem): void {
    this.processedQueue.set(item.id, item);

    // Trim old entries
    if (this.processedQueue.size > this.maxProcessedHistory) {
      const oldestId = this.processedQueue.keys().next().value;
      if (oldestId) {
        this.processedQueue.delete(oldestId);
      }
    }
  }

  /**
   * Get recently processed items
   */
  getProcessedHistory(): QueueItem[] {
    return Array.from(this.processedQueue.values())
      .sort((a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      );
  }

  /**
   * Clear the queue
   */
  clear(): void {
    const cancelledCount = this.queue.size;

    for (const item of this.queue.values()) {
      item.status = 'cancelled';
    }

    this.queue.clear();
    logger.info('Session queue cleared, %d items cancelled', cancelledCount);
    this.emit('queue:cleared');
  }
}
