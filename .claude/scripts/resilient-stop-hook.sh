#!/bin/bash
# Ralph BMAD Loop - Resilient Stop Hook with Rate Limit Handling
# This hook intercepts Claude Code exit attempts and re-invokes the loop
# Includes robust error handling for API rate limits and token exhaustion

STOP_FLAG=".claude/.ralph-bmad-stop"
PROJECT_STATE=".claude/.ralph-bmad-state"
RATE_LIMIT_LOG="_bmad-output/.rate-limit-history.log"
RETRY_STATE=".claude/.retry-state"
ERROR_LOG=".claude/.last-error.log"

# Source rate limit handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/rate-limit-handler.sh" 2>/dev/null || true

# Function to check if error is rate limit related
is_rate_limit_error() {
    local error_msg="$1"
    if echo "$error_msg" | grep -qiE "rate.*limit|too.*many.*request|429|quota|credit|billing|insufficient.*fund|402|403|token.*exhaust|plan.*limit|tier.*limit"; then
        return 0
    fi
    return 1
}

# Function to save error context
save_error_context() {
    local error_msg="$1"
    local iteration="$2"
    echo "$error_msg" > "$ERROR_LOG"
    echo "ITERATION=$iteration" >> "$ERROR_LOG"
    echo "TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$ERROR_LOG"
}

# Check if stop flag exists (user requested cancellation)
if [ -f "$STOP_FLAG" ]; then
    echo "🛑 Ralph BMAD Loop: Stop flag detected. Exiting gracefully."
    rm -f "$STOP_FLAG"
    rm -f "$RETRY_STATE" 2>/dev/null || true
    exit 0
fi

# Check if project state exists
if [ ! -f "$PROJECT_STATE" ]; then
    # No active loop, allow normal exit
    exit 0
fi

# Load project state
PROJECT_FILE=$(cat "$PROJECT_STATE" | grep "PROJECT_FILE=" | cut -d'=' -f2)
ITERATION=$(cat "$PROJECT_STATE" | grep "ITERATION=" | cut -d'=' -f2)
MAX_ITERATIONS=$(cat "$PROJECT_STATE" | grep "MAX_ITERATIONS=" | cut -d'=' -f2)
PROJECT_NAME=$(cat "$PROJECT_STATE" | grep "PROJECT_NAME=" | cut -d'=' -f2)
MODE=$(cat "$PROJECT_STATE" | grep "MODE=" | cut -d'=' -f2)

# Check if there was a rate limit error from previous iteration
if [ -f "$ERROR_LOG" ]; then
    ERROR_MSG=$(cat "$ERROR_LOG" | head -1)
    ERROR_ITERATION=$(grep "ITERATION=" "$ERROR_LOG" | cut -d'=' -f2 || echo "$ITERATION")

    if is_rate_limit_error "$ERROR_MSG"; then
        echo ""
        echo "⚠️  Detected rate limit error from previous iteration"

        # Handle the rate limit (this will sleep and retry)
        if handle_rate_limit "$ERROR_MSG"; then
            # Clear error log after successful wait
            rm -f "$ERROR_LOG"
        else
            # Max retries exceeded or other fatal error
            rm -f "$PROJECT_STATE"
            exit 0
        fi
    else
        # Non-rate-limit error, log it but continue
        echo "⚠️  Previous iteration had error: $ERROR_MSG"
        rm -f "$ERROR_LOG"
    fi
fi

