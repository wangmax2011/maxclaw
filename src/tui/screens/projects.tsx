// EPIC-008: Projects Screen

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';
import type { Project } from '../../types.js';

export const ProjectsScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!onFocus) return;

    const loadProjects = async () => {
      try {
        const { getAllProjects } = await import('../../project-manager.js');
        const allProjects = getAllProjects();
        setProjects(allProjects);
      } catch (error) {
        // Handle error
      }
    };

    loadProjects();
  }, [onFocus]);

  return (
    <Box flexDirection="column">
      <Text bold color="green">Projects ({projects.length})</Text>
      <Text> </Text>

      {projects.length === 0 ? (
        <Text dimColor>No projects found. Run 'maxclaw discover' to add projects.</Text>
      ) : (
        <Box flexDirection="column">
          {projects.map((project, index) => (
            <ProjectItem
              key={project.id}
              project={project}
              selected={index === selectedIndex}
            />
          ))}
        </Box>
      )}

      <Text> </Text>
      <Text dimColor>
        [↑↓] Navigate | [Enter] Start session | [d] Discover | [a] Add manually
      </Text>
    </Box>
  );
};

const ProjectItem: React.FC<{ project: Project; selected: boolean }> = ({ project, selected }) => {
  const techStack = project.techStack.slice(0, 3).join(', ');

  return (
    <Box
      backgroundColor={selected ? 'blue' : undefined}
      paddingX={1}
    >
      <Text color={selected ? 'white' : 'cyan'}>
        {selected ? '▶' : ' '} {project.name}
      </Text>
      <Text color="gray" dimColor={!selected}>
        {' '}
        [{techStack || 'No tech detected'}]
      </Text>
      <Text color="gray" dimColor={!selected}>
        {' '}
        {project.path}
      </Text>
    </Box>
  );
};

export default ProjectsScreen;
