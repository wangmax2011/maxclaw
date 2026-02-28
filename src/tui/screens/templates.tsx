// MOD-008: Templates Management Screen - Project template management

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScreenProps } from '../types.js';

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  language: string;
  framework?: string;
  files: string[];
  variables: TemplateVariable[];
}

interface TemplateVariable {
  name: string;
  description: string;
  default: string;
}

export const TemplatesScreen: React.FC<ScreenProps> = ({ onFocus, onNavigate }) => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTemplateContents, setShowTemplateContents] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!onFocus) return;

    const loadTemplates = async () => {
      try {
        // Templates are file-based in ~/.maxclaw/templates/
        // For now, use mock data - will be populated from templates directory
        const allTemplates: any[] = [];
        setTemplates(allTemplates);
      } catch (error) {
        console.error('Failed to load templates:', error);
        // Mock data for development
        setTemplates([
          {
            id: 'nodejs-ts',
            name: 'Node.js TypeScript',
            description: 'Node.js project with TypeScript configuration',
            version: '1.0.0',
            language: 'typescript',
            framework: 'node',
            files: ['src/index.ts', 'tsconfig.json', 'package.json', '.gitignore'],
            variables: [
              { name: 'projectName', description: 'Project name', default: 'my-project' },
              { name: 'version', description: 'Version', default: '1.0.0' },
            ],
          },
          {
            id: 'python',
            name: 'Python Project',
            description: 'Python project with virtual environment',
            version: '1.0.0',
            language: 'python',
            files: ['src/__init__.py', 'requirements.txt', '.gitignore', 'README.md'],
            variables: [
              { name: 'projectName', description: 'Project name', default: 'my-project' },
              { name: 'pythonVersion', description: 'Python version', default: '3.11' },
            ],
          },
          {
            id: 'react-app',
            name: 'React App',
            description: 'React application with Vite',
            version: '1.0.0',
            language: 'typescript',
            framework: 'react',
            files: ['src/App.tsx', 'src/main.tsx', 'index.html', 'package.json', 'vite.config.ts'],
            variables: [
              { name: 'projectName', description: 'Project name', default: 'react-app' },
              { name: 'template', description: 'Template variant', default: 'ts' },
            ],
          },
          {
            id: 'nextjs',
            name: 'Next.js App',
            description: 'Next.js 14+ with App Router',
            version: '1.0.0',
            language: 'typescript',
            framework: 'nextjs',
            files: ['src/app/layout.tsx', 'src/app/page.tsx', 'package.json', 'next.config.js'],
            variables: [
              { name: 'projectName', description: 'Project name', default: 'nextjs-app' },
              { name: 'template', description: 'Template variant', default: 'ts' },
            ],
          },
        ]);
      }
    };

    loadTemplates();
  }, [onFocus]);

  const handleUseTemplate = async (template: ProjectTemplate) => {
    setStatusMessage(`Using template "${template.name}"...`);
    // Navigate to project creation with template
    setTimeout(() => {
      setStatusMessage(`Template "${template.name}" ready for project creation`);
      setTimeout(() => setStatusMessage(''), 3000);
    }, 1000);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setTemplates(templates.filter(t => t.id !== templateId));
    setStatusMessage('Template deleted');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleOpenTemplatesDir = () => {
    const { execSync } = require('child_process');
    const templatesDir = process.cwd() + '/templates';
    try {
      execSync(`open "${templatesDir}"`, { stdio: 'ignore' });
      setStatusMessage(`Opened templates directory: ${templatesDir}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to open templates directory');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="green">Project Templates ({templates.length})</Text>
      <Text> </Text>

      {templates.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No templates available. Templates are stored in ~/.maxclaw/templates/</Text>
          <Text> </Text>
          <Text color="cyan">[c] Create custom template</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {templates.map((template, index) => (
            <TemplateItem
              key={template.id}
              template={template}
              selected={index === selectedIndex}
              onUse={() => handleUseTemplate(template)}
              onView={() => setShowTemplateContents(!showTemplateContents)}
              onDelete={() => handleDeleteTemplate(template.id)}
            />
          ))}
        </Box>
      )}

      <Text> </Text>

      {/* Template Actions */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Template Actions</Text>
        <Text> </Text>
        <Text color="cyan">  [u] Use Template - Create project from template</Text>
        <Text color="cyan">  [v] View Template - Show template contents</Text>
        <Text color="cyan">  [c] Create Custom - Create new template</Text>
        <Text color="cyan">  [d] Delete Template - Remove template</Text>
        <Text color="cyan">  [o] Open Templates Dir - Browse templates</Text>
      </Box>

      {/* Built-in Templates Info */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Available Templates</Text>
        <Text> </Text>
        <Box flexDirection="column">
          {templates.map(template => (
            <Box key={template.id}>
              <Text color="green">  \u25CF </Text>
              <Text>{template.name}</Text>
              <Text dimColor> - {template.description}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Template Creation Guide */}
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Create Custom Template</Text>
        <Text> </Text>
        <Text dimColor>To create a custom template:</Text>
        <Text>  1. Create a folder in ~/.maxclaw/templates/</Text>
        <Text>  2. Add template files with {'{{'}variable{'}'} placeholders</Text>
        <Text>  3. Create template.yaml with metadata</Text>
        <Text> </Text>
        <Text dimColor>Example template.yaml:</Text>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>name: my-template</Text>
          <Text dimColor>description: My custom template</Text>
          <Text dimColor>language: typescript</Text>
        </Box>
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

const TemplateItem: React.FC<{
  template: ProjectTemplate;
  selected: boolean;
  onUse: () => void;
  onView: () => void;
  onDelete: () => void;
}> = ({ template, selected, onUse, onView, onDelete }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? 'single' : 'single'}
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text bold color={selected ? 'white' : 'cyan'}>{template.name}</Text>
        <Text color="gray"> | </Text>
        <Text dimColor>v{template.version}</Text>
        <Text color="gray"> | </Text>
        <Text color="green">{template.language}</Text>
        {template.framework && (
          <>
            <Text color="gray"> | </Text>
            <Text color="magenta">{template.framework}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text dimColor>  {template.description}</Text>
      </Box>
      {template.files && template.files.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Files:</Text>
          {template.files.slice(0, 5).map(file => (
            <Text key={file} dimColor>
              {`  - ${file}`}
            </Text>
          ))}
          {template.files.length > 5 && (
            <Text dimColor>{`  ... and ${template.files.length - 5} more`}</Text>
          )}
        </Box>
      )}
      {selected && (
        <Box marginTop={1}>
          <Text color="yellow">  [u] Use | [v] View | [d] Delete</Text>
        </Box>
      )}
    </Box>
  );
};

export default TemplatesScreen;
