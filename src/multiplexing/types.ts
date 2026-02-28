// EPIC-006: Multi-plexing Types

import type { Session } from '../types.js';

/**
 * Multiplexing configuration
 */
export interface MultiplexingConfig {
  maxConcurrentSessions: number;  // Maximum concurrent sessions system-wide
  maxSessionsPerProject: number;  // Maximum sessions per single project
  sessionTimeout: number;         // Session timeout in milliseconds
  queueEnabled: boolean;          // Enable session queuing
  resourceMonitorEnabled: boolean; // Enable resource monitoring
}

/**
 * Default multiplexing configuration
 */
export const DEFAULT_MULTIPLEXING_CONFIG: MultiplexingConfig = {
  maxConcurrentSessions: 5,
  maxSessionsPerProject: 2,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  queueEnabled: true,
  resourceMonitorEnabled: true,
};

/**
 * Session pool status
 */
export interface SessionPoolStatus {
  activeSessions: number;
  maxConcurrentSessions: number;
  availableSlots: number;
  utilizationPercent: number;
  sessionsByProject: Map<string, number>;
}

/**
 * Session queue item
 */
export interface QueueItem {
  id: string;
  projectId: string;
  projectName: string;
  requestedAt: string;
  priority: number;  // 1-5, 5 being highest
  options?: SessionOptions;
  status: 'queued' | 'running' | 'cancelled' | 'completed';
  position?: number;
}

/**
 * Session options
 */
export interface SessionOptions {
  allowedTools?: string[];
  initialPrompt?: string;
  workspaceId?: string;
  profileName?: string;
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
  cpuUsage: number;       // Percentage (0-100)
  memoryUsage: number;    // Bytes
  memoryTotal: number;    // Bytes
  memoryPercent: number;  // Percentage (0-100)
  activeProcesses: number;
  timestamp: string;
}

/**
 * Resource constraints
 */
export interface ResourceConstraints {
  maxCpuPercent: number;      // Throttle above this
  maxMemoryPercent: number;   // Throttle above this
  checkIntervalMs: number;    // How often to check
}

/**
 * Default resource constraints
 */
export const DEFAULT_RESOURCE_CONSTRAINTS: ResourceConstraints = {
  maxCpuPercent: 80,
  maxMemoryPercent: 80,
  checkIntervalMs: 5000,  // 5 seconds
};

/**
 * Session allocation result
 */
export interface AllocationResult {
  allocated: boolean;
  reason?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;  // milliseconds
}

/**
 * Resource throttle state
 */
export type ThrottleState = 'none' | 'warning' | 'throttled' | 'blocked';
