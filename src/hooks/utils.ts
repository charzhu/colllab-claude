import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

// ============================================
// Types (duplicated from MCP server for standalone use)
// ============================================

export type TrustLevel = "AUTONOMOUS" | "SUGGEST_ONLY" | "READ_ONLY" | "SUPERVISED";

export interface TrustPolicy {
  pattern: string;
  trust: TrustLevel;
  owner?: string;
  reason?: string;
}

export interface RegionOverride {
  file: string;
  line_start: number;
  line_end: number;
  trust: TrustLevel;
  reason?: string;
}

export interface TrustConfig {
  default_trust: TrustLevel;
  policies: TrustPolicy[];
  regions?: RegionOverride[];
}

export interface AuthorshipRecord {
  timestamp: string;
  author: string;
  model?: string;
  file_path: string;
  line_start: number;
  line_end: number;
  confidence: number;
}

// ============================================
// Constants
// ============================================

export const COLLAB_DIR = ".collab";
export const TRUST_FILE = "trust.yaml";
export const META_DIR = "meta";

// ============================================
// Utility Functions
// ============================================

export function sanitizeFilePath(filePath: string): string {
  return filePath.replace(/[\/\\:]/g, "_");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Trust Management
// ============================================

export async function loadTrustConfig(): Promise<TrustConfig | null> {
  const trustPath = path.join(COLLAB_DIR, TRUST_FILE);

  try {
    const content = await fs.readFile(trustPath, "utf-8");
    return yaml.parse(content) as TrustConfig;
  } catch {
    return null;
  }
}

function matchesPattern(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath) || regex.test(filePath.replace(/\\/g, "/"));
}

export function getTrustLevel(
  config: TrustConfig,
  filePath: string,
  lineStart?: number,
  lineEnd?: number
): { level: TrustLevel; reason?: string; owner?: string } {
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

export async function recordAuthorship(record: AuthorshipRecord): Promise<void> {
  const metaDir = path.join(COLLAB_DIR, META_DIR);
  await ensureDir(metaDir);

  const metaPath = path.join(metaDir, sanitizeFilePath(record.file_path) + ".jsonl");
  await fs.appendFile(metaPath, JSON.stringify(record) + "\n");
}

// ============================================
// Line Counting
// ============================================

export function countLines(content: string): number {
  return content.split("\n").length;
}
