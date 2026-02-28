// E4: GitHub Sync - Synchronizes GitHub data to local database

import Database from 'better-sqlite3';
import { logger } from './logger.js';
import { DB_PATH } from './config.js';
import {
  listIssues,
  listPullRequests,
  listCommits,
  getRepository,
  parseRepoString,
  GitHubIssue,
  GitHubPullRequest,
  GitHubCommit,
  GitHubRepository,
  GitHubError,
  GitHubAuthError,
} from './github-client.js';

// Sync result types
export interface SyncResult {
  success: boolean;
  syncedAt: string;
  issues?: {
    total: number;
    new: number;
    updated: number;
    errors: number;
  };
  pullRequests?: {
    total: number;
    new: number;
    updated: number;
    errors: number;
  };
  commits?: {
    total: number;
    new: number;
    errors: number;
  };
  error?: string;
}

// Database types for GitHub entities
interface GitHubIssueRecord {
  id: string;
  project_id: string;
  issue_number: number;
  title: string;
  state: string;
  labels: string;
  assignee: string | null;
  body: string | null;
  url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  synced_at: string;
}

interface GitHubPrRecord {
  id: string;
  project_id: string;
  pr_number: number;
  title: string;
  state: string;
  branch: string;
  base_branch: string;
  merged: number;
  mergeable: number | null;
  draft: number;
  labels: string;
  assignee: string | null;
  body: string | null;
  url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  synced_at: string;
}

interface GitHubCommitRecord {
  id: string;
  project_id: string;
  sha: string;
  message: string;
  author: string;
  author_email: string | null;
  date: string;
  url: string | null;
  branch: string | null;
  synced_at: string;
}

// Get database connection
function getDb(): Database.Database {
  return new Database(DB_PATH);
}

// Get project GitHub configuration
export function getProjectGitHubConfig(projectId: string): {
  repo: string | null;
  token: string | null;
} {
  const db = getDb();
  try {
    const row = db
      .prepare('SELECT github_repo, github_token FROM projects WHERE id = ?')
      .get(projectId) as { github_repo: string | null; github_token: string | null } | undefined;

    return {
      repo: row?.github_repo ?? null,
      token: row?.github_token ?? null,
    };
  } finally {
    db.close();
  }
}

// Update project GitHub configuration
export function updateProjectGitHubConfig(
  projectId: string,
  config: { repo?: string; token?: string | null }
): void {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (config.repo !== undefined) {
      fields.push('github_repo = ?');
      values.push(config.repo);
    }

    if (config.token !== undefined) {
      fields.push('github_token = ?');
      values.push(config.token);
    }

    if (fields.length === 0) return;

    values.push(projectId);
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    logger.info('Updated GitHub config for project %s', projectId);
  } finally {
    db.close();
  }
}

// Link project to GitHub repository
export async function linkProjectToGitHub(
  projectId: string,
  repo: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate repo format
    parseRepoString(repo);

    // Check repository access
    const { getRepository } = await import('./github-client.js');
    const repository = await getRepository(repo, token);

    if (!repository) {
      return { success: false, error: 'Repository not found' };
    }

    // Update project configuration
    updateProjectGitHubConfig(projectId, { repo, token: token ?? null });

    logger.info('Linked project %s to GitHub repository %s', projectId, repo);
    return { success: true };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return { success: false, error: 'Invalid GitHub token' };
    }
    if (error instanceof GitHubError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: String(error) };
  }
}

// Unlink project from GitHub
export function unlinkProjectFromGitHub(projectId: string): void {
  const db = getDb();
  try {
    // Clear GitHub config
    db.prepare('UPDATE projects SET github_repo = NULL, github_token = NULL WHERE id = ?').run(projectId);

    // Clean up synced data
    db.prepare('DELETE FROM github_issues WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM github_prs WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM github_commits WHERE project_id = ?').run(projectId);

    logger.info('Unlinked project %s from GitHub', projectId);
  } finally {
    db.close();
  }
}

