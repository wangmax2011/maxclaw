// EPIC-006: Resource Monitor
// Monitors system resources and provides throttle recommendations

import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import {
  ResourceMetrics,
  ResourceConstraints,
  ThrottleState,
  DEFAULT_RESOURCE_CONSTRAINTS,
} from './types.js';

/**
 * Resource Monitor
 * Monitors CPU and memory usage, provides throttle recommendations
 */
export class ResourceMonitor extends EventEmitter {
  private constraints: ResourceConstraints;
  private currentMetrics: ResourceMetrics | null;
  private monitorInterval?: NodeJS.Timeout;
  private throttleState: ThrottleState;
  private enabled: boolean;

  constructor(constraints: Partial<ResourceConstraints> = {}) {
    super();
    this.constraints = { ...DEFAULT_RESOURCE_CONSTRAINTS, ...constraints };
    this.currentMetrics = null;
    this.throttleState = 'none';
    this.enabled = true;
  }

  /**
   * Start resource monitoring
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      logger.info('Resource monitoring is disabled');
      return;
    }

    logger.info('Starting resource monitoring (interval: %dms)', this.constraints.checkIntervalMs);

    // Initial metrics collection
    await this.collectMetrics();

    // Start periodic collection
    this.monitorInterval = setInterval(
      () => this.collectMetrics(),
      this.constraints.checkIntervalMs
    );
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    logger.info('Resource monitoring stopped');
  }

  /**
   * Collect current system metrics
   */
  async collectMetrics(): Promise<ResourceMetrics> {
    try {
      // Get CPU usage (approximate via load average on Unix)
      const cpuUsage = await this.getCpuUsage();

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory = this.getTotalMemory();
      const memoryPercent = (memoryUsage.heapUsed / totalMemory) * 100;

      // Get active process count (simplified)
      const activeProcesses = 1; // Current process

      const metrics: ResourceMetrics = {
        cpuUsage,
        memoryUsage: memoryUsage.heapUsed,
        memoryTotal: totalMemory,
        memoryPercent,
        activeProcesses,
        timestamp: new Date().toISOString(),
      };

      this.currentMetrics = metrics;
      this.updateThrottleState(metrics);

      return metrics;
    } catch (error) {
      logger.error('Failed to collect metrics: %s', error);

      // Return default metrics on error
      const defaultMetrics: ResourceMetrics = {
        cpuUsage: 0,
        memoryUsage: 0,
        memoryTotal: this.getTotalMemory(),
        memoryPercent: 0,
        activeProcesses: 1,
        timestamp: new Date().toISOString(),
      };

      this.currentMetrics = defaultMetrics;
      return defaultMetrics;
    }
  }

  /**
   * Get CPU usage percentage
   */
  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      try {
        // Use os.loadavg() on Unix systems for a quick approximation
        const os = require('os');

        if (typeof os.loadavg === 'function') {
          const load = os.loadavg()[0]; // 1-minute load average
          const cpus = os.cpus()?.length || 1;
          const usage = Math.min(100, (load / cpus) * 100);
          resolve(usage);
        } else {
          // Fallback for Windows or systems without loadavg
          resolve(0);
        }
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Get total system memory in bytes
   */
  private getTotalMemory(): number {
    try {
      const os = require('os');
      return os.totalmem();
    } catch {
      return 8 * 1024 * 1024 * 1024; // Default to 8GB
    }
  }

  /**
   * Update throttle state based on metrics
   */
  private updateThrottleState(metrics: ResourceMetrics): void {
    const prevState = this.throttleState;
    let newState: ThrottleState = 'none';

    const cpuOverThreshold = metrics.cpuUsage > this.constraints.maxCpuPercent;
    const memoryOverThreshold = metrics.memoryPercent > this.constraints.maxMemoryPercent;

    if (cpuOverThreshold && memoryOverThreshold) {
      newState = 'blocked';
    } else if (cpuOverThreshold || memoryOverThreshold) {
      newState = 'throttled';
    } else if (
      metrics.cpuUsage > this.constraints.maxCpuPercent * 0.8 ||
      metrics.memoryPercent > this.constraints.maxMemoryPercent * 0.8
    ) {
      newState = 'warning';
    }

    if (prevState !== newState) {
      this.throttleState = newState;
      logger.info('Throttle state changed: %s -> %s', prevState, newState);
      this.emit('throttle:change', newState, metrics);
    }
  }

  /**
   * Get current throttle state
   */
  getThrottleState(): ThrottleState {
    return this.throttleState;
  }

  /**
   * Check if new sessions can be started
   */
  canStartSession(): boolean {
    return this.throttleState !== 'blocked' && this.throttleState !== 'throttled';
  }

  /**
   * Get current metrics
   */
  getMetrics(): ResourceMetrics | null {
    return this.currentMetrics;
  }

  /**
   * Get resource status summary
   */
  getStatus(): {
    state: ThrottleState;
    cpuPercent: number;
    memoryPercent: number;
    canStartSession: boolean;
  } {
    return {
      state: this.throttleState,
      cpuPercent: this.currentMetrics?.cpuUsage ?? 0,
      memoryPercent: this.currentMetrics?.memoryPercent ?? 0,
      canStartSession: this.canStartSession(),
    };
  }

  /**
   * Enable resource monitoring
   */
  enable(): void {
    this.enabled = true;
    logger.info('Resource monitoring enabled');
  }

  /**
   * Disable resource monitoring
   */
  disable(): void {
    this.enabled = false;
    this.throttleState = 'none';
    logger.info('Resource monitoring disabled');
  }
}
