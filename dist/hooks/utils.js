import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
// ============================================
// Constants
// ============================================
export const COLLAB_DIR = ".collab";
export const TRUST_FILE = "trust.yaml";
export const META_DIR = "meta";
// ============================================
// Utility Functions
// ============================================
export function sanitizeFilePath(filePath) {
    return filePath.replace(/[\/\\:]/g, "_");
}
export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
export async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
// ============================================
// Trust Management
// ============================================
export async function loadTrustConfig() {
    const trustPath = path.join(COLLAB_DIR, TRUST_FILE);
    try {
        const content = await fs.readFile(trustPath, "utf-8");
        return yaml.parse(content);
    }
    catch {
        return null;
    }
}
function matchesPattern(filePath, pattern) {
    const regexPattern = pattern
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(filePath.replace(/\\/g, "/"));
}
export function getTrustLevel(config, filePath, lineStart, lineEnd) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    // Check region overrides first
    if (config.regions && lineStart !== undefined) {
        for (const region of config.regions) {
            const regionFile = region.file.replace(/\\/g, "/");
            if (normalizedPath.endsWith(regionFile) || normalizedPath === regionFile) {
                const end = lineEnd ?? lineStart;
                if (lineStart <= region.line_end && end >= region.line_start) {
                    return { level: region.trust, reason: region.reason };
                }
            }
        }
    }
    // Check pattern policies
    for (const policy of config.policies) {
        if (matchesPattern(normalizedPath, policy.pattern)) {
            return { level: policy.trust, reason: policy.reason, owner: policy.owner };
        }
    }
    return { level: config.default_trust, reason: "Default trust level" };
}
// ============================================
// Authorship Recording
// ============================================
export async function recordAuthorship(record) {
    const metaDir = path.join(COLLAB_DIR, META_DIR);
    await ensureDir(metaDir);
    const metaPath = path.join(metaDir, sanitizeFilePath(record.file_path) + ".jsonl");
    await fs.appendFile(metaPath, JSON.stringify(record) + "\n");
}
// ============================================
// Line Counting
// ============================================
export function countLines(content) {
    return content.split("\n").length;
}
