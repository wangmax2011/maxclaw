// MOD-001: Overview Screen - Global overview and quick actions

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';
import { ResourceMonitor } from '../../multiplexing/resource-monitor.js';

interface OverviewStats {
  activeSessions: number;
  totalProjects: number;
  activeTeams: number;
  scheduledTasks: number;
  cpuUsage: number;
  memoryUsage: number;
  recentActivities: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: 'session' | 'project' | 'team' | 'task';
  description: string;
  timestamp: string;
}

export const OverviewScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [stats, setStats] = useState<OverviewStats>({
    activeSessions: 0,
    totalProjects: 0,
    activeTeams: 0,
    scheduledTasks: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    recentActivities: [],
  });

  useEffect(() => {
    if (!onFocus) return;

    let resourceMonitor: ResourceMonitor | null = null;

    const loadOverview = async () => {
      try {
        const { listActiveSessions } = await import('../../db.js');
        const { getAllProjects } = await import('../../project-manager.js');
        const { listAllTeams } = await import('../../team-manager.js');

        const sessions = listActiveSessions();
        const projects = getAllProjects();
        const teams = listAllTeams();

        // Get resource metrics
        let cpuUsage = 0;
        let memoryUsage = 0;

        if (!resourceMonitor) {
          resourceMonitor = new ResourceMonitor();
          await resourceMonitor.start();
        }

        const metrics = await resourceMonitor.collectMetrics();
        cpuUsage = metrics.cpuUsage;
        memoryUsage = metrics.memoryPercent;

        // Generate recent activities (mock data for now)
        const activities: ActivityItem[] = [
          { id: '1', type: 'session', description: 'Session started on project "maxclaw"', timestamp: new Date().toISOString() },
          { id: '2', type: 'project', description: 'Project "web-app" discovered', timestamp: new Date().toISOString() },
          { id: '3', type: 'task', description: 'Scheduled task "daily-backup" completed', timestamp: new Date().toISOString() },
          { id: '4', type: 'team', description: 'Team "alpha" created', timestamp: new Date().toISOString() },
          { id: '5', type: 'session', description: 'Session completed on project "api"', timestamp: new Date().toISOString() },
        ];

        setStats({
          activeSessions: sessions.length,
          totalProjects: projects.length,
          activeTeams: teams.length,
          scheduledTasks: 0,
          cpuUsage,
          memoryUsage,
          recentActivities: activities.slice(0, 5),
        });
      } catch (error) {
        console.error('Failed to load overview:', error);
      }
    };

    loadOverview();
    const interval = setInterval(loadOverview, 3000);
    return () => {
      clearInterval(interval);
      if (resourceMonitor) {
        resourceMonitor.stop();
      }
    };
  }, [onFocus]);

  return (
    <Box flexDirection="column">
      <Text bold color="green">Overview</Text>
      <Text> </Text>

      {/* System Status Dashboard */}
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">System Status</Text>
        <Text> </Text>
        <Box>
          <StatBox label="Sessions" value={stats.activeSessions.toString()} color="cyan" />
          <Text> </Text>
          <StatBox label="Projects" value={stats.totalProjects.toString()} color="green" />
          <Text> </Text>
          <StatBox label="Teams" value={stats.activeTeams.toString()} color="yellow" />
          <Text> </Text>
          <StatBox label="Schedules" value={stats.scheduledTasks.toString()} color="magenta" />
        </Box>
      </Box>

      {/* Resource Usage Monitor */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold>Resource Usage</Text>
        <Text> </Text>
        <ProgressBar label="CPU Usage" value={stats.cpuUsage} color="cyan" />
        <Text> </Text>
        <ProgressBar label="Memory Usage" value={stats.memoryUsage} color="green" />
      </Box>

      {/* Quick Actions Panel */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold>Quick Actions</Text>
        <Text> </Text>
        <Text color="cyan">  [n] New Session - Start a new coding session</Text>
        <Text color="cyan">  [d] Discover Projects - Scan for new projects</Text>
        <Text color="cyan">  [t] Task Dispatcher - Open task command center</Text>
        <Text color="cyan">  [s] Settings - Configure MaxClaw</Text>
      </Box>

      {/* Recent Activity Feed */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Recent Activity</Text>
        <Text> </Text>
        {stats.recentActivities.map((activity) => (
          <ActivityFeedItem key={activity.id} activity={activity} />
        ))}
      </Box>
    </Box>
  );
};

const StatBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  return (
    <Box
      borderStyle="single"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      alignItems="center"
      minWidth={15}
    >
      <Text bold color={color}>{value}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
};

const ProgressBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const bars = Math.floor((value / 100) * 20);
  const barText = '\u2588'.repeat(bars) + '\u2591'.repeat(20 - bars);

  return (
    <Box>
      <Text dimColor>{label.padEnd(15)} </Text>
      <Text color={color}>{barText} </Text>
      <Text>{value.toFixed(1)}%</Text>
    </Box>
  );
};

const ActivityFeedItem: React.FC<{ activity: ActivityItem }> = ({ activity }) => {
  const typeIcon = {
    session: '\u25B6',
    project: '\uD83D\uDCC1',
    team: '\uD83D\uDC65',
    task: '\u2713',
  }[activity.type];

  const typeColor = {
    session: 'cyan',
    project: 'green',
    team: 'yellow',
    task: 'magenta',
  }[activity.type];

  return (
    <Box marginBottom={1}>
      <Text color={typeColor}>{typeIcon} </Text>
      <Text>{activity.description}</Text>
    </Box>
  );
};

export default OverviewScreen;
