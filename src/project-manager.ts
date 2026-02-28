import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig } from './config.js';
import { createActivity, createProject, deleteProject, getProject, getProjectByPath, listProjects, updateProject } from './db.js';
import { logger } from './logger.js';
import { Activity, Project, ProjectDiscoveryResult, ProjectIndicator } from './types.js';

function generateId(): string {
  return crypto.randomUUID();
}

function getProjectNameFromPath(projectPath: string): string {
  return path.basename(projectPath);
}

function detectTechStack(indicators: ProjectIndicator[]): string[] {
  const techStack = new Set<string>();

  for (const indicator of indicators) {
    switch (indicator.type) {
      case 'package.json':
        techStack.add('Node.js');
        break;
      case 'Cargo.toml':
        techStack.add('Rust');
        break;
      case 'pyproject.toml':
        techStack.add('Python');
        break;
      case 'go.mod':
        techStack.add('Go');
        break;
      case 'Dockerfile':
        techStack.add('Docker');
        break;
      case 'git':
        techStack.add('Git');
        break;
    }
  }

  // Try to detect more specific technologies from package.json
  const packageJsonIndicator = indicators.find((i) => i.type === 'package.json');
  if (packageJsonIndicator) {
    try {
      const packagePath = path.join(path.dirname(packageJsonIndicator.path), 'package.json');
      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

      const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };

      if (deps.react) techStack.add('React');
      if (deps.vue) techStack.add('Vue');
      if (deps.angular) techStack.add('Angular');
      if (deps.next) techStack.add('Next.js');
      if (deps.nuxt) techStack.add('Nuxt');
      if (deps.typescript || deps.tsx) techStack.add('TypeScript');
      if (deps.express) techStack.add('Express');
      if (deps['@nestjs/core']) techStack.add('NestJS');
      if (deps.prisma) techStack.add('Prisma');
      if (deps.tailwindcss) techStack.add('Tailwind CSS');
    } catch {
      // Ignore parsing errors
    }
  }

  return Array.from(techStack);
}

export function scanDirectoryForProjects(dirPath: string, depth = 2): ProjectDiscoveryResult[] {
  const results: ProjectDiscoveryResult[] = [];
  const resolvedPath = dirPath.startsWith('~') ? path.join(os.homedir(), dirPath.slice(1)) : path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    logger.warn('Scan path does not exist: %s', resolvedPath);
    return results;
  }

  const isProject = (itemPath: string): { isProject: boolean; indicators: ProjectIndicator[] } => {
    const indicators: ProjectIndicator[] = [];

    try {
      const entries = fs.readdirSync(itemPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === '.git') {
          indicators.push({ type: 'git', path: path.join(itemPath, entry.name) });
        } else if (entry.isFile()) {
          switch (entry.name) {
            case 'package.json':
              indicators.push({ type: 'package.json', path: path.join(itemPath, entry.name) });
              break;
            case 'Cargo.toml':
              indicators.push({ type: 'Cargo.toml', path: path.join(itemPath, entry.name) });
              break;
            case 'pyproject.toml':
            case 'setup.py':
            case 'requirements.txt':
              indicators.push({ type: 'pyproject.toml', path: path.join(itemPath, entry.name) });
              break;
            case 'go.mod':
              indicators.push({ type: 'go.mod', path: path.join(itemPath, entry.name) });
              break;
            case 'Dockerfile':
            case 'docker-compose.yml':
              indicators.push({ type: 'Dockerfile', path: path.join(itemPath, entry.name) });
              break;
            case 'CLAUDE.md':
              indicators.push({ type: 'CLAUDE.md', path: path.join(itemPath, entry.name) });
              break;
          }
        }
      }
    } catch {
      // Permission errors, etc.
    }

    return { isProject: indicators.length > 0, indicators };
  };

  const scan = (currentPath: string, currentDepth: number) => {
    if (currentDepth > depth) return;

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue; // Skip hidden directories
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'target') continue;
        if (entry.name === 'dist') continue;
        if (entry.name === 'build') continue;

        const fullPath = path.join(currentPath, entry.name);
        const projectCheck = isProject(fullPath);

        if (projectCheck.isProject) {
          results.push({
            path: fullPath,
            name: entry.name,
            indicators: projectCheck.indicators,
            techStack: detectTechStack(projectCheck.indicators),
          });
        } else if (currentDepth < depth) {
          scan(fullPath, currentDepth + 1);
        }
      }
    } catch (error) {
      logger.warn('Error scanning %s: %s', currentPath, error);
    }
  };

  // Check if the root itself is a project
  const rootCheck = isProject(resolvedPath);
  if (rootCheck.isProject) {
    results.push({
      path: resolvedPath,
      name: getProjectNameFromPath(resolvedPath),
      indicators: rootCheck.indicators,
      techStack: detectTechStack(rootCheck.indicators),
    });
  }

  scan(resolvedPath, 1);

  return results;
}

