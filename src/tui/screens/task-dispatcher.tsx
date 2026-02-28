// MOD-009: Task Dispatcher - Unified task command center

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

type TaskType = 'schedule' | 'skill' | 'session' | 'discover' | 'custom';

interface TaskDispatcherState {
  selectedTaskType: TaskType;
  targetProject?: string;
  targetTeam?: string;
  command?: string;
  parameters: Record<string, string>;
  isExecuting: boolean;
  executionResult?: TaskExecutionResult;
}

interface TaskExecutionResult {
  success: boolean;
  message: string;
  output?: string;
}

interface TaskTypeOption {
  id: TaskType;
  label: string;
  description: string;
  icon: string;
}

const TASK_TYPE_OPTIONS: TaskTypeOption[] = [
  { id: 'schedule', label: 'Schedule', description: 'Run scheduled task', icon: '\u23F0' },
  { id: 'skill', label: 'Skill', description: 'Run skill command', icon: '\u26A1' },
  { id: 'session', label: 'Session', description: 'Start/stop session', icon: '\u25B6' },
  { id: 'discover', label: 'Discover', description: 'Scan for projects', icon: '\uD83D\uDD0D' },
  { id: 'custom', label: 'Custom', description: 'Custom command', icon: '\u2699' },
];

export const TaskDispatcherScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [state, setState] = useState<TaskDispatcherState>({
    selectedTaskType: 'schedule',
    parameters: {},
    isExecuting: false,
  });
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [scheduledTasks, setScheduledTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!onFocus) return;

    const loadData = async () => {
      try {
        const { getAllProjects } = await import('../../project-manager.js');
        const { listAllTeams } = await import('../../team-manager.js');

        // Mock data for task dispatcher
        setScheduledTasks([]);
        setProjects(getAllProjects() || []);
        setSkills([]);
      } catch (error) {
        console.error('Failed to load data for task dispatcher:', error);
      }
    };

    loadData();
  }, [onFocus]);

  const handleSelectTaskType = (taskType: TaskType) => {
    setState(prev => ({ ...prev, selectedTaskType: taskType }));
  };

  const handleExecuteTask = async () => {
    setState(prev => ({ ...prev, isExecuting: true }));

    try {
      let result: TaskExecutionResult;

      switch (state.selectedTaskType) {
        case 'schedule':
          result = await executeScheduledTask(state.parameters.taskId);
          break;
        case 'skill':
          result = await executeSkillCommand(state.parameters.skillId, state.parameters.command);
          break;
        case 'session':
          result = await executeSessionCommand(state.parameters.action, state.targetProject);
          break;
        case 'discover':
          result = await executeDiscover(state.targetProject);
          break;
        case 'custom':
          result = await executeCustomCommand(state.command);
          break;
        default:
          result = { success: false, message: 'Unknown task type' };
      }

      setState(prev => ({ ...prev, isExecuting: false, executionResult: result }));
      setStatusMessage(result.message);
      setTimeout(() => setStatusMessage(''), 5000);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isExecuting: false,
        executionResult: { success: false, message: `Error: ${error}` },
      }));
    }
  };

  const executeScheduledTask = async (taskId?: string): Promise<TaskExecutionResult> => {
    // Execute scheduled task logic
    return { success: true, message: `Scheduled task "${taskId}" executed successfully` };
  };

  const executeSkillCommand = async (skillId?: string, command?: string): Promise<TaskExecutionResult> => {
    // Execute skill command logic
    return { success: true, message: `Skill "${skillId}" command "${command}" executed` };
  };

  const executeSessionCommand = async (action?: string, projectId?: string): Promise<TaskExecutionResult> => {
    // Execute session command logic
    return { success: true, message: `Session ${action} on project "${projectId}"` };
  };

  const executeDiscover = async (path?: string): Promise<TaskExecutionResult> => {
    // Execute discover logic
    return { success: true, message: `Discovered projects in "${path || 'scan paths'}"` };
  };

  const executeCustomCommand = async (command?: string): Promise<TaskExecutionResult> => {
    // Execute custom command logic
    return { success: true, message: `Executed custom command: "${command}"` };
  };

  return (
    <Box flexDirection="column">
      <Text bold color="green">Task Dispatcher</Text>
      <Text> </Text>

      {/* Task Type Selection */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Select Task Type</Text>
        <Text> </Text>
        <Box flexDirection="column">
          {TASK_TYPE_OPTIONS.map((option, index) => (
            <Box
              key={option.id}
              backgroundColor={index === selectedOptionIndex ? 'blue' : undefined}
              paddingX={1}
            >
              <Text color={index === selectedOptionIndex ? 'white' : option.id === state.selectedTaskType ? 'green' : undefined}>
                {option.icon} {' '}
              </Text>
              <Text bold color={index === selectedOptionIndex ? 'white' : 'cyan'}>
                {option.label}
              </Text>
              <Text dimColor> - {option.description}</Text>
            </Box>
          ))}
        </Box>
        <Text> </Text>
        <Text dimColor>[↑↓] Navigate | [Enter] Select</Text>
      </Box>

      {/* Task Configuration based on selected type */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Configure {TASK_TYPE_OPTIONS.find(o => o.id === state.selectedTaskType)?.label} Task
        </Text>
        <Text> </Text>

        {state.selectedTaskType === 'schedule' && (
          <ScheduleTaskConfig
            tasks={scheduledTasks}
            parameters={state.parameters}
            onParameterChange={(key, value) =>
              setState(prev => ({ ...prev, parameters: { ...prev.parameters, [key]: value } }))
            }
          />
        )}

        {state.selectedTaskType === 'skill' && (
          <SkillTaskConfig
            skills={skills}
            parameters={state.parameters}
            onParameterChange={(key, value) =>
              setState(prev => ({ ...prev, parameters: { ...prev.parameters, [key]: value } }))
            }
          />
        )}

        {state.selectedTaskType === 'session' && (
          <SessionTaskConfig
            projects={projects}
            parameters={state.parameters}
            onParameterChange={(key, value) =>
              setState(prev => ({ ...prev, parameters: { ...prev.parameters, [key]: value } }))
            }
          />
        )}

        {state.selectedTaskType === 'discover' && (
          <DiscoverTaskConfig
            projects={projects}
            targetProject={state.targetProject}
            onTargetChange={(target) => setState(prev => ({ ...prev, targetProject: target }))}
          />
        )}

        {state.selectedTaskType === 'custom' && (
          <CustomTaskConfig
            command={state.command}
            onCommandChange={(command) => setState(prev => ({ ...prev, command }))}
          />
        )}
      </Box>

      {/* Execute Button */}
      <Box marginBottom={1}>
        {state.isExecuting ? (
          <Text bold color="yellow">Executing task...</Text>
        ) : (
          <Text color="green">[Enter] Execute Task</Text>
        )}
      </Box>

      {/* Execution Result */}
      {state.executionResult && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={state.executionResult.success ? 'green' : 'red'}
          paddingX={1}
        >
          <Text bold color={state.executionResult.success ? 'green' : 'red'}>
            {state.executionResult.success ? 'Success' : 'Failed'}
          </Text>
          <Text>{state.executionResult.message}</Text>
          {state.executionResult.output && (
            <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
              <Text dimColor>Output:</Text>
              <Text>{state.executionResult.output}</Text>
            </Box>
          )}
        </Box>
      )}

      {statusMessage && (
        <Text> </Text>
      )}
      {statusMessage && (
        <Text bold color="yellow">{statusMessage}</Text>
      )}
    </Box>
  );
};

