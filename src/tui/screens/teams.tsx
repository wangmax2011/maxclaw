// EPIC-008: Teams Screen

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

export const TeamsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    if (!onFocus) return;

    const loadTeams = async () => {
      try {
        const { listAllTeams } = await import('../../team-manager.js');
        const allTeams = listAllTeams();
        setTeams(allTeams);
      } catch (error) {
        // Handle error
      }
    };

    loadTeams();
  }, [onFocus]);

  return (
    <Box flexDirection="column">
      <Text bold color="green">Teams ({teams.length})</Text>
      <Text> </Text>

      {teams.length === 0 ? (
        <Text dimColor>No teams created. Use 'maxclaw team create' to create a team.</Text>
      ) : (
        <Box flexDirection="column">
          {teams.map((team) => (
            <TeamItem key={team.id} team={team} />
          ))}
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>
        [↑↓] Navigate | [Enter] View details | [n] New team
      </Text>
    </Box>
  );
};

const TeamItem: React.FC<{ team: any }> = ({ team }) => {
  const statusColor = team.status === 'active' ? 'green' : 'gray';
  const statusIcon = team.status === 'active' ? '🟢' : '⚪';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={1}>
      <Box>
        <Text bold color="cyan">{team.name}</Text>
        <Text color="gray"> | </Text>
        <Text color={statusColor}>{statusIcon} {team.status}</Text>
      </Box>
      <Box>
        <Text dimColor>Lead: {team.lead?.name || 'N/A'}</Text>
        <Text dimColor> | </Text>
        <Text dimColor>Members: {team.memberIds?.length || 0}</Text>
        <Text dimColor> | </Text>
        <Text dimColor>Project: {team.projectId}</Text>
      </Box>
    </Box>
  );
};

export default TeamsScreen;