export function discoverProjects(scanPaths?: string[]): ProjectDiscoveryResult[] {
  const config = loadConfig();
  const pathsToScan = scanPaths ?? config.scanPaths;

  logger.info('Scanning for projects in: %s', pathsToScan.join(', '));

  const allDiscovered: ProjectDiscoveryResult[] = [];

  for (const scanPath of pathsToScan) {
    const discovered = scanDirectoryForProjects(scanPath);
    allDiscovered.push(...discovered);
  }

  // Remove duplicates by path
  const uniqueByPath = new Map<string, ProjectDiscoveryResult>();
  for (const result of allDiscovered) {
    if (!uniqueByPath.has(result.path)) {
      uniqueByPath.set(result.path, result);
    }
  }

  return Array.from(uniqueByPath.values());
}

export function registerProject(discovery: ProjectDiscoveryResult): Project {
  // Check if project already exists
  const existing = getProjectByPath(discovery.path);
  if (existing) {
    logger.debug('Project already registered: %s', discovery.name);
    return existing;
  }

  const project: Project = {
    id: generateId(),
    name: discovery.name,
    path: discovery.path,
    techStack: discovery.techStack,
    discoveredAt: new Date().toISOString(),
  };

  createProject(project);

  // Log activity
  const activity: Activity = {
    id: generateId(),
    projectId: project.id,
    type: 'discover',
    timestamp: new Date().toISOString(),
    details: { indicators: discovery.indicators.map((i) => i.type) },
  };
  createActivity(activity);

  logger.info('Registered project: %s at %s', project.name, project.path);

  return project;
}

export function addManualProject(projectPath: string, name?: string, description?: string): Project {
  const resolvedPath = path.resolve(projectPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${resolvedPath}`);
  }

  const existing = getProjectByPath(resolvedPath);
  if (existing) {
    throw new Error(`Project already registered: ${existing.name}`);
  }

  // Detect indicators
  const indicators: ProjectIndicator[] = [];
  try {
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') indicators.push({ type: 'git', path: path.join(resolvedPath, entry.name) });
      if (entry.name === 'package.json') indicators.push({ type: 'package.json', path: path.join(resolvedPath, entry.name) });
      if (entry.name === 'Cargo.toml') indicators.push({ type: 'Cargo.toml', path: path.join(resolvedPath, entry.name) });
    }
  } catch {
    // Ignore
  }

  const project: Project = {
    id: generateId(),
    name: name ?? getProjectNameFromPath(resolvedPath),
    path: resolvedPath,
    description,
    techStack: detectTechStack(indicators),
    discoveredAt: new Date().toISOString(),
  };

  createProject(project);

  const activity: Activity = {
    id: generateId(),
    projectId: project.id,
    type: 'add',
    timestamp: new Date().toISOString(),
    details: { manual: true },
  };
  createActivity(activity);

  logger.info('Manually added project: %s', project.name);

  return project;
}

export function removeProject(projectIdOrName: string): void {
  // Try to find by ID first, then by name
  let project = getProject(projectIdOrName);
  if (!project) {
    project = findProjectByName(projectIdOrName);
  }

  if (!project) {
    throw new Error(`Project not found: ${projectIdOrName}`);
  }

  deleteProject(project.id);
  logger.info('Removed project: %s', project.name);
}

export function updateProjectMetadata(
  projectId: string,
  updates: { name?: string; description?: string; techStack?: string[] }
): void {
  updateProject({
    id: projectId,
    ...updates,
  });

  logger.info('Updated project metadata: %s', projectId);
}

export function getAllProjects(): Project[] {
  return listProjects();
}

export function findProjectByName(name: string): Project | null {
  const projects = listProjects();
  // Exact match first
  const exact = projects.find((p) => p.name === name);
  if (exact) return exact;

  // Case-insensitive match
  const caseInsensitive = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (caseInsensitive) return caseInsensitive;

  // Partial match
  const partial = projects.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
  if (partial) return partial;

  return null;
}