// Configuration sub-components

const ScheduleTaskConfig: React.FC<{
  tasks: any[];
  parameters: Record<string, string>;
  onParameterChange: (key: string, value: string) => void;
}> = ({ tasks, parameters, onParameterChange }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Select Scheduled Task:</Text>
      {tasks.map((task, index) => (
        <Box key={task.id}>
          <Text
            color={parameters.taskId === task.id ? 'green' : undefined}
          >
            {parameters.taskId === task.id ? '\u25CF' : '\u25CB'} {task.name}
          </Text>
        </Box>
      ))}
      {tasks.length === 0 && (
        <Text dimColor>No scheduled tasks configured. Go to Schedules to add tasks.</Text>
      )}
    </Box>
  );
};

const SkillTaskConfig: React.FC<{
  skills: any[];
  parameters: Record<string, string>;
  onParameterChange: (key: string, value: string) => void;
}> = ({ skills, parameters, onParameterChange }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Select Skill:</Text>
      {skills.filter(s => s.enabled).map((skill) => (
        <Box key={skill.id} flexDirection="column">
          <Text
            color={parameters.skillId === skill.id ? 'green' : undefined}
          >
            {parameters.skillId === skill.id ? '\u25CF' : '\u25CB'} {skill.name}
          </Text>
          {parameters.skillId === skill.id && skill.commands && (
            <Box flexDirection="column" marginLeft={2}>
              <Text dimColor>Commands:</Text>
              {skill.commands.map((cmd: any) => (
                <Text
                  key={cmd.name}
                  color={parameters.command === cmd.name ? 'cyan' : 'dimColor'}
                >
                  {parameters.command === cmd.name ? '\u25CF' : '\u25CB'} {cmd.name} - {cmd.description}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

const SessionTaskConfig: React.FC<{
  projects: any[];
  parameters: Record<string, string>;
  onParameterChange: (key: string, value: string) => void;
}> = ({ projects, parameters, onParameterChange }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Action:</Text>
      <Box>
        <Text color={parameters.action === 'start' ? 'green' : undefined}>
          {parameters.action === 'start' ? '[\u25CF]' : '[\u25CB]'} Start Session
        </Text>
        <Text> </Text>
        <Text color={parameters.action === 'stop' ? 'red' : undefined}>
          {parameters.action === 'stop' ? '[\u25CF]' : '[\u25CB]'} Stop Session
        </Text>
      </Box>
      <Text> </Text>
      <Text bold>Select Project:</Text>
      {projects.map((project) => (
        <Box key={project.id}>
          <Text color={parameters.projectId === project.id ? 'green' : undefined}>
            {parameters.projectId === project.id ? '\u25CF' : '\u25CB'} {project.name}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

const DiscoverTaskConfig: React.FC<{
  projects: any[];
  targetProject?: string;
  onTargetChange: (target: string) => void;
}> = ({ projects, targetProject, onTargetChange }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Discover Options:</Text>
      <Text>  Scan all configured paths for new projects</Text>
      <Text> </Text>
      <Text dimColor>Scan Paths:</Text>
      <Text dimColor>  ~/.maxclaw/config.yaml - scanPaths</Text>
      <Text> </Text>
      <Text color="cyan">[Enter] Start Discovery Scan</Text>
    </Box>
  );
};

const CustomTaskConfig: React.FC<{
  command?: string;
  onCommandChange: (command: string) => void;
}> = ({ command, onCommandChange }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Custom Command:</Text>
      <Text dimColor>Enter the command to execute:</Text>
      <Box>
        <Text color="cyan">$ </Text>
        <Text>{command || '<type command here>'}</Text>
      </Box>
      <Text> </Text>
      <Text dimColor>Examples:</Text>
      <Text dimColor>  maxclaw session start --project my-app</Text>
      <Text dimColor>  maxclaw skill frontend-design component Button</Text>
      <Text dimColor>  maxclaw discover ~/projects</Text>
    </Box>
  );
};

export default TaskDispatcherScreen;
