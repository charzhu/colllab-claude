# collab-init

Initialize collaboration tracking for the current project with context-aware trust policies.

## Instructions

When the user invokes this command:

1. **Check for existing configuration**:
   - Look for `.collab/trust.yaml` in the project root
   - If it exists, inform the user and show current policies

2. **Initialize the collaboration system**:
   - Call the `collab_init` MCP tool to:
     - Scan the project to detect languages and frameworks
     - Create context-aware trust policies based on project structure
     - Set up the `.collab/` directory structure

3. **Display the results**:

```
Collaboration tracking initialized!

## Project Analysis

Detected Type: {detected_type}
Languages: {languages}
Frameworks: {frameworks}

## Trust Policies Created

Based on your project structure, I've created these policies:

| Pattern | Trust Level | Reason |
|---------|-------------|--------|
| **/test/** | AUTONOMOUS | Test files can be freely modified |
| **/security/** | READ_ONLY | Security-critical code requires human review |
| **/auth/** | SUGGEST_ONLY | Authentication code requires careful review |
| ... | ... | ... |

## Directory Structure

📁 .collab/
├── trust.yaml    - Trust policies (auto-generated based on your project)
├── config.yaml   - General settings
├── meta/         - Tracks who wrote what code
├── intents/      - Records why code was written
└── proposals/    - Holds pending change suggestions

## How It Works

1. Before editing sensitive files, I'll check trust levels
2. For READ_ONLY files, I won't modify them - I'll explain what changes are needed
3. For SUGGEST_ONLY files, I'll create proposals instead of direct edits
4. Use `/collab-proposals` to review and apply pending changes
5. Use `/collab-status` to see project collaboration stats

## Customize Trust Policies

Review and edit `.collab/trust.yaml` to fine-tune policies:

```yaml
default_trust: SUPERVISED

policies:
  # Add your custom policies here
  - pattern: "src/payments/**"
    trust: READ_ONLY
    owner: "payments-team"
    reason: "Payment processing - PCI compliance required"
```
```

4. **If trust.yaml already exists**:

```
Collaboration tracking is already initialized!

Your existing `.collab/trust.yaml` has been preserved.

Current policies:
{list current policies}

To re-scan your project and get new suggestions, delete `.collab/trust.yaml` first.
```

5. **Suggest next steps**:
   - Review `.collab/trust.yaml` and adjust policies as needed
   - Add `@collab` annotations to sensitive functions (see README for examples)
   - Try `/collab-status` to see current state

## Project Detection

The scanner recognizes:

### Languages
TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C#, C++, PHP

### Frameworks
- **Node.js**: Next.js, Express, Fastify, NestJS, React, Vue, Angular
- **Python**: Django, Flask
- **Java**: Spring Boot
- **Ruby**: Rails
- **Go**: Gin

### Auto-Generated Policies

Based on detected patterns:

| Directory/Pattern | Default Trust | Rationale |
|-------------------|---------------|-----------|
| `**/test/**`, `**/*.test.*` | AUTONOMOUS | Test code can be freely modified |
| `**/generated/**`, `**/dist/**` | AUTONOMOUS | Build artifacts, regeneratable |
| `**/security/**`, `**/crypto/**` | READ_ONLY | Security-critical, human only |
| `**/auth/**` | SUGGEST_ONLY | Authentication requires review |
| `**/core/**`, `**/domain/**` | SUGGEST_ONLY | Business logic requires review |
| `**/migrations/**` | SUGGEST_ONLY | Database changes require review |
| `**/.env*` | READ_ONLY | May contain secrets |
