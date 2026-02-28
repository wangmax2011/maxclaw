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

// team assign-task
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

// Parse command line arguments
program.parse();
