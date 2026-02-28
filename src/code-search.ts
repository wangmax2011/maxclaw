// Code Search Service - Cross-project code search functionality

import { exec } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'node:util';

import { logger } from './logger.js';
import { getAllProjects } from './project-manager.js';

const execAsync = promisify(exec);

// ===== Types =====

export interface SearchOptions {
  projects?: string[]; // Project IDs or names to search (undefined = all projects)
  type?: string; // File type filter (e.g., 'ts', 'js', 'py')
  extensions?: string[]; // Specific extensions to search (e.g., ['.ts', '.tsx'])
  limit?: number; // Max results per project
  offset?: number; // Pagination offset
  caseSensitive?: boolean;
  regex?: boolean;
  includeHidden?: boolean; // Include hidden files/directories
  contextLines?: number; // Lines of context around matches
  maxResultsPerProject?: number;
}

export interface SearchResult {
  project: {
    id: string;
    name: string;
    path: string;
  };
  file: string; // Relative path within project
  line: number; // Line number (1-based)
  column: number; // Column number (1-based)
  content: string; // Matching line content
  context?: {
    before: string[];
    after: string[];
  };
  matchStart?: number; // Start position of match in line
  matchEnd?: number; // End position of match in line
}

export interface FileSearchResult {
  project: {
    id: string;
    name: string;
    path: string;
  };
  file: string; // Relative path within project
  size?: number;
  lastModified?: Date;
}

export interface SymbolSearchResult extends SearchResult {
  symbolType: 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'constant';
  symbolName: string;
}

export interface SearchResultsGrouped {
  total: number;
  byProject: Map<string, {
    project: { id: string; name: string; path: string };
    results: SearchResult[];
    hasMore: boolean;
  }>;
  searchTime: number; // ms
}

// Default ignore patterns
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.next',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.idea',
  '.vscode',
  '*.min.js',
  '*.bundle.js',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

// Extension mappings
const EXTENSION_MAP: Record<string, string[]> = {
  ts: ['.ts', '.tsx'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  py: ['.py', '.pyw'],
  rb: ['.rb', '.erb'],
  go: ['.go'],
  rs: ['.rs'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
  cs: ['.cs'],
  php: ['.php'],
  swift: ['.swift'],
  kt: ['.kt', '.kts'],
  scala: ['.scala'],
  clj: ['.clj', '.cljs', '.cljc'],
  ex: ['.ex', '.exs'],
  elixir: ['.ex', '.exs'],
  haskell: ['.hs', '.lhs'],
  ml: ['.ml', '.mli'],
  r: ['.r', '.R'],
  julia: ['.jl'],
  lua: ['.lua'],
  sh: ['.sh', '.bash', '.zsh'],
  ps1: ['.ps1'],
  sql: ['.sql'],
  html: ['.html', '.htm'],
  css: ['.css', '.scss', '.sass', '.less', '.styl'],
  json: ['.json', '.json5'],
  xml: ['.xml', '.xsl', '.xsd'],
  yaml: ['.yaml', '.yml'],
  toml: ['.toml'],
  md: ['.md', '.markdown'],
  rst: ['.rst'],
  dockerfile: ['Dockerfile', 'Dockerfile.*'],
  makefile: ['Makefile', 'makefile', 'GNUmakefile'],
};

// Symbol patterns for different languages
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
    /(?:const|let|var)\s+(\w+)\s*=/g,
  ],
  javascript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:const|let|var)\s+(\w+)\s*=/g,
    /(?:export\s+)?(?:default\s+)?\{[^}]*\}/g,
  ],
  python: [
    /(?:async\s+)?def\s+(\w+)/g,
    /class\s+(\w+)/g,
  ],
  java: [
    /(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:\w+\s+)+(\w+)\s*\(/g,
    /(?:public|private|protected)?\s*class\s+(\w+)/g,
    /interface\s+(\w+)/g,
  ],
  go: [
    /func\s+(?:\([^)]+\)\s+)?(\w+)/g,
    /type\s+(\w+)/g,
  ],
  rust: [
    /(?:pub\s+)?fn\s+(\w+)/g,
    /(?:pub\s+)?struct\s+(\w+)/g,
    /(?:pub\s+)?enum\s+(\w+)/g,
    /(?:pub\s+)?trait\s+(\w+)/g,
  ],
};

// Cache for search results
interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
  query: string;
  options: SearchOptions;
}

const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ===== Helper Functions =====

/**
 * Check if ripgrep (rg) is available
 */
