// MaxClaw Template Engine - Project Scaffolding System

import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { execSync } from 'child_process';

import { logger } from './logger.js';
import { registerProject } from './project-manager.js';

export interface TemplateVariable {
  name: string;
  description?: string;
  default?: string;
  required?: boolean;
}

export interface TemplateCondition {
  variable: string;
  equals?: string | boolean;
  exists?: boolean;
}

export interface TemplateFile {
  path: string;
  content?: string;
  condition?: TemplateCondition;
  skipVariableSubstitution?: boolean;
}

export interface TemplateConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  variables: TemplateVariable[];
  files: TemplateFile[];
  dependencies?: {
    npm?: string[];
    pip?: string[];
  };
  gitignore?: string[];
  postInstall?: string[];
}

export interface TemplateOptions {
  projectName: string;
  projectPath: string;
  author?: string;
  description?: string;
  variables?: Record<string, string>;
  installDeps?: boolean;
  initGit?: boolean;
  registerToMaxClaw?: boolean;
}

export interface TemplateResult {
  success: boolean;
  projectPath: string;
  filesCreated: string[];
  errors: string[];
  warnings: string[];
}

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Get the templates directory
 */
export function getTemplatesDir(): string {
  const __filename = path.dirname(new URL(import.meta.url).pathname);
  const __dirname = path.resolve(__filename);

  // When running from dist/, __dirname will be dist/
  // Templates should be in dist/templates
  const distTemplates = path.join(__dirname, 'templates');
  if (fs.existsSync(distTemplates)) {
    return distTemplates;
  }

  // When running from src/, look for src/templates
  const srcTemplates = path.join(__dirname, '..', 'src', 'templates');
  if (fs.existsSync(srcTemplates)) {
    return srcTemplates;
  }

  // Fallback to dist/templates
  return distTemplates;
}

/**
 * Get custom templates directory in user's home
 */
export function getCustomTemplatesDir(): string {
  return path.join(os.homedir(), '.maxclaw', 'templates');
}

/**
 * Ensure custom templates directory exists
 */
