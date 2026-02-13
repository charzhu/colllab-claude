#!/usr/bin/env node
/**
 * CLI entry point for collab-claude-code
 *
 * Usage:
 *   collab-claude-code init       - Install skills, MCP server, and hooks
 *   collab-claude-code uninstall  - Remove all components
 *   collab-claude-code --help     - Show help
 */
import { init, uninstall, showHelp } from "./installer.js";
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    switch (command) {
        case "init":
        case "install":
            await init();
            break;
        case "uninstall":
        case "remove":
            await uninstall();
            break;
        case "--help":
        case "-h":
        case "help":
        case undefined:
            showHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.error('Run "collab-claude-code --help" for usage information.');
            process.exit(1);
    }
}
main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