// Sync issues from GitHub
export async function syncIssues(projectId: string): Promise<SyncResult> {
  const startTime = Date.now();
  const syncedAt = new Date().toISOString();

  const config = getProjectGitHubConfig(projectId);
  if (!config.repo) {
    return { success: false, syncedAt, error: 'Project not linked to GitHub repository' };
  }

  const result: SyncResult = {
    success: true,
    syncedAt,
    issues: { total: 0, new: 0, updated: 0, errors: 0 },
  };

  try {
    logger.info('Syncing issues for project %s from %s', projectId, config.repo);

    // Fetch all issues (both open and closed)
    const issues = await listIssues(config.repo, {
      state: 'all',
      perPage: 100,
      token: config.token || undefined,
    });

    const db = getDb();
    try {
      const insertStmt = db.prepare(`
        INSERT INTO github_issues (
          id, project_id, issue_number, title, state, labels, assignee, body,
          url, created_at, updated_at, closed_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE github_issues SET
          title = ?, state = ?, labels = ?, assignee = ?, body = ?,
          url = ?, created_at = ?, updated_at = ?, closed_at = ?, synced_at = ?
        WHERE project_id = ? AND issue_number = ?
      `);

      const checkStmt = db.prepare(
        'SELECT id FROM github_issues WHERE project_id = ? AND issue_number = ?'
      );

      for (const issue of issues) {
        try {
          result.issues!.total++;

          const existing = checkStmt.get(projectId, issue.number) as { id: string } | undefined;

          const labels = JSON.stringify(issue.labels.map((l) => l.name));
          const assignee = issue.assignee?.login || null;

          if (existing) {
            updateStmt.run(
              issue.title,
              issue.state,
              labels,
              assignee,
              issue.body,
              issue.html_url,
              issue.created_at,
              issue.updated_at,
              issue.closed_at,
              syncedAt,
              projectId,
              issue.number
            );
            result.issues!.updated++;
          } else {
            const id = `issue-${projectId}-${issue.number}`;
            insertStmt.run(
              id,
              projectId,
              issue.number,
              issue.title,
              issue.state,
              labels,
              assignee,
              issue.body,
              issue.html_url,
              issue.created_at,
              issue.updated_at,
              issue.closed_at,
              syncedAt
            );
            result.issues!.new++;
          }
        } catch (error) {
          logger.error('Failed to sync issue #%d: %s', issue.number, error);
          result.issues!.errors++;
        }
      }

      logger.info(
        'Synced %d issues for project %s (%d new, %d updated, %d errors)',
        result.issues!.total,
        projectId,
        result.issues!.new,
        result.issues!.updated,
        result.issues!.errors
      );
    } finally {
      db.close();
    }

    return result;
  } catch (error) {
    logger.error('Failed to sync issues for project %s: %s', projectId, error);
    return {
      success: false,
      syncedAt,
      error: String(error),
    };
  }
}

