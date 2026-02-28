#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

import { loadConfig, saveConfig, VERSION, DATA_DIR } from './config.js';
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
  regenerateSessionSummary,
} from './session-manager.js';
import { listActivitiesForProject, getSession, getProject, listSessionsForProject, getScheduleLogs } from './db.js';
import type { TaskPriority } from './types.js';
import {
  initSkillRegistry,
  loadAllSkills,
  saveSkillRecord,
  setSkillEnabled,
  getExternalSkillsDir,
  getBuiltinSkillsDir,
  ensureExternalSkillsDir,
} from './skills/index.js';
import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

// Template imports
import { listTemplates, createProject, createTemplate, deleteTemplate, showTemplateDetails } from './template-manager.js';

const program = new Command();

program.name('maxclaw').description('Personal project assistant for Claude Code').version(VERSION);

// Initialize database on startup
initDatabase();

// Initialize skill registry
const db = new Database(DB_PATH);
const skillRegistry = initSkillRegistry(db);

// Load and register all skills on startup
async function initializeSkills(): Promise<void> {
  try {
    const { loaded, failed } = await loadAllSkills();

    for (const result of loaded) {
      if (result.skill && result.record) {
        // Check if skill was previously disabled
        const existingRecord = skillRegistry.getRecord(result.record.name);
        if (existingRecord && !existingRecord.enabled) {
          result.record.enabled = false;
        }

        await skillRegistry.register(result.skill, result.record);
        saveSkillRecord(db, result.record);
      }
    }

    if (failed.length > 0) {
      for (const result of failed) {
        if (result.record) {
          saveSkillRecord(db, result.record);
        }
        logger.warn('Failed to load skill: %s - %s', result.record?.name, result.error);
      }
    }

    logger.info('Skills initialized: %d loaded, %d failed', loaded.length, failed.length);
  } catch (error) {
    logger.error('Failed to initialize skills: %s', error);
  }
}

// Initialize skills asynchronously
await initializeSkills();

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

// team command - Team management
const teamCommand = program
  .command('team')
  .description('Manage agent teams');