async function hasRipgrep(): Promise<boolean> {
  try {
    await execAsync('rg --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file extensions for a type filter
 */
function getExtensionsForType(type: string): string[] {
  const lowerType = type.toLowerCase();
  return EXTENSION_MAP[lowerType] || [`.${type}`];
}

/**
 * Build ripgrep arguments from options
 */
function buildRipgrepArgs(query: string, options: SearchOptions, searchPath: string): string[] {
  const args: string[] = [];

  // Search pattern - use --regexp for regex patterns
  if (options.regex) {
    args.push('--regexp');
  }

  // Case sensitivity
  if (options.caseSensitive) {
    args.push('--case-sensitive');
  } else {
    args.push('--ignore-case');
  }

  // Context lines
  if (options.contextLines && options.contextLines > 0) {
    args.push('--context', options.contextLines.toString());
  }

  // Line numbers (always include for parsing)
  args.push('--line-number');

  // Column numbers
  args.push('--column');

  // File type filter
  if (options.type) {
    const extensions = getExtensionsForType(options.type);
    for (const ext of extensions) {
      if (ext.startsWith('.')) {
        args.push('--glob', `*${ext}`);
      } else {
        args.push('--glob', ext);
      }
    }
  }

  if (options.extensions) {
    for (const ext of options.extensions) {
      args.push('--glob', `*${ext}`);
    }
  }

  // Ignore patterns
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    args.push('--glob', `!${pattern}`);
  }

  if (!options.includeHidden) {
    args.push('--hidden');
  }

  // Limit results
  const limit = options.limit || options.maxResultsPerProject || 50;
  args.push('--max-count', limit.toString());

  // Output format
  args.push('--json');

  // Search pattern and path
  args.push(query);
  args.push(searchPath);

  return args;
}

/**
 * Parse ripgrep JSON output
 */
function parseRipgrepOutput(output: string, projectPath: string): SearchResult[] {
  const results: SearchResult[] = [];

  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const json = JSON.parse(line);

      if (json.type === 'match') {
        const result: SearchResult = {
          project: {
            id: '', // Will be filled by caller
            name: '', // Will be filled by caller
            path: projectPath,
          },
          file: path.relative(projectPath, json.data.path.text),
          line: json.data.line_number,
          column: json.data.submatches[0]?.start || 1,
          content: json.data.lines.text?.trim() || '',
          matchStart: json.data.submatches[0]?.start,
          matchEnd: json.data.submatches[0]?.end,
        };

        // Handle context if available
        if (json.data.context_lines) {
          result.context = {
            before: [],
            after: [],
          };
        }

        results.push(result);
      }
    } catch {
      // Skip malformed JSON lines
      continue;
    }
  }

  return results;
}

/**
 * Fallback search using Node.js fs module
 */
async function searchWithFs(
  query: string,
  options: SearchOptions,
  searchPath: string
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const limit = options.limit || options.maxResultsPerProject || 50;

  // Build regex pattern
  let pattern: RegExp;
  try {
    if (options.regex) {
      pattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    } else {
      // Escape special regex characters for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(escaped, options.caseSensitive ? 'g' : 'gi');
    }
  } catch (error) {
    logger.error('Invalid regex pattern: %s', error);
    throw new Error(`Invalid search pattern: ${query}`);
  }

  // Get file extensions to search
  const extensions = options.extensions ||
    (options.type ? getExtensionsForType(options.type) : null);

  // Recursively search directory
  await searchDirectory(searchPath, searchPath, pattern, extensions, results, limit);

  return results.slice(0, limit);
}

/**
 * Recursively search a directory using fs
 */
async function searchDirectory(
  rootPath: string,
  currentPath: string,
  pattern: RegExp,
  extensions: string[] | null,
  results: SearchResult[],
  limit: number
): Promise<void> {
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip ignored directories
    if (DEFAULT_IGNORE_PATTERNS.some(p => entry.name === p || entry.name.endsWith(p))) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip hidden directories if not including hidden
      if (entry.name.startsWith('.') && entry.name !== '.git') {
        continue;
      }
      await searchDirectory(rootPath, path.join(currentPath, entry.name), pattern, extensions, results, limit);
    } else if (entry.isFile()) {
      // Check extension filter
      if (extensions && !extensions.some(ext => entry.name.endsWith(ext))) {
        continue;
      }

      const filePath = path.join(currentPath, entry.name);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length && results.length < limit; i++) {
          const line = lines[i];
          const match = pattern.exec(line);

          if (match) {
            results.push({
              project: {
                id: '',
                name: '',
                path: rootPath,
              },
              file: path.relative(rootPath, filePath),
              line: i + 1,
              column: match.index + 1,
              content: line.trim(),
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            });
            pattern.lastIndex = 0; // Reset for next search
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
}

/**
 * Get cache key for search
 */
function getCacheKey(query: string, options: SearchOptions): string {
  return JSON.stringify({ query, options });
}

/**
 * Get cached results if available
 */
function getCachedResults(cacheKey: string): SearchResult[] | null {
  const entry = SEARCH_CACHE.get(cacheKey);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    SEARCH_CACHE.delete(cacheKey);
    return null;
  }

  return entry.results;
}

