// EPIC-008: TUI App Component

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TUI_CONFIG, ScreenType } from './types.js';
import { DashboardScreen } from './screens/dashboard.js';
import { ProjectsScreen } from './screens/projects.js';
import { SessionsScreen } from './sessions/sessions.js';
import { TeamsScreen } from './screens/teams.js';

interface AppState {
  currentScreen: ScreenType;
  isRunning: boolean;
}

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentScreen: 'dashboard',
    isRunning: true,
  });

  const config = DEFAULT_TUI_CONFIG;

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (data: Buffer) => {
      const key = data.toString();

      // Number keys for navigation
      if (key === '1') {
        setState(prev => ({ ...prev, currentScreen: 'dashboard' }));
      } else if (key === '2') {
        setState(prev => ({ ...prev, currentScreen: 'projects' }));
      } else if (key === '3') {
        setState(prev => ({ ...prev, currentScreen: 'sessions' }));
      } else if (key === '4') {
        setState(prev => ({ ...prev, currentScreen: 'teams' }));
      } else if (key === 'h') {
        setState(prev => ({ ...prev, currentScreen: 'help' }));
      } else if (key === 'q' || key === '\u001b') {
        // q or Escape
        setState(prev => ({ ...prev, isRunning: false }));
        process.exit(0);
      } else if (key === 'r' || key === 'R') {
        // Refresh on any screen
        // Could trigger a global refresh event
      } else if (key === 'd' || key === 'D') {
        // Quick discover projects (from any screen)
        setState(prev => ({ ...prev, currentScreen: 'projects' }));
      } else if (key === 's' || key === 'S') {
        // Quick start session (from any screen)
        setState(prev => ({ ...prev, currentScreen: 'sessions' }));
      }
    };

    // Set raw mode for keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', handleKeyPress);

    return () => {
      process.stdin.off('data', handleKeyPress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };
  }, []);

  const navigate = (screen: ScreenType) => {
    setState(prev => ({ ...prev, currentScreen: screen }));
  };

  const renderScreen = () => {
    switch (state.currentScreen) {
      case 'dashboard':
        return <DashboardScreen onFocus={true} onNavigate={navigate} />;
      case 'projects':
        return <ProjectsScreen onFocus={true} onNavigate={navigate} />;
      case 'sessions':
        return <SessionsScreen onFocus={true} onNavigate={navigate} />;
      case 'teams':
        return <TeamsScreen onFocus={true} onNavigate={navigate} />;
      case 'help':
        return <HelpScreen onFocus={true} onNavigate={navigate} />;
      default:
        return <DashboardScreen onFocus={true} onNavigate={navigate} />;
    }
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box backgroundColor={config.theme.primaryColor} paddingX={1}>
        <Text bold color="white">
          {' '}
          MaxClaw TUI
          {' '}
          <Text color="gray">v2.0.0</Text>
        </Text>
      </Box>

      {/* Navigation Tabs */}
      <Box borderStyle="single" borderColor={config.theme.borderColor} paddingX={1}>
        <Tab label="Dashboard" active={state.currentScreen === 'dashboard'} shortcut="1" />
        <Text> </Text>
        <Tab label="Projects" active={state.currentScreen === 'projects'} shortcut="2" />
        <Text> </Text>
        <Tab label="Sessions" active={state.currentScreen === 'sessions'} shortcut="3" />
        <Text> </Text>
        <Tab label="Teams" active={state.currentScreen === 'teams'} shortcut="4" />
        <Text> </Text>
        <Tab label="Help" active={state.currentScreen === 'help'} shortcut="h" />
      </Box>

      {/* Main Content */}
      <Box padding={1} flexDirection="column" minHeight={15}>
        {renderScreen()}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor={config.theme.borderColor} paddingX={1}>
        <Text color="gray">
          [1-4] Navigate | [s] Session | [d] Discover | [h] Help | [q] Quit
        </Text>
      </Box>
    </Box>
  );
};

const Tab: React.FC<{ label: string; active: boolean; shortcut: string }> = ({ label, active, shortcut }) => {
  if (active) {
    return (
      <Text bold color={DEFAULT_TUI_CONFIG.theme.primaryColor}>
        {label} [{shortcut}]
      </Text>
    );
  }
  return (
    <Text color="gray">
      {label} [{shortcut}]
    </Text>
  );
};

const HelpScreen: React.FC<{ onFocus: boolean; onNavigate: (screen: ScreenType) => void }> = ({ onFocus, onNavigate }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Keyboard Shortcuts</Text>
      <Text> </Text>
      <Text bold color="green">Navigation</Text>
      <Text><Text bold color="cyan">[1]</Text> Dashboard - Overview and quick stats</Text>
      <Text><Text bold color="cyan">[2]</Text> Projects - Browse and manage projects</Text>
      <Text><Text bold color="cyan">[3]</Text> Sessions - View and control sessions</Text>
      <Text><Text bold color="cyan">[4]</Text> Teams - Manage team members and tasks</Text>
      <Text> </Text>
      <Text bold color="green">Quick Actions</Text>
      <Text><Text bold color="cyan">[s]</Text> Go to Sessions - Start or view sessions</Text>
      <Text><Text bold color="cyan">[d]</Text> Discover Projects - Quick access to discovery</Text>
      <Text> </Text>
      <Text bold color="green">General</Text>
      <Text><Text bold color="cyan">[h]</Text> Help - Show this screen</Text>
      <Text><Text bold color="cyan">[q]</Text> or [Escape] - Quit TUI</Text>
      <Text> </Text>
      <Text bold color="green">Screen-Specific Shortcuts</Text>
      <Text dimColor>Dashboard:</Text>
      <Text dimColor>  [r] Refresh stats</Text>
      <Text dimColor>Projects:</Text>
      <Text dimColor>  [Enter] Start session | [a] Add project</Text>
      <Text dimColor>Sessions:</Text>
      <Text dimColor>  [s] Start | [x] Stop | [r] Resume</Text>
      <Text> </Text>
      <Text bold color="yellow">Tip</Text>
      <Text>Number keys work from any screen for quick navigation.</Text>
    </Box>
  );
};

export default App;
