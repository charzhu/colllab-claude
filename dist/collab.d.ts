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
export declare const COLLAB_DIR = ".collab";
export declare const TRUST_FILE = "trust.yaml";
export declare const CONFIG_FILE = "config.yaml";
export declare const META_DIR = "meta";
export declare const INTENTS_DIR = "intents";
export declare const PROPOSALS_DIR = "proposals";
export declare function generateId(): string;
export declare function sanitizeFilePath(filePath: string): string;
export declare function ensureCollabDir(subdir?: string): Promise<string>;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function parseAnnotations(filePath: string): Promise<ParsedAnnotation[]>;
export declare function loadTrustConfig(): Promise<TrustConfig>;
export declare function saveTrustConfig(config: TrustConfig): Promise<void>;
export declare function getTrustLevelWithAnnotations(config: TrustConfig, filePath: string, lineStart?: number, lineEnd?: number): Promise<TrustResult>;
export declare function getTrustLevel(config: TrustConfig, filePath: string, lineStart?: number, lineEnd?: number): TrustResult;
export declare function loadIntents(filePath: string): Promise<Intent[]>;
export declare function saveIntent(intent: Intent): Promise<void>;
export declare function loadProposals(): Promise<Proposal[]>;
export declare function loadProposal(id: string): Promise<Proposal | null>;
export declare function saveProposal(proposal: Proposal): Promise<void>;
export declare function deleteProposal(id: string): Promise<void>;
export declare function recordAuthorship(record: AuthorshipRecord): Promise<void>;
export declare function loadAuthorship(filePath: string): Promise<AuthorshipRecord[]>;
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
export declare function getFileStatus(filePath: string): Promise<FileStatus>;
export declare function getProjectStatus(): Promise<ProjectStatus>;
export interface ProjectStructure {
    file_tree: string;
    files: string[];
    directories: string[];
    languages: string[];
    frameworks: string[];
    config_files: string[];
    file_samples: Record<string, string>;
    existing_trust_file: boolean;
    existing_policies?: TrustPolicy[];
}
export declare function getProjectStructure(rootDir?: string, options?: {
    includeSamples?: boolean;
    maxFiles?: number;
}): Promise<ProjectStructure>;
export interface ProjectScanResult {
    detected_type: string;
    detected_languages: string[];
    detected_frameworks: string[];
    suggested_policies: TrustPolicy[];
    existing_trust_file: boolean;
}
export declare function scanProject(rootDir?: string): Promise<ProjectScanResult>;
export declare function initializeCollab(useProjectScan?: boolean): Promise<ProjectScanResult | null>;
export interface InitOptions {
    policies?: TrustPolicy[];
    default_trust?: TrustLevel;
}
export declare function initializeCollabWithPolicies(options?: InitOptions): Promise<{
    created: boolean;
    policies_count: number;
    message: string;
}>;