// Sync pull requests from GitHub
export async function syncPullRequests(projectId: string): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  const config = getProjectGitHubConfig(projectId);
  if (!config.repo) {
    return { success: false, syncedAt, error: 'Project not linked to GitHub repository' };
  }

  const result: SyncResult = {
    success: true,
    syncedAt,
    pullRequests: { total: 0, new: 0, updated: 0, errors: 0 },
  };

  try {
    logger.info('Syncing pull requests for project %s from %s', projectId, config.repo);

    const prs = await listPullRequests(config.repo, {
      state: 'all',
      perPage: 100,
      token: config.token || undefined,
    });

    const db = getDb();
    try {
      const insertStmt = db.prepare(`
        INSERT INTO github_prs (
          id, project_id, pr_number, title, state, branch, base_branch, merged,
          mergeable, draft, labels, assignee, body, url, created_at, updated_at,
          closed_at, merged_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE github_prs SET
          title = ?, state = ?, branch = ?, base_branch = ?, merged = ?,
          mergeable = ?, draft = ?, labels = ?, assignee = ?, body = ?,
          url = ?, created_at = ?, updated_at = ?, closed_at = ?, merged_at = ?, synced_at = ?
        WHERE project_id = ? AND pr_number = ?
      `);

      const checkStmt = db.prepare(
        'SELECT id FROM github_prs WHERE project_id = ? AND pr_number = ?'
      );

      for (const pr of prs) {
        try {
          result.pullRequests!.total++;

          const existing = checkStmt.get(projectId, pr.number) as { id: string } | undefined;

          const labels = JSON.stringify(pr.labels.map((l) => l.name));
          const assignee = pr.assignee?.login || null;

          if (existing) {
            updateStmt.run(
              pr.title,
              pr.state,
              pr.head.ref,
              pr.base.ref,
              pr.merged ? 1 : 0,
              pr.mergeable === null ? null : pr.mergeable ? 1 : 0,
              pr.draft ? 1 : 0,
              labels,
              assignee,
              pr.body,
              pr.html_url,
              pr.created_at,
              pr.updated_at,
              pr.closed_at,
              pr.merged_at,
              syncedAt,
              projectId,
              pr.number
            );
            result.pullRequests!.updated++;
          } else {
            const id = `pr-${projectId}-${pr.number}`;
            insertStmt.run(
              id,
              projectId,
              pr.number,
              pr.title,
              pr.state,
              pr.head.ref,
              pr.base.ref,
              pr.merged ? 1 : 0,
              pr.mergeable === null ? null : pr.mergeable ? 1 : 0,
              pr.draft ? 1 : 0,
              labels,
              assignee,
              pr.body,
              pr.html_url,
              pr.created_at,
              pr.updated_at,
              pr.closed_at,
              pr.merged_at,
              syncedAt
            );
            result.pullRequests!.new++;
          }
        } catch (error) {
          logger.error('Failed to sync PR #%d: %s', pr.number, error);
          result.pullRequests!.errors++;
        }
      }

      logger.info(
        'Synced %d pull requests for project %s (%d new, %d updated, %d errors)',
        result.pullRequests!.total,
        projectId,
        result.pullRequests!.new,
        result.pullRequests!.updated,
        result.pullRequests!.errors
      );
    } finally {
      db.close();
    }

    return result;
  } catch (error) {
    logger.error('Failed to sync pull requests for project %s: %s', projectId, error);
    return {
      success: false,
      syncedAt,
      error: String(error),
    };
  }
}