# Check max iterations
if [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
    echo "⛔ Ralph BMAD Loop: Maximum iterations ($MAX_ITERATIONS) reached."
    echo "📁 Final state saved to: _bmad-output/$PROJECT_NAME/"
    rm -f "$PROJECT_STATE"
    rm -f "$RETRY_STATE" 2>/dev/null || true
    exit 0
fi

# Check completion status
STATUS_FILE="_bmad-output/$PROJECT_NAME/status.yaml"
if [ -f "$STATUS_FILE" ]; then
    if grep -q "status: COMPLETE" "$STATUS_FILE" 2>/dev/null; then
        echo "✅ Ralph BMAD Loop: Project marked complete."
        echo "📁 Deliverables saved to: _bmad-output/$PROJECT_NAME/"
        rm -f "$PROJECT_STATE"
        rm -f "$RETRY_STATE" 2>/dev/null || true
        # Reset retry state on successful completion
        reset_retry_state 2>/dev/null || true
        exit 0
    fi
fi

# Increment iteration
NEXT_ITERATION=$((ITERATION + 1))
echo "PROJECT_FILE=$PROJECT_FILE" > "$PROJECT_STATE"
echo "ITERATION=$NEXT_ITERATION" >> "$PROJECT_STATE"
echo "MAX_ITERATIONS=$MAX_ITERATIONS" >> "$PROJECT_STATE"
echo "PROJECT_NAME=$PROJECT_NAME" >> "$PROJECT_STATE"
echo "MODE=$MODE" >> "$PROJECT_STATE"

echo ""
echo "🔄 Ralph BMAD Loop - Iteration $NEXT_ITERATION/$MAX_ITERATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show rate limit status if applicable
if [ -f "$RETRY_STATE" ]; then
    RETRY_COUNT=$(grep "RETRY_COUNT=" "$RETRY_STATE" | cut -d'=' -f2 || echo "0")
    if [ "$RETRY_COUNT" -gt "0" ]; then
        echo "📊 Retry Stats: Attempt $RETRY_COUNT (recovered from rate limit)"
        echo ""
    fi
fi

# Re-invoke the loop with updated context - invoke BMAD agents via skills
cat << 'RALPH_PROMPT'
🔄 RALPH BMAD LOOP - AUTONOMOUS AGENT INVOCATION

STATE SUMMARY:
- Project: {PROJECT_NAME}
- Current Iteration: {NEXT_ITERATION}/{MAX_ITERATIONS}
- Mode: {MODE}

⚠️ AUTONOMOUS MODE: DO NOT ask user questions. Invoke BMAD agents directly.

STEP 1: READ PROJECT STATE
Read and analyze:
- Project template: {PROJECT_FILE}
- Current status: _bmad-output/{PROJECT_NAME}/status.yaml
- Recent logs: _bmad-output/{PROJECT_NAME}/logs/

STEP 2: DETERMINE CURRENT PHASE AND WORKFLOW
Based on status.yaml phase field, identify which BMAD agents to invoke.

STEP 3: INVOKE BMAD AGENTS (Use Skill tool, do not ask user)

For "init" or "analysis" phase:
skill: "bmad:bmm:agents:pm"
Follow with: skill: "bmad:bmm:agents:analyst"

For "planning" phase:
skill: "bmad:bmm:agents:pm"
skill: "bmad:bmm:agents:architect"
skill: "bmad:bmm:agents:ux-designer"

For "solutioning" phase:
skill: "bmad:bmm:agents:architect"
skill: "bmad:bmm:agents:sm"
skill: "bmad:bmm:agents:tea"

For "implementation" phase:
skill: "bmad:bmm:agents:sm"
skill: "bmad:bmm:agents:dev"
skill: "bmad:bmm:agents:tea"

For "review" phase:
skill: "bmad:bmm:agents:tea"
skill: "bmad:bmm:agents:architect"

For "documentation" phase:
skill: "bmad:bmm:agents:tech-writer"

STEP 4: INVOKE WORKFLOW
After loading agents, invoke the appropriate workflow:
skill: "bmad:bmm:workflows:workflow-init"       # for init phase
skill: "bmad:bmm:workflows:create-product-brief" # for analysis phase
skill: "bmad:bmm:workflows:prd"                  # for planning phase
skill: "bmad:bmm:workflows:create-architecture"  # for solutioning phase
skill: "bmad:bmm:workflows:dev-story"            # for implementation phase
skill: "bmad:bmm:workflows:code-review"          # for review phase

STEP 5: UPDATE STATUS
After agent completes work:
- Update _bmad-output/{PROJECT_NAME}/status.yaml
- Log progress and metrics
- Set next_actions

ERROR HANDLING:
If API errors occur:
1. Write "RATE_LIMIT_ERROR: [details]" to .claude/.last-error.log
2. Save progress
3. System will auto-retry

COMPLETION CHECK:
If all goals achieved:
- Update status.yaml to "status: COMPLETE"
- Output: <promise>RALPH_BMAD_COMPLETE</promise>

Otherwise, proceed and allow stop hook to re-trigger.

🎯 EXECUTE IMMEDIATELY - DO NOT WAIT FOR USER INPUT
RALPH_PROMPT

# Prevent normal exit - Claude will read the above and continue
exit 1
