#!/usr/bin/env node
/**
 * Post-edit hook for Claude Code
 *
 * This hook runs AFTER successful Edit/Write tool executions.
 * It records authorship metadata for tracking.
 *
 * Usage in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": { "tool_name": "Edit|Write" },
 *       "command": "node /path/to/collab-hooks/dist/post-edit.js"
 *     }]
 *   }
 * }
 *
 * The hook receives tool input and output via stdin as JSON.
 */
export {};