export function ensureCustomTemplatesDir(): string {
  const dir = getCustomTemplatesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Replace variables in content using {{variable}} syntax
 */
export function substituteVariables(content: string, variables: Record<string, string>): string {
  return content.replace(VARIABLE_PATTERN, (match, varName) => {
    const value = variables[varName];
    if (value === undefined) {
      logger.warn(`Variable "${varName}" not provided, keeping placeholder`);
      return match;
    }
    return value;
  });
}

/**
 * Check if a file condition is met
 */
export function checkCondition(condition: TemplateCondition | undefined, variables: Record<string, string>): boolean {
  if (!condition) return true;

  const value = variables[condition.variable];

  if (condition.exists !== undefined) {
    return condition.exists ? value !== undefined : value === undefined;
  }

  if (condition.equals !== undefined) {
    return value === String(condition.equals);
  }

  return true;
}

/**
 * Load template configuration from template.yaml
 */
export function loadTemplateConfig(templateDir: string): TemplateConfig | null {
  const configPath = path.join(templateDir, 'template.yaml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = YAML.parse(content) as TemplateConfig;
    return parsed;
  } catch (error) {
    logger.error('Failed to load template config: %s', error);
    return null;
  }
}

/**
 * Copy a single file with variable substitution
 */
export function copyFileWithSubstitution(
  srcPath: string,
  destPath: string,
  variables: Record<string, string>,
  skipSubstitution: boolean = false
): void {
  const ext = path.extname(srcPath);
  const shouldSubstitute = !skipSubstitution &&
    !['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext);

  let content: string | Buffer;

  if (shouldSubstitute) {
    const textContent = fs.readFileSync(srcPath, 'utf-8');
    content = substituteVariables(textContent, variables);
  } else {
    content = fs.readFileSync(srcPath);
  }

  // Ensure destination directory exists
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  // Handle filename variable substitution
  const destPathWithVars = substituteVariables(destPath, variables);

  fs.writeFileSync(destPathWithVars, content);
}

/**
 * Create a .gitignore file
 */
export function createGitignore(projectPath: string, entries: string[]): void {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const content = entries.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, content);
}

/**
 * Install npm dependencies
 */
export function installNpmDependencies(projectPath: string, packages: string[]): void {
  if (packages.length === 0) return;

  logger.info('Installing npm dependencies: %s', packages.join(', '));

  try {
    execSync(`npm install ${packages.join(' ')}`, {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } catch (error) {
    logger.error('Failed to install npm dependencies: %s', error);
    throw error;
  }
}

/**
 * Install pip dependencies
 */
export function installPipDependencies(projectPath: string, packages: string[]): void {
  if (packages.length === 0) return;

  logger.info('Installing pip dependencies: %s', packages.join(', '));

  try {
    execSync(`pip install ${packages.join(' ')}`, {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } catch (error) {
    logger.error('Failed to install pip dependencies: %s', error);
    throw error;
  }
}

/**
 * Initialize git repository
 */
export function initGitRepository(projectPath: string): void {
  logger.info('Initializing git repository in %s', projectPath);

  try {
    execSync('git init', {
      cwd: projectPath,
      stdio: 'pipe',
    });
  } catch (error) {
    logger.warn('Failed to initialize git repository: %s', error);
  }
}

/**
 * Run post-install scripts
 */
export function runPostInstallScripts(projectPath: string, scripts: string[]): void {
  for (const script of scripts) {
    logger.info('Running post-install script: %s', script);

    try {
      execSync(script, {
        cwd: projectPath,
        stdio: 'inherit',
      });
    } catch (error) {
      logger.warn('Post-install script failed: %s', script);
    }
  }
}

/**
 * Process template files from directory
 */
export function processTemplateDirectory(
  templateDir: string,
  outputPath: string,
  variables: Record<string, string>,
  config: TemplateConfig
): { filesCreated: string[]; warnings: string[] } {
  const filesCreated: string[] = [];
  const warnings: string[] = [];

  // Walk through template directory
  const walkDirectory = (dir: string, relativeBase: string = ''): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip config file and hidden directories (except .github etc)
      if (entry.name === 'template.yaml') continue;
      if (entry.name.startsWith('.') && !entry.name.startsWith('.github')) continue;

      const srcPath = path.join(dir, entry.name);
      const relativePath = path.join(relativeBase, entry.name);
      // Apply variable substitution to destination path (for directory names like {{project_name}})
      const destRelativePath = substituteVariables(relativePath, variables);
      const destPath = path.join(outputPath, destRelativePath);

      // Check file condition (if config.files is defined)
      const fileConfig = config.files?.find(f => f.path === relativePath);
      if (fileConfig?.condition && !checkCondition(fileConfig.condition, variables)) {
        warnings.push(`Skipped file (condition not met): ${relativePath}`);
        continue;
      }

      if (entry.isDirectory()) {
        // Create directory with substituted name
        fs.mkdirSync(destPath, { recursive: true });
        walkDirectory(srcPath, destRelativePath);
      } else {
        // Ensure parent directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const skipSubstitution = fileConfig?.skipVariableSubstitution ?? false;
        copyFileWithSubstitution(srcPath, destPath, variables, skipSubstitution);
        filesCreated.push(destRelativePath);
      }
    }
  };

  walkDirectory(templateDir);

  return { filesCreated, warnings };
}

/**
 * Main template processing function
 */
export async function processTemplate(
  templateDir: string,
  options: TemplateOptions
): Promise<TemplateResult> {
  const result: TemplateResult = {
    success: false,
    projectPath: options.projectPath,
    filesCreated: [],
    errors: [],
    warnings: [],
  };

  // Load template config
  const config = loadTemplateConfig(templateDir);
  if (!config) {
    result.errors.push('Failed to load template.yaml');
    return result;
  }

  // Build variables map
  const variables: Record<string, string> = {
    project_name: options.projectName,
    project_name_kebab: options.projectName.toLowerCase().replace(/\s+/g, '-'),
    project_name_camel: options.projectName.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    ),
    project_name_pascal: options.projectName.replace(/(?:^\w|[A-Z]|\b\w)/g, word =>
      word.toUpperCase()
    ),
    author: options.author || os.userInfo().username,
    date: new Date().toISOString().split('T')[0],
    description: options.description || `A new project: ${options.projectName}`,
    ...options.variables,
  };

  try {
    // Create output directory
    fs.mkdirSync(options.projectPath, { recursive: true });

    // Process template files
    const processResult = processTemplateDirectory(templateDir, options.projectPath, variables, config);
    result.filesCreated.push(...processResult.filesCreated);
    result.warnings.push(...processResult.warnings);

    // Create .gitignore
    if (config.gitignore && config.gitignore.length > 0) {
      createGitignore(options.projectPath, config.gitignore);
      result.filesCreated.push('.gitignore');
    }

    // Initialize git repository
    if (options.initGit) {
      initGitRepository(options.projectPath);
    }

    // Install dependencies
    if (options.installDeps) {
      if (config.dependencies?.npm && config.dependencies.npm.length > 0) {
        try {
          installNpmDependencies(options.projectPath, config.dependencies.npm);
        } catch (error) {
          result.warnings.push('Some npm dependencies failed to install');
        }
      }

      if (config.dependencies?.pip && config.dependencies.pip.length > 0) {
        try {
          installPipDependencies(options.projectPath, config.dependencies.pip);
        } catch (error) {
          result.warnings.push('Some pip dependencies failed to install');
        }
      }
    }

    // Run post-install scripts
    if (config.postInstall && config.postInstall.length > 0) {
      runPostInstallScripts(options.projectPath, config.postInstall);
    }

    // Register to MaxClaw
    if (options.registerToMaxClaw) {
      try {
        const discoveryResult = {
          path: options.projectPath,
          name: options.projectName,
          indicators: [] as any[],
          techStack: config.dependencies?.npm ? ['nodejs', 'typescript'] : [],
        };
        registerProject(discoveryResult as any);
        logger.info('Project registered to MaxClaw');
      } catch (error) {
        result.warnings.push('Failed to register project to MaxClaw');
      }
    }

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * List available templates
 */
export function listAvailableTemplates(): Array<{ name: string; version: string; description: string; source: 'builtin' | 'custom' }> {
  const templates: Array<{ name: string; version: string; description: string; source: 'builtin' | 'custom' }> = [];

  // Check builtin templates
  const builtinDir = getTemplatesDir();
  if (fs.existsSync(builtinDir)) {
    const entries = fs.readdirSync(builtinDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const config = loadTemplateConfig(path.join(builtinDir, entry.name));
        if (config) {
          templates.push({
            name: entry.name,
            version: config.version,
            description: config.description,
            source: 'builtin',
          });
        }
      }
    }
  }

  // Check custom templates
  const customDir = getCustomTemplatesDir();
  if (fs.existsSync(customDir)) {
    const entries = fs.readdirSync(customDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const config = loadTemplateConfig(path.join(customDir, entry.name));
        if (config) {
          templates.push({
            name: entry.name,
            version: config.version,
            description: config.description,
            source: 'custom',
          });
        }
      }
    }
  }

  return templates;
}

/**
 * Get template directory by name
 */
export function getTemplateDirByName(templateName: string): string | null {
  // Check custom templates first (user templates have priority)
  const customDir = path.join(getCustomTemplatesDir(), templateName);
  if (fs.existsSync(customDir)) {
    return customDir;
  }

  // Check builtin templates
  const builtinDir = path.join(getTemplatesDir(), templateName);
  if (fs.existsSync(builtinDir)) {
    return builtinDir;
  }

  return null;
}
