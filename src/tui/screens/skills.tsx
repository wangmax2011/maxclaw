// MOD-006: Skills Management Screen - Skill plugins management

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  author: string;
  commands: SkillCommand[];
}

interface SkillCommand {
  name: string;
  description: string;
  handler: string;
}

export const SkillsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSkillInfo, setShowSkillInfo] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!onFocus) return;

    const loadSkills = async () => {
      try {
        // Skills are loaded from skills/index.js - use mock data for now
        // The actual skill system uses SkillRegistry
        const allSkills: any[] = [];
        setSkills(allSkills);
      } catch (error) {
        console.error('Failed to load skills:', error);
        // Mock data for development
        setSkills([
          {
            id: 'frontend-design',
            name: 'frontend-design',
            description: 'Frontend design and UI generation skill',
            version: '1.0.0',
            enabled: true,
            author: 'MaxClaw',
            commands: [
              { name: 'design', description: 'Generate UI design', handler: 'design' },
              { name: 'component', description: 'Create React component', handler: 'component' },
            ],
          },
          {
            id: 'code-review',
            name: 'code-review',
            description: 'Code review and analysis skill',
            version: '1.0.0',
            enabled: true,
            author: 'MaxClaw',
            commands: [
              { name: 'review', description: 'Review code changes', handler: 'review' },
              { name: 'analyze', description: 'Analyze code quality', handler: 'analyze' },
            ],
          },
          {
            id: 'test-generator',
            name: 'test-generator',
            description: 'Generate unit and integration tests',
            version: '1.0.0',
            enabled: false,
            author: 'MaxClaw',
            commands: [
              { name: 'generate', description: 'Generate tests', handler: 'generate' },
            ],
          },
          {
            id: 'documentation',
            name: 'documentation',
            description: 'Generate documentation from code',
            version: '1.0.0',
            enabled: true,
            author: 'MaxClaw',
            commands: [
              { name: 'docs', description: 'Generate docs', handler: 'docs' },
              { name: 'readme', description: 'Generate README', handler: 'readme' },
            ],
          },
        ]);
      }
    };

    loadSkills();
  }, [onFocus]);

  const handleToggleSkill = async (skillId: string) => {
    setSkills(skills.map(s =>
      s.id === skillId ? { ...s, enabled: !s.enabled } : s
    ));
    setStatusMessage('Skill updated');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleRunSkill = async (skill: Skill) => {
    setStatusMessage(`Running skill "${skill.name}"...`);
    setTimeout(() => {
      setStatusMessage(`Skill "${skill.name}" completed!`);
      setTimeout(() => setStatusMessage(''), 3000);
    }, 2000);
  };

  const handleOpenSkillsDir = () => {
    const { execSync } = require('child_process');
    const skillsDir = process.cwd() + '/skills';
    try {
      execSync(`open "${skillsDir}"`, { stdio: 'ignore' });
      setStatusMessage(`Opened skills directory: ${skillsDir}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to open skills directory');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="green">Skills ({skills.length})</Text>
      <Text> </Text>

      {skills.length === 0 ? (
        <Text dimColor>No skills installed. Visit the skills directory to add more.</Text>
      ) : (
        <Box flexDirection="column">
          {skills.map((skill, index) => (
            <SkillItem
              key={skill.id}
              skill={skill}
              selected={index === selectedIndex}
              onToggle={() => handleToggleSkill(skill.id)}
              onRun={() => handleRunSkill(skill)}
              onInfo={() => setShowSkillInfo(!showSkillInfo)}
            />
          ))}
        </Box>
      )}

      <Text> </Text>

      {/* Skill Actions */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Skill Management</Text>
        <Text> </Text>
        <Text color="cyan">  [e] Enable/Disable - Toggle skill on/off</Text>
        <Text color="cyan">  [i] Skill Info - View detailed information</Text>
        <Text color="cyan">  [r] Run Skill - Execute skill command</Text>
        <Text color="cyan">  [t] Create Template - Create skill template</Text>
        <Text color="cyan">  [o] Open Skills Dir - Browse skills directory</Text>
      </Box>

      {/* Installed Skills List */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Installed Skills</Text>
        <Text> </Text>
        <Box flexDirection="column">
          {skills.filter(s => s.enabled).map(skill => (
            <Box key={skill.id}>
              <Text color="green">  \u25CF </Text>
              <Text>{skill.name} v{skill.version}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Quick Command Reference */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Quick Commands</Text>
        <Text> </Text>
        <Text dimColor>Run a skill command directly:</Text>
        <Text>  maxclaw skill {'<name>'} {'<command>'} [args]</Text>
        <Text> </Text>
        <Text dimColor>Example:</Text>
        <Text>  maxclaw skill frontend-design component Button</Text>
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

const SkillItem: React.FC<{
  skill: Skill;
  selected: boolean;
  onToggle: () => void;
  onRun: () => void;
  onInfo: () => void;
}> = ({ skill, selected, onToggle, onRun, onInfo }) => {
  const statusColor = skill.enabled ? 'green' : 'gray';
  const statusIcon = skill.enabled ? '\u25CF' : '\u25CB';

  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? 'single' : 'single'}
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text bold color={selected ? 'white' : 'cyan'}>{skill.name}</Text>
        <Text color="gray"> | </Text>
        <Text dimColor>v{skill.version}</Text>
        <Text color="gray"> | </Text>
        <Text dimColor>by {skill.author}</Text>
      </Box>
      <Box>
        <Text dimColor>  {skill.description}</Text>
      </Box>
      {skill.commands && skill.commands.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Commands:</Text>
          {skill.commands.map(cmd => (
            <Text key={cmd.name} dimColor>
              {`  - ${cmd.name}: ${cmd.description}`}
            </Text>
          ))}
        </Box>
      )}
      {selected && (
        <Box marginTop={1}>
          <Text color="yellow">  [e] Toggle | [r] Run | [i] Info</Text>
        </Box>
      )}
    </Box>
  );
};

export default SkillsScreen;
