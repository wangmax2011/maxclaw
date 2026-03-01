# MaxClaw Documentation

This folder contains internal development documentation and configuration files.

## Folder Structure

```
docs/
├── dev/           # Development documentation and implementation guides
├── specs/         # Technical specifications and design docs
├── plans/         # Project plans and roadmaps
├── config/        # Configuration files and YAML specs
└── README.md      # This file
```

## Root Folder Files (Not in docs/)

The following folders remain in the root directory for tool compatibility:

- `_bmad/` - BMAD method workflow files (required by BMAD tools)
- `_bmad-output/` - BMAD generated output files (required by BMAD tools)
- `agents/` - Agent configuration files
- `ralph-bmad-templates/` - Ralph BMAD templates
```

## Contents

### Development (`dev/`)
- `E8_IMPLEMENTATION.md` - Epic 8 implementation guide
- `E10-AGENT-PROTOCOL-IMPLEMENTATION.md` - Agent protocol implementation
- `SKILLS_IMPLEMENTATION.md` - Skills system implementation
- `TEMPLATE_SYSTEM.md` - Template system documentation
- `TEST_REPORT.md` - Test reports and coverage

### Configuration (`config/`)
- `maxclaw-project.yaml` - Main project configuration
- `maxclaw-enhancement-plan.yaml` - Enhancement roadmap
- `maxclaw-features-project.yaml` - Features breakdown
- `ralph-bmad-dashboard.yaml` - Ralph BMAD dashboard config

### BMAD Method (`_bmad/`, `_bmad-output/`)
- BMAD workflow definitions
- Sprint status tracking
- Generated documentation

## Note

These are internal development files. For user-facing documentation, see the main [README.md](../README.md).
