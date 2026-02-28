---
name: ralph-bmad-loop
description: Start a 7×24 continuous development loop using BMAD Method agents
---

# /ralph-bmad-loop

Start a 7×24 continuous development loop using BMAD Method agents.

## ⚠️ Important: How to Run This Command

This is a **Claude Code slash command**, not a bash script. Run it directly in the chat:

```
/ralph-bmad-loop --project <project-file>
```

**DO NOT use Bash() tool** - just type the command above in your message.

## Usage

```
/ralph-bmad-loop --project <project-file> [--max-iterations <n>] [--mode <mode>]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--project <path>` | Path to project goal template (required) | - |
| `--max-iterations <n>` | Safety limit for iterations | 100 |
| `--mode <mode>` | Execution mode: `sequential` or `adaptive` | adaptive |
| `--agents <list>` | Comma-separated agent list (default: all) | all |

## Examples

```bash
# Start with project template
/ralph-bmad-loop --project ./projects/my-app.yaml

# Limit iterations and use specific agents
/ralph-bmad-loop --project ./projects/api-service.yaml --max-iterations 50 --agents "pm,architect,dev"

# Sequential mode (strict workflow order)
/ralph-bmad-loop --project ./projects/saas.yaml --mode sequential
```

## How It Works

1. **Load Project Template** - Read user-defined goals and constraints
2. **Agent Council Convenes** - Relevant BMAD agents analyze and plan
3. **Execute Workflow** - Run appropriate BMAD workflow for current phase
4. **Self-Assessment** - Agents evaluate progress against completion criteria
5. **Iterate** - Stop hook feeds progress back until completion or max-iterations

## Completion Criteria

Loop automatically terminates when:
- All project goals marked complete in `_bmad-output/{project-name}/status.yaml`
- `--max-iterations` reached
- User runs `/cancel-ralph-bmad`
