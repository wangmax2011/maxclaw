// E4: GitHub API Client - Handles all GitHub REST API interactions

import { logger } from './logger.js';

// GitHub API Configuration
const GITHUB_API_BASE = process.env.GITHUB_API_URL || 'https://api.github.com';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// GitHub API Error Types
export class GitHubError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHubRateLimitError extends GitHubError {
  public resetAt: Date;

  constructor(resetAt: Date) {
    super(`GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}`, 429);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetAt;
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(message = 'GitHub authentication failed') {
    super(message, 401);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor(resource: string) {
    super(`GitHub resource not found: ${resource}`, 404);
    this.name = 'GitHubNotFoundError';
  }
}

// GitHub API Types
export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  head: { ref: string };
  base: { ref: string };
  merged: boolean;
  mergeable: boolean | null;
  draft: boolean;
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
  author: { login: string } | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

// API Response cache
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL = 60000; // 1 minute

function getCacheKey(endpoint: string): string {
  return `${GITHUB_API_BASE}${endpoint}`;
}

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttl = DEFAULT_CACHE_TTL): void {
  apiCache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });
}

function clearCache(): void {
  apiCache.clear();
}

// Parse owner/repo from full repo string
export function parseRepoString(repo: string): { owner: string; repo: string } {
  const parts = repo.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new GitHubError(`Invalid repository format: ${repo}. Expected: owner/repo`);
  }
  return { owner: parts[0], repo: parts.slice(1).join('/') };
}

// Main API request function
async function githubRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    token?: string;
    useCache?: boolean;
    cacheTtl?: number;
  } = {}
): Promise<T> {
  const { method = 'GET', body, token, useCache = true, cacheTtl } = options;

  // Check cache for GET requests
  const cacheKey = getCacheKey(endpoint);
  if (method === 'GET' && useCache) {
    const cached = getCached<T>(cacheKey);
    if (cached) {
      logger.debug('GitHub API cache hit: %s', endpoint);
      return cached;
    }
  }

  const authToken = token || process.env.GITHUB_TOKEN;
  if (!authToken) {
    throw new GitHubAuthError('No GitHub token provided. Set GITHUB_TOKEN environment variable or pass token explicitly.');
  }

  const url = `${GITHUB_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${authToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MaxClaw-GitHub-Client/1.0',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug('GitHub API request: %s %s (attempt %d/%d)', method, endpoint, attempt, MAX_RETRIES);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (response.status === 429 || (rateLimitRemaining === '0' && rateLimitReset)) {
        const resetAt = new Date(parseInt(rateLimitReset || '0', 10) * 1000);
        throw new GitHubRateLimitError(resetAt);
      }

      // Handle authentication errors
      if (response.status === 401) {
        throw new GitHubAuthError();
      }

      // Handle not found
      if (response.status === 404) {
        throw new GitHubNotFoundError(endpoint);
      }

      // Handle other errors
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new GitHubError(
          `GitHub API error: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = await response.json() as T;

      // Cache successful GET responses
      if (method === 'GET' && useCache) {
        setCached(cacheKey, data, cacheTtl);
      }

      return data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on auth errors or not found
      if (error instanceof GitHubAuthError || error instanceof GitHubNotFoundError) {
        throw error;
      }

      // Don't retry on rate limit errors
      if (error instanceof GitHubRateLimitError) {
        throw error;
      }

      // Check if it's the last attempt
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Wait before retrying
      logger.warn('GitHub API request failed (attempt %d/%d): %s', attempt, MAX_RETRIES, error);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }

  throw lastError || new GitHubError('GitHub API request failed after retries');
}

// ===== Repository Operations =====

export async function getRepository(
  repo: string,
  token?: string
): Promise<GitHubRepository> {
  const { owner, repo: repoName } = parseRepoString(repo);
  return githubRequest<GitHubRepository>(`/repos/${owner}/${repoName}`, { token });
}

// ===== Issue Operations =====

