# collab-init

Initialize collaboration tracking with LLM-analyzed trust policies.

## Instructions

When the user invokes this command:

### Step 1: Scan the Project

Call `collab_scan_project` with `include_file_samples: true` to get:
- File tree structure
- Detected languages and frameworks
- Config files
- Sample content from key files

### Step 2: Analyze and Determine Trust Policies

Based on the project structure, determine appropriate trust levels for each directory/pattern. Consider:

**AUTONOMOUS** (Claude can edit freely):
- Test directories (`test/`, `tests/`, `__tests__/`, `spec/`)
- Test files (`*.test.*`, `*.spec.*`, `*_test.go`, `test_*.py`)
- Generated/build output (`generated/`, `dist/`, `build/`, `.next/`)
- Documentation (`docs/`, `*.md` except README)
- Mock/fixture data (`fixtures/`, `mocks/`, `__mocks__/`)

**SUPERVISED** (default - proceed with caution):
- General application code
- UI components
- Utilities and helpers

**SUGGEST_ONLY** (must propose changes):
- Core business logic (`core/`, `domain/`, `services/`)
- API routes and controllers (`api/`, `routes/`, `controllers/`)
- Database models and migrations (`models/`, `migrations/`, `schema/`)
- Configuration (`config/`, `settings/`)
- Payment/billing code (`payments/`, `billing/`, `checkout/`)

**READ_ONLY** (human only):
- Security code (`security/`, `crypto/`, `encryption/`)
- Authentication (`auth/` if contains crypto/tokens)
- Secret management (`secrets/`, `.env*`)
- Infrastructure (`infra/`, `terraform/`, `k8s/`)
- CI/CD pipelines (`.github/workflows/`, `.gitlab-ci.yml`)

### Step 3: Initialize with Policies

Call `collab_init` with your analyzed policies:

```json
{
  "default_trust": "SUPERVISED",
  "policies": [
    { "pattern": "**/test/**", "trust": "AUTONOMOUS", "reason": "Test files" },
    { "pattern": "**/security/**", "trust": "READ_ONLY", "reason": "Security-critical code" },
    { "pattern": "**/core/**", "trust": "SUGGEST_ONLY", "reason": "Core business logic" }
  ]
}
```

### Step 4: Present Results

Show the user what was created:

```
Collaboration tracking initialized!

## Project Analysis

Based on analyzing your project structure, I've configured these trust policies:

| Pattern | Trust Level | Reason |
|---------|-------------|--------|
| **/tests/** | AUTONOMOUS | Test files can be freely modified |
| **/src/core/** | SUGGEST_ONLY | Core business logic requires review |
| **/src/auth/** | READ_ONLY | Authentication contains security-critical code |
| ... | ... | ... |

## What This Means

- **AUTONOMOUS**: I can edit these files freely
- **SUPERVISED**: I'll proceed with caution (default)
- **SUGGEST_ONLY**: I'll create proposals instead of direct edits
- **READ_ONLY**: I won't modify these - I'll explain needed changes

## Next Steps

1. Review `.collab/trust.yaml` and adjust if needed
2. Add `@collab` annotations to specific functions for fine-grained control
3. Use `/collab-status` to see collaboration metrics
```

## Example Analysis

For a Next.js project with this structure:
```
src/
├── app/           → SUPERVISED (pages, layouts)
├── components/    → SUPERVISED (UI components)
├── lib/
│   ├── auth/      → SUGGEST_ONLY (auth logic)
│   ├── db/        → SUGGEST_ONLY (database)
│   └── utils/     → SUPERVISED (utilities)
├── api/           → SUGGEST_ONLY (API routes)
tests/             → AUTONOMOUS
prisma/
├── schema.prisma  → SUGGEST_ONLY (database schema)
└── migrations/    → READ_ONLY (applied migrations)
```

## Language/Framework Considerations

- **Go**: `internal/` is private API, `cmd/` is entry points
- **Rust**: `src/lib.rs` is public API, `src/bin/` is binaries
- **Python**: `__init__.py` defines module interface
- **Java/Spring**: `@Configuration` classes need review
- **Rails**: `db/migrate/` and `config/` need careful handling

## When Trust File Exists

If `.collab/trust.yaml` already exists:
1. Read and display current policies
2. Offer to scan for suggestions
3. Don't overwrite without explicit user confirmation
