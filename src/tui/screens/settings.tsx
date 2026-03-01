// MOD-007: Settings Screen - Global configuration management

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ScreenProps } from '../types.js';

interface SettingsState {
  scanPaths: string[];
  aiSettings: {
    summaryEnabled: boolean;
    summaryModel: string;
    apiKey: string;
  };
  multiplexSettings: {
    maxSessions: number;
    maxSessionsPerProject: number;
  };
  tuiSettings: {
    refreshInterval: number;
  };
}

type SectionType = 'scanPaths' | 'aiSettings' | 'multiplexSettings' | 'tuiSettings' | 'dataStorage';

interface SectionDef {
  id: SectionType;
  title: string;
  editable: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'scanPaths', title: 'Scan Paths', editable: true },
  { id: 'aiSettings', title: 'AI Settings', editable: true },
  { id: 'multiplexSettings', title: 'Session Pool', editable: true },
  { id: 'tuiSettings', title: 'TUI Settings', editable: true },
  { id: 'dataStorage', title: 'Data & Storage', editable: false },
];

export const SettingsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [selectedSection, setSelectedSection] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [showAddPathInput, setShowAddPathInput] = useState(false);
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    if (!onFocus) return;

    const loadSettings = async () => {
      try {
        const { loadConfig } = await import('../../config.js');
        const config = loadConfig();

        setSettings({
          scanPaths: config.scanPaths || [],
          aiSettings: {
            summaryEnabled: config.ai?.summaryEnabled ?? false,
            summaryModel: config.ai?.summaryModel || 'claude-sonnet-4-20250514',
            apiKey: config.ai?.apiKey ? '***hidden***' : '',
          },
          multiplexSettings: {
            maxSessions: config.multiplex?.maxSessions || 5,
            maxSessionsPerProject: config.multiplex?.maxSessionsPerProject || 2,
          },
          tuiSettings: {
            refreshInterval: config.tui?.refreshInterval || 3000,
          },
        });
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, [onFocus]);

  const handleSave = async () => {
    try {
      const { loadConfig, saveConfig } = await import('../../config.js');
      const config = loadConfig();

      config.scanPaths = settings?.scanPaths || [];
      config.ai = {
        ...config.ai,
        summaryEnabled: settings?.aiSettings.summaryEnabled ?? false,
        summaryModel: settings?.aiSettings.summaryModel || 'claude-sonnet-4-20250514',
      };
      config.multiplex = {
        ...config.multiplex,
        maxSessions: settings?.multiplexSettings.maxSessions || 5,
        maxSessionsPerProject: settings?.multiplexSettings.maxSessionsPerProject || 2,
      };
      config.tui = {
        ...config.tui,
        refreshInterval: settings?.tuiSettings.refreshInterval || 3000,
      };

      saveConfig(config);
      setStatusMessage('✓ Configuration saved!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('✗ Failed to save configuration');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleReload = async () => {
    const { loadConfig } = await import('../../config.js');
    const config = loadConfig();
    setSettings({
      scanPaths: config.scanPaths || [],
      aiSettings: {
        summaryEnabled: config.ai?.summaryEnabled ?? false,
        summaryModel: config.ai?.summaryModel || 'claude-sonnet-4-20250514',
        apiKey: config.ai?.apiKey ? '***hidden***' : '',
      },
      multiplexSettings: {
        maxSessions: config.multiplex?.maxSessions || 5,
        maxSessionsPerProject: config.multiplex?.maxSessionsPerProject || 2,
      },
      tuiSettings: {
        refreshInterval: config.tui?.refreshInterval || 3000,
      },
    });
    setStatusMessage('✓ Configuration reloaded!');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleOpenDataDir = () => {
    const { execSync } = require('child_process');
    const dataDir = process.env.HOME + '/.maxclaw';
    try {
      execSync(`open "${dataDir}"`, { stdio: 'ignore' });
      setStatusMessage(`✓ Opened: ${dataDir}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('✗ Failed to open data directory');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleAddPath = () => {
    setShowAddPathInput(true);
  };

  const confirmAddPath = () => {
    if (newPath.trim() && settings) {
      setSettings({
        ...settings,
        scanPaths: [...settings.scanPaths, newPath.trim()],
      });
      setNewPath('');
      setShowAddPathInput(false);
      setStatusMessage('✓ Path added');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const handleRemovePath = (index: number) => {
    if (settings) {
      const newPaths = settings.scanPaths.filter((_, i) => i !== index);
      setSettings({ ...settings, scanPaths: newPaths });
      setStatusMessage('✓ Path removed');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const toggleSummaryEnabled = () => {
    if (settings) {
      setSettings({
        ...settings,
        aiSettings: { ...settings.aiSettings, summaryEnabled: !settings.aiSettings.summaryEnabled },
      });
    }
  };

  const incrementValue = (field: string) => {
    if (!settings) return;
    if (field === 'maxSessions') {
      setSettings({
        ...settings,
        multiplexSettings: { ...settings.multiplexSettings, maxSessions: settings.multiplexSettings.maxSessions + 1 },
      });
    } else if (field === 'maxSessionsPerProject') {
      setSettings({
        ...settings,
        multiplexSettings: { ...settings.multiplexSettings, maxSessionsPerProject: settings.multiplexSettings.maxSessionsPerProject + 1 },
      });
    } else if (field === 'refreshInterval') {
      setSettings({
        ...settings,
        tuiSettings: { ...settings.tuiSettings, refreshInterval: settings.tuiSettings.refreshInterval + 1000 },
      });
    }
  };

  const decrementValue = (field: string) => {
    if (!settings) return;
    if (field === 'maxSessions' && settings.multiplexSettings.maxSessions > 1) {
      setSettings({
        ...settings,
        multiplexSettings: { ...settings.multiplexSettings, maxSessions: settings.multiplexSettings.maxSessions - 1 },
      });
    } else if (field === 'maxSessionsPerProject' && settings.multiplexSettings.maxSessionsPerProject > 1) {
      setSettings({
        ...settings,
        multiplexSettings: { ...settings.multiplexSettings, maxSessionsPerProject: settings.multiplexSettings.maxSessionsPerProject - 1 },
      });
    } else if (field === 'refreshInterval' && settings.tuiSettings.refreshInterval > 1000) {
      setSettings({
        ...settings,
        tuiSettings: { ...settings.tuiSettings, refreshInterval: settings.tuiSettings.refreshInterval - 1000 },
      });
    }
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (!settings) return;

    // Navigation with arrow keys
    if (key.upArrow) {
      setSelectedSection((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedSection((prev) => Math.min(SECTIONS.length - 1, prev + 1));
    }

    // Section-specific actions
    const currentSection = SECTIONS[selectedSection].id;

    if (currentSection === 'scanPaths') {
      if (input === 'a') {
        handleAddPath();
      } else if (input === 'd' || input === 'D') {
        // Remove last path for simplicity
        if (settings.scanPaths.length > 0) {
          handleRemovePath(settings.scanPaths.length - 1);
        }
      }
    }

    // AI Settings actions
    if (currentSection === 'aiSettings') {
      if (input === 'e' || input === 'E') {
        toggleSummaryEnabled();
      }
    }

    // Numeric value editing
    if (currentSection === 'multiplexSettings' || currentSection === 'tuiSettings') {
      if (input === '+') {
        incrementValue(currentSection === 'multiplexSettings' ? 'maxSessions' : 'refreshInterval');
      } else if (input === '-') {
        decrementValue(currentSection === 'multiplexSettings' ? 'maxSessions' : 'refreshInterval');
      }
    }

    // Global actions
    if (input === 's' || input === 'S') {
      handleSave();
    } else if (input === 'r' || input === 'R') {
      handleReload();
    } else if (input === 'o' || input === 'O') {
      handleOpenDataDir();
    }

    // Number input for adding path
    if (showAddPathInput) {
      if (key.return) {
        confirmAddPath();
      } else if (key.escape) {
        setShowAddPathInput(false);
        setNewPath('');
      } else {
        setNewPath((prev) => prev + input);
      }
    }
  }, { isActive: true });

  if (!settings) {
    return <Text>Loading settings...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="green">Settings</Text>
      <Text> </Text>

      {SECTIONS.map((section, index) => {
        const isSelected = index === selectedSection;
        const highlight = isSelected ? 'yellow' : 'cyan';

        return (
          <Box
            key={section.id}
            flexDirection="column"
            borderStyle="single"
            borderColor={isSelected ? 'yellow' : 'gray'}
            paddingX={1}
            marginBottom={1}
          >
            <Text bold color={highlight}>{section.title}</Text>
            <Text> </Text>

            {section.id === 'scanPaths' && (
              <>
                {settings.scanPaths.length === 0 ? (
                  <Text dimColor>No scan paths configured</Text>
                ) : (
                  settings.scanPaths.map((path, idx) => (
                    <Box key={idx} marginBottom={1}>
                      <Text color="green">  {idx + 1}. </Text>
                      <Text>{path}</Text>
                    </Box>
                  ))
                )}
                {showAddPathInput ? (
                  <Box>
                    <Text color="yellow">New path: </Text>
                    <Text>{newPath}</Text>
                    <Text dimColor> [Enter] Confirm [Esc] Cancel</Text>
                  </Box>
                ) : (
                  <Text dimColor>[a] Add path | [d] Remove last</Text>
                )}
              </>
            )}

            {section.id === 'aiSettings' && (
              <>
                <SettingItem
                  label="Summary Enabled"
                  value={settings.aiSettings.summaryEnabled ? 'Yes ✓' : 'No'}
                  description="Enable AI-powered session summaries"
                />
                <SettingItem
                  label="Summary Model"
                  value={settings.aiSettings.summaryModel}
                  description="Model used for generating summaries"
                />
                <SettingItem
                  label="API Key"
                  value={settings.aiSettings.apiKey || 'Not configured'}
                  description="Anthropic API Key (encrypted storage)"
                />
                <Text dimColor>[e] Toggle Summary Enabled</Text>
              </>
            )}

            {section.id === 'multiplexSettings' && (
              <>
                <SettingItem
                  label="Max Sessions"
                  value={settings.multiplexSettings.maxSessions.toString()}
                  description="Maximum concurrent sessions"
                />
                <SettingItem
                  label="Max Sessions Per Project"
                  value={settings.multiplexSettings.maxSessionsPerProject.toString()}
                  description="Maximum sessions per project"
                />
                <Text dimColor>[+] Increase | [-] Decrease</Text>
              </>
            )}

            {section.id === 'tuiSettings' && (
              <>
                <SettingItem
                  label="Refresh Interval"
                  value={`${settings.tuiSettings.refreshInterval}ms`}
                  description="TUI auto-refresh interval"
                />
                <Text dimColor>[+] Increase | [-] Decrease</Text>
              </>
            )}

            {section.id === 'dataStorage' && (
              <>
                <Text>  Data Directory: ~/.maxclaw/</Text>
                <Text>  Config File: ~/.maxclaw/config.yaml</Text>
                <Text>  Database: ~/.maxclaw/data.db</Text>
                <Text> </Text>
                <Text dimColor>[o] Open data directory</Text>
              </>
            )}
          </Box>
        );
      })}

      {/* Action Buttons */}
      <Box marginBottom={1}>
        <Text color="green">[s] Save Config</Text>
        <Text> </Text>
        <Text color="cyan">[r] Reload Config</Text>
        <Text> </Text>
        {statusMessage && (
          <Text bold color="yellow">{statusMessage}</Text>
        )}
      </Box>

      {/* Help Footer */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold dimColor>Quick Help</Text>
        <Text dimColor>↑↓ Navigate sections | [a] Add | [d] Delete | [+/-] Adjust values | [s] Save | [r] Reload</Text>
      </Box>
    </Box>
  );
};

const SettingItem: React.FC<{ label: string; value: string; description: string }> = ({ label, value, description }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="green">{label.padEnd(25)} </Text>
        <Text color="cyan">{value}</Text>
      </Box>
      <Text dimColor>  {description}</Text>
    </Box>
  );
};

export default SettingsScreen;
