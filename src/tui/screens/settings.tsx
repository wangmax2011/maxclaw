// MOD-007: Settings Screen - Global configuration management

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
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

interface ConfigSection {
  id: string;
  title: string;
  items: ConfigItem[];
}

interface ConfigItem {
  key: string;
  label: string;
  value: string | boolean | number;
  type: 'string' | 'boolean' | 'number' | 'array';
  description: string;
}

export const SettingsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [selectedSection, setSelectedSection] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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

      // Update config with settings
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
      setStatusMessage('Configuration saved successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to save configuration');
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
    setStatusMessage('Configuration reloaded!');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleOpenDataDir = () => {
    const { execSync } = require('child_process');
    const dataDir = process.env.HOME + '/.maxclaw';
    try {
      execSync(`open "${dataDir}"`, { stdio: 'ignore' });
      setStatusMessage(`Opened data directory: ${dataDir}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to open data directory');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  if (!settings) {
    return <Text>Loading settings...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="green">Settings</Text>
      <Text> </Text>

      {/* Scan Paths Management */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Scan Paths</Text>
        <Text> </Text>
        {settings.scanPaths.length === 0 ? (
          <Text dimColor>No scan paths configured</Text>
        ) : (
          settings.scanPaths.map((path, index) => (
            <Box key={index} marginBottom={1}>
              <Text color="green">  {index + 1}. </Text>
              <Text>{path}</Text>
            </Box>
          ))
        )}
        <Text> </Text>
        <Text dimColor>[a] Add path | [d] Remove path</Text>
      </Box>

      {/* AI Settings */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">AI Settings</Text>
        <Text> </Text>
        <SettingItem
          label="Summary Enabled"
          value={settings.aiSettings.summaryEnabled ? 'Yes' : 'No'}
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
        <Text> </Text>
        <Text dimColor>[e] Edit value</Text>
      </Box>

      {/* Session Pool Configuration */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Session Pool</Text>
        <Text> </Text>
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
        <Text> </Text>
        <Text dimColor>[e] Edit value</Text>
      </Box>

      {/* TUI Settings */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">TUI Settings</Text>
        <Text> </Text>
        <SettingItem
          label="Refresh Interval"
          value={`${settings.tuiSettings.refreshInterval}ms`}
          description="TUI auto-refresh interval"
        />
        <Text> </Text>
        <Text dimColor>[e] Edit value</Text>
      </Box>

      {/* Data & Storage Info */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Data & Storage</Text>
        <Text> </Text>
        <Text>  Data Directory: ~/.maxclaw/</Text>
        <Text>  Config File: ~/.maxclaw/config.yaml</Text>
        <Text>  Database: ~/.maxclaw/data.db</Text>
        <Text> </Text>
        <Text dimColor>[o] Open data directory</Text>
      </Box>

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

      {/* Export/Import Config */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">Import/Export</Text>
        <Text> </Text>
        <Text dimColor>[x] Export configuration</Text>
        <Text dimColor>[i] Import configuration</Text>
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