// team create
teamCommand
  .command('create <name>')
  .description('Create a new team')
  .requiredOption('-p, --project <project>', 'Project ID or name')
  .requiredOption('-l, --lead <lead>', 'Team lead name')
  .option('--max-members <n>', 'Maximum team members', '5')
  .action(async (name, options) => {
    try {
      const { createNewTeam } = await import('./team-manager.js');
      const project = findProjectByName(options.project);
      if (!project) {
        console.error(`❌ Project not found: ${options.project}`);
        process.exit(1);
      }

      const team = await createNewTeam(name, project.id, options.lead, {
        maxMembers: parseInt(options.maxMembers, 10),
        coordinationMode: 'hierarchical',
        autoAssign: false,
      });

      console.log(`✅ Created team: ${team.name}`);
      console.log(`   Project: ${project.name}`);
      console.log(`   Lead: ${team.lead.name}`);
      console.log(`   Max members: ${options.maxMembers}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team list
teamCommand
  .command('list')
  .description('List all teams')
  .option('-p, --project <project>', 'Filter by project')
  .action(async (options) => {
    try {
      const { listAllTeams, listTeamsByProject } = await import('./team-manager.js');

      let teams;
      if (options.project) {
        const project = findProjectByName(options.project);
        if (!project) {
          console.error(`❌ Project not found: ${options.project}`);
          process.exit(1);
        }
        teams = listTeamsByProject(project.id);
      } else {
        teams = listAllTeams();
      }

      if (teams.length === 0) {
        console.log('No teams found.');
        return;
      }

      console.log(`\n👥 ${teams.length} team(s):\n`);
      for (const team of teams) {
        const statusIcon = team.status === 'active' ? '🟢' : '⚪';
        console.log(`  ${statusIcon} ${team.name}`);
        console.log(`     Project: ${(await import('./db.js')).getProject(team.projectId)?.name ?? 'Unknown'}`);
        console.log(`     Lead: ${team.lead.name}`);
        console.log(`     Members: ${team.members.length}`);
        console.log(`     Status: ${team.status}`);
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team show
teamCommand
  .command('show <team>')
  .description('Show team details')
  .action(async (teamName) => {
    try {
      const { getTeamByNameWithMembers } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      console.log(`\n👥 Team: ${team.name}\n`);
      console.log(`  Status: ${team.status}`);
      console.log(`  Lead: ${team.lead.name} (${team.lead.role})`);
      console.log(`  Members (${team.members.length}):`);

      for (const member of team.members) {
        const specialty = member.specialty.length > 0 ? ` [${member.specialty.join(', ')}]` : '';
        const statusIcon = member.status === 'busy' ? '🔴' : member.status === 'idle' ? '🟢' : '⚪';
        console.log(`    ${statusIcon} ${member.name} (${member.role})${specialty}`);
      }

      // Show active session if any
      const { getActiveTeamSession } = await import('./team-manager.js');
      const session = getActiveTeamSession(team.id);
      if (session) {
        console.log(`\n  🟢 Active Session:`);
        console.log(`    Started: ${new Date(session.startedAt).toLocaleString()}`);
        if (session.goal) {
          console.log(`    Goal: ${session.goal}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team remove
teamCommand
  .command('remove <team>')
  .description('Remove a team')
  .action(async (teamName) => {
    try {
      const { getTeamByNameWithMembers, removeTeam } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      removeTeam(team.id);
      console.log(`✅ Removed team: ${team.name}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team add-member
teamCommand
  .command('add-member <team> <name>')
  .description('Add a member to a team')
  .option('-r, --role <role>', 'Member role', 'developer')
  .option('-s, --specialty <specialties>', 'Comma-separated specialties')
  .action(async (teamName, memberName, options) => {
    try {
      const { getTeamByNameWithMembers, addMemberToTeam } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const specialty = options.specialty?.split(',').map((s: string) => s.trim()) ?? [];
      const member = addMemberToTeam(team.id, memberName, options.role, specialty);

      console.log(`✅ Added member: ${member.name}`);
      console.log(`   Role: ${member.role}`);
      if (specialty.length > 0) {
        console.log(`   Specialty: ${specialty.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team remove-member
teamCommand
  .command('remove-member <team> <name>')
  .description('Remove a member from a team')
  .action(async (teamName, memberName) => {
    try {
      const { getTeamByNameWithMembers, removeMemberFromTeam } = await import('./team-manager.js');
      const { listTeamMembers } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === memberName);

      if (!member) {
        console.error(`❌ Member not found: ${memberName}`);
        process.exit(1);
      }

      removeMemberFromTeam(team.id, member.id);
      console.log(`✅ Removed member: ${memberName}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team start
teamCommand
  .command('start <team>')
  .description('Start a team session')
  .option('-g, --goal <goal>', 'Session goal/description')
  .action(async (teamName, options) => {
    try {
      const { getTeamByNameWithMembers, startTeamSession } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const session = await startTeamSession(team.id, options.goal);
      console.log(`🚀 Started team session: ${session.id}`);
      console.log(`   Team: ${team.name}`);
      if (options.goal) {
        console.log(`   Goal: ${options.goal}`);
      }
      console.log(`   Members ready: ${team.members.length}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team stop
teamCommand
  .command('stop <team>')
  .description('Stop a team session')
  .option('-s, --summary <summary>', 'Session summary')
  .action(async (teamName, options) => {
    try {
      const { getTeamByNameWithMembers, stopTeamSession } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      stopTeamSession(team.id, options.summary);
      console.log(`⏹️  Stopped team session for: ${team.name}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team status
teamCommand
  .command('status <team>')
  .description('Show team session status')
  .action(async (teamName) => {
    try {
      const { getTeamByNameWithMembers, getActiveTeamSession } = await import('./team-manager.js');
      const { listTeamTasksForSession, listTeamMessagesForSession } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      console.log(`\n👥 Team: ${team.name}`);
      console.log(`Status: ${team.status}\n`);

      const session = getActiveTeamSession(team.id);
      if (!session) {
        console.log('No active session.');
        return;
      }

      console.log('🟢 Active Session:');
      console.log(`  Started: ${new Date(session.startedAt).toLocaleString()}`);
      if (session.goal) {
        console.log(`  Goal: ${session.goal}`);
      }

      const tasks = listTeamTasksForSession(session.id);
      const pending = tasks.filter((t) => t.status === 'pending').length;
      const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
      const completed = tasks.filter((t) => t.status === 'completed').length;

      console.log(`\n  Tasks: ${tasks.length} total (${pending} pending, ${inProgress} in progress, ${completed} completed)`);

      const messages = listTeamMessagesForSession(session.id, 5);
      if (messages.length > 0) {
        console.log(`\n  Recent messages:`);
        for (const msg of messages.reverse()) {
          const from = team.members.find((m) => m.id === msg.fromId)?.name ?? 'System';
          console.log(`    [${msg.type}] ${from}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team log
teamCommand
  .command('log <team>')
  .description('Show team communication log')
  .option('-n, --limit <n>', 'Number of messages to show', '20')
  .action(async (teamName, options) => {
    try {
      const { getTeamByNameWithMembers, getActiveTeamSession } = await import('./team-manager.js');
      const { listTeamMessagesForSession } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const session = getActiveTeamSession(team.id);
      if (!session) {
        console.log('No active session to show log.');
        return;
      }

      const limit = parseInt(options.limit, 10);
      const messages = listTeamMessagesForSession(session.id, limit);

      console.log(`\n📜 Team Log: ${team.name}\n`);

      if (messages.length === 0) {
        console.log('No messages yet.');
        return;
      }

      for (const msg of messages.reverse()) {
        const from = team.members.find((m) => m.id === msg.fromId)?.name ?? 'System';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const icon = msg.type === 'task_assigned' ? '📋' : msg.type === 'result' ? '✅' : msg.type === 'status_update' ? '📊' : msg.type === 'question' ? '❓' : '💬';
        console.log(`  ${icon} [${time}] ${from}: ${msg.content}`);
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team assign-task (legacy - kept for backward compatibility)
teamCommand
  .command('assign-task <team> <member> <title>')
  .description('Assign a task to a team member')
  .option('-d, --description <desc>', 'Task description')
  .action(async (teamName, memberName, title, options) => {
    try {
      const { getTeamByNameWithMembers, getActiveTeamSession, assignTaskToMember } = await import('./team-manager.js');
      const { listTeamMembers } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const session = getActiveTeamSession(team.id);
      if (!session) {
        console.error(`❌ No active session for team ${teamName}. Start a session first.`);
        process.exit(1);
      }

      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === memberName);

      if (!member) {
        console.error(`❌ Member not found: ${memberName}`);
        process.exit(1);
      }

      const task = assignTaskToMember(session.id, member.id, title, options.description);
      console.log(`✅ Assigned task: ${task.title}`);
      console.log(`   To: ${memberName}`);
      console.log(`   Status: ${task.status}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// E7: team assign - Smart task assignment
teamCommand
  .command('assign <team> <task-title>')
  .description('Smart assign a task to the best team member')
  .option('-t, --type <type>', 'Task type (feature, bug, review, refactor, docs, test)', 'feature')
  .option('-s, --skills <skills>', 'Comma-separated required skills')
  .option('-p, --priority <n>', 'Task priority (1-5)', '3')
  .option('-d, --description <desc>', 'Task description')
  .option('-m, --member <member>', 'Manually specify member (bypass smart assignment)')
  .action(async (teamName, title, options) => {
    try {
      const {
        getTeamByNameWithMembers,
        getActiveTeamSession,
        suggestSmartTaskAssignment,
        createTaskWithSmartAssignment,
      } = await import('./team-manager.js');
      const { listTeamMembers } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const session = getActiveTeamSession(team.id);
      if (!session) {
        console.error(`❌ No active session for team ${teamName}. Start a session first.`);
        process.exit(1);
      }

      const requiredSkills = options.skills?.split(',').map((s: string) => s.trim()) ?? [];
      const priority = parseInt(options.priority, 10) as TaskPriority;

      // If member is manually specified, use that
      let assigneeId: string | undefined;
      if (options.member) {
        const members = listTeamMembers(team.id);
        const member = members.find((m) => m.name === options.member);
        if (!member) {
          console.error(`❌ Member not found: ${options.member}`);
          process.exit(1);
        }
        assigneeId = member.id;
      }

      // Show smart assignment recommendations
      console.log(`\n🎯 Task: ${title}`);
      console.log(`   Type: ${options.type}`);
      if (requiredSkills.length > 0) {
        console.log(`   Required Skills: ${requiredSkills.join(', ')}`);
      }
      console.log(`   Priority: ${priority}\n`);

      if (!assigneeId) {
        // Get smart recommendations
        const recommendations = suggestSmartTaskAssignment(team.id, requiredSkills, options.type);

        if (recommendations.length === 0) {
          console.error('❌ No available team members (all at capacity)');
          process.exit(1);
        }

        console.log('📊 Smart Assignment Recommendations:\n');
        console.log('  Rank | Member           | Score | Skill Match | Workload | Tasks');
        console.log('  -----|------------------|-------|-------------|----------|------');

        recommendations.slice(0, 5).forEach((rec, index) => {
          const rank = index + 1;
          const name = rec.member.name.padEnd(16);
          const score = (rec.overallScore * 100).toFixed(1).padStart(5);
          const skillMatch = (rec.skillMatchScore * 100).toFixed(0).padStart(3);
          const workload = (rec.workloadFactor * 100).toFixed(0).padStart(3);
          const tasks = `${rec.currentTasks}/${rec.maxTasks}`.padStart(5);
          const indicator = index === 0 ? ' ⭐' : '';
          console.log(`   ${rank}   | ${name} | ${score}% |    ${skillMatch}%    |   ${workload}%  | ${tasks}${indicator}`);
        });

        console.log(`\n✅ Recommended: ${recommendations[0].member.name}`);
        console.log(`   (Use --member=<name> to override)\n`);

        // Use the top recommendation
        assigneeId = recommendations[0].member.id;
      } else {
        console.log(`👤 Manual assignment: ${options.member}\n`);
      }

      // Create the task
      const task = await createTaskWithSmartAssignment(session.id, title, {
        description: options.description,
        type: options.type,
        requiredSkills,
        priority,
        assigneeId,
      });

      const member = listTeamMembers(team.id).find((m) => m.id === task.assigneeId);

      console.log(`✅ Task assigned successfully!`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Assigned to: ${member?.name ?? 'Unknown'}`);
      console.log(`   Status: ${task.status}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// E7: team member set-expertise
const teamMemberCommand = teamCommand
  .command('member')
  .description('Manage team members');

teamMemberCommand
  .command('set-expertise <team> <member> <skills>')
  .description('Set member expertise (comma-separated skills)')
  .action(async (teamName, memberName, skills) => {
    try {
      const { getTeamByNameWithMembers, updateMemberExpertise } = await import('./team-manager.js');
      const { listTeamMembers } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === memberName);

      if (!member) {
        console.error(`❌ Member not found: ${memberName}`);
        process.exit(1);
      }

      const expertise = skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      updateMemberExpertise(member.id, expertise);

      console.log(`✅ Updated ${memberName}'s expertise:`);
      console.log(`   ${expertise.join(', ')}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// E7: team member set-capacity
teamMemberCommand
  .command('set-capacity <team> <member> <max-tasks>')
  .description('Set member max concurrent tasks (1-10)')
  .action(async (teamName, memberName, maxTasksStr) => {
    try {
      const { getTeamByNameWithMembers, updateMemberCapacity } = await import('./team-manager.js');
      const { listTeamMembers } = await import('./db.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === memberName);

      if (!member) {
        console.error(`❌ Member not found: ${memberName}`);
        process.exit(1);
      }

      const maxTasks = parseInt(maxTasksStr, 10);
      updateMemberCapacity(member.id, maxTasks);

      console.log(`✅ Updated ${memberName}'s max concurrent tasks to ${maxTasks}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// E7: team workload
teamCommand
  .command('workload <team>')
  .description('Show team workload distribution')
  .action(async (teamName) => {
    try {
      const { getTeamByNameWithMembers, getTeamWorkloadDistribution } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      const workload = getTeamWorkloadDistribution(team.id);

      console.log(`\n📊 Workload Distribution: ${team.name}\n`);
      console.log('  Member           | Tasks | Capacity | Utilization | Status');
      console.log('  -----------------|-------|----------|-------------|--------');

      for (const item of workload) {
        const name = item.member.name.padEnd(16);
        const tasks = item.currentTasks.toString().padStart(5);
        const capacity = item.maxTasks.toString().padStart(8);
        const utilization = `${(item.utilization * 100).toFixed(0)}%`.padStart(11);

        let status: string;
        if (item.utilization >= 1) {
          status = '🔴 Full';
        } else if (item.utilization >= 0.7) {
          status = '🟡 Busy';
        } else {
          status = '🟢 Available';
        }

        console.log(`  ${name} | ${tasks} | ${capacity} | ${utilization} | ${status}`);
      }

      // Summary
      const totalTasks = workload.reduce((sum, w) => sum + w.currentTasks, 0);
      const totalCapacity = workload.reduce((sum, w) => sum + w.maxTasks, 0);
      const teamUtilization = totalCapacity > 0 ? (totalTasks / totalCapacity) * 100 : 0;

      console.log(`\n  Team Summary:`);
      console.log(`    Total Active Tasks: ${totalTasks}`);
      console.log(`    Total Capacity: ${totalCapacity}`);
      console.log(`    Team Utilization: ${teamUtilization.toFixed(1)}%`);
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// team complete-task (for testing/demo)
teamCommand
  .command('complete-task <team> <task-id>')
  .description('Mark a task as completed (for demo)')
  .option('-r, --result <result>', 'Task result')
  .action(async (teamName, taskId, options) => {
    try {
      const { getTeamByNameWithMembers, completeTask } = await import('./team-manager.js');
      const team = getTeamByNameWithMembers(teamName);

      if (!team) {
        console.error(`❌ Team not found: ${teamName}`);
        process.exit(1);
      }

      completeTask(taskId, options.result);
      console.log(`✅ Completed task: ${taskId}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== Skill Commands =====

const skillCommand = program.command('skill').description('Manage and run skills');

// skill list
skillCommand
  .command('list')
  .description('List all available skills')
  .option('-a, --all', 'Show all skills including disabled')
  .action(async (options) => {
    try {
      const records = skillRegistry.getAllRecords();
      const enabledSkills = records.filter((r) => r.enabled);
      const disabledSkills = records.filter((r) => !r.enabled);

      if (records.length === 0) {
        console.log('No skills found.');
        console.log(`\nBuilt-in skills directory: ${getBuiltinSkillsDir()}`);
        console.log(`External skills directory: ${getExternalSkillsDir()}`);
        return;
      }

      console.log(`\n🔌 ${enabledSkills.length} enabled skill(s):\n`);
      for (const record of enabledSkills) {
        const skill = skillRegistry.get(record.name);
        const commandCount = skill?.manifest.commands.length ?? 0;
        const sourceIcon = record.source === 'builtin' ? '📦' : '🔌';
        console.log(`  ${sourceIcon} ${record.name} v${record.version}`);
        console.log(`     Commands: ${commandCount}`);
        if (skill) {
          console.log(`     ${skill.manifest.description}`);
        }
        console.log();
      }

      if (options.all && disabledSkills.length > 0) {
        console.log(`⚪ ${disabledSkills.length} disabled skill(s):\n`);
        for (const record of disabledSkills) {
          const sourceIcon = record.source === 'builtin' ? '📦' : '🔌';
          console.log(`  ${sourceIcon} ${record.name} v${record.version}`);
          if (record.error) {
            console.log(`     Error: ${record.error}`);
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill enable
skillCommand
  .command('enable <name>')
  .description('Enable a skill')
  .action(async (name) => {
    try {
      const success = await skillRegistry.enable(name);
      if (success) {
        setSkillEnabled(db, name, true);
        console.log(`✅ Enabled skill: ${name}`);
      } else {
        console.error(`❌ Failed to enable skill: ${name}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill disable
skillCommand
  .command('disable <name>')
  .description('Disable a skill')
  .action(async (name) => {
    try {
      const success = await skillRegistry.disable(name);
      if (success) {
        setSkillEnabled(db, name, false);
        console.log(`✅ Disabled skill: ${name}`);
      } else {
        console.error(`❌ Failed to disable skill: ${name}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill run
skillCommand
  .command('run <name> <command>')
  .description('Run a skill command')
  .argument('[args...]', 'Command arguments')
  .option('-o, --option <key=value>', 'Command options', [])
  .action(async (skillName, commandName, args, options) => {
    try {
      // Parse options
      const parsedOptions: Record<string, unknown> = {};
      if (options.option) {
        for (const opt of options.option) {
          const [key, value] = opt.split('=');
          if (key && value !== undefined) {
            // Try to parse as number or boolean
            if (value === 'true') {
              parsedOptions[key] = true;
            } else if (value === 'false') {
              parsedOptions[key] = false;
            } else if (!isNaN(Number(value))) {
              parsedOptions[key] = Number(value);
            } else {
              parsedOptions[key] = value;
            }
          }
        }
      }

      const result = await skillRegistry.execute(skillName, commandName, args, parsedOptions);
      if (result !== undefined) {
        console.log(result);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill info
skillCommand
  .command('info <name>')
  .description('Show detailed information about a skill')
  .action(async (name) => {
    try {
      const help = skillRegistry.getHelp(name);
      console.log(help);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill install (placeholder for future implementation)
skillCommand
  .command('install <path>')
  .description('Install an external skill from a directory')
  .action(async (skillPath) => {
    try {
      const resolvedPath = path.resolve(skillPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`❌ Path not found: ${resolvedPath}`);
        process.exit(1);
      }

      // Check if it's a valid skill
      const { loadManifest } = await import('./skills/skill-loader.js');
      const manifestResult = loadManifest(resolvedPath);

      if (!manifestResult.success) {
        console.error(`❌ Invalid skill: ${manifestResult.error}`);
        process.exit(1);
      }

      // Copy to external skills directory
      const targetPath = path.join(getExternalSkillsDir(), manifestResult.manifest!.name);
      if (fs.existsSync(targetPath)) {
        console.error(`❌ Skill "${manifestResult.manifest!.name}" is already installed`);
        process.exit(1);
      }

      // Simple copy (in production, this should be more robust)
      fs.cpSync(resolvedPath, targetPath, { recursive: true });

      console.log(`✅ Installed skill: ${manifestResult.manifest!.name}`);
      console.log(`   Version: ${manifestResult.manifest!.version}`);
      console.log(`   Location: ${targetPath}`);
      console.log(`\nRun "maxclaw skill enable ${manifestResult.manifest!.name}" to enable it.`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill uninstall
skillCommand
  .command('uninstall <name>')
  .description('Uninstall an external skill')
  .action(async (name) => {
    try {
      const record = skillRegistry.getRecord(name);
      if (!record) {
        console.error(`❌ Skill not found: ${name}`);
        process.exit(1);
      }

      if (record.source === 'builtin') {
        console.error(`❌ Cannot uninstall built-in skill: ${name}`);
        process.exit(1);
      }

      // Disable first
      if (record.enabled) {
        await skillRegistry.disable(name);
      }

      // Remove from database
      const { deleteSkillRecord } = await import('./skills/skill-db.js');
      deleteSkillRecord(db, name);

      // Remove directory
      fs.rmSync(record.path, { recursive: true, force: true });

      console.log(`✅ Uninstalled skill: ${name}`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// skill create-template
skillCommand
  .command('create-template <name>')
  .description('Create a new skill template in the external skills directory')
  .action(async (name) => {
    try {
      // Validate name
      if (!/^[a-z0-9-]+$/.test(name)) {
        console.error('❌ Skill name must contain only lowercase letters, numbers, and hyphens');
        process.exit(1);
      }

      ensureExternalSkillsDir();
      const skillDir = path.join(getExternalSkillsDir(), name);

      if (fs.existsSync(skillDir)) {
        console.error(`❌ Skill "${name}" already exists`);
        process.exit(1);
      }

      fs.mkdirSync(skillDir, { recursive: true });

      // Create skill.yaml
      const manifest = `name: ${name}
version: 1.0.0
description: A new skill for MaxClaw
author: Your Name
commands:
  - name: hello
    description: Say hello
    args:
      - name: name
        description: Name to greet
        required: false
permissions:
  - fs:read
`;

      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), manifest);

      // Create index.ts
      const indexTs = `// ${name} skill for MaxClaw

import type { Skill, SkillContext, SkillManifest } from '../../src/skills/types.js';

const manifest: SkillManifest = {
  name: '${name}',
  version: '1.0.0',
  description: 'A new skill for MaxClaw',
  commands: [
    {
      name: 'hello',
      description: 'Say hello',
      args: [
        {
          name: 'name',
          description: 'Name to greet',
          required: false,
        },
      ],
    },
  ],
  permissions: ['fs:read'],
};

let context: SkillContext | null = null;

const skill: Skill = {
  manifest,

  async activate(ctx: SkillContext): Promise<void> {
    context = ctx;
    context.logger.info('${name} skill activated!');
  },

  async deactivate(): Promise<void> {
    context?.logger.info('${name} skill deactivated!');
    context = null;
  },

  async execute(
    commandName: string,
    args: string[],
    options: Record<string, unknown>
  ): Promise<string> {
    if (!context) {
      throw new Error('Skill not activated');
    }

    switch (commandName) {
      case 'hello': {
        const name = args[0] || 'World';
        return \`Hello, \${name}! This is the ${name} skill.\`;
      }

      default:
        throw new Error(\`Unknown command: \${commandName}\`);
    }
  },
};

export default skill;
`;

      fs.writeFileSync(path.join(skillDir, 'index.ts'), indexTs);

      console.log(`✅ Created skill template: ${name}`);
      console.log(`   Location: ${skillDir}`);
      console.log('\nNext steps:');
      console.log(`  1. Edit ${path.join(skillDir, 'skill.yaml')} to define your skill`);
      console.log(`  2. Edit ${path.join(skillDir, 'index.ts')} to implement your skill logic`);
      console.log(`  3. Run "maxclaw skill enable ${name}" to enable it`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== Summary Commands =====

const summaryCommand = program.command('summary').description('Manage session summaries');

// summary view
summaryCommand
  .command('view <session-id>')
  .alias('show')
  .description('View summary for a session')
  .option('-j, --json', 'Output as JSON')
  .action(async (sessionId, options) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        console.error(`❌ Session not found: ${sessionId}`);
        process.exit(1);
      }

      if (!session.summary) {
        console.log(`\n📝 No summary available for session ${sessionId}`);
        console.log(`Status: ${session.summaryStatus || 'pending'}`);
        if (session.summaryStatus === 'failed') {
          console.log('\nUse "maxclaw summary generate <session-id>" to retry.');
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({
          sessionId: session.id,
          projectId: session.projectId,
          status: session.status,
          summaryStatus: session.summaryStatus,
          summaryGeneratedAt: session.summaryGeneratedAt,
          summary: session.summary,
        }, null, 2));
        return;
      }

      const project = getProject(session.projectId);
      const duration = formatSessionDuration(session);

      console.log(`\n📝 Session Summary`);
      console.log(`   Session: ${session.id}`);
      console.log(`   Project: ${project?.name || session.projectId}`);
      console.log(`   Duration: ${duration}`);
      console.log(`   Status: ${session.status}`);
      if (session.summaryGeneratedAt) {
        console.log(`   Generated: ${new Date(session.summaryGeneratedAt).toLocaleString()}`);
      }
      console.log();
      console.log(session.summary);
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// summary generate
summaryCommand
  .command('generate <session-id>')
  .description('Manually generate or regenerate summary for a session')
  .action(async (sessionId) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        console.error(`❌ Session not found: ${sessionId}`);
        process.exit(1);
      }

      if (session.status === 'active') {
        console.error(`❌ Cannot generate summary for active session: ${sessionId}`);
        console.error('   Stop the session first.');
        process.exit(1);
      }

      console.log(`🤖 Generating summary for session ${sessionId}...`);

      const updatedSession = await regenerateSessionSummary(sessionId);

      if (updatedSession?.summary) {
        console.log('✅ Summary generated successfully!');
        console.log();
        console.log(updatedSession.summary);
      } else {
        console.error('❌ Failed to generate summary');
        console.error('   Check that ANTHROPIC_API_KEY is set and session logs are available.');
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// summary list
summaryCommand
  .command('list [project]')
  .description('List all sessions with summaries')
  .option('-l, --limit <n>', 'Number of summaries to show', '20')
  .action(async (projectName, options) => {
    try {
      let projectId: string | undefined;

      if (projectName) {
        const project = findProjectByName(projectName);
        if (!project) {
          console.error(`❌ Project not found: ${projectName}`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const limit = parseInt(options.limit, 10);
      const sessions = listSessionsForProject(projectId || '').slice(0, limit);

      if (sessions.length === 0) {
        if (projectName) {
          console.log(`\n📝 No summaries found for project: ${projectName}`);
        } else {
          console.log('\n📝 No session summaries found.');
        }
        console.log('\nSummaries are generated automatically when sessions end.');
        console.log('Use "maxclaw summary generate <session-id>" to manually generate one.');
        return;
      }

      const title = projectName ? `Summaries for ${projectName}` : 'Session Summaries';
      console.log(`\n📝 ${title}:\n`);

      for (const session of sessions) {
        const project = getProject(session.projectId);
        const duration = formatSessionDuration(session);
        const date = new Date(session.startedAt).toLocaleDateString();

        console.log(`  📄 ${session.id}`);
        console.log(`     Project: ${project?.name || session.projectId}`);
        console.log(`     Date: ${date} | Duration: ${duration}`);

        if (session.summary) {
          // Show first line of summary as preview
          const preview = session.summary.split('\n')[0].substring(0, 60);
          console.log(`     Preview: ${preview}...`);
        }
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== E3: Schedule Commands =====

const scheduleCommand = program.command('schedule').description('Manage scheduled tasks');

// schedule list
scheduleCommand
  .command('list [project]')
  .description('List all scheduled tasks')
  .action(async (projectName) => {
    try {
      const {
        listAllSchedules,
        listProjectSchedules,
      } = await import('./scheduler-manager.js');
      const { findProjectByName } = await import('./project-manager.js');

      let schedules;
      if (projectName) {
        const project = findProjectByName(projectName);
        if (!project) {
          console.error(`❌ Project not found: ${projectName}`);
          process.exit(1);
        }
        schedules = listProjectSchedules(project.id);
      } else {
        schedules = listAllSchedules();
      }

      if (schedules.length === 0) {
        console.log(projectName ? `No schedules for project: ${projectName}` : 'No schedules found.');
        return;
      }

      console.log(`\n📅 ${schedules.length} schedule(s):\n`);

      for (const schedule of schedules) {
        const statusIcon = schedule.enabled ? '🟢' : '⚪';
        const project = getProject(schedule.projectId);

        console.log(`  ${statusIcon} ${schedule.name} (${schedule.taskType})`);
        console.log(`     ID: ${schedule.id}`);
        console.log(`     Project: ${project?.name ?? schedule.projectId}`);
        console.log(`     Cron: ${schedule.cronExpression}`);
        if (schedule.nextRun) {
          console.log(`     Next run: ${new Date(schedule.nextRun).toLocaleString()}`);
        }
        if (schedule.lastRun) {
          console.log(`     Last run: ${new Date(schedule.lastRun).toLocaleString()}`);
        }
        console.log(`     Run count: ${schedule.runCount}`);
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule add
scheduleCommand
  .command('add <project> <name>')
  .description('Add a new scheduled task')
  .requiredOption('--cron <expression>', 'Cron expression (e.g., "0 9 * * *")')
  .requiredOption('--type <type>', 'Task type: reminder, backup, command, skill')
  .option('--message <text>', 'Message for reminder type')
  .option('--command <cmd>', 'Shell command for command type')
  .option('--skill <name>', 'Skill name for skill type')
  .option('--skill-cmd <command>', 'Skill command for skill type')
  .option('--skill-args <args>', 'Skill arguments (comma-separated)')
  .option('--description <desc>', 'Schedule description')
  .action(async (projectName, scheduleName, options) => {
    try {
      const { createNewSchedule } = await import('./scheduler-manager.js');
      const { findProjectByName } = await import('./project-manager.js');

      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      // Validate cron expression
      const { validateCronExpression } = await import('./scheduler.js');
      if (!validateCronExpression(options.cron)) {
        console.error(`❌ Invalid cron expression: ${options.cron}`);
        process.exit(1);
      }

      // Validate task type
      const validTypes = ['reminder', 'backup', 'command', 'skill'];
      if (!validTypes.includes(options.type)) {
        console.error(`❌ Invalid task type: ${options.type}. Must be one of: ${validTypes.join(', ')}`);
        process.exit(1);
      }

      // Validate type-specific options
      if (options.type === 'reminder' && !options.message) {
        console.error('❌ Reminder type requires --message');
        process.exit(1);
      }

      if (options.type === 'command' && !options.command) {
        console.error('❌ Command type requires --command');
        process.exit(1);
      }

      if (options.type === 'skill' && (!options.skill || !options.skillCmd)) {
        console.error('❌ Skill type requires --skill and --skill-cmd');
        process.exit(1);
      }

      const schedule = createNewSchedule({
        projectId: project.id,
        name: scheduleName,
        description: options.description,
        cronExpression: options.cron,
        taskType: options.type,
        command: options.command,
        skillName: options.skill,
        skillCommand: options.skillCmd,
        skillArgs: options.skillArgs?.split(',').map((s: string) => s.trim()),
        message: options.message,
      });

      console.log(`✅ Created schedule: ${schedule.name}`);
      console.log(`   ID: ${schedule.id}`);
      console.log(`   Type: ${schedule.taskType}`);
      console.log(`   Cron: ${schedule.cronExpression}`);
      if (schedule.nextRun) {
        console.log(`   Next run: ${new Date(schedule.nextRun).toLocaleString()}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule remove
scheduleCommand
  .command('remove <schedule-id>')
  .description('Remove a scheduled task')
  .action(async (scheduleId) => {
    try {
      const { removeSchedule } = await import('./scheduler-manager.js');

      const success = removeSchedule(scheduleId);
      if (success) {
        console.log(`✅ Removed schedule: ${scheduleId}`);
      } else {
        console.error(`❌ Schedule not found: ${scheduleId}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule enable
scheduleCommand
  .command('enable <schedule-id>')
  .description('Enable a scheduled task')
  .action(async (scheduleId) => {
    try {
      const { enableSchedule } = await import('./scheduler-manager.js');

      const success = enableSchedule(scheduleId);
      if (success) {
        console.log(`✅ Enabled schedule: ${scheduleId}`);
      } else {
        console.error(`❌ Schedule not found: ${scheduleId}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule disable
scheduleCommand
  .command('disable <schedule-id>')
  .description('Disable a scheduled task')
  .action(async (scheduleId) => {
    try {
      const { disableSchedule } = await import('./scheduler-manager.js');

      const success = disableSchedule(scheduleId);
      if (success) {
        console.log(`✅ Disabled schedule: ${scheduleId}`);
      } else {
        console.error(`❌ Schedule not found: ${scheduleId}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule run
scheduleCommand
  .command('run <schedule-id>')
  .description('Run a scheduled task immediately')
  .action(async (scheduleId) => {
    try {
      const { runScheduleNow } = await import('./scheduler-manager.js');

      console.log(`🚀 Running schedule: ${scheduleId}...`);
      const result = await runScheduleNow(scheduleId);

      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule logs
scheduleCommand
  .command('logs [schedule-id]')
  .description('View execution logs for a schedule')
  .option('-l, --limit <n>', 'Number of logs to show', '20')
  .action(async (scheduleId, options) => {
    try {
      const { listScheduleLogs } = await import('./db.js');
      const { getScheduleById } = await import('./scheduler-manager.js');

      if (!scheduleId) {
        console.error('❌ Schedule ID is required');
        process.exit(1);
      }

      const schedule = getScheduleById(scheduleId);
      if (!schedule) {
        console.error(`❌ Schedule not found: ${scheduleId}`);
        process.exit(1);
      }

      const limit = parseInt(options.limit, 10);
      const logs = getScheduleLogs(scheduleId, limit);

      if (logs.length === 0) {
        console.log(`No logs found for schedule: ${schedule.name}`);
        return;
      }

      console.log(`\n📋 Execution logs for "${schedule.name}":\n`);

      for (const log of logs) {
        const statusIcon = log.status === 'completed' ? '✅' : log.status === 'failed' ? '❌' : '⏳';
        const startedAt = new Date(log.startedAt).toLocaleString();

        console.log(`  ${statusIcon} ${log.status} - ${startedAt}`);
        if (log.duration) {
          console.log(`     Duration: ${log.duration}ms`);
        }
        if (log.output) {
          console.log(`     Output: ${log.output.substring(0, 100)}${log.output.length > 100 ? '...' : ''}`);
        }
        if (log.error) {
          console.log(`     Error: ${log.error.substring(0, 100)}${log.error.length > 100 ? '...' : ''}`);
        }
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// schedule status
scheduleCommand
  .command('status')
  .description('Show scheduler status')
  .action(async () => {
    try {
      const { getSchedulerStatus } = await import('./scheduler-manager.js');

      const status = getSchedulerStatus();

      console.log('\n📅 Scheduler Status:\n');
      console.log(`  Running: ${status.isRunning ? 'Yes 🟢' : 'No ⚪'}`);
      console.log(`  Check interval: ${status.checkInterval}ms`);
      if (status.lastCheck) {
        console.log(`  Last check: ${status.lastCheck.toLocaleString()}`);
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== E6: Notification Commands =====

const notifyCommand = program.command('notify').description('Manage notifications');

// notify config
notifyCommand
  .command('config <project>')
  .description('Configure notification webhook for a project')
  .requiredOption('--webhook <url>', 'Webhook URL')
  .option('--type <type>', 'Webhook type (feishu|wechat|slack|custom)', 'custom')
  .option('--level <level>', 'Minimum notification level (info|warning|error)', 'info')
  .action(async (projectName, options) => {
    try {
      const { configureNotification, sendTestNotification } = await import('./notifier.js');
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      // Validate notification type
      const validTypes = ['feishu', 'wechat', 'slack', 'custom'];
      if (!validTypes.includes(options.type)) {
        console.error(`❌ Invalid notification type: ${options.type}`);
        console.error(`   Valid types: ${validTypes.join(', ')}`);
        process.exit(1);
      }

      // Validate notification level
      const validLevels = ['info', 'warning', 'error'];
      if (!validLevels.includes(options.level)) {
        console.error(`❌ Invalid notification level: ${options.level}`);
        console.error(`   Valid levels: ${validLevels.join(', ')}`);
        process.exit(1);
      }

      // Update project notification config
      const result = await configureNotification(project.id, {
        webhook: options.webhook,
        type: options.type,
        level: options.level,
      });

      if (!result.success) {
        console.error(`❌ Failed to configure notification: ${result.error}`);
        process.exit(1);
      }

      console.log(`✅ Notification configured for project: ${project.name}`);
      console.log(`   Webhook: ${options.webhook}`);
      console.log(`   Type: ${options.type}`);
      console.log(`   Level: ${options.level}`);
      console.log(`\n💡 Run "maxclaw notify test ${projectName}" to test the configuration.`);
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// notify test
notifyCommand
  .command('test <project>')
  .description('Send a test notification')
  .action(async (projectName) => {
    try {
      const { sendTestNotification } = await import('./notifier.js');
      const { getProject } = await import('./db.js');

      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      // Refresh project data to get notification config
      const projectWithConfig = getProject(project.id);
      if (!projectWithConfig) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      if (!projectWithConfig.notificationWebhook) {
        console.error(`❌ No webhook configured for project: ${projectName}`);
        console.log(`\n💡 Run "maxclaw notify config ${projectName} --webhook=<url> --type=<type>" first.`);
        process.exit(1);
      }

      console.log(`🚀 Sending test notification to ${projectName}...`);
      const result = await sendTestNotification(projectWithConfig);

      if (result.success) {
        console.log(`✅ Test notification sent successfully!`);
        console.log(`   Webhook: ${projectWithConfig.notificationWebhook}`);
        console.log(`   Type: ${projectWithConfig.notificationType ?? 'custom'}`);
      } else {
        console.error(`❌ Failed to send test notification: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// notify send
notifyCommand
  .command('send <project> <message>')
  .description('Send a manual notification')
  .option('--level <level>', 'Notification level (info|warning|error)', 'info')
  .action(async (projectName, message, options) => {
    try {
      const { sendNotification } = await import('./notifier.js');
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      // Validate notification level
      const validLevels = ['info', 'warning', 'error'];
      if (!validLevels.includes(options.level)) {
        console.error(`❌ Invalid notification level: ${options.level}`);
        console.error(`   Valid levels: ${validLevels.join(', ')}`);
        process.exit(1);
      }

      console.log(`🚀 Sending ${options.level} notification to ${projectName}...`);
      const result = await sendNotification(project.id, message, {
        level: options.level,
      });

      if (result.success) {
        console.log(`✅ Notification sent successfully!`);
      } else {
        console.error(`❌ Failed to send notification: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// notify status
notifyCommand
  .command('status <project>')
  .description('Show notification configuration for a project')
  .action(async (projectName) => {
    try {
      const { getProject } = await import('./db.js');
      const project = findProjectByName(projectName);
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      // Refresh project data to get notification config
      const projectWithConfig = getProject(project.id);
      if (!projectWithConfig) {
        console.error(`❌ Project not found: ${projectName}`);
        process.exit(1);
      }

      console.log(`\n📢 Notification Configuration for "${projectWithConfig.name}":\n`);

      if (projectWithConfig.notificationWebhook) {
        console.log(`  Webhook: ${projectWithConfig.notificationWebhook}`);
        console.log(`  Type: ${projectWithConfig.notificationType ?? 'custom'}`);
        console.log(`  Level: ${projectWithConfig.notificationLevel ?? 'info'}`);
        console.log(`\n✅ Notifications are enabled`);
      } else {
        console.log(`  Webhook: Not configured`);
        console.log(`  Type: -`);
        console.log(`  Level: -`);
        console.log(`\n⚠️  Notifications are not configured`);
        console.log(`\n💡 Run "maxclaw notify config ${projectName} --webhook=<url> --type=<type>" to configure.`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== E8: Code Search Commands =====

// search command - Search code content
program
  .command('search <query>')
  .description('Search code content across projects')
  .option('-p, --projects <projects>', 'Comma-separated project names/IDs (default: all)')
  .option('-t, --type <type>', 'File type filter (e.g., ts, js, py)')
  .option('-l, --limit <n>', 'Max results per project', '50')
  .option('--context <n>', 'Lines of context around matches', '0')
  .option('--regex', 'Treat query as regular expression')
  .option('--case-sensitive', 'Case-sensitive search')
  .option('--no-cache', 'Disable result caching')
  .action(async (query, options) => {
    try {
      const { searchCode, formatSearchResults, clearSearchCache } = await import('./code-search.js');

      // Clear cache if requested
      if (options.noCache) {
        clearSearchCache();
      }

      const searchOptions = {
        projects: options.projects?.split(',').map((p: string) => p.trim()),
        type: options.type,
        limit: parseInt(options.limit, 10),
        contextLines: parseInt(options.context, 10),
        regex: options.regex,
        caseSensitive: options.caseSensitive,
      };

      console.log(`\n🔍 Searching for: ${query}`);
      if (options.type) {
        console.log(`   File type: ${options.type}`);
      }
      if (options.projects) {
        console.log(`   Projects: ${options.projects}`);
      }
      console.log();

      const results = await searchCode(query, searchOptions);

      // Format and display results
      const formatted = formatSearchResults(results, {
        highlight: true,
        showContext: searchOptions.contextLines! > 0,
      });

      console.log(formatted);

      if (results.total > 0) {
        console.log(`\n📊 Search completed in ${results.searchTime}ms`);
        console.log(`   Total matches: ${results.total}`);
        console.log(`   Projects searched: ${results.byProject.size}`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// search-files command - Search for files by pattern
program
  .command('search-files <pattern>')
  .description('Search for files by name pattern')
  .option('-p, --projects <projects>', 'Comma-separated project names/IDs (default: all)')
  .option('-l, --limit <n>', 'Max results', '100')
  .action(async (pattern: string, options: { projects?: string; limit?: string }) => {
    try {
      const { searchFiles } = await import('./code-search.js');

      const searchOptions = {
        projects: options.projects ? options.projects.split(',').map((p: string) => p.trim()) : undefined,
        limit: parseInt(options.limit ?? '100', 10),
      };

      console.log(`\n📁 Finding files: ${pattern}`);
      if (options.projects) {
        console.log(`   Projects: ${options.projects}`);
      }
      console.log();

      const results = await searchFiles(pattern, searchOptions);

      if (results.length === 0) {
        console.log('No files found.');
        return;
      }

      // Group by project
      const byProject = new Map<string, typeof results>();
      for (const result of results) {
        const projectId = result.project.id;
        if (!byProject.has(projectId)) {
          byProject.set(projectId, []);
        }
        byProject.get(projectId)!.push(result);
      }

      console.log(`\nFound ${results.length} file(s) in ${byProject.size} project(s):\n`);

      for (const [projectId, files] of byProject) {
        const projectName = files[0].project.name;
        console.log(`\n📂 ${projectName}`);
        console.log(`${'─'.repeat(50)}`);

        for (const file of files.slice(0, 50)) {
          let info = `   ${file.file}`;
          if (file.size) {
            const sizeKB = (file.size / 1024).toFixed(1);
            info += ` (${sizeKB}KB)`;
          }
          console.log(info);
        }

        if (files.length > 50) {
          console.log(`   ... and ${files.length - 50} more`);
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// search-symbols command - Search for symbol definitions
program
  .command('search-symbols <symbol>')
  .description('Search for function/class/type definitions')
  .option('-p, --projects <projects>', 'Comma-separated project names/IDs (default: all)')
  .option('-t, --type <type>', 'File type filter (e.g., ts, js, py)')
  .option('-l, --limit <n>', 'Max results', '50')
  .action(async (symbol: string, options: { projects?: string; type?: string; limit?: string }) => {
    try {
      const { searchSymbols } = await import('./code-search.js');

      const searchOptions = {
        projects: options.projects ? options.projects.split(',').map((p: string) => p.trim()) : undefined,
        type: options.type,
        limit: parseInt(options.limit ?? '50', 10),
      };

      console.log(`\n🔎 Searching for symbol: ${symbol}`);
      if (options.type) {
        console.log(`   File type: ${options.type}`);
      }
      if (options.projects) {
        console.log(`   Projects: ${options.projects}`);
      }
      console.log();

      const results = await searchSymbols(symbol, searchOptions);

      if (results.length === 0) {
        console.log('No symbol definitions found.');
        return;
      }

      // Group by project
      const byProject = new Map<string, typeof results>();
      for (const result of results) {
        const projectId = result.project.id;
        if (!byProject.has(projectId)) {
          byProject.set(projectId, []);
        }
        byProject.get(projectId)!.push(result);
      }

      console.log(`\nFound ${results.length} symbol definition(s) in ${byProject.size} project(s):\n`);

      for (const [projectId, symbols] of byProject) {
        const projectName = symbols[0].project.name;
        const projectPath = symbols[0].project.path;

        console.log(`\n📂 ${projectName} (${projectPath})`);
        console.log(`${'─'.repeat(60)}`);

        for (const sym of symbols) {
          const icon =
            sym.symbolType === 'function' ? 'ƒ' :
            sym.symbolType === 'class' ? 'ℂ' :
            sym.symbolType === 'interface' ? 'Ⅰ' :
            sym.symbolType === 'type' ? '𝕋' :
            sym.symbolType === 'method' ? 'm' :
            sym.symbolType === 'variable' ? 'v' :
            sym.symbolType === 'constant' ? 'ℂ' : '?';

          const lineNum = String(sym.line).padStart(4, ' ');
          console.log(`   ${icon} ${sym.symbolName} in ${sym.file}:${lineNum}`);
          console.log(`      ${sym.content.substring(0, 80)}${sym.content.length > 80 ? '...' : ''}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== E9: Template Commands =====

const templateCommand = program.command('template').description('Manage project templates');

// template list
templateCommand
  .command('list')
  .description('List all available templates')
  .action(() => {
    try {
      const templates = listTemplates();

      if (templates.length === 0) {
        console.log('No templates found.');
        return;
      }

      console.log('\n📁 Available Templates:\n');

      for (const template of templates) {
        const sourceIcon = template.source === 'builtin' ? '📦' : '🔌';
        console.log(`  ${sourceIcon} ${template.name} v${template.version}`);
        console.log(`     ${template.description}`);
        console.log(`     Source: ${template.source}`);
        console.log();
      }

      console.log('Usage:');
      console.log('  maxclaw template use <template> <path> --name=<name>');
      console.log('  maxclaw template create <name>');
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// template use
templateCommand
  .command('use <template> <path>')
  .description('Create a new project from template')
  .option('-n, --name <name>', 'Project name (default: directory name)')
  .option('-a, --author <author>', 'Author name')
  .option('-d, --description <desc>', 'Project description')
  .option('--no-git', 'Skip git initialization')
  .option('--no-register', 'Skip registration to MaxClaw')
  .option('--install-deps', 'Install dependencies after creation')
  .action(async (templateName: string, targetPath: string, options: {
    name?: string;
    author?: string;
    description?: string;
    git?: boolean;
    register?: boolean;
    installDeps?: boolean;
  }) => {
    try {
      console.log(`\n🚀 Creating project from template: ${templateName}`);
      console.log(`   Target: ${targetPath}`);
      if (options.name) {
        console.log(`   Name: ${options.name}`);
      }
      console.log();

      const result = await createProject(templateName, targetPath, {
        name: options.name,
        author: options.author,
        description: options.description,
        initGit: options.git !== false,
        registerToMaxClaw: options.register !== false,
        installDeps: options.installDeps,
      });

      if (result.success) {
        console.log(`\n✅ Project created successfully!`);
        console.log(`   Path: ${result.projectPath}`);
        console.log(`   Files created: ${result.filesCreated.length}`);

        if (result.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          for (const warning of result.warnings) {
            console.log(`   - ${warning}`);
          }
        }

        console.log('\n📁 Files created:');
        result.filesCreated.slice(0, 20).forEach((file) => {
          console.log(`   - ${file}`);
        });
        if (result.filesCreated.length > 20) {
          console.log(`   ... and ${result.filesCreated.length - 20} more`);
        }

        console.log('\nNext steps:');
        console.log(`  cd ${targetPath}`);
        if (options.installDeps) {
          console.log('  npm install (if not already done)');
        }
        console.log('  npm run dev');
      } else {
        console.error('❌ Failed to create project:');
        for (const error of result.errors) {
          console.error(`   - ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// template create
templateCommand
  .command('create <name>')
  .description('Create a new custom template')
  .option('-d, --description <desc>', 'Template description')
  .option('-t, --type <type>', 'Base template type (nodejs-ts, react-app, nextjs, python, empty)', 'empty')
  .action(async (templateName: string, options: {
    description?: string;
    type?: string;
  }) => {
    try {
      console.log(`\n📦 Creating custom template: ${templateName}`);
      console.log();

      const result = await createTemplate(templateName, {
        description: options.description,
        templateType: options.type as any,
      });

      if (result.success) {
        console.log(`\n✅ Custom template created successfully!`);
        console.log(`   Name: ${templateName}`);
        console.log(`   Location: ${result.templatePath}`);
        console.log('\nNext steps:');
        console.log(`  1. Edit ${result.templatePath}/template.yaml to customize`);
        console.log('  2. Add your template files to the directory');
        console.log(`  3. Use "maxclaw template use ${templateName} <path>" to test it`);
      } else {
        console.error('❌ Failed to create template:');
        for (const error of result.errors) {
          console.error(`   - ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// template delete
templateCommand
  .command('delete <name>')
  .description('Delete a custom template')
  .option('-y, --yes', 'Skip confirmation')
  .action((templateName, options) => {
    try {
      // Check if it's a builtin template
      const builtinTemplates = ['nodejs-ts', 'react-app', 'nextjs', 'python'];
      if (builtinTemplates.includes(templateName)) {
        console.error(`❌ Cannot delete builtin template: ${templateName}`);
        process.exit(1);
      }

      if (!options.yes) {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        readline.question(`Are you sure you want to delete template "${templateName}"? [y/N] `, (answer: string) => {
          readline.close();
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            const result = deleteTemplate(templateName);
            if (result.success) {
              console.log(`✅ Deleted template: ${templateName}`);
            } else {
              console.error(`❌ Failed to delete template:`);
              for (const error of result.errors) {
                console.error(`   - ${error}`);
              }
              process.exit(1);
            }
          } else {
            console.log('Cancelled.');
            process.exit(0);
          }
        });
        return;
      }

      const result = deleteTemplate(templateName);
      if (result.success) {
        console.log(`✅ Deleted template: ${templateName}`);
      } else {
        console.error(`❌ Failed to delete template:`);
        for (const error of result.errors) {
          console.error(`   - ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// template info
templateCommand
  .command('info <name>')
  .description('Show template details')
  .action((templateName) => {
    try {
      const result = showTemplateDetails(templateName);

      if (!result.success) {
        console.error(`❌ Failed to get template info:`);
        for (const error of result.errors) {
          console.error(`   - ${error}`);
        }
        process.exit(1);
      }

      const config = result.config!;

      console.log(`\n📦 Template: ${config.name} v${config.version}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`   Description: ${config.description}`);
      if (config.author) {
        console.log(`   Author: ${config.author}`);
      }
      console.log();

      if (config.variables && config.variables.length > 0) {
        console.log('Variables:');
        for (const variable of config.variables) {
          const required = variable.required ? ' (required)' : '';
          const defaultValue = variable.default !== undefined ? ` [default: ${variable.default}]` : '';
          console.log(`   - ${variable.name}${required}${defaultValue}`);
          if (variable.description) {
            console.log(`     ${variable.description}`);
          }
        }
        console.log();
      }

      if (config.dependencies) {
        if (config.dependencies.npm && config.dependencies.npm.length > 0) {
          console.log('NPM Dependencies:');
          for (const dep of config.dependencies.npm) {
            console.log(`   - ${dep}`);
          }
          console.log();
        }
        if (config.dependencies.pip && config.dependencies.pip.length > 0) {
          console.log('PIP Dependencies:');
          for (const dep of config.dependencies.pip) {
            console.log(`   - ${dep}`);
          }
          console.log();
        }
      }

      if (config.gitignore && config.gitignore.length > 0) {
        console.log('.gitignore entries:');
        for (const entry of config.gitignore) {
          console.log(`   - ${entry}`);
        }
        console.log();
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// template open-dir
templateCommand
  .command('open-dir')
  .description('Open custom templates directory')
  .action(async () => {
    try {
      const { openCustomTemplatesDir } = await import('./template-manager.js');
      const dir = openCustomTemplatesDir();
      console.log(`\n📂 Custom templates directory:`);
      console.log(`   ${dir}`);
      console.log('\nYou can manually add template folders here.');
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// ===== E10: Agent Commands =====

const agentCommand = program.command('agent').description('Manage and interact with agents');

// agent list
agentCommand
  .command('list')
  .description('List all registered agents')
  .option('-s, --status <status>', 'Filter by status (idle|busy|offline|error)')
  .option('-c, --capability <capability>', 'Filter by capability')
  .action(async (options) => {
    try {
      const { AgentRuntime } = await import('./agent-protocol/agent-runtime.js');

      // Create a temporary runtime to query agents
      // In production, this would connect to the running runtime
      const runtime = new AgentRuntime();
      const result = runtime.discoverAgents({
        status: options.status,
        capability: options.capability,
      });

      if (result.agents.length === 0) {
        console.log('No agents registered.');
        return;
      }

      console.log(`\n🤖 ${result.agents.length} registered agent(s):\n`);
      console.log('  ID           | Name            | Status | Capabilities');
      console.log('  -------------|-----------------|--------|-------------');

      for (const agent of result.agents) {
        const id = agent.id.substring(0, 12).padEnd(12);
        const name = agent.name.padEnd(15);
        const statusIcon = agent.status === 'idle' ? '🟢' : agent.status === 'busy' ? '🟡' : agent.status === 'error' ? '🔴' : '⚪';
        const capabilities = agent.capabilities.slice(0, 3).join(', ');
        console.log(`  ${id} | ${name} | ${statusIcon} ${agent.status.padEnd(6)} | ${capabilities}`);
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// agent send
agentCommand
  .command('send <to-agent> <message>')
  .description('Send a message to an agent')
  .option('-f, --from <from>', 'Sender agent ID')
  .option('-t, --type <type>', 'Message type (task|query|notification)', 'notification')
  .option('-a, --action <action>', 'Action to perform')
  .action(async (toAgent, message, options) => {
    try {
      const { AgentRuntime, createMessage } = await import('./agent-protocol/agent-runtime.js');
      const { MessageBus } = await import('./agent-protocol/message-bus.js');

      const runtime = new AgentRuntime();
      const messageBus = runtime.getMessageBus();

      const senderId = options.from ?? 'cli';
      const messageType = options.type as 'task' | 'query' | 'notification';
      const action = options.action ?? 'message';

      const agentMessage = createMessage(
        senderId,
        messageType,
        {
          action,
          data: { message, raw: message },
        },
        {
          receiver: toAgent,
        }
      );

      if (messageType === 'query') {
        console.log(`\n📤 Sending query to agent ${toAgent}...`);
        const result = await messageBus.requestResponse(toAgent, agentMessage, 30000);

        if (result.success) {
          console.log(`✅ Response received (${result.responseTime}ms):`);
          console.log(`   ${JSON.stringify(result.data, null, 2)}`);
        } else {
          console.log(`❌ Request failed: ${result.error}`);
        }
      } else {
        console.log(`\n📤 Sending ${messageType} to agent ${toAgent}...`);
        const topic = `agent:${toAgent}:inbox`;
        await messageBus.publish(topic, agentMessage);
        console.log(`✅ Message sent successfully`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// agent status
agentCommand
  .command('status')
  .description('Show agent runtime status')
  .action(async () => {
    try {
      const { AgentRuntime } = await import('./agent-protocol/agent-runtime.js');

      const runtime = new AgentRuntime();
      const stats = runtime.getStats();
      const agents = runtime.getAllAgents();

      console.log('\n📊 Agent Runtime Status:\n');
      console.log(`  Total Agents:      ${stats.totalAgents}`);
      console.log(`  Initialized:       ${stats.initializedAgents}`);
      console.log(`  Active:            ${stats.activeAgents}`);
      console.log(`  Error:             ${stats.errorAgents}`);
      console.log(`  Message Queue:     ${stats.messageQueueSize}`);
      console.log(`  Pending Requests:  ${stats.pendingRequests}`);
      console.log();

      if (agents.length > 0) {
        console.log('Registered Agents:');
        for (const agent of agents) {
          const statusIcon = agent.status === 'idle' ? '🟢' : agent.status === 'busy' ? '🟡' : agent.status === 'error' ? '🔴' : '⚪';
          console.log(`  ${statusIcon} ${agent.name} (${agent.id.substring(0, 8)}...)`);
          console.log(`      Status: ${agent.status}`);
          console.log(`      Capabilities: ${agent.capabilities.join(', ')}`);
          if (agent.lastHeartbeat) {
            console.log(`      Last Heartbeat: ${new Date(agent.lastHeartbeat).toLocaleString()}`);
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// agent info
agentCommand
  .command('info <agent-id>')
  .description('Show detailed information about an agent')
  .action(async (agentId) => {
    try {
      const { AgentRuntime } = await import('./agent-protocol/agent-runtime.js');

      const runtime = new AgentRuntime();
      const agent = runtime.getAgentInfo(agentId);

      if (!agent) {
        console.error(`❌ Agent not found: ${agentId}`);
        process.exit(1);
      }

      console.log(`\n🤖 Agent Information:\n`);
      console.log(`  ID:           ${agent.id}`);
      console.log(`  Name:         ${agent.name}`);
      console.log(`  Description:  ${agent.description ?? 'N/A'}`);
      console.log(`  Status:       ${agent.status}`);
      console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
      console.log(`  Registered:   ${new Date(agent.registeredAt).toLocaleString()}`);
      console.log(`  Last Active:  ${agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleString() : 'N/A'}`);

      if (agent.subscriptions.length > 0) {
        console.log(`\n  Subscriptions:`);
        for (const topic of agent.subscriptions) {
          console.log(`    - ${topic}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// Dashboard command
program
  .command('dashboard')
  .description('Start the MaxClaw web dashboard')
  .option('-p, --port <port>', 'Dashboard port', '9876')
  .option('--stop', 'Stop the running dashboard')
  .action(async (options) => {
    try {
      const { startDashboard, stopDashboard } = await import('./dashboard-server.js');

      if (options.stop) {
        await stopDashboard();
        console.log('✅ Dashboard stopped');
        return;
      }

      const port = parseInt(options.port, 10);
      const url = await startDashboard(port);

      console.log(`\n🚀 MaxClaw Dashboard started!`);
      console.log(`\n   Local URL: ${url}`);
      console.log(`\n   The dashboard should open automatically in your browser.`);
      console.log(`   If not, copy the URL above and open it manually.`);
      console.log(`\n   Press Ctrl+C to stop the dashboard\n`);

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n\n👋 Stopping dashboard...');
        await stopDashboard();
        process.exit(0);
      });

      // Keep running
      await new Promise(() => {});
    } catch (error) {
      console.error(`❌ Error: ${error}`);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
