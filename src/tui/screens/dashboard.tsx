// EPIC-008: Dashboard Screen

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

export const DashboardScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [stats, setStats] = useState({
    activeSessions: 0,
    totalProjects: 0,
    activeTeams: 0,
    cpuUsage: 0,
    memoryUsage: 0,
  });

  useEffect(() => {
    if (!onFocus) return;

    // Load dashboard stats
    const loadStats = async () => {
      try {
        const { listActiveSessions } = await import('../../db.js');
        const { getAllProjects } = await import('../../project-manager.js');

        const sessions = listActiveSessions();
        const projects = getAllProjects();

        setStats({
          activeSessions: sessions.length,
          totalProjects: projects.length,
          activeTeams: 0,
          cpuUsage: 0,
          memoryUsage: 0,
        });
      } catch (error) {
        // Handle error silently
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [onFocus]);

  return (
    <Box flexDirection="column">
      <Text bold color="green">Dashboard</Text>
      <Text> </Text>

      {/* Stats Grid */}
      <Box>
        <StatBox label="Active Sessions" value={stats.activeSessions.toString()} color="cyan" />
        <Text> </Text>
        <StatBox label="Total Projects" value={stats.totalProjects.toString()} color="green" />
        <Text> </Text>
        <StatBox label="Active Teams" value={stats.activeTeams.toString()} color="yellow" />
      </Box>

      <Text> </Text>

      {/* Resource Usage */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Resource Usage</Text>
        <Text> </Text>
        <ProgressBar label="CPU Usage" value={stats.cpuUsage} color="cyan" />
        <ProgressBar label="Memory Usage" value={stats.memoryUsage} color="green" />
      </Box>

      <Text> </Text>

      {/* Quick Actions */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Quick Actions</Text>
        <Text> </Text>
        <Text color="cyan">  [s] Start new session</Text>
        <Text color="cyan">  [p] View projects</Text>
        <Text color="cyan">  [t] View teams</Text>
        <Text color="cyan">  [r] Refresh</Text>
      </Box>
    </Box>
  );
};

const StatBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  return (
    <Box
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      alignItems="center"
    >
      <Text bold color={color}>{value}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
};

const ProgressBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const bars = Math.floor((value / 100) * 20);
  const barText = '█'.repeat(bars) + '░'.repeat(20 - bars);

  return (
    <Box>
      <Text dimColor>{label.padEnd(15)} </Text>
      <Text color={color}>{barText} </Text>
      <Text>{value.toFixed(1)}%</Text>
    </Box>
  );
};

export default DashboardScreen;
