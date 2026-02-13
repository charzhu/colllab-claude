/**
 * Installer module for collab-claude-code
 *
 * Handles installation and uninstallation of:
 * - Skills (slash commands)
 * - MCP server configuration
 * - Hooks configuration
 */
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Get user home directory
const HOME = process.env.HOME || process.env.USERPROFILE || "";
// Paths
const CLAUDE_DIR = path.join(HOME, ".claude");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const MCP_FILE = path.join(HOME, ".mcp.json");
// Package paths
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(PACKAGE_ROOT, "skills");
const HOOKS_DIR = path.join(__dirname, "hooks");
async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function readJson(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
}
/**
 * Copy skills to ~/.claude/commands/
 */
async function installSkills() {
    await ensureDir(COMMANDS_DIR);
    const skills = await fs.readdir(SKILLS_DIR);
    for (const skill of skills) {
        if (skill.endsWith(".md")) {
            const src = path.join(SKILLS_DIR, skill);
            const dest = path.join(COMMANDS_DIR, skill);
            await fs.copyFile(src, dest);
            console.log(`  ✓ Copied ${skill}`);
        }
    }
}
/**
 * Remove skills from ~/.claude/commands/
 */
async function uninstallSkills() {
    const skills = ["collab-init.md", "collab-status.md", "collab-proposals.md", "collab-review.md"];
    for (const skill of skills) {
        const skillPath = path.join(COMMANDS_DIR, skill);
        if (await fileExists(skillPath)) {
            await fs.unlink(skillPath);
            console.log(`  ✓ Removed ${skill}`);
        }
    }
}
/**
 * Add MCP server to ~/.mcp.json
 */
async function installMcpServer() {
    let config = (await readJson(MCP_FILE)) || {};
    if (!config.mcpServers) {
        config.mcpServers = {};
    }
    const serverPath = path.join(__dirname, "index.js");
    config.mcpServers.collab = {
        command: "node",
        args: [serverPath],
    };
    await writeJson(MCP_FILE, config);
    console.log(`  ✓ Added MCP server to ${MCP_FILE}`);
}
/**
 * Remove MCP server from ~/.mcp.json
 */
async function uninstallMcpServer() {
    const config = await readJson(MCP_FILE);
    if (!config?.mcpServers?.collab) {
        return;
    }
    delete config.mcpServers.collab;
    await writeJson(MCP_FILE, config);
    console.log(`  ✓ Removed MCP server from ${MCP_FILE}`);
}
/**
 * Add hooks to ~/.claude/settings.json
 */
async function installHooks() {
    await ensureDir(CLAUDE_DIR);
    let settings = (await readJson(SETTINGS_FILE)) || {};
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const preEditPath = path.join(HOOKS_DIR, "pre-edit.js");
    const postEditPath = path.join(HOOKS_DIR, "post-edit.js");
    // Add PreToolUse hook
    const preToolUse = settings.hooks.PreToolUse || [];
    const hasPreEdit = preToolUse.some((h) => h.hooks?.some((hook) => hook.command.includes("collab")));
    if (!hasPreEdit) {
        preToolUse.push({
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: `node "${preEditPath}"` }],
        });
        settings.hooks.PreToolUse = preToolUse;
    }
    // Add PostToolUse hook
    const postToolUse = settings.hooks.PostToolUse || [];
    const hasPostEdit = postToolUse.some((h) => h.hooks?.some((hook) => hook.command.includes("collab")));
    if (!hasPostEdit) {
        postToolUse.push({
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: `node "${postEditPath}"` }],
        });
        settings.hooks.PostToolUse = postToolUse;
    }
    await writeJson(SETTINGS_FILE, settings);
    console.log(`  ✓ Added hooks to ${SETTINGS_FILE}`);
}
/**
 * Remove hooks from ~/.claude/settings.json
 */
async function uninstallHooks() {
    const settings = await readJson(SETTINGS_FILE);
    if (!settings?.hooks) {
        return;
    }
    // Remove collab hooks from PreToolUse
    if (settings.hooks.PreToolUse) {
        settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((h) => !h.hooks?.some((hook) => hook.command.includes("collab")));
    }
    // Remove collab hooks from PostToolUse
    if (settings.hooks.PostToolUse) {
        settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((h) => !h.hooks?.some((hook) => hook.command.includes("collab")));
    }
    await writeJson(SETTINGS_FILE, settings);
    console.log(`  ✓ Removed hooks from ${SETTINGS_FILE}`);
}
/**
 * Full installation
 */
export async function init() {
    console.log("\nInstalling collab-claude-code...\n");
    console.log("Skills:");
    await installSkills();
    console.log("\nMCP Server:");
    await installMcpServer();
    console.log("\nHooks:");
    await installHooks();
    console.log(`
Done! Restart Claude Code to use:

  /collab-init      - Initialize a project
  /collab-status    - View collaboration status
  /collab-proposals - Review pending changes
  /collab-review    - Pre-commit review
`);
}
/**
 * Full uninstallation
 */
export async function uninstall() {
    console.log("\nUninstalling collab-claude-code...\n");
    console.log("Skills:");
    await uninstallSkills();
    console.log("\nMCP Server:");
    await uninstallMcpServer();
    console.log("\nHooks:");
    await uninstallHooks();
    console.log("\nDone! collab-claude-code has been removed.\n");
}
/**
 * Show help
 */
export function showHelp() {
    console.log(`
collab-claude-code - Human-LLM collaboration tracking for Claude Code

Usage:
  collab-claude-code init       Install skills, MCP server, and hooks
  collab-claude-code uninstall  Remove all components
  collab-claude-code --help     Show this help message

After installation, use these commands in Claude Code:
  /collab-init      - Initialize collaboration in a project
  /collab-status    - View collaboration status
  /collab-proposals - Review pending change proposals
  /collab-review    - Pre-commit collaboration review

For more information, visit:
  https://github.com/charzhu/colllab-claude
`);
}
