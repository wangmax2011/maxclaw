# MaxClaw Skills Plugin System - Implementation Summary

## Overview
This document describes the implementation of the Skills Plugin System (E1) for MaxClaw, a personal project assistant CLI tool.

## Files Created/Modified

### New Files Created

#### 1. Type Definitions
- **`src/skills/types.ts`** - Core type definitions for the Skills system:
  - `SkillPermission` - Permission types (db:read, db:write, fs:read, fs:write, exec, network, all)
  - `SkillManifest` - Skill metadata (name, version, description, commands, hooks, permissions)
  - `SkillCommand`, `SkillCommandArg`, `SkillCommandOption` - Command definitions
  - `SkillHook` - Hook event definitions
  - `Skill` - Main skill interface with activate, deactivate, execute, handleHook methods
  - `SkillContext` - Context passed to skills (db, config, logger, permissions)
  - `SkillRecord` - Database record structure for skills
  - `SkillLoadResult` - Result type for skill loading operations
  - `SkillRegistryEvent` - Event types for the registry

#### 2. Skill Loader
- **`src/skills/skill-loader.ts`** - Handles loading and validation of skills:
  - `validateManifest()` - Zod-based manifest validation
  - `loadManifest()` - Load and parse skill.yaml files
  - `loadSkillModule()` - Dynamic ES Module import for external skills
  - `loadBuiltinSkills()` - Load built-in skills from TypeScript files
  - `scanSkillsDirectory()` - Scan directories for skills
  - `loadSkill()` - Load a single skill
  - `loadAllSkills()` - Load all skills (builtin + external)
  - `getSkillInfo()` - Get skill info without full loading
  - `ensureExternalSkillsDir()` / `getExternalSkillsDir()` - External skills directory management
  - `getBuiltinSkillsDir()` - Built-in skills directory path

#### 3. Skill Registry
- **`src/skills/skill-registry.ts`** - Central skill management:
  - `SkillRegistry` class extending EventEmitter
  - `register()` - Register and activate a skill
  - `unregister()` - Unregister and deactivate a skill
  - `enable()` / `disable()` - Enable/disable skills
  - `get()` / `getRecord()` - Get skill or record by name
  - `getAll()` / `getAllRecords()` - Get all skills/records
  - `getEnabled()` - Get only enabled skills
  - `has()` / `isEnabled()` - Check skill status
  - `getCommands()` - Get skill commands
  - `execute()` - Execute a skill command
  - `triggerHook()` - Trigger hook events
  - `getHelp()` - Generate help text
  - `initSkillRegistry()` / `getSkillRegistry()` - Singleton management

#### 4. Skill Database Operations
- **`src/skills/skill-db.ts`** - Database operations for skills:
  - `createSkillsSchema()` - Create skills table
  - `saveSkillRecord()` - Save/update skill record
  - `getSkillRecord()` - Get skill by name
  - `listSkillRecords()` - List all skills
  - `setSkillEnabled()` - Update enabled status
  - `updateSkillConfig()` - Update skill config
  - `deleteSkillRecord()` - Delete skill record
  - `skillExists()` - Check if skill exists

#### 5. Skills Index
- **`src/skills/index.ts`** - Main export file for the skills module

#### 6. Built-in Example Skills
- **`src/skills/builtin/hello-world.ts`** - Simple greeting skill demonstrating the API
- **`src/skills/builtin/project-stats.ts`** - Project statistics skill showing database access

#### 7. Tests
- **`src/skills/__tests__/skill-loader.test.ts`** - Tests for skill loader functionality
- **`src/skills/__tests__/skill-registry.test.ts`** - Tests for skill registry functionality

### Files Modified

#### 1. Database Schema (`src/db.ts`)
- Added import for `createSkillsSchema` from skill-db
- Added call to `createSkillsSchema(database)` in `createSchema()` function

#### 2. CLI (`src/index.ts`)
- Added skills-related imports
- Added skill registry initialization
- Added `initializeSkills()` function to load skills on startup
- Added skill commands:
  - `skill list` - List all skills
  - `skill enable <name>` - Enable a skill
  - `skill disable <name>` - Disable a skill
  - `skill run <name> <command>` - Run a skill command
  - `skill info <name>` - Show skill information
  - `skill install <path>` - Install external skill
  - `skill uninstall <name>` - Uninstall external skill
  - `skill create-template <name>` - Create new skill template

## Key Design Decisions

### 1. Permission System
Skills must declare permissions in their manifest:
- `db:read` - Read from database
- `db:write` - Write to database
- `fs:read` - Read from filesystem
- `fs:write` - Write to filesystem
- `exec` - Execute commands
- `network` - Network access
- `all` - All permissions

Permissions are enforced through the `SkillContext.hasPermission()` method.

### 2. Skill Loading Strategy
- **Built-in skills**: Loaded directly from TypeScript files in `src/skills/builtin/`
- **External skills**: Loaded from `~/.maxclaw/skills/` with YAML manifest and index.ts

### 3. Skill Lifecycle
1. **Load**: Manifest validation and module import
2. **Register**: Add to registry, create context, call `activate()`
3. **Execute**: Run commands through `execute()` method
4. **Disable**: Call `deactivate()`, remove from active skills
5. **Unregister**: Full cleanup

### 4. Event System
The SkillRegistry extends EventEmitter and emits:
- `skill:loaded` - When a skill is registered
- `skill:unloaded` - When a skill is unregistered
- `skill:enabled` - When a skill is enabled
- `skill:disabled` - When a skill is disabled
- `skill:error` - When a skill operation fails
- `command:executed` - When a command is executed
- `hook:triggered` - When a hook is triggered

### 5. Database Integration
Skills have access to the database through `SkillContext.db` with permission checks. The skills table stores:
- id, name, version, source (builtin/external)
- path, enabled status, config (JSON)
- loaded_at, error, created_at

## Testing

### Running Tests
```bash
npm test
```

### Test Coverage
- Manifest validation (valid/invalid cases)
- Skill loading (builtin and external)
- Registry operations (register, unregister, enable, disable)
- Command execution
- Hook triggering
- Event emission

## Usage Examples

### List Skills
```bash
maxclaw skill list
```

### Run a Skill Command
```bash
maxclaw skill run hello-world greet "MaxClaw"
maxclaw skill run hello-world greet --uppercase
maxclaw skill run project-stats show --detailed
```

### Create a New Skill
```bash
maxclaw skill create-template my-skill
```

### Install External Skill
```bash
maxclaw skill install /path/to/skill
maxclaw skill enable my-skill
```

## Backward Compatibility
All existing CLI commands remain unchanged. The skills system is additive and doesn't modify existing functionality.

## Future Enhancements
- Skill marketplace integration
- Hot-reloading of skills during development
- More granular permissions
- Skill dependencies and version constraints
- Skill configuration UI
