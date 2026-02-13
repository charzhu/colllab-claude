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
export declare const COLLAB_DIR = ".collab";
export declare const TRUST_FILE = "trust.yaml";
export declare const META_DIR = "meta";
export declare function sanitizeFilePath(filePath: string): string;
export declare function ensureDir(dir: string): Promise<void>;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function loadTrustConfig(): Promise<TrustConfig | null>;
export declare function getTrustLevel(config: TrustConfig, filePath: string, lineStart?: number, lineEnd?: number): {
    level: TrustLevel;
    reason?: string;
    owner?: string;
};
export declare function recordAuthorship(record: AuthorshipRecord): Promise<void>;
export declare function countLines(content: string): number;
