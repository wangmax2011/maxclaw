import { logger } from './logger.js';
import { loadConfig } from './config.js';
import type { LogEntry } from './session-logger.js';

/**
 * Summary result interface
 */
export interface SummaryResult {
  summary: string;
  status: 'generated' | 'failed';
  error?: string;
}

/**
 * Summary content structure
 */
export interface SessionSummary {
  overview: string;
  tasksCompleted: string[];
  decisions: string[];
  codeChanges: string[];
  errors: string[];
  nextSteps?: string[];
}

// Anthropic API types
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  error?: {
    message: string;
  };
}

/**
 * Default summary prompt
 */
const DEFAULT_SUMMARY_PROMPT = `You are a session summarizer for Claude Code conversations.
Your task is to analyze the conversation and extract key information.

Please provide a structured summary in the following format:

## Overview
A brief 2-3 sentence overview of what was accomplished in this session.

## Tasks Completed
- List of specific tasks that were completed
- Use action-oriented language

## Key Decisions
- Important decisions made during the session
- Architecture choices, approach selections, etc.

## Code Changes
- Files modified, created, or deleted
- Key code patterns or structures implemented

## Errors and Issues
- Any errors encountered
- Problems that were solved or remain unsolved

## Next Steps (Optional)
- Suggested follow-up tasks
- Unfinished work to continue

Keep the summary concise but informative. Focus on actionable information.`;

/**
 * Get Anthropic API key from config or environment
 */
function getApiKey(): string | undefined {
  const config = loadConfig();
  return config.ai?.apiKey || process.env.ANTHROPIC_API_KEY;
}

/**
 * Get the model to use for summarization
 */
function getModel(): string {
  const config = loadConfig();
  return config.ai?.summaryModel || 'claude-3-sonnet-20240229';
}

/**
 * Check if AI summarization is enabled
 */
export function isSummarizationEnabled(): boolean {
  const config = loadConfig();
  // Default to true if not explicitly disabled
  return config.ai?.summaryEnabled !== false;
}

/**
 * Format log entries for the AI prompt
 */
function formatConversation(entries: LogEntry[]): string {
  // Filter to user and assistant messages only
  const conversation = entries.filter(
    (entry) => entry.role === 'user' || entry.role === 'assistant'
  );

  // Limit to last 100 messages to avoid token limits
  const limited = conversation.slice(-100);

  return limited
    .map((entry) => {
      const role = entry.role.toUpperCase();
      const content = entry.content.length > 2000
        ? entry.content.substring(0, 2000) + '... [truncated]'
        : entry.content;
      return `[${role}]: ${content}`;
    })
    .join('\n\n');
}

/**
 * Call Anthropic API to generate summary
 */
async function callAnthropicAPI(
  conversation: string,
  retryCount = 0
): Promise<SummaryResult> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      summary: '',
      status: 'failed',
      error: 'No API key found. Set ANTHROPIC_API_KEY environment variable or configure ai.apiKey in config.',
    };
  }

  const model = getModel();
  const maxRetries = 3;
  const retryDelay = parseInt(process.env.TEST_MODE ? '10' : '500', 10); // 10ms in test mode, 500ms otherwise

  const requestBody: AnthropicRequest = {
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Please summarize the following Claude Code session:\n\n${conversation}`,
      },
    ],
    system: DEFAULT_SUMMARY_PROMPT,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Retry on rate limit or server errors
      if ((response.status === 429 || response.status >= 500) && retryCount < maxRetries) {
        logger.warn('API request failed with %d, retrying in %dms...', response.status, retryDelay);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return callAnthropicAPI(conversation, retryCount + 1);
      }

      return {
        summary: '',
        status: 'failed',
        error: `API request failed: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as AnthropicResponse;

    if (data.error) {
      return {
        summary: '',
        status: 'failed',
        error: `API error: ${data.error.message}`,
      };
    }

    const summary = data.content?.[0]?.text || '';

    if (!summary) {
      return {
        summary: '',
        status: 'failed',
        error: 'Empty response from API',
      };
    }

    return {
      summary,
      status: 'generated',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Retry on network errors
    if (retryCount < maxRetries) {
      logger.warn('API request failed with error, retrying in %dms...', retryDelay);
      await new Promise((resolve) => setTimeout(resolve, retryDelay * (retryCount + 1)));
      return callAnthropicAPI(conversation, retryCount + 1);
    }

    return {
      summary: '',
      status: 'failed',
      error: `Failed to call API: ${errorMessage}`,
    };
  }
}

