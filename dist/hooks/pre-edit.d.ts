#!/usr/bin/env node
/**
 * Pre-edit hook for Claude Code
 *
 * This hook runs BEFORE Edit/Write tool executions.
 * It checks trust levels and can block edits to protected regions.
 *
 * Exit codes:
 *   0 = Allow the edit
 *   1 = Block the edit (READ_ONLY region)
 *
 * Usage in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": { "tool_name": "Edit|Write" },
 *       "command": "node /path/to/collab-hooks/dist/pre-edit.js"
 *     }]
 *   }
 * }
 *
 * The hook receives tool input via stdin as JSON.
 */
export {};
