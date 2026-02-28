# MaxClaw

Personal project assistant for managing Claude Code sessions across local projects.

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
Automatically generate AI-powered session summaries:
```bash
maxclaw session end --summary "Fixed auth bug"    # End with summary
maxclaw session list                              # View all sessions
maxclaw session logs <session-id>                 # View session logs
```

#### ⏰ Scheduled Tasks
Schedule recurring tasks with cron expressions:
```bash
maxclaw schedule add "Daily Backup" "0 2 * * *" backup --project my-project
maxclaw schedule list
maxclaw schedule run <schedule-id>              # Run immediately
maxclaw schedule remove <schedule-id>
```

#### 🔗 GitHub Integration
Sync with GitHub repositories:
```bash
maxclaw github sync my-project                    # Sync issues and PRs
maxclaw github issues my-project --status open    # List open issues
maxclaw github prs my-project                     # List pull requests
maxclaw github issue create my-project --title "Bug" --body "Details"
```

Configure with `GITHUB_TOKEN` environment variable.

#### 📋 Notion Integration
Sync project knowledge to Notion:
```bash
maxclaw notion sync my-project                    # Sync to Notion
```

Configure with `NOTION_TOKEN` and `NOTION_DATABASE_ID` environment variables.

#### 🔔 Notifications
Real-time notifications via Feishu/WeChat webhooks:
```bash
maxclaw notify test my-project                    # Test notification
maxclaw notify configure my-project --webhook <url>
```

Configure notification triggers for session events, task completion, and errors.

#### 🔍 Cross-Project Code Search
Search across all registered projects:
```bash
maxclaw search "function authenticate"            # Search all projects
maxclaw search "auth" --projects project-a,project-b
maxclaw files "*.test.ts"                         # Find files by pattern
```

Uses ripgrep for fast searching with regex support.

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
# API Keys (optional)
ai:
  summary_enabled: true
  summary_model: claude-3-sonnet-20241022

github:
  token: ghp_xxxxxxxxxxxx

notion:
  token: secret_xxxxxxxx
  database_id: xxxxxxxx

# Notifications
notification:
  webhook_url: https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx
  level: info  # error, warning, info, success

# Skills
skills:
  external_dir: ~/.maxclaw/skills/
```

## Environment Variables

```bash
# Required for AI summaries
ANTHROPIC_API_KEY=sk-ant-...

# Required for GitHub integration
GITHUB_TOKEN=ghp_...

# Required for Notion integration
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=...

# Required for notifications
FEISHU_WEBHOOK_URL=https://...
WECHAT_WEBHOOK_URL=https://...
```

## Data Storage

All data is stored locally in `~/.maxclaw/`:
- `data.db` - SQLite database with projects, sessions, teams, schedules, skills
- `config.yaml` - User configuration
- `skills/` - External skill plugins
- `templates/` - Custom project templates
- `projects/<id>/CLAUDE.md` - Per-project memory files
- `logs/` - Session logs and summaries

## Architecture

Based on [NanoClaw](https://github.com/AnthropicLabs/NanoClaw), enhanced with:
- Modular skill system for extensibility
- Agent protocol for multi-agent workflows
- Database-backed task scheduling
- External service integrations (GitHub, Notion)
- Webhook-based notifications
- Local-first storage with sync options

## Requirements

- Node.js 20+
- Claude Code CLI installed
- Optional: ripgrep (rg) for code search
- Optional: GitHub token for GitHub integration
- Optional: Notion integration token for Notion sync

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

## License

MIT
