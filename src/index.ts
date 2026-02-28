#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';

import { loadConfig, saveConfig, VERSION } from './config.js';
import { initDatabase } from './db.js';
import { logger } from './logger.js';
import {
  addManualProject,
  discoverProjects,
  findProjectByName,
  getAllProjects,
  registerProject,
  removeProject,
} from './project-manager.js';
import {
  formatSessionDuration,
  getSessionHistory,
  listRunningSessions,
  startClaudeSession,
  stopSession,
} from './session-manager.js';
import { listActivitiesForProject } from './db.js';

const program = new Command();

program.name('maxclaw').description('Personal project assistant for Claude Code').version(VERSION);

// Initialize database on startup
initDatabase();

// list command
program
  .command('list')
  .description('List all registered projects')
  .option('-d, --discovered', 'Show discovery date')
  .action((options) => {
    const projects = getAllProjects();

    if (projects.length === 0) {
      console.log('No projects registered. Run `maxclaw discover` to find projects.');
      return;
    }

    console.log(`\n📁 ${projects.length} project(s) registered:\n`);

    for (const project of projects) {
      const techStack = project.techStack.length > 0 ? `(${project.techStack.join(', ')})` : '';
      const lastAccessed = project.lastAccessed
        ? `Last accessed: ${new Date(project.lastAccessed).toLocaleDateString()}`
        : 'Never accessed';

      console.log(`  ${project.name} ${techStack}`);
      console.log(`    Path: ${project.path}`);
      if (options.discovered) {
        console.log(`    Discovered: ${new Date(project.discoveredAt).toLocaleDateString()}`);
      }
      console.log(`    ${lastAccessed}`);
      console.log();
    }
  });

// discover command
program
  .command('discover')
  .description('Scan for new projects')
  .argument('[path]', 'Path to scan (default: use config paths)')
  .option('-d, --depth <depth>', 'Scan depth', '2')
  .action(async (scanPath, options) => {
    try {
      const paths = scanPath ? [scanPath] : undefined;
      const depth = parseInt(options.depth, 10);

      console.log('🔍 Scanning for projects...\n');

      const discovered = discoverProjects(paths);
      let newCount = 0;

      for (const result of discovered) {
        try {
          const project = registerProject(result);
          if (project.discoveredAt === new Date().toISOString().split('T')[0] + 'T') {
            // Likely newly registered in this run
            newCount++;
          }
          console.log(`  ✓ ${project.name} - ${project.path}`);
          if (project.techStack.length > 0) {
            console.log(`    Tech: ${project.techStack.join(', ')}`);
          }
        } catch {
          // Already registered
          console.log(`  • ${result.name} - ${result.path} (already registered)`);
        }
      }

      console.log(`\n✅ Found ${discovered.length} project(s), ${newCount} new`);
    } catch (error) {
      logger.error('Discovery failed: %s', error);
      process.exit(1);
    }
  });