/**
 * Generate a summary from log entries
 */
export async function generateSummary(entries: LogEntry[]): Promise<SummaryResult> {
  if (!isSummarizationEnabled()) {
    return {
      summary: '',
      status: 'failed',
      error: 'Summarization is disabled in config',
    };
  }

  if (entries.length === 0) {
    return {
      summary: '',
      status: 'failed',
      error: 'No log entries to summarize',
    };
  }

  const conversation = formatConversation(entries);

  if (!conversation.trim()) {
    return {
      summary: '',
      status: 'failed',
      error: 'No conversation content to summarize',
    };
  }

  logger.debug('Generating summary for conversation with %d entries', entries.length);

  return callAnthropicAPI(conversation);
}

/**
 * Generate a summary from conversation text
 */
export async function generateSummaryFromText(conversation: string): Promise<SummaryResult> {
  if (!isSummarizationEnabled()) {
    return {
      summary: '',
      status: 'failed',
      error: 'Summarization is disabled in config',
    };
  }

  if (!conversation.trim()) {
    return {
      summary: '',
      status: 'failed',
      error: 'No conversation content to summarize',
    };
  }

  return callAnthropicAPI(conversation);
}

/**
 * Parse a structured summary from text
 */
export function parseStructuredSummary(summaryText: string): SessionSummary {
  const summary: SessionSummary = {
    overview: '',
    tasksCompleted: [],
    decisions: [],
    codeChanges: [],
    errors: [],
  };

  // Extract sections using regex
  const overviewMatch = summaryText.match(/## Overview\n+([\s\S]*?)(?=##|$)/);
  if (overviewMatch) {
    summary.overview = overviewMatch[1].trim();
  }

  const tasksMatch = summaryText.match(/## Tasks Completed\n+([\s\S]*?)(?=##|$)/);
  if (tasksMatch) {
    summary.tasksCompleted = tasksMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.substring(2).trim());
  }

  const decisionsMatch = summaryText.match(/## Key Decisions\n+([\s\S]*?)(?=##|$)/);
  if (decisionsMatch) {
    summary.decisions = decisionsMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.substring(2).trim());
  }

  const changesMatch = summaryText.match(/## Code Changes\n+([\s\S]*?)(?=##|$)/);
  if (changesMatch) {
    summary.codeChanges = changesMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.substring(2).trim());
  }

  const errorsMatch = summaryText.match(/## Errors and Issues\n+([\s\S]*?)(?=##|$)/);
  if (errorsMatch) {
    summary.errors = errorsMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.substring(2).trim());
  }

  const nextStepsMatch = summaryText.match(/## Next Steps.*?\n+([\s\S]*?)(?=##|$)/i);
  if (nextStepsMatch) {
    summary.nextSteps = nextStepsMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      .map((line) => line.substring(2).trim());
  }

  return summary;
}

/**
 * Format summary for display
 */
export function formatSummary(summary: SessionSummary): string {
  const parts: string[] = [];

  if (summary.overview) {
    parts.push('Overview:', summary.overview, '');
  }

  if (summary.tasksCompleted.length > 0) {
    parts.push('Tasks Completed:');
    for (const task of summary.tasksCompleted) {
      parts.push(`  - ${task}`);
    }
    parts.push('');
  }

  if (summary.decisions.length > 0) {
    parts.push('Key Decisions:');
    for (const decision of summary.decisions) {
      parts.push(`  - ${decision}`);
    }
    parts.push('');
  }

  if (summary.codeChanges.length > 0) {
    parts.push('Code Changes:');
    for (const change of summary.codeChanges) {
      parts.push(`  - ${change}`);
    }
    parts.push('');
  }

  if (summary.errors.length > 0) {
    parts.push('Errors and Issues:');
    for (const error of summary.errors) {
      parts.push(`  - ${error}`);
    }
    parts.push('');
  }

  if (summary.nextSteps && summary.nextSteps.length > 0) {
    parts.push('Next Steps:');
    for (const step of summary.nextSteps) {
      parts.push(`  - ${step}`);
    }
    parts.push('');
  }

  return parts.join('\n').trim();
}
