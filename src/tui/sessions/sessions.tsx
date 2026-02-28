// EPIC-008: Sessions Screen

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';
import type { Session } from '../../types.js';

export const SessionsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [sessions, setSessions] = useState<Array<Session & { projectName?: string }>>([]);

  useEffect(() => {
    if (!onFocus) return;

    const loadSessions = async () => {
      try {
        const { listActiveSessions, getProject } = await import('../../db.js');

        const activeSessions = listActiveSessions();
        const sessionsWithNames = activeSessions.map(s => ({
          ...s,
          projectName: getProject(s.projectId)?.name || 'Unknown',
        }));
        setSessions(sessionsWithNames);
      } catch (error) {
        // Handle error
      }
    };

    loadSessions();
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, [onFocus]);

  return (
    <Box flexDirection="column">
      <Text bold color="green">Sessions ({sessions.length} active)</Text>
      <Text> </Text>

      {sessions.length === 0 ? (
        <Text dimColor>No active sessions. Press [n] to start a new session.</Text>
      ) : (
        <Box flexDirection="column">
          {sessions.map((session: Session & { projectName?: string }) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>
        [↑↓] Navigate | [s] Start | [x] Stop | [r] Resume | [h] History
      </Text>
    </Box>
  );
};

const SessionItem: React.FC<{ session: Session & { projectName?: string } }> = ({ session }) => {
  const duration = formatDuration(session.startedAt);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={1}>
      <Box>
        <Text bold color="cyan">{session.projectName || 'Unknown'}</Text>
        <Text color="gray"> | </Text>
        <Text color="green">{session.status}</Text>
      </Box>
      <Box>
        <Text dimColor>Session: {session.id.slice(0, 8)}...</Text>
        <Text dimColor> | </Text>
        <Text dimColor>Duration: {duration}</Text>
        {session.pid && (
          <>
            <Text dimColor> | </Text>
            <Text dimColor>PID: {session.pid}</Text>
          </>
        )}
      </Box>
    </Box>
  );
};

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default SessionsScreen;
