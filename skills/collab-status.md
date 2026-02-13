# collab-status

Show collaboration status for the current project.

## Instructions

When the user invokes this command:

1. **Get project status** using the `collab_status` MCP tool (without file_path for project-wide summary)

2. **Format and display the results** as a visual report:

```
╔══════════════════════════════════════════════════════════════╗
║                   COLLABORATION STATUS                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Files Tracked: {total_files_tracked}                         ║
║                                                               ║
║  Authorship:                                                  ║
║  ├── Claude:  {claude_count} files                            ║
║  ├── Human:   {human_count} files                             ║
║  └── Mixed:   {mixed_count} files                             ║
║                                                               ║
║  Average Confidence: {average_confidence}                     ║
║  ████████████░░░░░░░░  {percentage}%                          ║
║                                                               ║
║  Trust Distribution:                                          ║
║  ├── AUTONOMOUS:   {auto_count}                               ║
║  ├── SUGGEST_ONLY: {suggest_count}                            ║
║  ├── READ_ONLY:    {readonly_count}                           ║
║  └── SUPERVISED:   {supervised_count}                         ║
║                                                               ║
║  Pending Proposals: {pending_proposals}                       ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

3. **If there are pending proposals**, mention them:
   - "You have {n} pending proposals. Use /collab-proposals to review."

4. **If user provides a file path** as argument (e.g., `/collab-status src/main.ts`):
   - Call `collab_status` with that file_path
   - Show file-specific details:
     - Primary author
     - Lines by author
     - Confidence score
     - Trust level
     - Last modified

## File-Specific Output Format

```
╔══════════════════════════════════════════════════════════════╗
║  FILE: {file_path}                                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Primary Author: {primary_author}                             ║
║  Trust Level:    {trust_level}                                ║
║  Last Modified:  {last_modified}                              ║
║                                                               ║
║  Lines by Author:                                             ║
║  ├── claude:  {claude_lines} lines                            ║
║  └── human:   {human_lines} lines                             ║
║                                                               ║
║  Average Confidence: {confidence}                             ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```
