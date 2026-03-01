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

#### 📊 Web Dashboard
Visual overview of all your projects and sessions:
```bash
maxclaw dashboard                                 # Start dashboard (default port 9876)
maxclaw dashboard --port 8080                     # Use custom port
maxclaw dashboard --stop                          # Stop dashboard
```

Features:
- **Real-time project status** - See which projects have active sessions
- **Session summaries** - View AI-generated session summaries and their status
- **Activity timeline** - Track recent actions across all projects
- **Admin Panel** - Manage all MaxClaw settings from web UI at `/admin`
  - Configure scan paths, AI settings, session pool limits
  - Add/remove projects
  - Enable/disable skills
  - Manage scheduled tasks
- **Auto-refresh** - Data updates every 30 seconds
- **Dark theme** - Easy on the eyes
- **Fully local** - No data leaves your machine

The dashboard automatically opens in your browser at `http://localhost:9876`.
Access the Admin Panel at `http://localhost:9876/admin`.

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

#### 📢 Enhanced Notifications
Configure webhook notifications for multiple platforms (Feishu, WeChat, Slack):
```bash
maxclaw notify configure my-project --webhook <url> --type feishu --level info
maxclaw notify test my-project                      # Send test notification
maxclaw notify send my-project -m "Deployment complete" --level info
maxclaw notify status my-project                    # View configuration
```

Supported notification types: `feishu`, `wechat`, `slack`, `custom`.
Notification levels: `info`, `warning`, `error`.

#### 🔀 Session Multi-plexing
Run multiple concurrent sessions with resource management:
```bash
maxclaw multiplex status                            # View pool and resource status
maxclaw multiplex config --max-sessions 10          # Configure limits
maxclaw multiplex queue list                        # View queued sessions
maxclaw multiplex queue cancel <item-id>            # Cancel queued request
```

Features:
- **Session Pool** - Limit concurrent sessions system-wide and per-project
- **Resource Monitoring** - CPU and memory usage tracking with auto-throttling
- **Session Queue** - Queue sessions when limits reached with priority scheduling

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

## Installation

### Quick Install (Recommended)

Clone and install with one command:

```bash
# Clone repository
git clone https://github.com/wangmax2011/maxclaw.git
cd maxclaw

# Run installation script
bash install.sh
```

The installation script will:
- Check Node.js version (requires 20+)
- Install dependencies
- Build the project
- Install `maxclaw` command globally

### Manual Installation

```bash
# Clone repository
git clone https://github.com/wangmax2011/maxclaw.git
cd maxclaw

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
```

### Verify Installation

```bash
maxclaw --version
maxclaw --help
```

### Troubleshooting

If `maxclaw` command is not found after installation, add npm global bin directory to your PATH:

```bash
# For bash/zsh (add to ~/.bashrc or ~/.zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests (requires dashboard running)
npm run test:e2e

# Build
npm run build

# Type check
npm run typecheck
```

## Testing

MaxClaw includes comprehensive test coverage:

### Unit Tests
Run unit tests with:
```bash
npm test
```

### E2E Tests
Playwright-based end-to-end tests for the Web Dashboard:
```bash
npm run test:e2e
```

E2E tests verify:
- Dashboard page loads and displays stats correctly
- Admin panel navigation and settings management
- Project add/delete operations
- Skills toggle functionality
- API data integrity

Test reports are generated in `playwright-report/` directory.

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
