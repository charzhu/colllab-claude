import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { glob } from "glob";

// ============================================
// Types
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

export interface TrustResult {
  level: TrustLevel;
  reason?: string;
  owner?: string;
  intent?: string;
  constraints?: string[];
  source?: "annotation" | "region" | "policy" | "default";
}

export interface Intent {
  recorded_at: string;
  author: string;
  file_path: string;
  region_name: string;
  line_start?: number;
  line_end?: number;
  intent: string;
  constraints?: string[];
  non_goals?: string[];
}

export interface Proposal {
  id: string;
  created_at: string;
  author: string;
  status: "pending" | "approved" | "rejected";
  file_path: string;
  description: string;
  rationale?: string;
  old_code: string;
  new_code: string;
  confidence: number;
  risks?: string[];
  tests_needed?: string[];
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

export interface ParsedAnnotation {
  trust?: TrustLevel;
  owner?: string;
  intent?: string;
  constraints?: string[];
  line_start: number;
  line_end: number;
}

// ============================================
// Constants
// ============================================

export const COLLAB_DIR = ".collab";
export const TRUST_FILE = "trust.yaml";
export const CONFIG_FILE = "config.yaml";
export const META_DIR = "meta";
export const INTENTS_DIR = "intents";
export const PROPOSALS_DIR = "proposals";

// ============================================
// Utility Functions
// ============================================

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function sanitizeFilePath(filePath: string): string {
  return filePath.replace(/[\/\\:]/g, "_");
}

export async function ensureCollabDir(subdir?: string): Promise<string> {
  const dir = subdir ? path.join(COLLAB_DIR, subdir) : COLLAB_DIR;
  await fs.mkdir(dir, { recursive: true });
  return dir;
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
// Annotation Parsing
// ============================================

const ANNOTATION_PATTERN = /(?:\/\/|#|\/\*\*?)\s*@collab(?::begin|:end)?\s+(.+?)(?:\*\/)?$/;
const BLOCK_BEGIN_PATTERN = /@collab:begin\s+(.+)/;
const BLOCK_END_PATTERN = /@collab:end/;
const ATTR_PATTERN = /(\w+)=(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|(\S+))/g;

function parseAttributes(attrString: string): Partial<ParsedAnnotation> {
  const result: Partial<ParsedAnnotation> = {};
  let match: RegExpExecArray | null;

  while ((match = ATTR_PATTERN.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || match[5]; // quoted or unquoted
    const arrayValue = match[4]; // array value

    switch (key) {
      case "trust":
        if (["AUTONOMOUS", "SUPERVISED", "SUGGEST_ONLY", "READ_ONLY"].includes(value)) {
          result.trust = value as TrustLevel;
        }
        break;
      case "owner":
        result.owner = value;
        break;
      case "intent":
        result.intent = value;
        break;
      case "constraints":
        if (arrayValue) {
          result.constraints = arrayValue
            .split(",")
            .map(s => s.trim().replace(/^["']|["']$/g, ""));
        }
        break;
    }
  }

  return result;
}

function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

function detectAnnotationScope(
  lines: string[],
  annotationLineIndex: number,
  fileExt: string
): { start: number; end: number } {
  const startLine = annotationLineIndex + 1; // 1-indexed

  // Find the first non-comment, non-empty line after annotation
  let defLineIndex = annotationLineIndex + 1;
  while (defLineIndex < lines.length) {
    const line = lines[defLineIndex].trim();
    if (line && !line.startsWith("//") && !line.startsWith("#") && !line.startsWith("/*") && !line.startsWith("*")) {
      break;
    }
    defLineIndex++;
  }

  if (defLineIndex >= lines.length) {
    return { start: startLine, end: startLine };
  }

  // Python: indentation-based
  if (fileExt === "py") {
    const defLine = lines[defLineIndex];
    const baseIndent = defLine.length - defLine.trimStart().length;
    let endLineIndex = defLineIndex;

    for (let i = defLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;

      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent <= baseIndent && line.trim() !== "") {
        break;
      }
      endLineIndex = i;
    }

    return { start: defLineIndex + 1, end: endLineIndex + 1 };
  }

  // Brace-based languages: Go, Rust, Java, TypeScript, JavaScript
  if (["go", "rs", "java", "ts", "tsx", "js", "jsx"].includes(fileExt)) {
    let braceCount = 0;
    let foundOpenBrace = false;
    let endLineIndex = defLineIndex;

    for (let i = defLineIndex; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === "{") {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === "}") {
          braceCount--;
        }
      }

      if (foundOpenBrace && braceCount === 0) {
        endLineIndex = i;
        break;
      }
    }

    return { start: defLineIndex + 1, end: endLineIndex + 1 };
  }

  // Fallback: just the next line
  return { start: defLineIndex + 1, end: defLineIndex + 1 };
}

export async function parseAnnotations(filePath: string): Promise<ParsedAnnotation[]> {
  const annotations: ParsedAnnotation[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const fileExt = getFileExtension(filePath);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Check for block begin
      const blockBeginMatch = BLOCK_BEGIN_PATTERN.exec(line);
      if (blockBeginMatch) {
        const attrs = parseAttributes(blockBeginMatch[1]);
        const blockStart = i + 1; // 1-indexed

        // Find matching block end
        let blockEnd = blockStart;
        for (let j = i + 1; j < lines.length; j++) {
          if (BLOCK_END_PATTERN.test(lines[j])) {
            blockEnd = j; // Line before @collab:end
            i = j;
            break;
          }
        }

        annotations.push({
          ...attrs,
          line_start: blockStart + 1, // First line after @collab:begin
          line_end: blockEnd,
        });
        i++;
        continue;
      }

      // Check for single-line annotation
      const match = ANNOTATION_PATTERN.exec(line);
      if (match && !BLOCK_END_PATTERN.test(line)) {
        const attrs = parseAttributes(match[1]);

        // Collect consecutive @collab lines (multi-line annotation)
        const collectedAttrs = { ...attrs };
        let lastAnnotationLine = i;

        for (let j = i + 1; j < lines.length; j++) {
          const nextMatch = ANNOTATION_PATTERN.exec(lines[j]);
          if (nextMatch && !BLOCK_BEGIN_PATTERN.test(lines[j]) && !BLOCK_END_PATTERN.test(lines[j])) {
            const nextAttrs = parseAttributes(nextMatch[1]);
            Object.assign(collectedAttrs, nextAttrs);
            lastAnnotationLine = j;
          } else {
            break;
          }
        }

        // Detect scope of the annotated code
        const scope = detectAnnotationScope(lines, lastAnnotationLine, fileExt);

        annotations.push({
          ...collectedAttrs,
          line_start: scope.start,
          line_end: scope.end,
        });

        i = lastAnnotationLine + 1;
        continue;
      }

      i++;
    }
  } catch {
    // File doesn't exist or can't be read
  }

  return annotations;
}

// ============================================
// Trust Management
// ============================================

export async function loadTrustConfig(): Promise<TrustConfig> {
  const trustPath = path.join(COLLAB_DIR, TRUST_FILE);

  try {
    const content = await fs.readFile(trustPath, "utf-8");
    return yaml.parse(content) as TrustConfig;
  } catch {
    // Return default config if file doesn't exist
    return {
      default_trust: "SUPERVISED",
      policies: []
    };
  }
}

export async function saveTrustConfig(config: TrustConfig): Promise<void> {
  await ensureCollabDir();
  const trustPath = path.join(COLLAB_DIR, TRUST_FILE);
  await fs.writeFile(trustPath, yaml.stringify(config));
}

function matchesPattern(filePath: string, pattern: string): boolean {
  // Simple glob matching
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath) || regex.test(filePath.replace(/\\/g, "/"));
}

export async function getTrustLevelWithAnnotations(
  config: TrustConfig,
  filePath: string,
  lineStart?: number,
  lineEnd?: number
): Promise<TrustResult> {
  // Normalize path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // 1. Check inline annotations first (highest priority)
  if (lineStart !== undefined) {
    const annotations = await parseAnnotations(filePath);
    for (const annotation of annotations) {
      const end = lineEnd ?? lineStart;
      if (lineStart <= annotation.line_end && end >= annotation.line_start) {
        if (annotation.trust) {
          return {
            level: annotation.trust,
            reason: "Inline @collab annotation",
            owner: annotation.owner,
            intent: annotation.intent,
            constraints: annotation.constraints,
            source: "annotation",
          };
        }
      }
    }
  }

  // 2. Check region overrides (from trust.yaml)
  if (config.regions && lineStart !== undefined) {
    for (const region of config.regions) {
      const regionFile = region.file.replace(/\\/g, "/");
      if (normalizedPath.endsWith(regionFile) || normalizedPath === regionFile) {
        const end = lineEnd ?? lineStart;
        if (lineStart <= region.line_end && end >= region.line_start) {
          return {
            level: region.trust,
            reason: region.reason,
            source: "region",
          };
        }
      }
    }
  }

  // 3. Check pattern policies (in order, first match wins)
  for (const policy of config.policies) {
    if (matchesPattern(normalizedPath, policy.pattern)) {
      return {
        level: policy.trust,
        reason: policy.reason,
        owner: policy.owner,
        source: "policy",
      };
    }
  }

  // 4. Return default
  return {
    level: config.default_trust,
    reason: "Default trust level",
    source: "default",
  };
}

export function getTrustLevel(
  config: TrustConfig,
  filePath: string,
  lineStart?: number,
  lineEnd?: number
): TrustResult {
  // Normalize path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Check region overrides first (most specific)
  if (config.regions && lineStart !== undefined) {
    for (const region of config.regions) {
      const regionFile = region.file.replace(/\\/g, "/");
      if (normalizedPath.endsWith(regionFile) || normalizedPath === regionFile) {
        // Check if lines overlap
        const end = lineEnd ?? lineStart;
        if (lineStart <= region.line_end && end >= region.line_start) {
          return {
            level: region.trust,
            reason: region.reason,
            source: "region",
          };
        }
      }
    }
  }

  // Check pattern policies (in order, first match wins)
  for (const policy of config.policies) {
    if (matchesPattern(normalizedPath, policy.pattern)) {
      return {
        level: policy.trust,
        reason: policy.reason,
        owner: policy.owner,
        source: "policy",
      };
    }
  }

  // Return default
  return {
    level: config.default_trust,
    reason: "Default trust level",
    source: "default",
  };
}

// ============================================
// Intent Management
// ============================================

export async function loadIntents(filePath: string): Promise<Intent[]> {
  const intentPath = path.join(
    COLLAB_DIR,
    INTENTS_DIR,
    sanitizeFilePath(filePath) + ".yaml"
  );

  try {
    const content = await fs.readFile(intentPath, "utf-8");
    return yaml.parse(content) || [];
  } catch {
    return [];
  }
}

export async function saveIntent(intent: Intent): Promise<void> {
  await ensureCollabDir(INTENTS_DIR);

  const intentPath = path.join(
    COLLAB_DIR,
    INTENTS_DIR,
    sanitizeFilePath(intent.file_path) + ".yaml"
  );

  const intents = await loadIntents(intent.file_path);
  intents.push(intent);

  await fs.writeFile(intentPath, yaml.stringify(intents));
}

// ============================================
// Proposal Management
// ============================================

export async function loadProposals(): Promise<Proposal[]> {
  const proposalsDir = path.join(COLLAB_DIR, PROPOSALS_DIR);

  try {
    const files = await glob("*.yaml", { cwd: proposalsDir });
    const proposals: Proposal[] = [];

    for (const file of files) {
      const content = await fs.readFile(path.join(proposalsDir, file), "utf-8");
      proposals.push(yaml.parse(content) as Proposal);
    }

    return proposals;
  } catch {
    return [];
  }
}

export async function loadProposal(id: string): Promise<Proposal | null> {
  const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${id}.yaml`);

  try {
    const content = await fs.readFile(proposalPath, "utf-8");
    return yaml.parse(content) as Proposal;
  } catch {
    return null;
  }
}

export async function saveProposal(proposal: Proposal): Promise<void> {
  await ensureCollabDir(PROPOSALS_DIR);

  const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${proposal.id}.yaml`);
  await fs.writeFile(proposalPath, yaml.stringify(proposal));
}

export async function deleteProposal(id: string): Promise<void> {
  const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${id}.yaml`);

  try {
    await fs.unlink(proposalPath);
  } catch {
    // Ignore if doesn't exist
  }
}

// ============================================
// Authorship Management
// ============================================

export async function recordAuthorship(record: AuthorshipRecord): Promise<void> {
  await ensureCollabDir(META_DIR);

  const metaPath = path.join(
    COLLAB_DIR,
    META_DIR,
    sanitizeFilePath(record.file_path) + ".jsonl"
  );

  await fs.appendFile(metaPath, JSON.stringify(record) + "\n");
}

export async function loadAuthorship(filePath: string): Promise<AuthorshipRecord[]> {
  const metaPath = path.join(
    COLLAB_DIR,
    META_DIR,
    sanitizeFilePath(filePath) + ".jsonl"
  );

  try {
    const content = await fs.readFile(metaPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map(line => JSON.parse(line) as AuthorshipRecord);
  } catch {
    return [];
  }
}

// ============================================
// Status/Reporting
// ============================================

export interface FileStatus {
  file: string;
  primary_author: string;
  total_lines_by_author: Record<string, number>;
  average_confidence: number;
  trust_level: TrustLevel;
  pending_todos: number;
  last_modified?: string;
}

export interface ProjectStatus {
  total_files_tracked: number;
  files_by_author: Record<string, number>;
  average_confidence: number;
  pending_proposals: number;
  trust_distribution: Record<TrustLevel, number>;
}

export async function getFileStatus(filePath: string): Promise<FileStatus> {
  const authorship = await loadAuthorship(filePath);
  const trustConfig = await loadTrustConfig();
  const trustResult = getTrustLevel(trustConfig, filePath);

  // Calculate lines by author
  const linesByAuthor: Record<string, number> = {};
  let totalConfidence = 0;

  for (const record of authorship) {
    const author = record.author;
    const lines = record.line_end - record.line_start + 1;
    linesByAuthor[author] = (linesByAuthor[author] || 0) + lines;
    totalConfidence += record.confidence;
  }

  // Determine primary author
  let primaryAuthor = "unknown";
  let maxLines = 0;
  for (const [author, lines] of Object.entries(linesByAuthor)) {
    if (lines > maxLines) {
      maxLines = lines;
      primaryAuthor = author;
    }
  }

  return {
    file: filePath,
    primary_author: primaryAuthor,
    total_lines_by_author: linesByAuthor,
    average_confidence: authorship.length > 0 ? totalConfidence / authorship.length : 0,
    trust_level: trustResult.level,
    pending_todos: 0, // Would need to parse code for @todo markers
    last_modified: authorship.length > 0 ? authorship[authorship.length - 1].timestamp : undefined
  };
}

export async function getProjectStatus(): Promise<ProjectStatus> {
  const metaDir = path.join(COLLAB_DIR, META_DIR);
  const proposals = await loadProposals();
  const trustConfig = await loadTrustConfig();

  const filesByAuthor: Record<string, number> = {};
  const trustDistribution: Record<TrustLevel, number> = {
    AUTONOMOUS: 0,
    SUGGEST_ONLY: 0,
    READ_ONLY: 0,
    SUPERVISED: 0
  };

  let totalConfidence = 0;
  let totalRecords = 0;
  let totalFiles = 0;

  try {
    const metaFiles = await glob("*.jsonl", { cwd: metaDir });
    totalFiles = metaFiles.length;

    for (const metaFile of metaFiles) {
      const content = await fs.readFile(path.join(metaDir, metaFile), "utf-8");
      const records = content.trim().split("\n").filter(Boolean)
        .map(line => JSON.parse(line) as AuthorshipRecord);

      for (const record of records) {
        filesByAuthor[record.author] = (filesByAuthor[record.author] || 0) + 1;
        totalConfidence += record.confidence;
        totalRecords++;
      }

      // Get trust level for this file (reconstruct path from meta file name)
      const originalPath = metaFile.replace(".jsonl", "").replace(/_/g, "/");
      const trust = getTrustLevel(trustConfig, originalPath);
      trustDistribution[trust.level]++;
    }
  } catch {
    // No meta files yet
  }

  return {
    total_files_tracked: totalFiles,
    files_by_author: filesByAuthor,
    average_confidence: totalRecords > 0 ? totalConfidence / totalRecords : 0,
    pending_proposals: proposals.filter(p => p.status === "pending").length,
    trust_distribution: trustDistribution
  };
}

// ============================================
// Initialization
// ============================================

export async function initializeCollab(): Promise<void> {
  // Create directory structure
  await ensureCollabDir();
  await ensureCollabDir(META_DIR);
  await ensureCollabDir(INTENTS_DIR);
  await ensureCollabDir(PROPOSALS_DIR);

  // Create default trust.yaml if it doesn't exist
  const trustPath = path.join(COLLAB_DIR, TRUST_FILE);
  if (!(await fileExists(trustPath))) {
    const defaultConfig: TrustConfig = {
      default_trust: "SUPERVISED",
      policies: [
        {
          pattern: "**/generated/**",
          trust: "AUTONOMOUS",
          reason: "Auto-generated code, can be regenerated"
        },
        {
          pattern: "**/test/**",
          trust: "AUTONOMOUS",
          reason: "Test files can be freely modified"
        },
        {
          pattern: "**/*.test.*",
          trust: "AUTONOMOUS",
          reason: "Test files can be freely modified"
        },
        {
          pattern: "**/security/**",
          trust: "READ_ONLY",
          reason: "Security-critical code requires human modification"
        }
      ],
      regions: []
    };

    await saveTrustConfig(defaultConfig);
  }

  // Create config.yaml if it doesn't exist
  const configPath = path.join(COLLAB_DIR, CONFIG_FILE);
  if (!(await fileExists(configPath))) {
    const defaultConfig = {
      version: "1.0",
      confidence_threshold: 0.7,
      auto_record_authorship: true,
      model: "claude-opus-4"
    };

    await fs.writeFile(configPath, yaml.stringify(defaultConfig));
  }
}