// Sync commits from GitHub
export async function syncCommits(
  projectId: string,
  branch?: string
): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  const config = getProjectGitHubConfig(projectId);
  if (!config.repo) {
    return { success: false, syncedAt, error: 'Project not linked to GitHub repository' };
  }

  const result: SyncResult = {
    success: true,
    syncedAt,
    commits: { total: 0, new: 0, errors: 0 },
  };

  try {
    logger.info('Syncing commits for project %s from %s (branch: %s)', projectId, config.repo, branch || 'default');

    const commits = await listCommits(config.repo, {
      branch,
      perPage: 100,
      token: config.token || undefined,
    });

    const db = getDb();
    try {
      const insertStmt = db.prepare(`
        INSERT INTO github_commits (
          id, project_id, sha, message, author, author_email, date, url, branch, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const checkStmt = db.prepare(
        'SELECT id FROM github_commits WHERE project_id = ? AND sha = ?'
      );

      for (const commit of commits) {
        try {
          result.commits!.total++;

          const existing = checkStmt.get(projectId, commit.sha) as { id: string } | undefined;

          if (!existing) {
            const id = `commit-${projectId}-${commit.sha.substring(0, 16)}`;
            insertStmt.run(
              id,
              projectId,
              commit.sha,
              commit.commit.message,
              commit.commit.author.name,
              commit.commit.author.email || null,
              commit.commit.author.date,
              commit.html_url,
              branch || null,
              syncedAt
            );
            result.commits!.new++;
          }
        } catch (error) {
          logger.error('Failed to sync commit %s: %s', commit.sha.substring(0, 8), error);
          result.commits!.errors++;
        }
      }

      logger.info(
        'Synced %d commits for project %s (%d new, %d errors)',
        result.commits!.total,
        projectId,
        result.commits!.new,
        result.commits!.errors
      );
    } finally {
      db.close();
    }

    return result;
  } catch (error) {
    logger.error('Failed to sync commits for project %s: %s', projectId, error);
    return {
      success: false,
      syncedAt,
      error: String(error),
    };
  }
}

// Get repository information
export async function getRepositoryInfo(
  projectId: string
): Promise<{
  success: boolean;
  repository?: GitHubRepository;
  error?: string;
}> {
  const config = getProjectGitHubConfig(projectId);
  if (!config.repo) {
    return { success: false, error: 'Project not linked to GitHub repository' };
  }

  try {
    const repository = await getRepository(config.repo, config.token || undefined);
    return { success: true, repository };
  } catch (error) {
    logger.error('Failed to get repository info for project %s: %s', projectId, error);
    return {
      success: false,
      error: String(error),
    };
  }
}

// Full sync - issues, PRs, and commits
export async function syncAll(projectId: string): Promise<{
  success: boolean;
  results: {
    issues: SyncResult;
    pullRequests: SyncResult;
    commits: SyncResult;
  };
}> {
  logger.info('Starting full GitHub sync for project %s', projectId);

  const [issues, pullRequests, commits] = await Promise.all([
    syncIssues(projectId),
    syncPullRequests(projectId),
    syncCommits(projectId),
  ]);

  const success = issues.success && pullRequests.success && commits.success;

  logger.info(
    'Completed full GitHub sync for project %s (success: %s)',
    projectId,
    success
  );

  return {
    success,
    results: {
      issues,
      pullRequests,
      commits,
    },
  };
}

// Get cached issues
export function getCachedIssues(
  projectId: string,
  options: {
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  } = {}
): Array<{
  id: string;
  issueNumber: number;
  title: string;
  state: string;
  labels: string[];
  assignee: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}> {
  const db = getDb();
  try {
    const { state = 'all', limit = 50 } = options;

    let query = 'SELECT * FROM github_issues WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (state !== 'all') {
      query += ' AND state = ?';
      params.push(state);
    }

    query += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as GitHubIssueRecord[];

    return rows.map((row) => ({
      id: row.id,
      issueNumber: row.issue_number,
      title: row.title,
      state: row.state,
      labels: JSON.parse(row.labels || '[]'),
      assignee: row.assignee,
      url: row.url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    db.close();
  }
}

// Get cached pull requests
export function getCachedPullRequests(
  projectId: string,
  options: {
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  } = {}
): Array<{
  id: string;
  prNumber: number;
  title: string;
  state: string;
  branch: string;
  baseBranch: string;
  merged: boolean;
  draft: boolean;
  labels: string[];
  assignee: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}> {
  const db = getDb();
  try {
    const { state = 'all', limit = 50 } = options;

    let query = 'SELECT * FROM github_prs WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (state !== 'all') {
      query += ' AND state = ?';
      params.push(state);
    }

    query += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as GitHubPrRecord[];

    return rows.map((row) => ({
      id: row.id,
      prNumber: row.pr_number,
      title: row.title,
      state: row.state,
      branch: row.branch,
      baseBranch: row.base_branch,
      merged: row.merged === 1,
      draft: row.draft === 1,
      labels: JSON.parse(row.labels || '[]'),
      assignee: row.assignee,
      url: row.url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    db.close();
  }
}

// Get cached commits
export function getCachedCommits(
  projectId: string,
  options: {
    branch?: string;
    limit?: number;
  } = {}
): Array<{
  id: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  branch: string | null;
}> {
  const db = getDb();
  try {
    const { branch, limit = 50 } = options;

    let query = 'SELECT * FROM github_commits WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (branch) {
      query += ' AND branch = ?';
      params.push(branch);
    }

    query += ' ORDER BY date DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as GitHubCommitRecord[];

    return rows.map((row) => ({
      id: row.id,
      sha: row.sha,
      message: row.message,
      author: row.author,
      date: row.date,
      url: row.url ?? '',
      branch: row.branch,
    }));
  } finally {
    db.close();
  }
}

// Create a GitHub issue
export async function createGitHubIssue(
  projectId: string,
  input: {
    title: string;
    body?: string;
    labels?: string[];
  }
): Promise<{
  success: boolean;
  issue?: { number: number; title: string; url: string };
  error?: string;
}> {
  const config = getProjectGitHubConfig(projectId);
  if (!config.repo) {
    return { success: false, error: 'Project not linked to GitHub repository' };
  }

  try {
    const { createIssue } = await import('./github-client.js');
    const issue = await createIssue(config.repo, input, config.token || undefined);

    // Sync issues to update local cache
    await syncIssues(projectId);

    return {
      success: true,
      issue: {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
      },
    };
  } catch (error) {
    logger.error('Failed to create GitHub issue for project %s: %s', projectId, error);
    return {
      success: false,
      error: String(error),
    };
  }
}
