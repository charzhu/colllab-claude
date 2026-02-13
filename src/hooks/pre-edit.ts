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

import { loadTrustConfig, getTrustLevel, fileExists, COLLAB_DIR } from "./utils.js";

interface EditToolInput {
  file_path: string;
  old_string?: string;
  new_string?: string;
  content?: string;
}

interface WriteToolInput {
  file_path: string;
  content: string;
}

type ToolInput = EditToolInput | WriteToolInput;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  try {
    // Check if .collab directory exists
    if (!(await fileExists(COLLAB_DIR))) {
      // Collaboration not initialized, allow all edits
      process.exit(0);
    }

    // Read tool input from stdin
    const stdin = await readStdin();
    if (!stdin.trim()) {
      // No input, allow
      process.exit(0);
    }

    let input: ToolInput;
    try {
      input = JSON.parse(stdin);
    } catch {
      // Can't parse input, allow the edit
      process.exit(0);
    }

    const filePath = input.file_path;
    if (!filePath) {
      // No file path, allow
      process.exit(0);
    }

    // Load trust config
    const trustConfig = await loadTrustConfig();
    if (!trustConfig) {
      // No trust config, allow
      process.exit(0);
    }

    // Check trust level
    const trust = getTrustLevel(trustConfig, filePath);

    switch (trust.level) {
      case "READ_ONLY":
        // Block the edit
        console.error(`BLOCKED: ${filePath} is marked READ_ONLY`);
        if (trust.reason) {
          console.error(`Reason: ${trust.reason}`);
        }
        if (trust.owner) {
          console.error(`Owner: ${trust.owner}`);
        }
        console.error("Use collab_propose_change to suggest modifications instead.");
        process.exit(1);

      case "SUGGEST_ONLY":
        // Warn but allow (user can configure stricter behavior)
        console.error(`WARNING: ${filePath} is marked SUGGEST_ONLY`);
        console.error("Consider using collab_propose_change for changes to this file.");
        if (trust.owner) {
          console.error(`Owner: ${trust.owner}`);
        }
        process.exit(0);

      case "SUPERVISED":
        // Just log
        console.error(`Note: ${filePath} is under SUPERVISED trust level`);
        process.exit(0);

      case "AUTONOMOUS":
      default:
        // Allow without message
        process.exit(0);
    }
  } catch (error) {
    // On any error, allow the edit (fail open)
    console.error("Pre-edit hook error:", error);
    process.exit(0);
  }
}

main();
