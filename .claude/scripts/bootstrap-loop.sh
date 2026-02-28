#!/bin/bash
# Ralph BMAD Loop - Bootstrap Script
# Initializes the loop environment and starts first iteration

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_FILE=""
MAX_ITERATIONS=100
MODE="adaptive"
AGENTS="all"
RESUME_FROM=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_FILE="$2"
            shift 2
            ;;
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --agents)
            AGENTS="$2"
            shift 2
            ;;
        --resume-from)
            RESUME_FROM="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate project file
if [ -z "$PROJECT_FILE" ]; then
    echo "❌ Error: --project is required"
    echo "Usage: /ralph-bmad-loop --project ./path/to/project.yaml"
    exit 1
fi

if [ ! -f "$PROJECT_FILE" ]; then
    echo "❌ Error: Project file not found: $PROJECT_FILE"
    exit 1
fi

# Extract project name from template
PROJECT_NAME=$(grep "^project_name:" "$PROJECT_FILE" | cut -d':' -f2 | tr -d ' "')
if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME="unnamed-project"
fi

echo "🚀 Ralph BMAD Loop - Bootstrap"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Project: $PROJECT_NAME"
echo "📄 Template: $PROJECT_FILE"
echo "🔢 Max Iterations: $MAX_ITERATIONS"
echo "🎯 Mode: $MODE"
echo "🤖 Agents: $AGENTS"

# Create output directory structure
OUTPUT_DIR="_bmad-output/$PROJECT_NAME"
mkdir -p "$OUTPUT_DIR"/{analysis,planning,solutioning,implementation,review,documentation,logs,.orchestrator}

# Copy project template to output
cp "$PROJECT_FILE" "$OUTPUT_DIR/project.yaml"

# Initialize or load state
if [ -n "$RESUME_FROM" ] && [ -f "$RESUME_FROM" ]; then
    echo "📋 Resuming from checkpoint: $RESUME_FROM"
    # Load checkpoint data
    ITERATION=$(grep "iteration:" "$RESUME_FROM" | awk '{print $2}')
    PHASE=$(grep "phase:" "$RESUME_FROM" | awk '{print $2}')
else
    echo "🆕 Starting new project"
    ITERATION=1
    PHASE="init"
fi

# Create initial status.yaml
cat > "$OUTPUT_DIR/status.yaml" << EOF
---
project: $PROJECT_NAME
loop_version: "1.0.0"
created_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
updated_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

status: IN_PROGRESS
phase: $PHASE
current_workflow: workflow-init
iteration: $ITERATION
max_iterations: $MAX_ITERATIONS
mode: $MODE
agents: $AGENTS

progress:
  analysis:
    status: PENDING
    artifacts: []
  planning:
    status: PENDING
    artifacts: []
  solutioning:
    status: PENDING
    artifacts: []
  implementation:
    status: PENDING
    completed_stories: 0
    total_stories: 0
  review:
    status: PENDING
  documentation:
    status: PENDING

metrics:
  iterations: 0
  workflows_executed: 0
  agents_invoked: 0
  code_commits: 0
  tests_passing: 0
  tests_failing: 0
  coverage_percent: 0

blockers: []
next_actions:
  - "Initialize project and analyze requirements"
EOF

# Create runtime state file
mkdir -p .claude
cat > .claude/.ralph-bmad-state << EOF
PROJECT_FILE=$PROJECT_FILE
ITERATION=$ITERATION
MAX_ITERATIONS=$MAX_ITERATIONS
PROJECT_NAME=$PROJECT_NAME
MODE=$MODE
AGENTS=$AGENTS
OUTPUT_DIR=$OUTPUT_DIR
EOF

# Clear any existing stop flag
rm -f .claude/.ralph-bmad-stop

echo ""
echo "✅ Bootstrap complete"
echo "📂 Output directory: $OUTPUT_DIR"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Initial prompt for first iteration - invoke BMAD agents via skills
cat << 'INITIAL_PROMPT'
🎯 RALPH BMAD LOOP - INITIALIZATION

PROJECT CONTEXT:
- Name: {PROJECT_NAME}
- Mode: {MODE}
- Max Iterations: {MAX_ITERATIONS}

⚠️ AUTONOMOUS MODE: DO NOT ask user questions. Invoke BMAD agents via skills.

STEP 1: READ PROJECT
Read and analyze: {PROJECT_FILE}

STEP 2: INVOKE BMAD AGENTS FOR INIT PHASE
Invoke agents using Skill tool:

skill: "bmad:bmm:agents:pm"
skill: "bmad:bmm:agents:analyst"

STEP 3: INVOKE WORKFLOW
skill: "bmad:bmm:workflows:workflow-init"

STEP 4: UPDATE STATUS
Update _bmad-output/{PROJECT_NAME}/status.yaml with results.

6. AUTONOMOUS OPERATION GUIDELINES:
   ⚠️ DO NOT ask the user questions during execution
   - Make reasonable assumptions when requirements are unclear
   - Use your expertise to fill gaps in specifications
   - If blocked, try 3 alternative approaches before marking as blocked
   - Document assumptions in status.yaml for traceability

7. COMPLETION CHECK:
   - If all goals achieved → set status: COMPLETE
   - Output: <promise>RALPH_BMAD_COMPLETE</promise>
   - Otherwise, allow stop hook to re-trigger

🎯 EXECUTE IMMEDIATELY - INVOKE SKILLS NOW

INITIAL_PROMPT

echo ""
echo "🔄 Loop initialized. Stop hook will manage iterations."
echo ""
