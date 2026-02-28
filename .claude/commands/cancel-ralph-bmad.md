---
name: cancel-ralph-bmad
description: Immediately terminate the active Ralph BMAD Loop
---

# /cancel-ralph-bmad

Immediately terminate the active Ralph BMAD Loop.

## ⚠️ Important: How to Run This Command

This is a **Claude Code slash command**, not a bash script. Run it directly in the chat:

```
/cancel-ralph-bmad
```

**DO NOT use Bash() tool** - just type the command above in your message.

## Usage

```
/cancel-ralph-bmad [--force]
```

## Options

| Option | Description |
|--------|-------------|
| `--force` | Force kill without saving state |

## Behavior

1. Sets termination flag in `.claude/.ralph-bmad-stop`
2. Saves current iteration state to `_bmad-output/{project-name}/checkpoint-{timestamp}.yaml`
3. Exits gracefully with summary report

## Resume After Cancel

To resume a cancelled loop:

```bash
/ralph-bmad-loop --project <original-project-file> --resume-from <checkpoint-file>
```
