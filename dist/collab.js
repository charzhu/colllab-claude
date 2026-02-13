import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { glob } from "glob";
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
export function generateId() {
    return Math.random().toString(36).substring(2, 10);
}
export function sanitizeFilePath(filePath) {
    return filePath.replace(/[\/\\:]/g, "_");
}
export async function ensureCollabDir(subdir) {
    const dir = subdir ? path.join(COLLAB_DIR, subdir) : COLLAB_DIR;
    await fs.mkdir(dir, { recursive: true });
    return dir;
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
// Annotation Parsing
// ============================================
// Note: These patterns should NOT have global flag to avoid lastIndex issues
const ANNOTATION_REGEX = /(?:\/\/|#|\/\*\*?)\s*@collab(?::begin|:end)?\s+(.+?)(?:\*\/)?$/;
const BLOCK_BEGIN_REGEX = /@collab:begin\s+(.+)/;
const BLOCK_END_REGEX = /@collab:end/;
const ATTR_PATTERN = /(\w+)=(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|(\S+))/g;
function parseAttributes(attrString) {
    const result = {};
    // Create a new regex instance each time to avoid lastIndex issues with global flag
    const attrRegex = /(\w+)=(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|(\S+))/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
        const key = match[1];
        const value = match[2] || match[3] || match[5]; // quoted or unquoted
        const arrayValue = match[4]; // array value
        switch (key) {
            case "trust":
                if (["AUTONOMOUS", "SUPERVISED", "SUGGEST_ONLY", "READ_ONLY"].includes(value)) {
                    result.trust = value;
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
function getFileExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext.startsWith(".") ? ext.slice(1) : ext;
}
function detectAnnotationScope(lines, annotationLineIndex, fileExt) {
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
            if (line.trim() === "")
                continue;
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
                }
                else if (char === "}") {
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
export async function parseAnnotations(filePath) {
    const annotations = [];
    try {
        const content = await fs.readFile(filePath, "utf-8");
        // Normalize line endings - handle both CRLF and LF
        const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        const fileExt = getFileExtension(filePath);
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            // Check for block begin
            const blockBeginMatch = BLOCK_BEGIN_REGEX.exec(line);
            if (blockBeginMatch) {
                const attrs = parseAttributes(blockBeginMatch[1]);
                const blockStart = i + 1; // 1-indexed
                // Find matching block end
                let blockEnd = blockStart;
                for (let j = i + 1; j < lines.length; j++) {
                    if (BLOCK_END_REGEX.test(lines[j])) {
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
            const match = ANNOTATION_REGEX.exec(line);
            if (match && !BLOCK_END_REGEX.test(line)) {
                const attrs = parseAttributes(match[1]);
                // Collect consecutive @collab lines (multi-line annotation)
                const collectedAttrs = { ...attrs };
                let lastAnnotationLine = i;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextMatch = ANNOTATION_REGEX.exec(lines[j]);
                    if (nextMatch && !BLOCK_BEGIN_REGEX.test(lines[j]) && !BLOCK_END_REGEX.test(lines[j])) {
                        const nextAttrs = parseAttributes(nextMatch[1]);
                        Object.assign(collectedAttrs, nextAttrs);
                        lastAnnotationLine = j;
                    }
                    else {
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
    }
    catch {
        // File doesn't exist or can't be read
    }
    return annotations;
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
        // Return default config if file doesn't exist
        return {
            default_trust: "SUPERVISED",
            policies: []
        };
    }
}
export async function saveTrustConfig(config) {
    await ensureCollabDir();
    const trustPath = path.join(COLLAB_DIR, TRUST_FILE);
    await fs.writeFile(trustPath, yaml.stringify(config));
}
function matchesPattern(filePath, pattern) {
    // Simple glob matching
    const regexPattern = pattern
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(filePath.replace(/\\/g, "/"));
}
export async function getTrustLevelWithAnnotations(config, filePath, lineStart, lineEnd) {
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
export function getTrustLevel(config, filePath, lineStart, lineEnd) {
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
export async function loadIntents(filePath) {
    const intentPath = path.join(COLLAB_DIR, INTENTS_DIR, sanitizeFilePath(filePath) + ".yaml");
    try {
        const content = await fs.readFile(intentPath, "utf-8");
        return yaml.parse(content) || [];
    }
    catch {
        return [];
    }
}
export async function saveIntent(intent) {
    await ensureCollabDir(INTENTS_DIR);
    const intentPath = path.join(COLLAB_DIR, INTENTS_DIR, sanitizeFilePath(intent.file_path) + ".yaml");
    const intents = await loadIntents(intent.file_path);
    intents.push(intent);
    await fs.writeFile(intentPath, yaml.stringify(intents));
}
// ============================================
// Proposal Management
// ============================================
export async function loadProposals() {
    const proposalsDir = path.join(COLLAB_DIR, PROPOSALS_DIR);
    try {
        const files = await glob("*.yaml", { cwd: proposalsDir });
        const proposals = [];
        for (const file of files) {
            const content = await fs.readFile(path.join(proposalsDir, file), "utf-8");
            proposals.push(yaml.parse(content));
        }
        return proposals;
    }
    catch {
        return [];
    }
}
export async function loadProposal(id) {
    const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${id}.yaml`);
    try {
        const content = await fs.readFile(proposalPath, "utf-8");
        return yaml.parse(content);
    }
    catch {
        return null;
    }
}
export async function saveProposal(proposal) {
    await ensureCollabDir(PROPOSALS_DIR);
    const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${proposal.id}.yaml`);
    await fs.writeFile(proposalPath, yaml.stringify(proposal));
}
export async function deleteProposal(id) {
    const proposalPath = path.join(COLLAB_DIR, PROPOSALS_DIR, `${id}.yaml`);
    try {
        await fs.unlink(proposalPath);
    }
    catch {
        // Ignore if doesn't exist
    }
}
// ============================================
// Authorship Management
// ============================================
export async function recordAuthorship(record) {
    await ensureCollabDir(META_DIR);
    const metaPath = path.join(COLLAB_DIR, META_DIR, sanitizeFilePath(record.file_path) + ".jsonl");
    await fs.appendFile(metaPath, JSON.stringify(record) + "\n");
}
export async function loadAuthorship(filePath) {
    const metaPath = path.join(COLLAB_DIR, META_DIR, sanitizeFilePath(filePath) + ".jsonl");
    try {
        const content = await fs.readFile(metaPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        return lines.map(line => JSON.parse(line));
    }
    catch {
        return [];
    }
}
export async function getFileStatus(filePath) {
    const authorship = await loadAuthorship(filePath);
    const trustConfig = await loadTrustConfig();
    const trustResult = getTrustLevel(trustConfig, filePath);
    // Calculate lines by author
    const linesByAuthor = {};
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
export async function getProjectStatus() {
    const metaDir = path.join(COLLAB_DIR, META_DIR);
    const proposals = await loadProposals();
    const trustConfig = await loadTrustConfig();
    const filesByAuthor = {};
    const trustDistribution = {
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
                .map(line => JSON.parse(line));
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
    }
    catch {
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
// Common patterns for different project types
const COMMON_PATTERNS = [
    // Test files - AUTONOMOUS
    { pattern: "**/test/**", trust: "AUTONOMOUS", reason: "Test files can be freely modified", condition: () => true },
    { pattern: "**/tests/**", trust: "AUTONOMOUS", reason: "Test files can be freely modified", condition: () => true },
    { pattern: "**/__tests__/**", trust: "AUTONOMOUS", reason: "Test files can be freely modified", condition: () => true },
    { pattern: "**/*.test.*", trust: "AUTONOMOUS", reason: "Test files can be freely modified", condition: () => true },
    { pattern: "**/*.spec.*", trust: "AUTONOMOUS", reason: "Test files can be freely modified", condition: () => true },
    { pattern: "**/*_test.go", trust: "AUTONOMOUS", reason: "Go test files can be freely modified", condition: (files) => files.some(f => f.endsWith(".go")) },
    { pattern: "**/*_test.py", trust: "AUTONOMOUS", reason: "Python test files can be freely modified", condition: (files) => files.some(f => f.endsWith(".py")) },
    // Generated files - AUTONOMOUS
    { pattern: "**/generated/**", trust: "AUTONOMOUS", reason: "Auto-generated code, can be regenerated", condition: () => true },
    { pattern: "generated/**", trust: "AUTONOMOUS", reason: "Auto-generated code, can be regenerated", condition: () => true },
    { pattern: "**/dist/**", trust: "AUTONOMOUS", reason: "Build output, can be regenerated", condition: () => true },
    { pattern: "dist/**", trust: "AUTONOMOUS", reason: "Build output, can be regenerated", condition: () => true },
    { pattern: "**/build/**", trust: "AUTONOMOUS", reason: "Build output, can be regenerated", condition: () => true },
    { pattern: "build/**", trust: "AUTONOMOUS", reason: "Build output, can be regenerated", condition: () => true },
    { pattern: "**/.next/**", trust: "AUTONOMOUS", reason: "Next.js build output", condition: (files) => files.some(f => f.includes("next.config")) },
    // Security - READ_ONLY
    { pattern: "**/security/**", trust: "READ_ONLY", reason: "Security-critical code requires human review", condition: () => true },
    { pattern: "**/auth/**", trust: "SUGGEST_ONLY", reason: "Authentication code requires careful review", condition: () => true },
    { pattern: "**/crypto/**", trust: "READ_ONLY", reason: "Cryptographic code requires human review", condition: () => true },
    // Core business logic - SUGGEST_ONLY
    { pattern: "**/core/**", trust: "SUGGEST_ONLY", reason: "Core business logic requires review", condition: () => true },
    { pattern: "**/domain/**", trust: "SUGGEST_ONLY", reason: "Domain logic requires review", condition: () => true },
    // Infrastructure - SUGGEST_ONLY
    { pattern: "**/infra/**", trust: "SUGGEST_ONLY", reason: "Infrastructure code requires review", condition: () => true },
    { pattern: "**/infrastructure/**", trust: "SUGGEST_ONLY", reason: "Infrastructure code requires review", condition: () => true },
    { pattern: "**/migrations/**", trust: "SUGGEST_ONLY", reason: "Database migrations require careful review", condition: () => true },
    // Config files - READ_ONLY for sensitive ones
    { pattern: "**/.env*", trust: "READ_ONLY", reason: "Environment files may contain secrets", condition: () => true },
    { pattern: "**/secrets/**", trust: "READ_ONLY", reason: "Secret files must not be modified by AI", condition: () => true },
];
// Framework-specific patterns
const FRAMEWORK_PATTERNS = {
    nextjs: [
        { pattern: "app/**/layout.*", trust: "SUGGEST_ONLY", reason: "Next.js layouts affect multiple pages", condition: () => true },
        { pattern: "app/**/page.*", trust: "SUPERVISED", reason: "Next.js pages", condition: () => true },
        { pattern: "middleware.*", trust: "SUGGEST_ONLY", reason: "Middleware affects all requests", condition: () => true },
    ],
    express: [
        { pattern: "**/middleware/**", trust: "SUGGEST_ONLY", reason: "Express middleware affects request handling", condition: () => true },
        { pattern: "**/routes/**", trust: "SUPERVISED", reason: "API routes", condition: () => true },
    ],
    django: [
        { pattern: "**/settings/**", trust: "SUGGEST_ONLY", reason: "Django settings affect entire application", condition: () => true },
        { pattern: "**/models.py", trust: "SUGGEST_ONLY", reason: "Django models define database schema", condition: () => true },
        { pattern: "**/migrations/**", trust: "SUGGEST_ONLY", reason: "Django migrations modify database", condition: () => true },
    ],
    spring: [
        { pattern: "**/config/**", trust: "SUGGEST_ONLY", reason: "Spring configuration", condition: () => true },
        { pattern: "**/*Config.java", trust: "SUGGEST_ONLY", reason: "Spring configuration classes", condition: () => true },
        { pattern: "**/*Security*.java", trust: "READ_ONLY", reason: "Spring Security configuration", condition: () => true },
    ],
    rails: [
        { pattern: "config/**", trust: "SUGGEST_ONLY", reason: "Rails configuration", condition: () => true },
        { pattern: "db/migrate/**", trust: "SUGGEST_ONLY", reason: "Rails migrations modify database", condition: () => true },
        { pattern: "app/models/**", trust: "SUGGEST_ONLY", reason: "Rails models define database schema", condition: () => true },
    ],
};
async function detectProjectType(files) {
    const languages = new Set();
    const frameworks = new Set();
    let type = "unknown";
    // Detect languages by file extensions
    const extensionMap = {
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".py": "python",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".rb": "ruby",
        ".cs": "csharp",
        ".cpp": "cpp",
        ".c": "c",
        ".php": "php",
    };
    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (extensionMap[ext]) {
            languages.add(extensionMap[ext]);
        }
    }
    // Detect frameworks by specific files
    const frameworkIndicators = {
        nextjs: ["next.config.js", "next.config.mjs", "next.config.ts"],
        express: ["express"], // Will check package.json
        react: ["react"], // Will check package.json
        vue: ["vue.config.js", "nuxt.config.js", "nuxt.config.ts"],
        django: ["manage.py", "settings.py"],
        flask: ["flask"], // Will check requirements.txt
        spring: ["pom.xml", "build.gradle"],
        rails: ["Gemfile", "config/routes.rb"],
        gin: ["gin"], // Will check go.mod
    };
    // Check for framework indicator files
    for (const [framework, indicators] of Object.entries(frameworkIndicators)) {
        for (const indicator of indicators) {
            if (files.some(f => f.endsWith(indicator) || f.includes(indicator))) {
                frameworks.add(framework);
            }
        }
    }
    // Check package.json for JS frameworks
    if (files.some(f => f.endsWith("package.json"))) {
        try {
            const pkgPath = files.find(f => f.endsWith("package.json") && !f.includes("node_modules"));
            if (pkgPath) {
                const content = await fs.readFile(pkgPath, "utf-8");
                const pkg = JSON.parse(content);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (deps["next"])
                    frameworks.add("nextjs");
                if (deps["express"])
                    frameworks.add("express");
                if (deps["react"])
                    frameworks.add("react");
                if (deps["vue"])
                    frameworks.add("vue");
                if (deps["@angular/core"])
                    frameworks.add("angular");
                if (deps["fastify"])
                    frameworks.add("fastify");
                if (deps["nestjs"] || deps["@nestjs/core"])
                    frameworks.add("nestjs");
            }
        }
        catch {
            // Ignore parse errors
        }
    }
    // Determine project type
    if (frameworks.has("nextjs") || frameworks.has("react") || frameworks.has("vue") || frameworks.has("angular")) {
        type = "web-frontend";
    }
    else if (frameworks.has("express") || frameworks.has("fastify") || frameworks.has("nestjs")) {
        type = "node-backend";
    }
    else if (frameworks.has("django") || frameworks.has("flask")) {
        type = "python-backend";
    }
    else if (frameworks.has("spring")) {
        type = "java-backend";
    }
    else if (frameworks.has("rails")) {
        type = "ruby-backend";
    }
    else if (languages.has("go")) {
        type = "go-backend";
    }
    else if (languages.has("rust")) {
        type = "rust";
    }
    else if (languages.size > 0) {
        type = Array.from(languages)[0];
    }
    return {
        type,
        languages: Array.from(languages),
        frameworks: Array.from(frameworks),
    };
}
export async function scanProject(rootDir = ".") {
    // Check if trust.yaml already exists
    const trustPath = path.join(rootDir, COLLAB_DIR, TRUST_FILE);
    const existingTrustFile = await fileExists(trustPath);
    // Get all files in the project (excluding common ignore patterns)
    const files = await glob("**/*", {
        cwd: rootDir,
        ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
            "**/.next/**",
            "**/target/**",
            "**/__pycache__/**",
            "**/venv/**",
            "**/.venv/**",
            "**/vendor/**",
        ],
        nodir: true,
    });
    // Detect project type
    const { type, languages, frameworks } = await detectProjectType(files);
    // Build suggested policies
    const suggestedPolicies = [];
    const addedPatterns = new Set();
    // Add common patterns that match
    for (const pattern of COMMON_PATTERNS) {
        if (pattern.condition(files) && !addedPatterns.has(pattern.pattern)) {
            // Check if any files match this pattern
            const matchingFiles = await glob(pattern.pattern, { cwd: rootDir, nodir: true, ignore: ["**/node_modules/**"] });
            // Always include certain critical patterns even if no files match yet
            const alwaysIncludePatterns = [
                "**/test/**", "**/tests/**", "**/security/**", "**/crypto/**",
                "**/generated/**", "**/auth/**", "**/core/**", "**/.env*"
            ];
            const shouldAlwaysInclude = alwaysIncludePatterns.some(p => pattern.pattern === p);
            if (matchingFiles.length > 0 || shouldAlwaysInclude) {
                suggestedPolicies.push({
                    pattern: pattern.pattern,
                    trust: pattern.trust,
                    reason: pattern.reason,
                });
                addedPatterns.add(pattern.pattern);
            }
        }
    }
    // Add framework-specific patterns
    for (const framework of frameworks) {
        const frameworkPatterns = FRAMEWORK_PATTERNS[framework];
        if (frameworkPatterns) {
            for (const pattern of frameworkPatterns) {
                if (!addedPatterns.has(pattern.pattern)) {
                    suggestedPolicies.push({
                        pattern: pattern.pattern,
                        trust: pattern.trust,
                        reason: pattern.reason,
                    });
                    addedPatterns.add(pattern.pattern);
                }
            }
        }
    }
    // Sort policies by trust level priority (READ_ONLY first, then SUGGEST_ONLY, etc.)
    const trustOrder = {
        READ_ONLY: 0,
        SUGGEST_ONLY: 1,
        SUPERVISED: 2,
        AUTONOMOUS: 3,
    };
    suggestedPolicies.sort((a, b) => trustOrder[a.trust] - trustOrder[b.trust]);
    return {
        detected_type: type,
        detected_languages: languages,
        detected_frameworks: frameworks,
        suggested_policies: suggestedPolicies,
        existing_trust_file: existingTrustFile,
    };
}
// ============================================
// Initialization
// ============================================
export async function initializeCollab(useProjectScan = true) {
    // Create directory structure
    await ensureCollabDir();
    await ensureCollabDir(META_DIR);
    await ensureCollabDir(INTENTS_DIR);
    await ensureCollabDir(PROPOSALS_DIR);
    let scanResult = null;
    // Create default trust.yaml if it doesn't exist
    const trustPath = path.join(COLLAB_DIR, TRUST_FILE);
    if (!(await fileExists(trustPath))) {
        let policies;
        if (useProjectScan) {
            // Scan project and generate context-aware policies
            scanResult = await scanProject(".");
            policies = scanResult.suggested_policies.length > 0
                ? scanResult.suggested_policies
                : [
                    // Fallback to defaults if no patterns matched
                    { pattern: "**/generated/**", trust: "AUTONOMOUS", reason: "Auto-generated code" },
                    { pattern: "**/test/**", trust: "AUTONOMOUS", reason: "Test files" },
                    { pattern: "**/*.test.*", trust: "AUTONOMOUS", reason: "Test files" },
                    { pattern: "**/security/**", trust: "READ_ONLY", reason: "Security-critical code" },
                ];
        }
        else {
            policies = [
                { pattern: "**/generated/**", trust: "AUTONOMOUS", reason: "Auto-generated code, can be regenerated" },
                { pattern: "**/test/**", trust: "AUTONOMOUS", reason: "Test files can be freely modified" },
                { pattern: "**/*.test.*", trust: "AUTONOMOUS", reason: "Test files can be freely modified" },
                { pattern: "**/security/**", trust: "READ_ONLY", reason: "Security-critical code requires human modification" },
            ];
        }
        const config = {
            default_trust: "SUPERVISED",
            policies,
            regions: [],
        };
        await saveTrustConfig(config);
    }
    else if (useProjectScan) {
        // Even if trust file exists, scan to return info
        scanResult = await scanProject(".");
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
    return scanResult;
}
