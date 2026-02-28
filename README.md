# MaxClaw

Personal project assistant for managing Claude Code sessions across local projects.

## Features

- 🔍 **Auto-discover projects** - Scan directories to find Git repositories, Node.js projects, Python projects, etc.
- 🚀 **Launch Claude Code** - Start sessions in any project directory with context
- 📊 **Session tracking** - Track active and historical Claude Code sessions
- 📝 **Activity history** - Record all project interactions
- 💾 **Local storage** - SQLite database for all data, no cloud required
- 🧠 **Project memory** - Per-project CLAUDE.md files for context

## Installation

```bash
npm install
npm run build
npm link  # Makes `maxclaw` command available globally
```

## Usage

### List registered projects
```bash
maxclaw list
```

### Discover projects
```bash
maxclaw discover                    # Scan configured paths
maxclaw discover ~/code --depth 3   # Scan specific path
```

### Start Claude Code in a project
```bash
maxclaw start my-project
maxclaw start my-project --prompt "Fix the auth bug"
```

### View session status
```bash
maxclaw status
```

### View project history
```bash
maxclaw history my-project
```

### Add/remove projects
```bash
maxclaw add ~/projects/new-project --name "My Project"
maxclaw remove my-project
```

### Configuration
```bash
maxclaw config                     # View config
maxclaw config --add-path ~/code   # Add scan path
```

## Data Storage

All data is stored locally in `~/.maxclaw/`:
- `data.db` - SQLite database with projects, sessions, and activities
- `config.yaml` - User configuration
- `projects/<id>/CLAUDE.md` - Per-project memory files

## Architecture

Based on [NanoClaw](https://github.com/AnthropicLabs/NanoClaw), but focused on:
- Project discovery and management
- Claude Code session orchestration
- Local CLI experience

## Requirements

- Node.js 20+
- Claude Code CLI installed

## License

MIT
