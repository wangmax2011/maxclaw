// E10: Built-in Agent - Session Summarizer Agent
// Generates AI-powered summaries of coding sessions

import { BaseAgent } from '../src/agent-protocol/agent-runtime.js';
import type { AgentMessage, MessagePayload } from '../src/agent-protocol/types.js';
import { logger } from '../src/logger.js';
import { generateSummary, parseStructuredSummary, formatSummary } from '../src/ai-summarizer.js';
import { listLogEntriesForSession } from '../src/session-logger.js';

/**
 * Summarizer Agent Configuration
 */
export interface SummarizerConfig {
  /** Enable auto-summarization on session end */
  autoSummarize?: boolean;
  /** Default summary model */
  model?: string;
  /** Maximum log entries to include */
  maxLogEntries?: number;
}

/**
 * Summarizer Agent Request Payload
 */
export interface SummarizerRequest {
  /** Session ID to summarize */
  sessionId: string;
  /** Custom prompt (optional) */
  prompt?: string;
  /** Output format: 'raw' | 'structured' | 'formatted' */
  outputFormat?: 'raw' | 'structured' | 'formatted';
}

/**
 * Summarizer Agent Response Payload
 */
export interface SummarizerResponse {
  /** Session ID */
  sessionId: string;
  /** Generated summary */
  summary: string;
  /** Summary status */
  status: 'generated' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Summarizer Agent
 *
 * Capabilities:
 * - Generate session summaries using AI
 * - Support multiple output formats
 * - Handle batch summarization requests
 */
export class SummarizerAgent extends BaseAgent {
  private config: Required<SummarizerConfig>;
  private processedSessions: Set<string> = new Set();

  constructor(config: SummarizerConfig = {}) {
    super({
      name: 'summarizer',
      description: 'AI-powered session summarizer agent that generates concise summaries of coding sessions',
      capabilities: [
        'summarize_session',
        'generate_report',
        'extract_insights',
        'batch_summarize',
      ],
    });

    this.config = {
      autoSummarize: config.autoSummarize ?? true,
      model: config.model ?? 'claude-3-sonnet-20240229',
      maxLogEntries: config.maxLogEntries ?? 100,
    };

    logger.info('SummarizerAgent created with config: %j', this.config);
  }

  async initialize(): Promise<void> {
    logger.info('SummarizerAgent [%s] initialized', this.id);
  }

  async handleMessage(message: AgentMessage): Promise<unknown> {
    const action = message.payload.action;

    logger.debug('SummarizerAgent received message with action: %s', action);

    switch (action) {
      case 'summarize':
        return this.handleSummarizeRequest(message);

      case 'batch_summarize':
        return this.handleBatchSummarizeRequest(message);

      case 'get_status':
        return this.handleStatusRequest(message);

      default:
        logger.warn('Unknown action for SummarizerAgent: %s', action);
        return { error: `Unknown action: ${action}` };
    }
  }

  /**
   * Handle a single session summarization request
   */
  private async handleSummarizeRequest(message: AgentMessage<SummarizerRequest>): Promise<SummarizerResponse> {
    const { sessionId, outputFormat = 'raw' } = message.payload.data ?? {};

    if (!sessionId) {
      return {
        sessionId: '',
        summary: '',
        status: 'failed',
        error: 'Session ID is required',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      // Fetch log entries for the session
      const entries = listLogEntriesForSession(sessionId, this.config.maxLogEntries);

      if (entries.length === 0) {
        return {
          sessionId,
          summary: '',
          status: 'failed',
          error: 'No log entries found for session',
          duration: Date.now() - startTime,
        };
      }

      // Generate summary
      const result = await generateSummary(entries);

      if (result.status === 'failed') {
        return {
          sessionId,
          summary: '',
          status: 'failed',
          error: result.error,
          duration: Date.now() - startTime,
        };
      }

      // Format output based on requested format
      let summary = result.summary;
      if (outputFormat === 'structured') {
        const structured = parseStructuredSummary(result.summary);
        summary = JSON.stringify(structured, null, 2);
      } else if (outputFormat === 'formatted') {
        const structured = parseStructuredSummary(result.summary);
        summary = formatSummary(structured);
      }

      // Mark session as processed
      this.processedSessions.add(sessionId);

      logger.info('Generated summary for session %s (took %dms)', sessionId, Date.now() - startTime);

      return {
        sessionId,
        summary,
        status: 'generated',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to generate summary for session %s: %s', sessionId, errorMessage);

      return {
        sessionId,
        summary: '',
        status: 'failed',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle batch summarization request
   */
  private async handleBatchSummarizeRequest(
    message: AgentMessage<{ sessionIds: string[]; outputFormat?: 'raw' | 'structured' | 'formatted' }>
  ): Promise<{ results: SummarizerResponse[]; totalDuration: number }> {
    const { sessionIds = [], outputFormat = 'raw' } = message.payload.data ?? {};

    const startTime = Date.now();
    const results: SummarizerResponse[] = [];

    for (const sessionId of sessionIds) {
      const requestMessage: AgentMessage<SummarizerRequest> = {
        ...message,
        payload: {
          action: 'summarize',
          data: { sessionId, outputFormat },
        },
      };

      const result = await this.handleSummarizeRequest(requestMessage);
      results.push(result);
    }

    return {
      results,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Handle status request
   */
  private handleStatusRequest(message: AgentMessage): Promise<{ processedSessions: number; config: Required<SummarizerConfig> }> {
    return Promise.resolve({
      processedSessions: this.processedSessions.size,
      config: this.config,
    });
  }

  async shutdown(): Promise<void> {
    logger.info('SummarizerAgent [%s] shutdown. Processed %d sessions', this.id, this.processedSessions.size);
    this.processedSessions.clear();
  }

  /**
   * Get processed session count
   */
  getProcessedSessionCount(): number {
    return this.processedSessions.size;
  }
}

/**
 * Create and export a singleton instance
 */
export const summarizerAgent = new SummarizerAgent();
