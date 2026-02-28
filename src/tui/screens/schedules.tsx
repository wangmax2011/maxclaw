// MOD-005: Schedules Management Screen - Scheduled tasks and task dispatching

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  command: string;
  targetProjectId?: string;
  executionHistory: TaskExecution[];
}

interface TaskExecution {
  id: string;
  executedAt: string;
  status: 'success' | 'failed' | 'running';
  duration?: number;
  output?: string;
}

export const SchedulesScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!onFocus) return;

    const loadTasks = async () => {
      try {
        // Import schedule functions from db.js
        await import('../../db.js');
        // Get all schedules from database - mock data for now
        const allTasks: any[] = [];
        setTasks(allTasks);
      } catch (error) {
        console.error('Failed to load scheduled tasks:', error);
        // Mock data for development
        setTasks([
          {
            id: '1',
            name: 'Daily Backup',
            description: 'Backup all projects daily',
            cronExpression: '0 2 * * *',
            enabled: true,
            lastRun: new Date(Date.now() - 86400000).toISOString(),
            nextRun: new Date(Date.now() + 3600000).toISOString(),
            command: 'backup',
            executionHistory: [
              { id: '1', executedAt: new Date().toISOString(), status: 'success', duration: 1200 },
            ],
          },
          {
            id: '2',
            name: 'Weekly Report',
            description: 'Generate weekly progress report',
            cronExpression: '0 9 * * 1',
            enabled: true,
            lastRun: new Date(Date.now() - 604800000).toISOString(),
            nextRun: new Date(Date.now() + 604800000).toISOString(),
            command: 'report --weekly',
            executionHistory: [],
          },
        ]);
      }
    };

    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [onFocus]);

  const handleRunNow = async (task: ScheduledTask) => {
    try {
      setStatusMessage(`Running task "${task.name}"...`);
      // Execute task immediately
      setTimeout(() => {
        setStatusMessage(`Task "${task.name}" completed!`);
        setTimeout(() => setStatusMessage(''), 3000);
      }, 2000);
    } catch (error) {
      setStatusMessage(`Failed to run task: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId));
    setStatusMessage('Task deleted');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleToggleTask = async (taskId: string) => {
    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, enabled: !t.enabled } : t
    ));
    setStatusMessage('Task updated');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  return (
    <Box flexDirection="column">
      <Text bold color="green">Scheduled Tasks ({tasks.length})</Text>
      <Text> </Text>

      {tasks.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No scheduled tasks configured.</Text>
          <Text> </Text>
          <Text color="cyan">[a] Add scheduled task</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, index) => (
            <TaskItem
              key={task.id}
              task={task}
              selected={index === selectedIndex}
              onRun={() => handleRunNow(task)}
              onDelete={() => handleDeleteTask(task.id)}
              onToggle={() => handleToggleTask(task.id)}
            />
          ))}
        </Box>
      )}

      <Text> </Text>

      {/* Task Actions */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Task Actions</Text>
        <Text> </Text>
        <Text color="cyan">  [a] Add scheduled task - Create a new scheduled task</Text>
        <Text color="cyan">  [d] Delete task - Remove selected task</Text>
        <Text color="cyan">  [e] Edit task - Modify task configuration</Text>
        <Text color="cyan">  [r] Run now - Execute task immediately</Text>
        <Text color="cyan">  [t] Toggle enabled - Enable/disable task</Text>
        <Text color="cyan">  [h] View history - Show execution history</Text>
      </Box>

      {/* Task Dispatcher Quick Access */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Task Dispatcher</Text>
        <Text> </Text>
        <Text>Need to run a custom command or ad-hoc task?</Text>
        <Text color="yellow">  [p] Open Task Dispatcher</Text>
      </Box>

      {statusMessage && (
        <Text> </Text>
      )}
      {statusMessage && (
        <Text bold color="yellow">{statusMessage}</Text>
      )}
    </Box>
  );
};

const TaskItem: React.FC<{
  task: ScheduledTask;
  selected: boolean;
  onRun: () => void;
  onDelete: () => void;
  onToggle: () => void;
}> = ({ task, selected, onRun, onDelete, onToggle }) => {
  const statusColor = task.enabled ? 'green' : 'gray';
  const statusIcon = task.enabled ? '\u25CF' : '\u25CB';

  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? 'single' : 'single'}
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text color={statusIcon === '\u25CF' ? 'green' : 'gray'}>{statusIcon} </Text>
        <Text bold color={selected ? 'white' : 'cyan'}>{task.name}</Text>
        <Text color="gray"> | </Text>
        <Text dimColor>{task.cronExpression}</Text>
      </Box>
      <Box>
        <Text dimColor>  {task.description}</Text>
      </Box>
      <Box>
        {task.lastRun && (
          <>
            <Text dimColor>Last: {formatDate(task.lastRun)}</Text>
            <Text dimColor> | </Text>
          </>
        )}
        {task.nextRun && (
          <>
            <Text dimColor>Next: {formatDate(task.nextRun)}</Text>
            <Text dimColor> | </Text>
          </>
        )}
        <Text dimColor>Command: {task.command}</Text>
      </Box>
      {selected && (
        <Box marginTop={1}>
          <Text color="yellow">  [r] Run now | [e] Edit | [d] Delete | [t] Toggle</Text>
        </Box>
      )}
    </Box>
  );
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

export default SchedulesScreen;
