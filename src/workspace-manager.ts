import crypto from 'crypto';

import {
  createWorkspace,
  getWorkspace,
  getWorkspaceByName,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  addProjectToWorkspace,
  removeProjectFromWorkspace,
  getWorkspaceProjects,
  getProject,
} from './db.js';
import { logger } from './logger.js';
import type { Workspace } from './types.js';

/**
 * Create a new workspace
 */
export function createNewWorkspace(name: string, description?: string): Workspace {
  const existing = getWorkspaceByName(name);
  if (existing) {
    throw new Error(`Workspace already exists: ${name}`);
  }

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    description,
    projectIds: [],
    createdAt: now,
    updatedAt: now,
  };

  createWorkspace(workspace);
  logger.info('Created workspace: %s', name);

  return workspace;
}

/**
 * List all workspaces
 */
export function getAllWorkspaces(): Workspace[] {
  return listWorkspaces();
}

/**
 * Get a workspace by name
 */
export function getWorkspaceByNameOrThrow(name: string): Workspace {
  const workspace = getWorkspaceByName(name);
  if (!workspace) {
    throw new Error(`Workspace not found: ${name}`);
  }
  return workspace;
}

/**
 * Delete a workspace
 */
export function deleteWorkspaceByName(name: string): void {
  const workspace = getWorkspaceByName(name);
  if (!workspace) {
    throw new Error(`Workspace not found: ${name}`);
  }

  deleteWorkspace(workspace.id);
  logger.info('Deleted workspace: %s', name);
}

/**
 * Add a project to a workspace
 */
export function addProjectToWorkspaceByName(workspaceName: string, projectName: string): void {
  const workspace = getWorkspaceByName(workspaceName);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  const project = getProject(projectName);
  if (!project) {
    throw new Error(`Project not found: ${projectName}`);
  }

  // Check if project is already in workspace
  if (workspace.projectIds.includes(project.id)) {
    throw new Error(`Project ${projectName} is already in workspace ${workspaceName}`);
  }

  addProjectToWorkspace(workspace.id, project.id);
  updateWorkspace({
    id: workspace.id,
    updatedAt: new Date().toISOString(),
  });

  logger.info('Added project %s to workspace %s', projectName, workspaceName);
}

/**
 * Remove a project from a workspace
 */
export function removeProjectFromWorkspaceByName(workspaceName: string, projectName: string): void {
  const workspace = getWorkspaceByName(workspaceName);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  const project = getProject(projectName);
  if (!project) {
    throw new Error(`Project not found: ${projectName}`);
  }

  removeProjectFromWorkspace(workspace.id, project.id);
  updateWorkspace({
    id: workspace.id,
    updatedAt: new Date().toISOString(),
  });

  logger.info('Removed project %s from workspace %s', projectName, workspaceName);
}

/**
 * Activate a workspace (set as current workspace)
 */
export function activateWorkspace(workspaceName: string): Workspace {
  const workspace = getWorkspaceByName(workspaceName);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  // Store active workspace in config
  const { saveActiveWorkspace } = require('../config.js');
  saveActiveWorkspace(workspace.id);

  logger.info('Activated workspace: %s', workspaceName);

  return workspace;
}

/**
 * Deactivate current workspace
 */
export function deactivateWorkspace(): void {
  const { saveActiveWorkspace } = require('../config.js');
  saveActiveWorkspace(null);
  logger.info('Deactivated current workspace');
}

/**
 * Get current active workspace
 */
export function getActiveWorkspace(): Workspace | null {
  const { getActiveWorkspaceId } = require('../config.js');
  const workspaceId = getActiveWorkspaceId();

  if (!workspaceId) {
    return null;
  }

  return getWorkspace(workspaceId);
}

/**
 * Get projects in a workspace
 */
export function getProjectsInWorkspace(workspaceName: string): string[] {
  const workspace = getWorkspaceByName(workspaceName);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  return getWorkspaceProjects(workspace.id);
}

/**
 * Start a workspace session (session with all workspace projects in context)
 */
export async function startWorkspaceSession(workspaceName: string, options?: {
  allowedTools?: string[];
  initialPrompt?: string;
}): Promise<{ workspace: string; projects: string[]; sessionId: string }> {
  const workspace = getWorkspaceByName(workspaceName);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  if (workspace.projectIds.length === 0) {
    throw new Error(`Workspace ${workspaceName} has no projects. Add projects first.`);
  }

  // Get the active project or first project
  const activeProjectId = workspace.activeProjectId || workspace.projectIds[0];
  const activeProject = getProject(activeProjectId);

  if (!activeProject) {
    throw new Error(`Active project not found: ${activeProjectId}`);
  }

  // Start session with the active project
  const { startClaudeSession } = await import('./session-manager.js');
  const session = await startClaudeSession(activeProjectId, options);

  logger.info('Started workspace session for %s with %d projects', workspaceName, workspace.projectIds.length);

  return {
    workspace: workspaceName,
    projects: workspace.projectIds.map((id) => {
      const project = getProject(id);
      return project ? project.name : id;
    }),
    sessionId: session.id,
  };
}
