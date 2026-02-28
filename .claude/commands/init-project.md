---
name: init-project
description: Initialize a new project from a fuzzy idea using BMAD Agent
---

# /init-project

Initialize a new project from a fuzzy idea. A BMAD Agent will interview you and generate a project template.

## ⚠️ Important: How to Run This Command

This is a **Claude Code slash command**, not a bash script. Run it directly in the chat:

```
/init-project "Your fuzzy project idea"
```

**DO NOT use Bash() tool** - just type the command above in your message.

## Usage

```
/init-project "Your fuzzy project idea"
```

## Workflow

**Phase 1: Interactive (This Command)**
- Agent asks 2-4 clarifying questions
- You provide answers
- Agent generates project template
- **This phase is interactive** — you talk to the agent

**Phase 2: Autonomous (/ralph-bmad-loop)**
- Loop runs without user interaction
- Agents make decisions autonomously
- **No more questions** — agents execute independently

## Example

```
User: /init-project "I want to build a task management app"

Agent: Let me help you define this project. A few questions:
1. What type of users? Personal, team, or enterprise?
2. Key features? Just tasks or also projects, labels, deadlines?
3. Tech preference? Any specific language or framework?

[User answers]

Agent: 📄 Project template created: ./task-app-project.yaml

Please review and edit as needed. When ready, start the autonomous loop:
   /ralph-bmad-loop --project ./task-app-project.yaml
```

## Examples

```bash
# Simple idea
/init-project "I want to build a task management app"

# More detailed description
/init-project "A SaaS platform for freelancers to track time and invoice clients"

# With constraints
/init-project "Build a weather API that aggregates data from multiple sources, should be serverless"
```

## How It Works

1. **Idea Collection** — Agent asks clarifying questions about your idea
2. **Requirements Elicitation** — Agent extracts goals, constraints, success criteria
3. **Template Generation** — Agent creates a project-template.yaml file
4. **User Review** — You review and edit the generated template
5. **Loop Start** — Once approved, start the Ralph BMAD Loop

## Generated Template Structure

The agent will generate a complete project template including:

- **Project Identity**: Name, description, type
- **Tech Stack Recommendations**: Based on project requirements
- **Goals**: Primary and secondary objectives
- **Success Criteria**: Measurable completion criteria
- **Requirements**: Functional and non-functional
- **Out of Scope**: Explicit boundaries
- **Loop Configuration**: Sensible defaults for rate limit handling

## Example Session

```
User: /init-project "A simple blog platform"

Agent: Let me help you define this project. A few questions:

1. What type of blog? Personal, multi-user, or SaaS platform?
2. What tech stack do you prefer? (e.g., Next.js, Django, etc.)
3. Key features: Comments? Tags? Search? Markdown editor?
4. Timeline and budget constraints?
5. What's the primary success metric?

[After questions answered...]

Agent: I've generated a project template based on your requirements:

📄 Created: ./blog-platform-project.yaml

Please review and edit as needed. When ready, start the loop:
   /ralph-bmad-loop --project ./blog-platform-project.yaml
```

## Tips

- Be as specific or vague as you want — the agent will ask clarifying questions
- You can always edit the generated template before starting the loop
- The agent will suggest reasonable defaults for tech stack and constraints
- Don't worry about perfect requirements — the loop will refine them
