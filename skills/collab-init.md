# collab-init

Initialize collaboration tracking for the current project.

## Instructions

When the user invokes this command:

1. **Initialize the collaboration system**:
   - Call the `collab_init` MCP tool to create the `.collab/` directory structure
   - This creates:
     - `.collab/trust.yaml` - Trust policies
     - `.collab/config.yaml` - Configuration
     - `.collab/meta/` - Authorship metadata
     - `.collab/intents/` - Recorded intents
     - `.collab/proposals/` - Pending proposals

2. **Explain the system to the user**:

```
Collaboration tracking has been initialized!

## What's Set Up

📁 .collab/
├── trust.yaml    - Controls what you can edit freely vs. needs review
├── config.yaml   - General settings
├── meta/         - Tracks who wrote what code
├── intents/      - Records why code was written
└── proposals/    - Holds pending change suggestions

## Default Trust Policies

- **AUTONOMOUS**: `**/generated/**`, `**/test/**` - I can edit freely
- **READ_ONLY**: `**/security/**` - I won't modify; will ask you
- **SUPERVISED**: Everything else - I'll proceed with caution

## How It Works

1. Before editing sensitive files, I'll check trust levels
2. For SUGGEST_ONLY files, I'll create proposals instead of direct edits
3. Use `/collab-proposals` to review and apply pending changes
4. Use `/collab-status` to see project collaboration stats

## Customize Trust Policies

Edit `.collab/trust.yaml` to add your own rules:

```yaml
policies:
  - pattern: "src/core/**"
    trust: SUGGEST_ONLY
    owner: "your-name"
    reason: "Core business logic"
```

## Add to CLAUDE.md

Consider adding collaboration guidelines to your project's CLAUDE.md file.
```

3. **Suggest next steps**:
   - Edit `.collab/trust.yaml` to customize policies
   - Add collaboration section to CLAUDE.md
   - Try `/collab-status` to see current state
