// MOD-010: Enhanced TUI App Component with full navigation

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { DEFAULT_TUI_CONFIG, ScreenType } from './types.js';
import { OverviewScreen } from './screens/overview.js';
import { DashboardScreen } from './screens/dashboard.js';
import { ProjectsScreen } from './screens/projects.js';
import { SessionsScreen } from './sessions/sessions.js';
import { TeamsScreen } from './screens/teams.js';
import { SchedulesScreen } from './screens/schedules.js';
import { SkillsScreen } from './screens/skills.js';
import { SettingsScreen } from './screens/settings.js';
import { TemplatesScreen } from './screens/templates.js';
import { TaskDispatcherScreen } from './screens/task-dispatcher.js';

interface AppState {
  currentScreen: ScreenType;
  isRunning: boolean;
  previousScreen?: ScreenType;
}

// Navigation configuration
const NAVIGATION_CONFIG = [
  { key: '1', screen: 'overview', label: 'Overview' },
  { key: '2', screen: 'dashboard', label: 'Dashboard' },
  { key: '3', screen: 'projects', label: 'Projects' },
  { key: '4', screen: 'sessions', label: 'Sessions' },
  { key: '5', screen: 'teams', label: 'Teams' },
  { key: '6', screen: 'schedules', label: 'Schedules' },
  { key: '7', screen: 'skills', label: 'Skills' },
  { key: '8', screen: 'settings', label: 'Settings' },
  { key: '9', screen: 'templates', label: 'Templates' },
  { key: '0', screen: 'task-dispatcher', label: 'Task Dispatcher' },
];

