// MaxClaw Template Manager - CLI Support

import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { execSync } from 'child_process';

import {
  getTemplatesDir,
  getCustomTemplatesDir,
  ensureCustomTemplatesDir,
  listAvailableTemplates,
  getTemplateDirByName,
  processTemplate,
  TemplateConfig,
  TemplateOptions,
  TemplateResult,
} from './template-engine.js';

import { logger } from './logger.js';

export interface TemplateInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  source: 'builtin' | 'custom';
  path: string;
}

/**
 * List all available templates with detailed info
 */
export function listTemplates(): TemplateInfo[] {
  const templates = listAvailableTemplates();
  const infos: TemplateInfo[] = [];

  for (const template of templates) {
    const templateDir = getTemplateDirByName(template.name);
    if (!templateDir) continue;

    infos.push({
      name: template.name,
      version: template.version,
      description: template.description,
      author: template.name === 'builtin' ? 'MaxClaw' : 'User',
      source: template.source,
      path: templateDir,
    });
  }

  return infos;
}

/**
 * Create a project from template
 */
export async function createProject(
  templateName: string,
  targetPath: string,
  options: {
    name?: string;
    author?: string;
    description?: string;
    installDeps?: boolean;
    initGit?: boolean;
    registerToMaxClaw?: boolean;
  } = {}
): Promise<TemplateResult> {
  // Find template
  const templateDir = getTemplateDirByName(templateName);
  if (!templateDir) {
    return {
      success: false,
      projectPath: targetPath,
      filesCreated: [],
      errors: [`Template not found: ${templateName}`],
      warnings: [],
    };
  }

  // Resolve target path
  const resolvedPath = path.resolve(targetPath);

  // Check if target already exists
  if (fs.existsSync(resolvedPath) && fs.readdirSync(resolvedPath).length > 0) {
    return {
      success: false,
      projectPath: resolvedPath,
      filesCreated: [],
      errors: [`Target directory is not empty: ${resolvedPath}`],
      warnings: [],
    };
  }

  // Determine project name
  const projectName = options.name || path.basename(resolvedPath);

  // Get user info for default author
  const defaultAuthor = os.userInfo().username;

  // Process template
  const templateOptions: TemplateOptions = {
    projectName,
    projectPath: resolvedPath,
    author: options.author || defaultAuthor,
    description: options.description,
    installDeps: options.installDeps ?? false,
    initGit: options.initGit ?? true,
    registerToMaxClaw: options.registerToMaxClaw ?? true,
  };

  logger.info('Creating project from template: %s', templateName);
  logger.info('Project name: %s', projectName);
  logger.info('Target path: %s', resolvedPath);

  return processTemplate(templateDir, templateOptions);
}

/**
 * Create a new custom template
 */
export async function createTemplate(
  templateName: string,
  options: {
    description?: string;
    templateType?: 'nodejs-ts' | 'react-app' | 'nextjs' | 'python' | 'empty';
  } = {}
): Promise<{ success: boolean; templatePath: string; errors: string[] }> {
  const result = {
    success: false,
    templatePath: '',
    errors: [] as string[],
  };

  // Validate template name
  if (!/^[a-z0-9-]+$/.test(templateName)) {
    result.errors.push('Template name must contain only lowercase letters, numbers, and hyphens');
    return result;
  }

  // Ensure custom templates directory exists
  const customTemplatesDir = ensureCustomTemplatesDir();
  const templatePath = path.join(customTemplatesDir, templateName);

  // Check if template already exists
  if (fs.existsSync(templatePath)) {
    result.errors.push(`Template already exists: ${templateName}`);
    return result;
  }

  try {
    // Create template directory
    fs.mkdirSync(templatePath, { recursive: true });

    // If copying from existing template type
    if (options.templateType && options.templateType !== 'empty') {
      const sourceDir = getTemplateDirByName(options.templateType);
      if (sourceDir) {
        // Copy all files except template.yaml
        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(sourceDir, entry.name);
          const destPath = path.join(templatePath, entry.name);

          if (entry.isDirectory()) {
            fs.cpSync(srcPath, destPath, { recursive: true });
          } else if (entry.name !== 'template.yaml') {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
    }

    // Create template.yaml
    const config: TemplateConfig = {
      name: templateName,
      version: '1.0.0',
      description: options.description || `Custom template: ${templateName}`,
      author: os.userInfo().username,
      variables: [
        { name: 'project_name', description: 'Project name', required: true },
        { name: 'author', description: 'Author name', default: '' },
        { name: 'description', description: 'Project description', default: '' },
      ],
      files: [],
      gitignore: ['node_modules/', '*.log', '.DS_Store'],
    };

    const yamlContent = YAML.stringify(config, { indent: 2 });
    fs.writeFileSync(path.join(templatePath, 'template.yaml'), yamlContent);

    result.success = true;
    result.templatePath = templatePath;

    logger.info('Created custom template: %s', templateName);
    logger.info('Template path: %s', templatePath);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    // Clean up on error
    try {
      fs.rmSync(templatePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  return result;
}

/**
 * Delete a custom template
 */
export function deleteTemplate(templateName: string): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  const templateDir = path.join(getCustomTemplatesDir(), templateName);

  if (!fs.existsSync(templateDir)) {
    errors.push(`Template not found: ${templateName}`);
    return { success: false, errors };
  }

  try {
    fs.rmSync(templateDir, { recursive: true, force: true });
    logger.info('Deleted custom template: %s', templateName);
    return { success: true, errors: [] };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { success: false, errors };
  }
}

/**
 * Show template details
 */
export function showTemplateDetails(templateName: string): {
  success: boolean;
  config?: TemplateConfig;
  errors: string[];
} {
  const errors: string[] = [];

  const templateDir = getTemplateDirByName(templateName);
  if (!templateDir) {
    errors.push(`Template not found: ${templateName}`);
    return { success: false, errors };
  }

  const configPath = path.join(templateDir, 'template.yaml');
  if (!fs.existsSync(configPath)) {
    errors.push('template.yaml not found');
    return { success: false, errors };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = YAML.parse(content) as TemplateConfig;
    return { success: true, config, errors: [] };
  } catch (error) {
    errors.push(`Failed to parse template.yaml: ${error}`);
    return { success: false, errors };
  }
}

/**
 * Open custom templates directory
 */
export function openCustomTemplatesDir(): string {
  const dir = ensureCustomTemplatesDir();
  logger.info('Custom templates directory: %s', dir);
  return dir;
}
