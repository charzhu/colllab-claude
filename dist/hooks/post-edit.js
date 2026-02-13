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
import { recordAuthorship, fileExists, countLines, COLLAB_DIR } from "./utils.js";
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
}
async function main() {
    try {
        // Check if .collab directory exists
        if (!(await fileExists(COLLAB_DIR))) {
            // Collaboration not initialized, skip
            process.exit(0);
        }
        // Read hook input from stdin
        const stdin = await readStdin();
        if (!stdin.trim()) {
            process.exit(0);
        }
        let hookInput;
        try {
            hookInput = JSON.parse(stdin);
        }
        catch {
            // Can't parse input, skip
            process.exit(0);
        }
        // Check if the operation was successful
        if (hookInput.tool_output?.error) {
            // Edit failed, don't record
            process.exit(0);
        }
        const filePath = hookInput.tool_input.file_path;
        if (!filePath) {
            process.exit(0);
        }
        // Determine what was changed
        let lineStart = 1;
        let lineEnd = 1;
        let confidence = 0.85; // Default confidence
        if (hookInput.tool_name === "Write") {
            // Full file write
            const content = hookInput.tool_input.content || "";
            lineEnd = countLines(content);
        }
        else if (hookInput.tool_name === "Edit") {
            // Partial edit - estimate lines changed
            const newString = hookInput.tool_input.new_string || "";
            lineEnd = lineStart + countLines(newString) - 1;
        }
        // Record authorship
        await recordAuthorship({
            timestamp: new Date().toISOString(),
            author: "claude",
            model: process.env.CLAUDE_MODEL || "claude-opus-4",
            file_path: filePath,
            line_start: lineStart,
            line_end: lineEnd,
            confidence: confidence,
        });
        console.error(`Recorded authorship for ${filePath} (lines ${lineStart}-${lineEnd})`);
        process.exit(0);
    }
    catch (error) {
        // On any error, just exit cleanly
        console.error("Post-edit hook error:", error);
        process.exit(0);
    }
}
main();