/**
 * Cache search results
 */
function cacheResults(cacheKey: string, query: string, options: SearchOptions, results: SearchResult[]): void {
  SEARCH_CACHE.set(cacheKey, {
    results,
    timestamp: Date.now(),
    query,
    options,
  });
}

// ===== Main Search Functions =====

/**
 * Search code content across projects
 */
export async function searchCode(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResultsGrouped> {
  const startTime = Date.now();

  // Check cache first
  const cacheKey = getCacheKey(query, options);
  const cached = getCachedResults(cacheKey);
  if (cached) {
    // Return cached results with proper grouping
    const grouped: SearchResultsGrouped = {
      total: cached.length,
      byProject: new Map(),
      searchTime: 0,
    };

    for (const result of cached) {
      const projectId = result.project.id;
      if (!grouped.byProject.has(projectId)) {
        grouped.byProject.set(projectId, {
          project: result.project,
          results: [],
          hasMore: false,
        });
      }
      grouped.byProject.get(projectId)!.results.push(result);
    }

    return grouped;
  }

  // Get projects to search
  const allProjects = getAllProjects();
  const projectsToSearch = options.projects
    ? allProjects.filter(p =>
        options.projects!.includes(p.id) || options.projects!.includes(p.name)
      )
    : allProjects;

  if (projectsToSearch.length === 0) {
    return {
      total: 0,
      byProject: new Map(),
      searchTime: 0,
    };
  }

  const allResults: SearchResult[] = [];
  const checkRipgrep = hasRipgrep();
  const useRipgrep = await checkRipgrep;

  // Search each project in parallel with concurrency limit
  const concurrencyLimit = 5;
  const projectResults = await searchWithConcurrency(
    projectsToSearch,
    async (project) => {
      const projectResult = await searchInProject(
        project,
        query,
        options,
        useRipgrep
      );

      // Update project info in results
      for (const result of projectResult) {
        result.project.id = project.id;
        result.project.name = project.name;
      }

      return projectResult;
    },
    concurrencyLimit
  );

  // Combine results
  for (const results of projectResults) {
    allResults.push(...results);
  }

  // Cache results
  cacheResults(cacheKey, query, options, allResults);

  // Group by project
  const grouped: SearchResultsGrouped = {
    total: allResults.length,
    byProject: new Map(),
    searchTime: Date.now() - startTime,
  };

  for (const result of allResults) {
    const projectId = result.project.id;
    if (!grouped.byProject.has(projectId)) {
      const project = projectsToSearch.find(p => p.id === projectId);
      grouped.byProject.set(projectId, {
        project: {
          id: project!.id,
          name: project!.name,
          path: project!.path,
        },
        results: [],
        hasMore: false,
      });
    }
    grouped.byProject.get(projectId)!.results.push(result);
  }

  // Check for pagination
  const limit = options.limit || options.maxResultsPerProject || 50;
  for (const [projectId, projectData] of grouped.byProject) {
    if (projectData.results.length >= limit) {
      projectData.hasMore = true;
    }
  }

  return grouped;
}

/**
 * Search for files by pattern across projects
 */
export async function searchFiles(
  pattern: string,
  options: SearchOptions = {}
): Promise<FileSearchResult[]> {
  const allProjects = getAllProjects();
  const projectsToSearch = options.projects
    ? allProjects.filter(p =>
        options.projects!.includes(p.id) || options.projects!.includes(p.name)
      )
    : allProjects;

  const allResults: FileSearchResult[] = [];

  // Check if ripgrep is available
  const useRipgrep = await hasRipgrep();

  for (const project of projectsToSearch) {
    try {
      if (useRipgrep) {
        // Use ripgrep for file search
        const rgArgs = [
          '--files',
          '--glob', pattern,
          ...DEFAULT_IGNORE_PATTERNS.map(p => `--glob=!${p}`),
          project.path,
        ];

        const { stdout } = await execAsync(`rg ${rgArgs.map(a => `"${a}"`).join(' ')}`);
        const files = stdout.split('\n').filter(f => f.trim());

        for (const file of files) {
          const stat = await fs.promises.stat(file).catch(() => null);
          allResults.push({
            project: {
              id: project.id,
              name: project.name,
              path: project.path,
            },
            file: path.relative(project.path, file),
            size: stat?.size,
            lastModified: stat?.mtime,
          });
        }
      } else {
        // Fallback: use fs to search
        const files = await findFilesWithPattern(
          project.path,
          pattern,
          options
        );

        for (const file of files) {
          allResults.push({
            project: {
              id: project.id,
              name: project.name,
              path: project.path,
            },
            file: path.relative(project.path, file),
          });
        }
      }
    } catch (error) {
      logger.error('File search failed for project %s: %s', project.name, error);
    }
  }

  return allResults;
}

/**
 * Search for symbol definitions across projects
 */
export async function searchSymbols(
  symbol: string,
  options: SearchOptions = {}
): Promise<SymbolSearchResult[]> {
  // Escape symbol for regex
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build regex patterns for symbol search
  const patterns = [
    // Function declarations
    `(?:async\\s+)?(?:function|func|def|fn)\\s+${escapedSymbol}\\s*\\(`,
    // Class declarations
    `(?:class|type|interface|enum|struct)\\s+${escapedSymbol}`,
    // Method definitions
    `(?:async\\s+)?${escapedSymbol}\\s*\\([^)]*\\)\\s*(?::\\s*\\w+)?\\s*(?:\\{|=>|{)`,
    // Variable/constant declarations
    `(?:const|let|var|static|final)\\s+${escapedSymbol}\\s*=`,
  ];

  const regexPattern = patterns.join('|');

  const results = await searchCode(regexPattern, {
    ...options,
    regex: true,
  });

  // Convert to symbol results
  const symbolResults: SymbolSearchResult[] = [];

  for (const [_, projectData] of results.byProject) {
    for (const result of projectData.results) {
      const symbolInfo = identifySymbolType(result.content, symbol);
      if (symbolInfo) {
        symbolResults.push({
          ...result,
          symbolType: symbolInfo.type,
          symbolName: symbolInfo.name,
        });
      }
    }
  }

  return symbolResults;
}

/**
 * Identify the type of a symbol from its definition line
 */
function identifySymbolType(
  content: string,
  symbolName: string
): { type: SymbolSearchResult['symbolType']; name: string } | null {
  const patterns: Array<{
    regex: RegExp;
    type: SymbolSearchResult['symbolType'];
  }> = [
    { regex: /(?:async\s+)?function\s+(\w+)/i, type: 'function' },
    { regex: /(?:async\s+)?func\s+(\w+)/i, type: 'function' },
    { regex: /(?:async\s+)?def\s+(\w+)/i, type: 'function' },
    { regex: /(?:async\s+)?fn\s+(\w+)/i, type: 'function' },
    { regex: /class\s+(\w+)/i, type: 'class' },
    { regex: /interface\s+(\w+)/i, type: 'interface' },
    { regex: /type\s+(\w+)/i, type: 'type' },
    { regex: /enum\s+(\w+)/i, type: 'type' },
    { regex: /struct\s+(\w+)/i, type: 'class' },
    { regex: /(?:const|let|var)\s+(\w+)\s*=/i, type: 'variable' },
    { regex: /static\s+(?:final\s+)?(?:\w+\s+)+(\w+)/i, type: 'constant' },
    { regex: /const\s+(\w+)\s*=/i, type: 'constant' },
  ];

  for (const { regex, type } of patterns) {
    const match = regex.exec(content);
    if (match && match[1] === symbolName) {
      return { type, name: symbolName };
    }
  }

  // Default to variable if symbol is found but type is unclear
  if (content.includes(symbolName)) {
    return { type: 'variable', name: symbolName };
  }

  return null;
}

/**
 * Search in a single project
 */
async function searchInProject(
  project: { id: string; name: string; path: string },
  query: string,
  options: SearchOptions,
  useRipgrep: boolean
): Promise<SearchResult[]> {
  try {
    if (useRipgrep) {
      return await searchWithRipgrep(project.path, query, options);
    } else {
      return await searchWithFs(query, options, project.path);
    }
  } catch (error) {
    logger.error('Search failed in project %s: %s', project.name, error);
    return [];
  }
}

/**
 * Search using ripgrep
 */
async function searchWithRipgrep(
  searchPath: string,
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const args = buildRipgrepArgs(query, options, searchPath);

  try {
    const { stdout } = await execAsync(`rg ${args.map(a => `"${a}"`).join(' ')}`);
    return parseRipgrepOutput(stdout, searchPath);
  } catch (error: unknown) {
    // ripgrep returns exit code 1 when no matches found, which is not an error
    const err = error as { stdout?: string; stderr?: string; code?: number };
    if (err.stdout) {
      return parseRipgrepOutput(err.stdout, searchPath);
    }
    if (err.code === 1) {
      // No matches found
      return [];
    }
    throw error;
  }
}

/**
 * Find files matching pattern using fs
 */
async function findFilesWithPattern(
  rootPath: string,
  pattern: string,
  options: SearchOptions
): Promise<string[]> {
  const files: string[] = [];

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(regexPattern);

  await findFilesRecursive(rootPath, rootPath, regex, files, options);

  return files;
}

/**
 * Recursively find files
 */
async function findFilesRecursive(
  rootPath: string,
  currentPath: string,
  pattern: RegExp,
  files: string[],
  options: SearchOptions
): Promise<void> {
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip ignored directories
    if (DEFAULT_IGNORE_PATTERNS.some(p => entry.name === p)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      await findFilesRecursive(rootPath, path.join(currentPath, entry.name), pattern, files, options);
    } else if (entry.isFile()) {
      if (pattern.test(entry.name)) {
        files.push(path.join(currentPath, entry.name));
      }
    }
  }
}

