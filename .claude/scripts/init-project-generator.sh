#!/bin/bash
# Ralph BMAD Loop - Project Template Generator
# Generates a project template from a fuzzy user idea

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDEA="$1"
OUTPUT_FILE="${2:-project-draft.yaml}"

if [ -z "$IDEA" ]; then
    echo "❌ Error: Project idea is required"
    echo "Usage: /init-project \"Your project idea\""
    exit 1
fi

echo "🎯 Project Template Generator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Idea: $IDEA"
echo ""
echo "The BMAD Agent will now:"
echo "  1. Analyze your idea"
echo "  2. Ask clarifying questions"
echo "  3. Generate a project template"
echo "  4. Save to: $OUTPUT_FILE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Prompt for Claude to generate the template
cat << 'GENERATOR_PROMPT'
🎯 PROJECT TEMPLATE GENERATOR - BMAD AGENT MODE

You are the BMAD Master Agent specializing in project discovery and requirements elicitation.

USER IDEA: "{IDEA}"

YOUR TASK:

1. ANALYZE the user's idea
   - What type of project is this? (web-app, api-service, mobile-app, cli-tool, library)
   - What problem does it solve?
   - Who are the target users?

2. ASK CLARIFYING QUESTIONS (2-4 questions max)

   Ask about:
   - Specific features or functionality
   - Tech stack preferences (if any)
   - Constraints (timeline, budget, team size)
   - Success criteria (how do we know it's done?)

   Present questions as a numbered list. Wait for user response.

3. GENERATE PROJECT TEMPLATE

   After user answers, create a complete project template at: {OUTPUT_FILE}

   Include:
   - project_name: Suggest a concise, descriptive name
   - description: 2-3 sentences describing the project
   - project_type: Select from options
   - tech_stack: Recommend based on requirements
   - constraints: Timeline, budget, team_size (use reasonable defaults if not specified)
   - goals.primary: The main objective
   - goals.secondary: 2-4 secondary objectives
   - success_criteria: 2-4 measurable criteria with IDs (SC-001, SC-002, etc.)
   - requirements.functional: Key features
   - requirements.non_functional: Performance, security, etc.
   - out_of_scope: What's NOT included (important!)
   - loop_config: Sensible defaults with rate limit handling enabled
   - completion_promise: "RALPH_BMAD_COMPLETE"

4. PRESENT THE TEMPLATE

   Show the user:
   - Summary of what was generated
   - Key decisions made
   - File location: {OUTPUT_FILE}
   - Next step: How to start the loop

TEMPLATE FORMAT:
Use the standard project-template.yaml structure. Be specific and actionable.
Don't use placeholder text like "[fill in]" — generate actual content based on the idea.

EXAMPLE SUCCESS CRITERIA:
- SC-001: "User authentication working" → measurable: "Login and register endpoints tested with 100% success"
- SC-002: "Core feature implemented" → measurable: "Main workflow completes end-to-end without errors"

AFTER GENERATION:
Tell the user:
"📄 Project template created: {OUTPUT_FILE}

Please review and edit as needed. When ready, start the development loop:
   /ralph-bmad-loop --project {OUTPUT_FILE}"

GENERATOR_PROMPT