// Quick actions configuration
const QUICK_ACTIONS_CONFIG: Record<string, string> = {
  'n': 'sessions',      // New Session
  'd': 'projects',      // Discover Projects
  't': 'task-dispatcher', // Task Dispatcher
  's': 'settings',      // Settings
};

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentScreen: 'overview',
    isRunning: true,
    previousScreen: undefined,
  });

  const config = DEFAULT_TUI_CONFIG;

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (data: Buffer) => {
      const key = data.toString();

      // Number keys for navigation (1-9, 0)
      const navConfig = NAVIGATION_CONFIG.find(nc => nc.key === key);
      if (navConfig) {
        setState(prev => ({
          ...prev,
          currentScreen: navConfig.screen as ScreenType,
          previousScreen: prev.currentScreen,
        }));
        return;
      }

      // Quick actions from any screen
      const quickAction = QUICK_ACTIONS_CONFIG[key];
      if (quickAction) {
        setState(prev => ({
          ...prev,
          currentScreen: quickAction as ScreenType,
          previousScreen: prev.currentScreen,
        }));
        return;
      }

      // Help and Quit
      if (key === 'h' || key === '?') {
        setState(prev => ({ ...prev, currentScreen: 'help' }));
      } else if (key === 'q' || key === '\u001b') {
        // q or Escape
        setState(prev => ({ ...prev, isRunning: false }));
        process.exit(0);
      } else if (key === 'r' || key === 'R') {
        // Refresh on any screen - could trigger a global refresh event
        // Emit refresh event for current screen to listen
      } else if (key === '\t') {
        // Tab to cycle through screens
        setState(prev => {
          const currentIndex = NAVIGATION_CONFIG.findIndex(
            nc => nc.screen === prev.currentScreen
          );
          const nextIndex = (currentIndex + 1) % NAVIGATION_CONFIG.length;
          return {
            ...prev,
            currentScreen: NAVIGATION_CONFIG[nextIndex].screen as ScreenType,
            previousScreen: prev.currentScreen,
          };
        });
      } else if (key === 'z' && state.previousScreen) {
        // Go back to previous screen
        setState(prev => ({
          ...prev,
          currentScreen: prev.previousScreen!,
          previousScreen: prev.currentScreen,
        }));
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
  }, [state.previousScreen]);

  const navigate = (screen: ScreenType) => {
    setState(prev => ({
      ...prev,
      currentScreen: screen,
      previousScreen: prev.currentScreen,
    }));
  };

  const renderScreen = () => {
    switch (state.currentScreen) {
      case 'overview':
        return <OverviewScreen onFocus={true} onNavigate={navigate} />;
      case 'dashboard':
        return <DashboardScreen onFocus={true} onNavigate={navigate} />;
      case 'projects':
        return <ProjectsScreen onFocus={true} onNavigate={navigate} />;
      case 'sessions':
        return <SessionsScreen onFocus={true} onNavigate={navigate} />;
      case 'teams':
        return <TeamsScreen onFocus={true} onNavigate={navigate} />;
      case 'schedules':
        return <SchedulesScreen onFocus={true} onNavigate={navigate} />;
      case 'skills':
        return <SkillsScreen onFocus={true} onNavigate={navigate} />;
      case 'settings':
        return <SettingsScreen onFocus={true} onNavigate={navigate} />;
      case 'templates':
        return <TemplatesScreen onFocus={true} onNavigate={navigate} />;
      case 'task-dispatcher':
        return <TaskDispatcherScreen onFocus={true} onNavigate={navigate} />;
      case 'help':
        return <HelpScreen onFocus={true} onNavigate={navigate} />;
      default:
        return <OverviewScreen onFocus={true} onNavigate={navigate} />;
    }
  };

  const getCurrentScreenLabel = () => {
    const navConfig = NAVIGATION_CONFIG.find(nc => nc.screen === state.currentScreen);
    return navConfig ? navConfig.label : state.currentScreen;
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box backgroundColor={config.theme.primaryColor} paddingX={1}>
        <Text bold color="white">
          {' '}
          MaxClaw TUI
          {' '}
          <Text color="gray">v3.0.0</Text>
          {' '}
          <Text dimColor>|</Text>
          {' '}
          <Text color="cyan">{getCurrentScreenLabel()}</Text>
        </Text>
      </Box>

      {/* Navigation Tabs - Two rows for better layout */}
      <Box borderStyle="single" borderColor={config.theme.borderColor} paddingX={1} flexDirection="column">
        <Box>
          {NAVIGATION_CONFIG.slice(0, 5).map(nav => (
            <React.Fragment key={nav.key}>
              <Tab
                label={nav.label}
                active={state.currentScreen === nav.screen}
                shortcut={nav.key}
              />
              <Text> </Text>
            </React.Fragment>
          ))}
        </Box>
        <Box>
          {NAVIGATION_CONFIG.slice(5, 10).map(nav => (
            <React.Fragment key={nav.key}>
              <Tab
                label={nav.label}
                active={state.currentScreen === nav.screen}
                shortcut={nav.key}
              />
              <Text> </Text>
            </React.Fragment>
          ))}
        </Box>
      </Box>

      {/* Main Content */}
      <Box padding={1} flexDirection="column" minHeight={20}>
        {renderScreen()}
      </Box>

      {/* Footer with enhanced help */}
      <Box borderStyle="single" borderColor={config.theme.borderColor} paddingX={1}>
        <Text color="gray">
          [1-9,0] Navigate | [n] New Session | [d] Discover | [t] Tasks | [s] Settings | [h] Help | [q] Quit | [Tab] Cycle
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
      <Text bold color="green">Keyboard Shortcuts</Text>
      <Text> </Text>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Navigation (Number Keys)</Text>
        <Text> </Text>
        <Box flexDirection="column">
          {NAVIGATION_CONFIG.map(nav => (
            <Text key={nav.key}>
              <Text bold color="yellow">[{nav.key}]</Text>
              <Text> </Text>
              <Text color="cyan">{nav.label}</Text>
              <Text dimColor> - {getScreenDescription(nav.screen as ScreenType)}</Text>
            </Text>
          ))}
        </Box>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Quick Actions (From Any Screen)</Text>
        <Text> </Text>
        <Text><Text bold color="yellow">[n]</Text> <Text color="cyan">New Session</Text> - Start a new coding session</Text>
        <Text><Text bold color="yellow">[d]</Text> <Text color="cyan">Discover Projects</Text> - Scan for new projects</Text>
        <Text><Text bold color="yellow">[t]</Text> <Text color="cyan">Task Dispatcher</Text> - Open task command center</Text>
        <Text><Text bold color="yellow">[s]</Text> <Text color="cyan">Settings</Text> - Configure MaxClaw</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">General Shortcuts</Text>
        <Text> </Text>
        <Text><Text bold color="yellow">[h]</Text> <Text color="cyan">Help</Text> - Show this help screen</Text>
        <Text><Text bold color="yellow">[q]</Text> or <Text bold color="yellow">[Escape]</Text> <Text color="cyan">Quit</Text> - Exit TUI</Text>
        <Text><Text bold color="yellow">[Tab]</Text> <Text color="cyan">Cycle</Text> - Cycle through screens</Text>
        <Text><Text bold color="yellow">[z]</Text> <Text color="cyan">Back</Text> - Go to previous screen</Text>
        <Text><Text bold color="yellow">[r]</Text> <Text color="cyan">Refresh</Text> - Refresh current screen</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Screen-Specific Shortcuts</Text>
        <Text> </Text>
        <Text bold dimColor>Overview/Dashboard:</Text>
        <Text dimColor>  [r] Refresh stats</Text>
        <Text bold dimColor>Projects:</Text>
        <Text dimColor>  [Enter] Start session | [a] Add project | [d] Delete | [s] Scan directory</Text>
        <Text bold dimColor>Sessions:</Text>
        <Text dimColor>  [x] Stop session | [v] View logs | [r] Refresh</Text>
        <Text bold dimColor>Teams:</Text>
        <Text dimColor>  [c] Create team | [d] Dissolve | [m] Manage members</Text>
        <Text bold dimColor>Schedules:</Text>
        <Text dimColor>  [a] Add task | [d] Delete | [e] Edit | [r] Run now | [h] History</Text>
        <Text bold dimColor>Skills:</Text>
        <Text dimColor>  [e] Enable/Disable | [r] Run skill | [i] Info</Text>
        <Text bold dimColor>Settings:</Text>
        <Text dimColor>  [a] Add item | [d] Remove | [e] Edit | [s] Save | [r] Reload</Text>
        <Text bold dimColor>Templates:</Text>
        <Text dimColor>  [u] Use template | [v] View | [c] Create | [d] Delete</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="yellow">Pro Tips</Text>
        <Text> </Text>
        <Text>• Number keys work from any screen for quick navigation</Text>
        <Text>• Use [Tab] to cycle through all screens quickly</Text>
        <Text>• Use [z] to go back to the previous screen</Text>
        <Text>• Quick actions ([n], [d], [t], [s]) work from any screen</Text>
      </Box>
    </Box>
  );
};

function getScreenDescription(screen: ScreenType): string {
  const descriptions: Record<ScreenType, string> = {
    'overview': 'Global overview and quick stats',
    'dashboard': 'System status dashboard',
    'projects': 'Browse and manage projects',
    'sessions': 'View and control sessions',
    'teams': 'Manage team members and tasks',
    'schedules': 'Scheduled tasks management',
    'skills': 'Skill plugins management',
    'settings': 'Global configuration',
    'templates': 'Project templates',
    'task-dispatcher': 'Unified task command center',
    'help': 'Keyboard shortcuts help',
  };
  return descriptions[screen] || '';
}

export default App;