/**
 * Search with concurrency limit
 */
async function searchWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      const result = await fn(item);
      results[currentIndex] = result;
    }
  }

  const workers = Array(Math.min(limit, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  return results;
}

/**
 * Clear search cache
 */
export function clearSearchCache(): void {
  SEARCH_CACHE.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: number } {
  const now = Date.now();
  let validEntries = 0;

  for (const [key, entry] of SEARCH_CACHE.entries()) {
    if (now - entry.timestamp <= CACHE_TTL) {
      validEntries++;
    } else {
      SEARCH_CACHE.delete(key);
    }
  }

  return {
    size: SEARCH_CACHE.size,
    entries: validEntries,
  };
}

/**
 * Format search results for display
 */
export function formatSearchResults(
  results: SearchResultsGrouped,
  options: { highlight?: boolean; showContext?: boolean } = {}
): string {
  const lines: string[] = [];

  if (results.total === 0) {
    return 'No matches found.';
  }

  lines.push(`\nFound ${results.total} match(es) in ${results.byProject.size} project(s) (${results.searchTime}ms):\n`);

  for (const [projectId, projectData] of results.byProject) {
    lines.push(`\n${'='.repeat(60)}`);
    lines.push(`📁 ${projectData.project.name}`);
    lines.push(`   Path: ${projectData.project.path}`);
    lines.push(`   Matches: ${projectData.results.length}${projectData.hasMore ? '+' : ''}`);
    lines.push(`${'='.repeat(60)}\n`);

    for (const result of projectData.results) {
      const lineNum = String(result.line).padStart(4, ' ');
      const file = result.file;

      let content = result.content;
      if (options.highlight) {
        // Simple highlight - wrap content that looks like a match
        content = content.replace(/(\S+)/, '<$1>');
      }

      lines.push(`  ${file}:${lineNum}:${content}`);

      if (options.showContext && result.context) {
        for (const before of result.context.before || []) {
          lines.push(`    ${before}`);
        }
        for (const after of result.context.after || []) {
          lines.push(`    ${after}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Get language detection based on file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const basename = path.basename(filePath).toLowerCase();

  // Map extension keys to friendly language names
  const languageNames: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    pyw: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    clj: 'clojure',
    ex: 'elixir',
    haskell: 'haskell',
    ml: 'ocaml',
    r: 'r',
    julia: 'julia',
    lua: 'lua',
    sh: 'shell',
    ps1: 'powershell',
    sql: 'sql',
    html: 'html',
    css: 'css',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    rst: 'rst',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };

  // Check by extension
  for (const [lang, extensions] of Object.entries(EXTENSION_MAP)) {
    if (extensions.some(e => `.${ext}` === e || ext === e)) {
      return languageNames[lang] || lang;
    }
  }

  // Check by filename
  for (const [lang, names] of Object.entries(EXTENSION_MAP)) {
    if (names.some(n => basename === n.toLowerCase() || basename.startsWith(n.toLowerCase() + '.'))) {
      return languageNames[lang] || lang;
    }
  }

  return 'unknown';
}
