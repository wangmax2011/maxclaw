# Quick Start Guide

Get started with Ralph BMAD Loop in 5 minutes.

## Prerequisites

| Dependency | Required? | How to Install |
|------------|-----------|----------------|
| **Claude Code** | ✅ Required | Follow [official installation](https://github.com/anthropics/claude-code) |
| **BMAD Method** | ✅ Required | `git clone https://github.com/bmad-code-org/BMAD-METHOD.git && cd bmad && ./install.sh /your/project` |
| **Ralph Wiggum Plugin** | ❌ Not Required | Already included in this package |

### ⚠️ Important Note About Dependencies

**You DO need:**
- ✅ **BMAD Method framework** - Provides the 10 specialized agents (PM, Architect, Dev, etc.) and 36 workflows

**You DON'T need:**
- ❌ **Ralph Wiggum Plugin** - This project includes its own enhanced stop-hook implementation with rate limit resilience

### Verify BMAD Installation

```bash
# Check if BMAD is installed
ls _bmad/

# Should see:
# _bmad/core/     (core agents and workflows)
# _bmad/bmm/      (business method module)
# _bmad/_config/  (agent and workflow manifests)
```

If BMAD is not installed, the loop will not be able to orchestrate agents.

## Installation

### Option 1: Using the Install Script

```bash
# Clone the repository
git clone https://github.com/yourusername/ralph-bmad-loop.git
cd ralph-bmad-loop

# Install to your project
./install.sh /path/to/your/project
```

### Option 2: Manual Installation

```bash
# Copy plugin files to your project
cp -r ralph-bmad-loop/.claude /path/to/your/project/

# Make scripts executable
chmod +x /path/to/your/project/.claude/scripts/*.sh
chmod +x /path/to/your/project/.claude/hooks/*.sh

# Copy templates
cp -r ralph-bmad-loop/templates /path/to/your/project/ralph-bmad-templates
```

## Your First Project

### 1. Create a Project Template

```bash
cd /path/to/your/project

# Copy the template
cp ralph-bmad-templates/project-template.yaml ./my-first-project.yaml

# Edit the template
# You only need to fill in:
# - project_name
# - description
# - goals.primary
# - success_criteria (at least one)
```

### 2. Minimal Example

```yaml
# my-first-project.yaml
project_name: "hello-api"
description: "A simple REST API with one endpoint"

tech_stack:
  preferred_language: Python
  preferred_framework: FastAPI

goals:
  primary: "Create a /hello endpoint that returns JSON"

success_criteria:
  - id: SC-001
    description: "API endpoint working"
    measurable: "curl http://localhost:8000/hello returns 200"

loop_config:
  max_iterations: 20
```

### 3. Start the Loop

**⚠️ Important:** This is a Claude Code slash command, not a bash script. Type it directly in the chat:

```
/ralph-bmad-loop --project ./my-first-project.yaml
```

**DO NOT use `Bash(/ralph-bmad-loop ...)`** — Claude Code will recognize the `/` prefix and execute it as a plugin command.

### 4. Monitor Progress

```bash
# In another terminal, watch the status
cat _bmad-output/hello-api/status.yaml

# Or watch logs
tail -f _bmad-output/hello-api/logs/iteration-*.md
```

### 5. Collect Results

When complete, your deliverables are in:

```
_bmAD-output/hello-api/
├── analysis/
│   └── product-brief.md
├── planning/
│   ├── prd.md
│   └── ux-design.md
├── solutioning/
│   ├── architecture.md
│   └── epics-and-stories.md
├── implementation/
│   └── code/           # Your actual code!
└── documentation/
```

## Common Commands

| Command | Type | Purpose |
|---------|------|---------|
| `/ralph-bmad-loop --project FILE` | Claude Slash Command | Start loop |
| `/cancel-ralph-bmad` | Claude Slash Command | Stop loop gracefully |
| `cat _bmad-output/PROJECT/status.yaml` | Bash | Check status |
| `cat _bmad-output/.rate-limit-history.log` | Bash | View rate limit events |

**Slash Commands** (`/command`): Run directly in chat, do NOT use Bash()
**Bash Commands**: Use the Bash tool or run in terminal

## Tips for Success

1. **Start Small**: Begin with a simple API or feature
2. **Set Iteration Limits**: 20-50 is good for testing
3. **Check Early**: Review first 2-3 iterations for direction
4. **Use Sequential Mode** for complex projects: `--mode sequential`
5. **Use Adaptive Mode** for iterative improvements: `--mode adaptive`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Loop won't start | Check YAML syntax with `yamllint` |
| Stuck in one phase | Check `_bmad-output/PROJECT/status.yaml` for blockers |
| Rate limit hit | Loop will auto-retry. Check `.rate-limit-history.log` |
| Want to pause | Use `/cancel-ralph-bmad` |

## Next Steps

- Read the [full README](../README.md) for complete documentation
- Check [EXAMPLES.md](EXAMPLES.md) for more project templates
- Learn about [rate limit handling](RATE_LIMITS.md) for 7×24 operation
