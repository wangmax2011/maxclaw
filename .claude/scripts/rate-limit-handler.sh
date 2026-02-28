#!/bin/bash
# Ralph BMAD Loop - Rate Limit Handler
# Manages API rate limits, token exhaustion, and retry logic

set -eo pipefail

STATE_FILE=".claude/.ralph-bmad-state"
RATE_LIMIT_LOG="_bmad-output/.rate-limit-history.log"
RETRY_STATE=".claude/.retry-state"

# Rate limit configuration
DEFAULT_MAX_RETRIES=10
DEFAULT_BACKOFF_BASE=60  # Start with 60 seconds
DEFAULT_BACKOFF_MAX=3600  # Max 1 hour between retries
KIMI_TOKEN_RESET_HOURS=5  # Kimi provides new token every 5 hours
KIMI_WEEKLY_RESET_DAY=0   # Sunday (0 = Sunday, 1 = Monday, etc.)

# Ensure log directory exists
mkdir -p "_bmad-output"

log_rate_limit_event() {
    local event_type="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] $event_type: $message" >> "$RATE_LIMIT_LOG"
}

calculate_backoff() {
    local attempt=$1
    local base=${DEFAULT_BACKOFF_BASE}
    local max=${DEFAULT_BACKOFF_MAX}

    # Exponential backoff: 60s, 120s, 240s, 480s, 960s, 1800s, 3600s...
    local backoff=$((base * (2 ** (attempt - 1))))
    if [ $backoff -gt $max ]; then
        backoff=$max
    fi
    echo $backoff
}

calculate_wait_time_for_kimi() {
    local current_hour=$(date +%H)
    local current_min=$(date +%M)

    # Calculate minutes until next 5-hour boundary
    # Kimi tokens reset at: 00:00, 05:00, 10:00, 15:00, 20:00
    local hour_mod=$((current_hour % 5))
    local hours_until_reset=$((5 - hour_mod))
    local mins_until_reset=$((hours_until_reset * 60 - current_min))

    # Add 5 minutes buffer for token propagation
    echo $((mins_until_reset * 60 + 300))
}

calculate_wait_time_for_weekly_reset() {
    local current_day=$(date +%w)  # 0 = Sunday
    local current_hour=$(date +%H)

    # Calculate days until Sunday
    local days_until_sunday=$(( (7 - current_day) % 7 ))
    if [ $days_until_sunday -eq 0 ] && [ $current_hour -ge 0 ]; then
        # It's Sunday, but we need next Sunday
        days_until_sunday=7
    fi

    # Convert to seconds (add 1 hour buffer for weekly reset)
    echo $((days_until_sunday * 24 * 3600 + 3600))
}

