/**
 * Installer module for collab-claude-code
 *
 * Handles installation and uninstallation of:
 * - Skills (slash commands)
 * - MCP server configuration
 * - Hooks configuration
 */
/**
 * Full installation
 */
export declare function init(): Promise<void>;
/**
 * Full uninstallation
 */
export declare function uninstall(): Promise<void>;
/**
 * Show help
 */
export declare function showHelp(): void;
