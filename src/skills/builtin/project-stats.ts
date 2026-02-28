// Project Stats Skill - Display project statistics

import type { Skill, SkillContext, SkillManifest } from '../types.js';

const manifest: SkillManifest = {
  name: 'project-stats',
  version: '1.0.0',
  description: 'Display project statistics including project count, session count, and more',
  author: 'MaxClaw Team',
  commands: [
    {
      name: 'show',
      description: 'Show overall project statistics',
      options: [
        {
          name: 'detailed',
          alias: 'd',
          description: 'Show detailed statistics',
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'project',
      description: 'Show statistics for a specific project',
      args: [
        {
          name: 'project-name',
          description: 'Name of the project',
          required: true,
        },
      ],
    },
    {
      name: 'sessions',
      description: 'Show session statistics',
    },
  ],
  permissions: ['db:read'],
};

let context: SkillContext | null = null;

const skill: Skill = {
  manifest,

  async activate(ctx: SkillContext): Promise<void> {
    context = ctx;
    context.logger.info('Project Stats skill activated!');
  },

  async deactivate(): Promise<void> {
    context?.logger.info('Project Stats skill deactivated!');
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

    // Check permission
    if (!context.hasPermission('db:read')) {
      throw new Error('This skill requires db:read permission');
    }

    switch (commandName) {
      case 'show':
        return await showOverallStats(options.detailed as boolean);

      case 'project': {
        const projectName = args[0];
        if (!projectName) {
          throw new Error('Project name is required');
        }
        return await showProjectStats(projectName);
      }

      case 'sessions':
        return await showSessionStats();

      default:
        throw new Error(`Unknown command: ${commandName}`);
    }
  },
};

async function showOverallStats(detailed: boolean): Promise<string> {
  if (!context) throw new Error('Skill not activated');

  const db = context.db;

  // Get project count
  const projectRow = db.prepare('SELECT COUNT(*) as count FROM projects').get() as {
    count: number;
  };

  // Get session stats
  const sessionRow = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM sessions
    `
    )
    .get() as { total: number; active: number; completed: number };

  // Get team stats
  const teamRow = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM teams
    `
    )
    .get() as { total: number; active: number };

  // Get recent activities (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activityRow = db
    .prepare("SELECT COUNT(*) as count FROM activities WHERE timestamp > ?")
    .get(sevenDaysAgo.toISOString()) as { count: number };

  let output = '\n📊 Project Statistics\n';
  output += '====================\n\n';
  output += `📁 Projects: ${projectRow.count}\n`;
  output += `📅 Sessions: ${sessionRow.total} (${sessionRow.active} active, ${sessionRow.completed} completed)\n`;
  output += `👥 Teams: ${teamRow.total} (${teamRow.active} active)\n`;
  output += `📝 Recent Activities (7d): ${activityRow.count}\n`;

  if (detailed) {
    // Get tech stack distribution
    const projects = db.prepare('SELECT tech_stack FROM projects').all() as Array<{
      tech_stack: string;
    }>;

    const techCount: Record<string, number> = {};
    for (const project of projects) {
      const techs = JSON.parse(project.tech_stack) as string[];
      for (const tech of techs) {
        techCount[tech] = (techCount[tech] || 0) + 1;
      }
    }

    const sortedTech = Object.entries(techCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sortedTech.length > 0) {
      output += '\n🔧 Top Technologies:\n';
      for (const [tech, count] of sortedTech) {
        output += `  ${tech}: ${count}\n`;
      }
    }

    // Get most active projects
    const activeProjects = db
      .prepare(
        `
        SELECT p.name, COUNT(s.id) as session_count
        FROM projects p
        LEFT JOIN sessions s ON p.id = s.project_id
        GROUP BY p.id
        ORDER BY session_count DESC
        LIMIT 5
      `
      )
      .all() as Array<{ name: string; session_count: number }>;

    if (activeProjects.some((p) => p.session_count > 0)) {
      output += '\n🏆 Most Active Projects:\n';
      for (const project of activeProjects) {
        if (project.session_count > 0) {
          output += `  ${project.name}: ${project.session_count} sessions\n`;
        }
      }
    }
  }

  return output;
}

async function showProjectStats(projectName: string): Promise<string> {
  if (!context) throw new Error('Skill not activated');

  const db = context.db;

  // Find project by name
  const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName) as
    | {
        id: string;
        name: string;
        path: string;
        description: string | null;
        tech_stack: string;
        discovered_at: string;
        last_accessed: string | null;
      }
    | undefined;

  if (!project) {
    return `❌ Project "${projectName}" not found`;
  }

  // Get session stats for this project
  const sessionRow = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM sessions
      WHERE project_id = ?
    `
    )
    .get(project.id) as { total: number; active: number; completed: number };

  // Get team count for this project
  const teamRow = db
    .prepare('SELECT COUNT(*) as count FROM teams WHERE project_id = ?')
    .get(project.id) as { count: number };

  // Get recent activities
  const activities = db
    .prepare(
      'SELECT type, timestamp FROM activities WHERE project_id = ? ORDER BY timestamp DESC LIMIT 5'
    )
    .all(project.id) as Array<{ type: string; timestamp: string }>;

  const techStack = JSON.parse(project.tech_stack) as string[];

  let output = `\n📁 Project: ${project.name}\n`;
  output += '===================\n\n';
  output += `Path: ${project.path}\n`;
  if (project.description) {
    output += `Description: ${project.description}\n`;
  }
  output += `Tech Stack: ${techStack.length > 0 ? techStack.join(', ') : 'None detected'}\n`;
  output += `Discovered: ${new Date(project.discovered_at).toLocaleDateString()}\n`;
  if (project.last_accessed) {
    output += `Last Accessed: ${new Date(project.last_accessed).toLocaleDateString()}\n`;
  }
  output += `\n📅 Sessions: ${sessionRow.total} (${sessionRow.active} active, ${sessionRow.completed} completed)\n`;
  output += `👥 Teams: ${teamRow.count}\n`;

  if (activities.length > 0) {
    output += '\n📝 Recent Activity:\n';
    for (const activity of activities) {
      const date = new Date(activity.timestamp).toLocaleDateString();
      output += `  [${activity.type}] ${date}\n`;
    }
  }

  return output;
}

async function showSessionStats(): Promise<string> {
  if (!context) throw new Error('Skill not activated');

  const db = context.db;

  // Get session stats by day (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sessions = db
    .prepare(
      `
      SELECT
        date(started_at) as date,
        COUNT(*) as count
      FROM sessions
      WHERE started_at > ?
      GROUP BY date(started_at)
      ORDER BY date DESC
    `
    )
    .all(thirtyDaysAgo.toISOString()) as Array<{ date: string; count: number }>;

  // Get average session duration for completed sessions
  const durationRow = db
    .prepare(
      `
      SELECT
        AVG(
          (julianday(ended_at) - julianday(started_at)) * 24 * 60
        ) as avg_minutes
      FROM sessions
      WHERE status = 'completed' AND ended_at IS NOT NULL
    `
    )
    .get() as { avg_minutes: number | null };

  let output = '\n📅 Session Statistics\n';
  output += '====================\n\n';

  if (durationRow.avg_minutes) {
    const hours = Math.floor(durationRow.avg_minutes / 60);
    const mins = Math.round(durationRow.avg_minutes % 60);
    output += `⏱️  Average Session Duration: ${hours}h ${mins}m\n\n`;
  }

  if (sessions.length > 0) {
    output += '📊 Sessions by Day (Last 30 Days):\n';
    for (const session of sessions.slice(0, 10)) {
      const date = new Date(session.date).toLocaleDateString();
      const bar = '█'.repeat(Math.min(session.count, 20));
      output += `  ${date}: ${bar} ${session.count}\n`;
    }
  } else {
    output += 'No sessions in the last 30 days.\n';
  }

  return output;
}

export default skill;
