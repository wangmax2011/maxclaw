#!/bin/bash
# Agent Orchestrator for Ralph BMAD Loop
# Determines which agents and workflows to invoke based on project state

set -eo pipefail

PROJECT_FILE="$1"
STATUS_FILE="$2"
OUTPUT_DIR="$3"

# Default agent roster
ALL_AGENTS="pm,analyst,architect,ux-designer,sm,dev,tea,tech-writer"

echo "🎯 Agent Orchestrator"
echo "━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Parse current phase from status
CURRENT_PHASE=$(grep "phase:" "$STATUS_FILE" 2>/dev/null | head -1 | awk '{print $2}' || echo "init")
CURRENT_WORKFLOW=$(grep "current_workflow:" "$STATUS_FILE" 2>/dev/null | head -1 | awk '{print $2}' || echo "none")

echo "Current Phase: $CURRENT_PHASE"
echo "Current Workflow: $CURRENT_WORKFLOW"
echo ""

# Phase-to-Agents mapping
determine_agents() {
    case "$1" in
        "init"|"analysis")
            echo "pm,analyst"
            ;;
        "planning")
            echo "pm,architect,ux-designer"
            ;;
        "solutioning")
            echo "architect,sm,tea"
            ;;
        "implementation")
            echo "sm,dev,tea"
            ;;
        "review")
            echo "tea,architect,dev"
            ;;
        "documentation")
            echo "tech-writer,pm"
            ;;
        *)
            echo "$ALL_AGENTS"
            ;;
    esac
}

# Determine next workflow based on phase
determine_workflow() {
    case "$1" in
        "init")
            echo "workflow-init"
            ;;
        "analysis")
            echo "create-product-brief"
            ;;
        "planning")
            if [ "$CURRENT_WORKFLOW" == "create-product-brief" ]; then
                echo "prd"
            else
                echo "create-architecture"
            fi
            ;;
        "solutioning")
            if [ "$CURRENT_WORKFLOW" == "prd" ]; then
                echo "create-architecture"
            else
                echo "create-epics-and-stories"
            fi
            ;;
        "implementation")
            echo "sprint-planning"
            ;;
        "review")
            echo "code-review"
            ;;
        "complete")
            echo "retrospective"
            ;;
        *)
            echo "workflow-status"
            ;;
    esac
}

# Get recommendations
RECOMMENDED_AGENTS=$(determine_agents "$CURRENT_PHASE")
RECOMMENDED_WORKFLOW=$(determine_workflow "$CURRENT_PHASE")

echo "🤖 Recommended Agent Council: $RECOMMENDED_AGENTS"
echo "📋 Recommended Workflow: $RECOMMENDED_WORKFLOW"
echo ""

# Write orchestration decision
mkdir -p "$OUTPUT_DIR/.orchestrator"
cat > "$OUTPUT_DIR/.orchestrator/next-action.yaml" << EOF
---
generated_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
phase: $CURRENT_PHASE
recommendation:
  agents: [$RECOMMENDED_AGENTS]
  workflow: $RECOMMENDED_WORKFLOW
  confidence: high
rationale: |
  Based on current phase "$CURRENT_PHASE", the orchestrator recommends
  invoking agents: $RECOMMENDED_AGENTS to execute workflow: $RECOMMENDED_WORKFLOW.
EOF

echo "✅ Orchestration decision saved to: $OUTPUT_DIR/.orchestrator/next-action.yaml"