handle_rate_limit() {
    local error_message="$1"
    local project_name=$(grep "PROJECT_NAME=" "$STATE_FILE" 2>/dev/null | cut -d'=' -f2 || echo "unknown")

    # Load or initialize retry state
    local retry_count=0
    local last_retry_time=0
    if [ -f "$RETRY_STATE" ]; then
        retry_count=$(grep "RETRY_COUNT=" "$RETRY_STATE" | cut -d'=' -f2 || echo "0")
        last_retry_time=$(grep "LAST_RETRY_TIME=" "$RETRY_STATE" | cut -d'=' -f2 || echo "0")
    fi

    retry_count=$((retry_count + 1))

    # Check if we've exceeded max retries
    if [ $retry_count -gt $DEFAULT_MAX_RETRIES ]; then
        log_rate_limit_event "MAX_RETRIES_EXCEEDED" "Giving up after $DEFAULT_MAX_RETRIES attempts"
        echo "❌ Maximum retries ($DEFAULT_MAX_RETRIES) exceeded. Pausing loop."
        echo "📁 Current state saved. Resume with:"
        echo "   /ralph-bmad-loop --project ./_bmad-output/$project_name/project.yaml --resume"

        # Create a blocker in status.yaml
        local status_file="_bmad-output/$project_name/status.yaml"
        if [ -f "$status_file" ]; then
            sed -i '' "s/blockers: \[\]/blockers: ['API rate limit - max retries exceeded']/" "$status_file" 2>/dev/null || true
        fi

        # Clear retry state
        rm -f "$RETRY_STATE"
        return 1
    fi

    # Determine wait strategy based on error type
    local wait_time
    local wait_reason

    if echo "$error_message" | grep -qi "rate.*limit\|too.*many.*request\|429"; then
        # Rate limit (429) - use exponential backoff
        wait_time=$(calculate_backoff $retry_count)
        wait_reason="Rate limit (429) - exponential backoff"

    elif echo "$error_message" | grep -qi "quota\|credit\|billing\|insufficient.*fund\|402\|403"; then
        # Token/credit exhausted - wait for Kimi reset
        wait_time=$(calculate_wait_time_for_kimi)
        wait_reason="Token quota exhausted - waiting for Kimi 5-hour reset"

    elif echo "$error_message" | grep -qi "weekly\|plan.*limit\|tier.*limit"; then
        # Weekly plan limit - wait for Sunday
        wait_time=$(calculate_wait_time_for_weekly_reset)
        wait_reason="Weekly plan limit - waiting for Sunday reset"

    else
        # Unknown error - use conservative backoff
        wait_time=$(calculate_backoff $retry_count)
        wait_reason="Unknown API error - conservative backoff"
    fi

    # Save retry state
    cat > "$RETRY_STATE" << EOF
RETRY_COUNT=$retry_count
LAST_RETRY_TIME=$(date +%s)
WAIT_TIME=$wait_time
WAIT_REASON="$wait_reason"
NEXT_RETRY_AT=$(date -r $(( $(date +%s) + wait_time )) +"%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d "+$wait_time seconds" +"%Y-%m-%d %H:%M:%S")
EOF

    log_rate_limit_event "RETRY_SCHEDULED" "Attempt $retry_count/$DEFAULT_MAX_RETRIES - Waiting ${wait_time}s ($wait_reason)"

    # Display user-friendly message
    local wait_minutes=$((wait_time / 60))
    local wait_hours=$((wait_time / 3600))

    echo ""
    echo "⏸️  RALPH BMAD LOOP - PAUSED FOR RATE LIMIT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🔄 Retry Attempt: $retry_count/$DEFAULT_MAX_RETRIES"
    echo "⏱️  Wait Time: ${wait_minutes} minutes (${wait_hours} hours)"
    echo "📝 Reason: $wait_reason"
    echo "🔜 Next Retry: $(date -r $(( $(date +%s) + wait_time )) +"%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d "+$wait_time seconds" +"%Y-%m-%d %H:%M:%S")"
    echo ""
    echo "📊 Options:"
    echo "   1. Wait for automatic retry"
    echo "   2. Cancel: /cancel-ralph-bmad"
    echo "   3. Resume manually later: /ralph-bmad-loop --resume"
    echo ""
    echo "💡 Token Reset Schedule:"
    echo "   • Kimi: Every 5 hours (00:00, 05:00, 10:00, 15:00, 20:00)"
    echo "   • Weekly: Sunday 00:00"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Create a checkpoint before sleeping
    create_checkpoint "$project_name" "rate-limit-pause-attempt-$retry_count"

    # Sleep for calculated time
    sleep $wait_time

    echo "🔄 Retry attempt $retry_count commencing..."
    return 0
}

create_checkpoint() {
    local project_name="$1"
    local checkpoint_name="$2"
    local checkpoint_dir="_bmad-output/$project_name/checkpoints"
    local timestamp=$(date +%Y%m%d_%H%M%S)

    mkdir -p "$checkpoint_dir"

    # Save current state
    local checkpoint_file="$checkpoint_dir/${checkpoint_name}-${timestamp}.yaml"
    cat > "$checkpoint_file" << EOF
---
checkpoint_id: ${checkpoint_name}-${timestamp}
project: $project_name
created_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
iteration: $(grep "ITERATION=" "$STATE_FILE" 2>/dev/null | cut -d'=' -f2 || echo "unknown")
retry_state:
  $(cat "$RETRY_STATE" 2>/dev/null || echo "  none")
status_snapshot:
  $(cat "_bmad-output/$project_name/status.yaml" 2>/dev/null | sed 's/^/  /' || echo "  unavailable")
EOF

    log_rate_limit_event "CHECKPOINT_CREATED" "$checkpoint_file"
}

check_and_resume() {
    # Check if we were in a retry state
    if [ -f "$RETRY_STATE" ]; then
        local last_retry_time=$(grep "LAST_RETRY_TIME=" "$RETRY_STATE" | cut -d'=' -f2 || echo "0")
        local current_time=$(date +%s)
        local elapsed=$((current_time - last_retry_time))
        local wait_time=$(grep "WAIT_TIME=" "$RETRY_STATE" | cut -d'=' -f2 || echo "0")

        if [ $elapsed -lt $wait_time ]; then
            local remaining=$((wait_time - elapsed))
            echo "⏳ Rate limit cooldown still active. $remaining seconds remaining."
            echo "   Use --force to override, or wait for automatic retry."
            return 1
        fi
    fi
    return 0
}

reset_retry_state() {
    if [ -f "$RETRY_STATE" ]; then
        rm -f "$RETRY_STATE"
        log_rate_limit_event "RETRY_STATE_RESET" "Successful operation completed, resetting retry counter"
    fi
}

# Export functions for use in other scripts
export -f handle_rate_limit
export -f calculate_backoff
export -f create_checkpoint
export -f reset_retry_state
