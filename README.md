# MaxClaw

Personal project assistant for managing Claude Code sessions across local projects.

> **🔒 100% Local-First**: All data stored locally. No cloud services, no remote integrations, no external dependencies.

## Features

### Core Features
- 🔍 **Auto-discover projects** - Scan directories to find Git repositories, Node.js projects, Python projects, etc.
- 🚀 **Launch Claude Code** - Start sessions in any project directory with context
- 📊 **Session tracking** - Track active and historical Claude Code sessions
- 📝 **Activity history** - Record all project interactions
- 💾 **Local storage** - SQLite database for all data, no cloud required
- 🧠 **Project memory** - Per-project CLAUDE.md files for context

### Enhanced Features

#### 🧩 Skills Plugin System
Dynamically extend MaxClaw with custom plugins:
```bash
maxclaw skill list                          # List all installed skills
maxclaw skill enable <name>                 # Enable a skill
maxclaw skill disable <name>                # Disable a skill
maxclaw skill run <name> <command>          # Execute a skill command
maxclaw skill create-template <name>        # Create a new skill template
```

Built-in skills include `hello-world` and `project-stats`. Place custom skills in `~/.maxclaw/skills/`.

#### 📝 Session Summary
Automatically generate AI-powered session summaries (optional, requires ANTHROPIC_API_KEY):
```bash
maxclaw session end --summary "Fixed auth bug"    # End with summary
maxclaw session list                              # View all sessions
maxclaw session logs <session-id>                 # View session logs
```

AI summary generation is **completely optional**. If no API key is provided, MaxClaw works fully with manual summaries.

#### ⏰ Scheduled Tasks
Schedule recurring tasks with cron expressions:
```bash
maxclaw schedule add "Daily Backup" "0 2 * * *" backup --project my-project
maxclaw schedule list
maxclaw schedule run <schedule-id>              # Run immediately
maxclaw schedule remove <schedule-id>
```

All tasks run locally on your machine.

#### 🔍 Cross-Project Code Search
Search across all registered projects:
```bash
maxclaw search "function authenticate"            # Search all projects
maxclaw search "auth" --projects project-a,project-b
maxclaw files "*.test.ts"                         # Find files by pattern
```

Uses ripgrep for fast searching with regex support. No code leaves your machine.

#### 📁 Project Templates
Quickly scaffold new projects:
```bash
maxclaw template list                             # List available templates
maxclaw template use nodejs-ts my-new-project     # Create from template
```

Built-in templates: `nodejs-ts`, `python`, `react-app`, `nextjs`. Add custom templates to `~/.maxclaw/templates/`.

#### 👥 Team Management
Organize work with teams and smart task assignment:
```bash
maxclaw team create my-team --project my-project
maxclaw team add-member my-team "Developer" --role developer
maxclaw team assign-task my-team "Fix bug"        # Auto-assign based on skills
maxclaw team suggest my-team --skills "frontend,react"
```

Smart assignment considers member expertise, current workload, and availability.

## Installation

```bash
npm install
npm run build
npm link  # Makes `maxclaw` command available globally
```

## Configuration

Create `~/.maxclaw/config.yaml`:

```yaml
# AI Summary (optional - only if you want AI-generated session summaries)
ai:
  summary_enabled: true
  summary_model: claude-3-sonnet-20241022

# Skills
skills:
  external_dir: ~/.maxclaw/skills/
```

## Environment Variables

```bash
# Optional: Only needed for AI-generated session summaries
ANTHROPIC_API_KEY=sk-ant-...

# Optional: For webhook notifications (outgoing only)
FEISHU_WEBHOOK_URL=https://...
WECHAT_WEBHOOK_URL=https://...
```

## Data Storage

**All data is stored locally** in `~/.maxclaw/`:
- `data.db` - SQLite database with projects, sessions, teams, schedules, skills
- `config.yaml` - User configuration
- `skills/` - External skill plugins
- `templates/` - Custom project templates
- `projects/<id>/CLAUDE.md` - Per-project memory files
- `logs/` - Session logs and summaries

**Nothing is sent to any cloud service** (except optional AI summaries if you configure ANTHROPIC_API_KEY).

## Architecture

Based on [NanoClaw](https://github.com/AnthropicLabs/NanoClaw), enhanced with:
- **Modular skill system** for extensibility
- **Agent protocol** for multi-agent workflows
- **Database-backed task scheduling** - all local
- **Webhook-based notifications** - outgoing only, your data stays local
- **Local-first storage** - SQLite, no external database needed

## Requirements

- Node.js 20+
- Claude Code CLI installed
- Optional: ripgrep (rg) for code search
- Optional: ANTHROPIC_API_KEY for AI session summaries

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

## Privacy & Security

- ✅ All project data stored locally in SQLite
- ✅ No telemetry or analytics
- ✅ No cloud service integrations
- ✅ No GitHub/Notion/Jira/etc. syncing
- ✅ Optional AI summaries only send session logs to Anthropic API (if configured)
- ✅ Skills run with permission-based access control
- ✅ Your code never leaves your machine

## License

MIT