export async function listIssues(
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
    page?: number;
    token?: string;
  } = {}
): Promise<GitHubIssue[]> {
  const { owner, repo: repoName } = parseRepoString(repo);
  const { state = 'open', perPage = 100, page = 1, token } = options;

  const params = new URLSearchParams({
    state,
    per_page: String(perPage),
    page: String(page),
  });

  return githubRequest<GitHubIssue[]>(
    `/repos/${owner}/${repoName}/issues?${params.toString()}`,
    { token }
  );
}

export async function getIssue(
  repo: string,
  issueNumber: number,
  token?: string
): Promise<GitHubIssue> {
  const { owner, repo: repoName } = parseRepoString(repo);
  return githubRequest<GitHubIssue>(
    `/repos/${owner}/${repoName}/issues/${issueNumber}`,
    { token }
  );
}

export async function createIssue(
  repo: string,
  input: CreateIssueInput,
  token?: string
): Promise<GitHubIssue> {
  const { owner, repo: repoName } = parseRepoString(repo);
  return githubRequest<GitHubIssue>(
    `/repos/${owner}/${repoName}/issues`,
    {
      method: 'POST',
      body: input,
      token,
      useCache: false,
    }
  );
}

export async function updateIssue(
  repo: string,
  issueNumber: number,
  updates: Partial<CreateIssueInput>,
  token?: string
): Promise<GitHubIssue> {
  const { owner, repo: repoName } = parseRepoString(repo);
  return githubRequest<GitHubIssue>(
    `/repos/${owner}/${repoName}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      body: updates,
      token,
      useCache: false,
    }
  );
}

// ===== Pull Request Operations =====

export async function listPullRequests(
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
    page?: number;
    token?: string;
  } = {}
): Promise<GitHubPullRequest[]> {
  const { owner, repo: repoName } = parseRepoString(repo);
  const { state = 'open', perPage = 100, page = 1, token } = options;

  const params = new URLSearchParams({
    state,
    per_page: String(perPage),
    page: String(page),
  });

  return githubRequest<GitHubPullRequest[]>(
    `/repos/${owner}/${repoName}/pulls?${params.toString()}`,
    { token }
  );
}

export async function getPullRequest(
  repo: string,
  prNumber: number,
  token?: string
): Promise<GitHubPullRequest> {
  const { owner, repo: repoName } = parseRepoString(repo);
  return githubRequest<GitHubPullRequest>(
    `/repos/${owner}/${repoName}/pulls/${prNumber}`,
    { token }
  );
}

// ===== Commit Operations =====

export async function listCommits(
  repo: string,
  options: {
    branch?: string;
    perPage?: number;
    page?: number;
    token?: string;
  } = {}
): Promise<GitHubCommit[]> {
  const { owner, repo: repoName } = parseRepoString(repo);
  const { branch, perPage = 100, page = 1, token } = options;

  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });

  if (branch) {
    params.set('sha', branch);
  }

  return githubRequest<GitHubCommit[]>(
    `/repos/${owner}/${repoName}/commits?${params.toString()}`,
    { token }
  );
}

// ===== Utility Functions =====

export function clearGitHubCache(): void {
  clearCache();
  logger.debug('GitHub API cache cleared');
}

export function getGitHubCacheSize(): number {
  return apiCache.size;
}

// Validate GitHub token
export async function validateToken(token?: string): Promise<{
  valid: boolean;
  user?: { login: string; name?: string };
  error?: string;
}> {
  try {
    const response = await githubRequest<{ login: string; name?: string }>('/user', {
      token,
      useCache: false,
    });
    return { valid: true, user: response };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return { valid: false, error: 'Invalid token' };
    }
    // Extract error message from Error object
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { valid: false, error: errorMessage };
  }
}

// Check if repository exists and is accessible
export async function checkRepositoryAccess(
  repo: string,
  token?: string
): Promise<{
  accessible: boolean;
  repository?: GitHubRepository;
  error?: string;
}> {
  try {
    const repository = await getRepository(repo, token);
    return { accessible: true, repository };
  } catch (error) {
    if (error instanceof GitHubNotFoundError) {
      return { accessible: false, error: 'Repository not found or not accessible' };
    }
    if (error instanceof GitHubAuthError) {
      return { accessible: false, error: 'Authentication failed' };
    }
    return { accessible: false, error: String(error) };
  }
}
