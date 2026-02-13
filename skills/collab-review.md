# collab-review

Comprehensive collaboration review before commit.

## Instructions

When the user invokes this command:

1. **Get current git status**:
   - Run `git status` to see staged and unstaged changes
   - Run `git diff --staged` to see what will be committed

2. **Get collaboration status**:
   - Use `collab_status` MCP tool for project summary
   - For each changed file, use `collab_status` with file_path

3. **Generate collaboration review report**:

```
╔══════════════════════════════════════════════════════════════╗
║                   COLLABORATION REVIEW                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Files Changed: {count}                                       ║
║  Lines Added: {added} | Lines Removed: {removed}              ║
║                                                               ║
║  Authorship Breakdown:                                        ║
║  ├── Human:        {human_lines} lines ({human_pct}%)         ║
║  ├── Claude:       {claude_lines} lines ({claude_pct}%)       ║
║  └── Collaborative: {collab_lines} lines ({collab_pct}%)      ║
║                                                               ║
║  Confidence Distribution:                                     ║
║  ├── High (≥0.85):    {high_pct}%  ████████████░░░░           ║
║  ├── Medium (0.7-0.85): {med_pct}%  ████░░░░░░░░░░            ║
║  └── Low (<0.7):        {low_pct}%  ██░░░░░░░░░░░░            ║
║                                                               ║
║  Trust Compliance:                                            ║
║  ├── READ_ONLY violations: {readonly_violations}              ║
║  └── SUGGEST_ONLY bypasses: {suggest_bypasses}                ║
║                                                               ║
║  Pending Items:                                               ║
║  ├── Proposals: {pending_proposals}                           ║
║  └── TODOs: {pending_todos}                                   ║
║                                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Recommendations:                                             ║
║  {recommendations}                                            ║
╚══════════════════════════════════════════════════════════════╝
```

4. **Check for issues**:
   - Any READ_ONLY files modified? → Flag as violation
   - Any low-confidence sections? → Suggest review
   - Any pending proposals? → Suggest applying or rejecting
   - Any SUGGEST_ONLY files edited directly? → Note the bypass

5. **Generate commit message**:
   - Include collaboration summary
   - Add Co-Authored-By line for Claude

```
feat: {description}

{body}

Collaboration Summary:
- Human authored: {human_summary}
- Claude authored: {claude_summary}
- Average confidence: {avg_confidence}

Co-Authored-By: Claude <noreply@anthropic.com>
```

6. **Ask user**:
   - "Ready to commit with this message? (y/n/edit)"
   - If yes, proceed with commit
   - If edit, let user modify the message
   - If no, exit without committing

## Options

- `/collab-review` - Full review
- `/collab-review --no-commit` - Review only, don't offer to commit
- `/collab-review --quick` - Brief summary without full report
