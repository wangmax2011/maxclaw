// E4: GitHub Client Tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubError,
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  parseRepoString,
  validateToken,
  checkRepositoryAccess,
  clearGitHubCache,
  getGitHubCacheSize,
} from '../github-client.js';

describe('GitHub Client', () => {
  beforeEach(() => {
    clearGitHubCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Classes', () => {
    it('should create GitHubError with correct properties', () => {
      const error = new GitHubError('Test error', 500, { detail: 'test' });
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.responseBody).toEqual({ detail: 'test' });
      expect(error.name).toBe('GitHubError');
    });

    it('should create GitHubRateLimitError with reset time', () => {
      const resetAt = new Date('2024-01-01T00:00:00Z');
      const error = new GitHubRateLimitError(resetAt);
      expect(error.statusCode).toBe(429);
      expect(error.resetAt).toEqual(resetAt);
      expect(error.name).toBe('GitHubRateLimitError');
      expect(error.message).toContain('rate limit exceeded');
    });

    it('should create GitHubAuthError', () => {
      const error = new GitHubAuthError();
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('GitHubAuthError');
      expect(error.message).toBe('GitHub authentication failed');
    });

    it('should create GitHubNotFoundError', () => {
      const error = new GitHubNotFoundError('repos/owner/test');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('GitHubNotFoundError');
      expect(error.message).toContain('repos/owner/test');
    });
  });

  describe('parseRepoString', () => {
    it('should parse valid repo string', () => {
      const result = parseRepoString('owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse repo with multiple slashes in name', () => {
      const result = parseRepoString('owner/repo/name');
      expect(result).toEqual({ owner: 'owner', repo: 'repo/name' });
    });

    it('should throw error for invalid format - no slash', () => {
      expect(() => parseRepoString('invalid')).toThrow(GitHubError);
      expect(() => parseRepoString('invalid')).toThrow('Invalid repository format');
    });

    it('should throw error for invalid format - empty owner', () => {
      expect(() => parseRepoString('/repo')).toThrow(GitHubError);
    });

    it('should throw error for invalid format - empty repo', () => {
      expect(() => parseRepoString('owner/')).toThrow(GitHubError);
    });
  });

  describe('Cache Functions', () => {
    it('should clear cache', () => {
      expect(getGitHubCacheSize()).toBe(0);
    });

    it('should return cache size', () => {
      expect(getGitHubCacheSize()).toBe(0);
    });
  });

  describe('validateToken', () => {
    it('should return valid for successful token validation', async () => {
      const mockUser = { login: 'testuser', name: 'Test User' };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUser),
        headers: new Map(),
      });

      const result = await validateToken('valid-token');
      expect(result.valid).toBe(true);
      expect(result.user).toEqual(mockUser);
    });

    it('should return invalid for auth error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Bad credentials' }),
        headers: new Map(),
      });

      const result = await validateToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should return invalid for network error', async () => {
      // Mock all fetch calls to fail with network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await validateToken('token');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('checkRepositoryAccess', () => {
    it('should return accessible for valid repo', async () => {
      const mockRepo = {
        id: 1,
        name: 'test-repo',
        full_name: 'owner/test-repo',
      };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRepo),
        headers: new Map(),
      });

      const result = await checkRepositoryAccess('owner/test-repo', 'token');
      expect(result.accessible).toBe(true);
      expect(result.repository).toBeDefined();
    });

    it('should return not accessible for 404', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' }),
        headers: new Map(),
      });

      const result = await checkRepositoryAccess('owner/nonexistent', 'token');
      expect(result.accessible).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return not accessible for auth error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Bad credentials' }),
        headers: new Map(),
      });

      const result = await checkRepositoryAccess('owner/repo', 'invalid-token');
      expect(result.accessible).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });
  });
});
