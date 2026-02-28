// E10: Agent Protocol - Type Definitions
// Reference: Actor Model inspired message types for inter-agent communication

/**
 * Message types for agent communication
 */
export type MessageType =
  | 'task'        // Task execution request
  | 'query'       // Information request
  | 'response'    // Response to a query or task
  | 'notification' // One-way notification
  | 'error';      // Error message

/**
 * Agent status enumeration
 */
export type AgentStatus =
  | 'idle'       // Agent is available
  | 'busy'       // Agent is processing
  | 'offline'    // Agent is not available
  | 'error';     // Agent encountered an error

/**
 * Message header for metadata
 */
export interface MessageHeader {
  /** Message priority (1-5, 5 being highest) */
  priority?: number;
  /** Require acknowledgment */
  requireAck?: boolean;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Custom headers */
  [key: string]: unknown;
}

/**
 * Message payload structure
 */
export interface MessagePayload<T = unknown> {
  /** Action or command to execute */
  action?: string;
  /** Data associated with the message */
  data?: T;
  /** Additional parameters */
  params?: Record<string, unknown>;
}

/**
 * Agent message interface - core message structure
 */
export interface AgentMessage<T = unknown> {
  /** Unique message identifier */
  id: string;
  /** Type of message */
  type: MessageType;
  /** Sender agent ID */
  sender: string;
  /** Target agent ID (undefined for broadcast) */
  receiver?: string;
  /** Message topic/channel */
  topic?: string;
  /** Message payload */
  payload: MessagePayload<T>;
  /** Message headers */
  headers?: MessageHeader;
  /** Correlation ID for request-response pairing */
  correlationId?: string;
  /** Message creation timestamp */
  timestamp: string;
  /** Message status */
  status?: MessageStatus;
}

/**
 * Agent registration information
 */
export interface AgentInfo {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Agent status */
  status: AgentStatus;
  /** Topics this agent subscribes to */
  subscriptions: string[];
  /** Capabilities offered by this agent */
  capabilities: string[];
  /** Registration timestamp */
  registeredAt: string;
  /** Last heartbeat timestamp */
  lastHeartbeat?: string;
  /** Agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Message handler function type
 */
export type MessageHandler<T = unknown> = (message: AgentMessage<T>) => Promise<unknown> | unknown;

/**
 * Request-response result
 */
export interface RequestResponseResult<T = unknown> {
  /** Success status */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Response time in milliseconds */
  responseTime: number;
}

/**
 * Message delivery status
 */
export interface MessageDeliveryStatus {
  /** Message ID */
  messageId: string;
  /** Current status */
  status: MessageStatus;
  /** Delivered timestamp */
  deliveredAt?: string;
  /** Read timestamp */
  readAt?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Message status enumeration
 */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Agent discovery result
 */
export interface AgentDiscoveryResult {
  /** Found agents */
  agents: AgentInfo[];
  /** Discovery timestamp */
  discoveredAt: string;
}

/**
 * Message queue item for persistence
 */
export interface QueuedMessage {
  /** Queue item ID */
  id: string;
  /** Message ID reference */
  messageId: string;
  /** Message type */
  type: MessageType;
  /** Sender agent ID */
  sender: string;
  /** Receiver agent ID */
  receiver?: string;
  /** Topic/channel */
  topic?: string;
  /** Serialized payload */
  payload: string;
  /** Serialized headers */
  headers: string;
  /** Current status */
  status: MessageStatus;
  /** Created timestamp */
  createdAt: string;
  /** Delivered timestamp */
  deliveredAt?: string;
  /** Read timestamp */
  readAt?: string;
}