// add command
program
  .command('add')
  .description('Manually add a project')
  .argument('<path>', 'Path to project directory')
  .option('-n, --name <name>', 'Project name (default: directory name)')
  .option('-d, --description <desc>', 'Project description')
  .action(async (projectPath, options) => {
    try {
      const project = addManualProject(projectPath, options.name, options.description);
      console.log(`✅ Added project: ${project.name}`);
      console.log(`   Path: ${project.path}`);
      if (project.techStack.length > 0) {
        console.log(`   Tech: ${project.techStack.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// remove command
program
  .command('remove')
  .description('Remove a project (does not delete files)')
  .argument('<project>', 'Project name or ID')
  .action(async (projectName) => {
    try {
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      removeProject(project.id);
      console.log(`✅ Removed project: ${project.name}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// start command
program
  .command('start')
  .description('Start Claude Code in a project')
  .argument('<project>', 'Project name or ID')
  .option('-t, --tools <tools>', 'Comma-separated list of allowed tools')
  .option('-p, --prompt <prompt>', 'Initial prompt to send')
  .action(async (projectName, options) => {
    try {
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        console.log('\nRegistered projects:');
        const allProjects = getAllProjects();
        for (const p of allProjects) {
          console.log(`  - ${p.name}`);
        }
        process.exit(1);
      }

      const allowedTools = options.tools?.split(',').map((t: string) => t.trim());

      console.log(`🚀 Starting Claude Code in ${project.name}...\n`);

      await startClaudeSession(project.id, {
        allowedTools,
        initialPrompt: options.prompt,
      });
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// status command
program
  .command('status')
  .description('Show current active sessions')
  .action(async () => {
    try {
      const sessions = await listRunningSessions();

      if (sessions.length === 0) {
        console.log('No active Claude Code sessions');
        return;
      }

      console.log(`\n🟢 ${sessions.length} active session(s):\n`);

      for (const session of sessions) {
        const duration = formatSessionDuration({
          id: session.sessionId,
          projectId: session.projectId,
          startedAt: session.startedAt,
          status: 'active',
        });

        console.log(`  ${session.projectName}`);
        console.log(`    Path: ${session.projectPath}`);
        console.log(`    Started: ${new Date(session.startedAt).toLocaleString()}`);
        console.log(`    Duration: ${duration}`);
        console.log(`    PID: ${session.pid}`);
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// history command
program
  .command('history')
  .description('Show session history for a project')
  .argument('<project>', 'Project name or ID')
  .option('-l, --limit <n>', 'Number of sessions to show', '10')
  .action(async (projectName, options) => {
    try {
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      const limit = parseInt(options.limit, 10);
      const sessions = getSessionHistory(project.id, limit);

      if (sessions.length === 0) {
        console.log(`No sessions recorded for ${project.name}`);
        return;
      }

      console.log(`\n📜 Session history for ${project.name}:\n`);

      for (const session of sessions) {
        const statusIcon = session.status === 'completed' ? '✓' : session.status === 'active' ? '●' : '○';
        const duration = formatSessionDuration(session);
        const date = new Date(session.startedAt).toLocaleString();

        console.log(`  ${statusIcon} ${date} - ${duration} (${session.status})`);
        if (session.summary) {
          console.log(`    ${session.summary}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// activity command
program
  .command('activity')
  .description('Show recent activity for a project')
  .argument('[project]', 'Project name or ID (omit for all projects)')
  .option('-l, --limit <n>', 'Number of activities to show', '20')
  .action(async (projectName, options) => {
    try {
      const limit = parseInt(options.limit, 10);
      let activities;
      let project = null;

      if (projectName) {
        project = findProjectByName(projectName);
        if (!project) {
          console.error(`❌ Project not found: ${projectName}`);
          process.exit(1);
        }
        activities = listActivitiesForProject(project.id, limit);
      } else {
        const { listRecentActivities } = await import('./db.js');
        activities = listRecentActivities(limit);
      }

      if (activities.length === 0) {
        console.log(project ? `No activity recorded for ${project.name}` : 'No recent activity');
        return;
      }

      const title = project ? `Recent activity for ${project.name}` : 'Recent activity';
      console.log(`\n📊 ${title}:\n`);

      for (const activity of activities) {
        const time = new Date(activity.timestamp).toLocaleString();
        const icon =
          activity.type === 'start' ? '▶️' : activity.type === 'complete' ? '⏹️' : activity.type === 'discover' ? '🔍' : activity.type === 'add' ? '➕' : activity.type === 'remove' ? '➖' : '📝';

        console.log(`  ${icon} ${activity.type} - ${time}`);
        if (activity.details) {
          const details = Object.entries(activity.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          console.log(`     ${details}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// config command
program
  .command('config')
  .description('View or modify configuration')
  .option('-a, --add-path <path>', 'Add a scan path')
  .option('-r, --remove-path <path>', 'Remove a scan path')
  .option('-l, --list', 'List current configuration')
  .action(async (options) => {
    try {
      const config = loadConfig();

      if (options.list || (!options.addPath && !options.removePath)) {
        console.log('\n⚙️  MaxClaw Configuration:\n');
        console.log('Scan paths:');
        for (const p of config.scanPaths) {
          console.log(`  - ${p}`);
        }
        console.log(`\nData directory: ${config.dataDir}`);
        return;
      }

      if (options.addPath) {
        const resolvedPath = fs.realpathSync(options.addPath);
        if (!config.scanPaths.includes(resolvedPath)) {
          config.scanPaths.push(resolvedPath);
          saveConfig(config);
          console.log(`✅ Added scan path: ${resolvedPath}`);
        } else {
          console.log(`Path already in scan list: ${resolvedPath}`);
        }
      }

      if (options.removePath) {
        const initialLength = config.scanPaths.length;
        config.scanPaths = config.scanPaths.filter((p) => p !== options.removePath);
        if (config.scanPaths.length < initialLength) {
          saveConfig(config);
          console.log(`✅ Removed scan path: ${options.removePath}`);
        } else {
          console.log(`Path not found in scan list: ${options.removePath}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
