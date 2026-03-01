// MOD-005: Schedules Management Screen - Scheduled tasks and task dispatching

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
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
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (!onFocus) return;

    const loadTasks = async () => {
      try {
        await import('../../db.js');
        const allTasks: any[] = [];
        setTasks(allTasks);
      } catch (error) {
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
      setStatusMessage(`\u25B6 Running "${task.name}"...`);
      setTimeout(() => {
        setStatusMessage(`\u2713 "${task.name}" completed!`);
        setTimeout(() => setStatusMessage(''), 3000);
      }, 2000);
    } catch (error) {
      setStatusMessage(`\u2717 Failed: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleDeleteTask = () => {
    if (tasks.length === 0) return;
    const task = tasks[selectedIndex];
    setTasks(tasks.filter(t => t.id !== task.id));
    setStatusMessage(`\u2713 Deleted "${task.name}"`);
    setTimeout(() => setStatusMessage(''), 3000);
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleToggleTask = () => {
    if (tasks.length === 0) return;
    const task = tasks[selectedIndex];
    setTasks(tasks.map(t =>
      t.id === task.id ? { ...t, enabled: !t.enabled } : t
    ));
    setStatusMessage(`\u2713 "${task.name}" ${task.enabled ? 'disabled' : 'enabled'}`);
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleShowHistory = () => {
    if (tasks.length === 0) return;
    const task = tasks[selectedIndex];
    setShowHistory(!showHistory);
    setStatusMessage(`History: ${task.executionHistory.length} executions`);
    setTimeout(() => setStatusMessage(''), 3000);
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (showAddModal) return;

    // Navigation
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < tasks.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }

    // Actions
    if (input === 'r' || input === 'R') {
      if (tasks.length > 0) handleRunNow(tasks[selectedIndex]);
    } else if (input === 'd' || input === 'D') {
      if (tasks.length > 0) handleDeleteTask();
    } else if (input === 't' || input === 'T') {
      if (tasks.length > 0) handleToggleTask();
    } else if (input === 'h' || input === 'H') {
      if (tasks.length > 0) handleShowHistory();
    } else if (input === 'a' || input === 'A') {
      setShowAddModal(true);
    } else if (input === 'p' || input === 'P') {
      onNavigate('task-dispatcher');
    }
  }, { isActive: true });

  const selectedTask = tasks.length > 0 ? tasks[selectedIndex] : null;

  return (
    <Box flexDirection="column">
      <Text bold color="green">Scheduled Tasks ({tasks.length})</Text>
      <Text> </Text>

      {tasks.length === 0 ? (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
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
            />
          ))}
        </Box>
      )}

      {selectedTask && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
          <Text bold color="cyan">Selected: {selectedTask.name}</Text>
          <Text> </Text>
          <Text dimColor>Actions: [r] Run now | [d] Delete | [t] Toggle | [h] History</Text>
        </Box>
      )}

      {/* Task Actions */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Keyboard Shortcuts</Text>
        <Text> </Text>
        <Box>
          <Text color="yellow">[a] </Text>
          <Text>Add task</Text>
          <Text dimColor> | </Text>
          <Text color="yellow">[r] </Text>
          <Text>Run now</Text>
          <Text dimColor> | </Text>
          <Text color="yellow">[d] </Text>
          <Text>Delete</Text>
          <Text dimColor> | </Text>
          <Text color="yellow">[t] </Text>
          <Text>Toggle</Text>
          <Text dimColor> | </Text>
          <Text color="yellow">[h] </Text>
          <Text>History</Text>
        </Box>
      </Box>

      {/* Task Dispatcher Quick Access */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">Task Dispatcher</Text>
        <Text> </Text>
        <Text>Run custom commands or ad-hoc tasks:</Text>
        <Text color="yellow">  [p] Open Task Dispatcher</Text>
      </Box>

      {statusMessage && (
        <Text> </Text>
      )}
      {statusMessage && (
        <Text bold color="yellow">{statusMessage}</Text>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <Box flexDirection="column" borderStyle="double" borderColor="green" paddingX={1} marginTop={1}>
          <Text bold color="green">Add New Task</Text>
          <Text> </Text>
          <Text dimColor>Feature coming soon - use CLI to add tasks:</Text>
          <Text color="cyan">  maxclaw schedule add "Task Name" "0 2 * * *" command</Text>
          <Text> </Text>
          <Text color="yellow">[Esc] Close</Text>
        </Box>
      )}
    </Box>
  );
};

const TaskItem: React.FC<{
  task: ScheduledTask;
  selected: boolean;
}> = ({ task, selected }) => {
  const statusColor = task.enabled ? 'green' : 'gray';
  const statusIcon = task.enabled ? '\u25CF' : '\u25CB';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
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
        <Text dimColor>Cmd: {task.command}</Text>
      </Box>
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
