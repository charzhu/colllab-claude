#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { loadTrustConfig, getTrustLevel, getTrustLevelWithAnnotations, saveIntent, loadIntents, saveProposal, loadProposals, deleteProposal, recordAuthorship, getFileStatus, getProjectStatus, initializeCollab, initializeCollabWithPolicies, getProjectStructure, generateId, } from "./collab.js";
// ============================================
// Server Setup
// ============================================
const server = new Server({
    name: "collab-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// ============================================
// Tool Definitions
// ============================================
const TOOLS = [
    {
        name: "collab_check_trust",
        description: `Check trust level before modifying code.
Returns: AUTONOMOUS (edit freely), SUGGEST_ONLY (propose instead), READ_ONLY (do not modify), or SUPERVISED (proceed with caution).
IMPORTANT: Call this before editing files in src/core/, src/security/, or any critical paths.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file to check",
                },
                line_start: {
                    type: "number",
                    description: "Start line of region to modify (optional)",
                },
                line_end: {
                    type: "number",
                    description: "End line of region to modify (optional)",
                },
            },
            required: ["file_path"],
        },
    },
    {
        name: "collab_propose_change",
        description: `Propose a code change instead of applying directly.
Use when trust level is SUGGEST_ONLY or when you're uncertain about a change.
Human will review and apply if approved. Use /collab-proposals to list pending proposals.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file to modify",
                },
                description: {
                    type: "string",
                    description: "Short description of the change",
                },
                rationale: {
                    type: "string",
                    description: "Why this change is beneficial",
                },
                old_code: {
                    type: "string",
                    description: "Current code to be replaced",
                },
                new_code: {
                    type: "string",
                    description: "Proposed replacement code",
                },
                confidence: {
                    type: "number",
                    description: "Your confidence in this change (0.0-1.0)",
                },
                risks: {
                    type: "array",
                    items: { type: "string" },
                    description: "Potential risks or concerns",
                },
                tests_needed: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tests that should be added or run",
                },
            },
            required: ["file_path", "description", "old_code", "new_code", "confidence"],
        },
    },
    {
        name: "collab_record_intent",
        description: `Record the intent behind code changes.
Links natural language intent to specific code regions.
Helps future developers (human or LLM) understand the purpose of the code.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file",
                },
                region_name: {
                    type: "string",
                    description: "Name for this code region",
                },
                line_start: {
                    type: "number",
                    description: "Start line of the region",
                },
                line_end: {
                    type: "number",
                    description: "End line of the region",
                },
                intent: {
                    type: "string",
                    description: "Natural language description of what this code should do",
                },
                constraints: {
                    type: "array",
                    items: { type: "string" },
                    description: "Constraints the implementation must satisfy",
                },
                non_goals: {
                    type: "array",
                    items: { type: "string" },
                    description: "Things this code explicitly should NOT do",
                },
            },
            required: ["file_path", "region_name", "intent"],
        },
    },
    {
        name: "collab_get_intents",
        description: `Retrieve recorded intents for a file.
Call this before modifying code to understand the original purpose and constraints.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file",
                },
            },
            required: ["file_path"],
        },
    },
    {
        name: "collab_record_authorship",
        description: `Record that you (Claude) authored specific code.
Called automatically via hooks, but can be called manually for explicit tracking.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file",
                },
                line_start: {
                    type: "number",
                    description: "Start line of the authored code",
                },
                line_end: {
                    type: "number",
                    description: "End line of the authored code",
                },
                confidence: {
                    type: "number",
                    description: "Your confidence in this code (0.0-1.0)",
                },
                model: {
                    type: "string",
                    description: "Model identifier (defaults to claude-opus-4)",
                },
            },
            required: ["file_path", "line_start", "line_end", "confidence"],
        },
    },
    {
        name: "collab_status",
        description: `Get collaboration status for a file or the entire project.
Shows authorship breakdown, confidence scores, trust levels, and pending proposals.`,
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Specific file path, or omit for project-wide summary",
                },
            },
            required: [],
        },
    },
    {
        name: "collab_scan_project",
        description: `Scan the project structure and return file tree for analysis.
Returns the project's file structure, detected languages, and any existing configuration.
Use this to understand the project layout before suggesting trust policies.
The LLM should analyze the returned structure and determine appropriate trust levels.`,
        inputSchema: {
            type: "object",
            properties: {
                include_file_samples: {
                    type: "boolean",
                    description: "Include first few lines of key files to help understand their purpose",
                },
                max_files: {
                    type: "number",
                    description: "Maximum number of files to return (default: 200)",
                },
            },
            required: [],
        },
    },
    {
        name: "collab_init",
        description: `Initialize collaboration tracking with LLM-analyzed trust policies.
Creates .collab/ directory structure. If policies are provided, uses those.
Otherwise creates minimal defaults. Best used after collab_scan_project analysis.`,
        inputSchema: {
            type: "object",
            properties: {
                policies: {
                    type: "array",
                    description: "Trust policies determined by LLM analysis of project structure",
                    items: {
                        type: "object",
                        properties: {
                            pattern: { type: "string", description: "Glob pattern (e.g., '**/auth/**')" },
                            trust: { type: "string", enum: ["AUTONOMOUS", "SUPERVISED", "SUGGEST_ONLY", "READ_ONLY"] },
                            reason: { type: "string", description: "Why this trust level" },
                            owner: { type: "string", description: "Optional owner/team" },
                        },
                        required: ["pattern", "trust", "reason"],
                    },
                },
                default_trust: {
                    type: "string",
                    enum: ["AUTONOMOUS", "SUPERVISED", "SUGGEST_ONLY", "READ_ONLY"],
                    description: "Default trust level for unmatched files (default: SUPERVISED)",
                },
            },
            required: [],
        },
    },
    {
        name: "collab_list_proposals",
        description: `List all pending change proposals.
Returns proposals that are waiting for human review.`,
        inputSchema: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    enum: ["pending", "approved", "rejected", "all"],
                    description: "Filter by status (default: pending)",
                },
            },
            required: [],
        },
    },
    {
        name: "collab_apply_proposal",
        description: `Apply a pending proposal (for use by skills/commands).
This marks the proposal as approved. The actual code change should be made separately.`,
        inputSchema: {
            type: "object",
            properties: {
                proposal_id: {
                    type: "string",
                    description: "ID of the proposal to apply",
                },
            },
            required: ["proposal_id"],
        },
    },
    {
        name: "collab_reject_proposal",
        description: `Reject a pending proposal.`,
        inputSchema: {
            type: "object",
            properties: {
                proposal_id: {
                    type: "string",
                    description: "ID of the proposal to reject",
                },
                reason: {
                    type: "string",
                    description: "Reason for rejection",
                },
            },
            required: ["proposal_id"],
        },
    },
];
// ============================================
// Tool Handlers
// ============================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "collab_check_trust": {
                const { file_path, line_start, line_end } = args;
                const trustConfig = await loadTrustConfig();
                // Use annotation-aware version when line numbers provided
                const trust = line_start !== undefined
                    ? await getTrustLevelWithAnnotations(trustConfig, file_path, line_start, line_end)
                    : getTrustLevel(trustConfig, file_path, line_start, line_end);
                const guidance = {
                    AUTONOMOUS: "You may edit this region freely.",
                    SUGGEST_ONLY: "Use collab_propose_change instead of direct Edit.",
                    READ_ONLY: "Do not modify this region. Explain why changes are needed and ask the human to make them.",
                    SUPERVISED: "Proceed with caution. Consider using collab_propose_change for significant changes.",
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                file: file_path,
                                trust_level: trust.level,
                                reason: trust.reason,
                                owner: trust.owner,
                                intent: trust.intent,
                                constraints: trust.constraints,
                                source: trust.source,
                                guidance: guidance[trust.level],
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_propose_change": {
                const { file_path, description, rationale, old_code, new_code, confidence, risks, tests_needed, } = args;
                const proposal = {
                    id: generateId(),
                    created_at: new Date().toISOString(),
                    author: "claude",
                    status: "pending",
                    file_path,
                    description,
                    rationale,
                    old_code,
                    new_code,
                    confidence,
                    risks,
                    tests_needed,
                };
                await saveProposal(proposal);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                proposal_id: proposal.id,
                                status: "pending",
                                message: `Proposal ${proposal.id} created. Human can review with: /collab-proposals`,
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_record_intent": {
                const { file_path, region_name, line_start, line_end, intent, constraints, non_goals } = args;
                await saveIntent({
                    recorded_at: new Date().toISOString(),
                    author: "claude",
                    file_path,
                    region_name,
                    line_start,
                    line_end,
                    intent,
                    constraints,
                    non_goals,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "recorded",
                                region: region_name,
                                message: "Intent recorded. Will be used for future modifications.",
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_get_intents": {
                const { file_path } = args;
                const intents = await loadIntents(file_path);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                file: file_path,
                                intents: intents,
                                message: intents.length === 0 ? "No intents recorded for this file" : undefined,
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_record_authorship": {
                const { file_path, line_start, line_end, confidence, model } = args;
                await recordAuthorship({
                    timestamp: new Date().toISOString(),
                    author: "claude",
                    model: model || "claude-opus-4",
                    file_path,
                    line_start,
                    line_end,
                    confidence,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ status: "recorded" }, null, 2),
                        },
                    ],
                };
            }
            case "collab_status": {
                const { file_path } = args;
                if (file_path) {
                    const status = await getFileStatus(file_path);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(status, null, 2),
                            },
                        ],
                    };
                }
                else {
                    const status = await getProjectStatus();
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(status, null, 2),
                            },
                        ],
                    };
                }
            }
            case "collab_scan_project": {
                const { include_file_samples, max_files } = args;
                const structure = await getProjectStructure(".", {
                    includeSamples: include_file_samples,
                    maxFiles: max_files,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                file_tree: structure.file_tree,
                                total_files: structure.files.length,
                                directories: structure.directories,
                                languages: structure.languages,
                                frameworks: structure.frameworks,
                                config_files: structure.config_files,
                                file_samples: structure.file_samples,
                                existing_trust_file: structure.existing_trust_file,
                                existing_policies: structure.existing_policies,
                                instructions: `Analyze this project structure and determine appropriate trust policies.
For each directory or pattern, assign one of:
- AUTONOMOUS: Safe to edit freely (tests, generated code, docs)
- SUPERVISED: Default, proceed with caution
- SUGGEST_ONLY: Requires proposal (core logic, APIs, configs)
- READ_ONLY: Human only (security, crypto, secrets)

Call collab_init with your recommended policies array.`,
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_init": {
                const { policies, default_trust } = args;
                // If policies provided, use the new LLM-driven init
                if (policies && policies.length > 0) {
                    const result = await initializeCollabWithPolicies({
                        policies: policies,
                        default_trust,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    status: result.created ? "initialized" : "already_exists",
                                    message: result.message,
                                    policies_count: result.policies_count,
                                    policies: result.created ? policies : undefined,
                                    next_steps: result.created ? [
                                        "Review .collab/trust.yaml and adjust if needed",
                                        "Add @collab annotations to sensitive functions",
                                        "Use collab_check_trust before editing sensitive files",
                                    ] : [
                                        "Delete .collab/trust.yaml to reinitialize",
                                        "Or edit it directly to modify policies",
                                    ],
                                }, null, 2),
                            },
                        ],
                    };
                }
                // Fallback to legacy scan-based init
                const scanResult = await initializeCollab(true);
                const response = {
                    status: "initialized",
                    message: "Collaboration tracking initialized. Created .collab/ directory.",
                };
                if (scanResult) {
                    response.detected_type = scanResult.detected_type;
                    response.detected_languages = scanResult.detected_languages;
                    response.detected_frameworks = scanResult.detected_frameworks;
                    response.policies_created = scanResult.suggested_policies.length;
                    if (scanResult.existing_trust_file) {
                        response.note = "Trust file already existed, kept existing configuration.";
                    }
                    else {
                        response.policies = scanResult.suggested_policies.map(p => ({
                            pattern: p.pattern,
                            trust: p.trust,
                            reason: p.reason,
                        }));
                    }
                }
                response.next_steps = [
                    "Review .collab/trust.yaml and adjust policies as needed",
                    "Add collaboration guidelines to CLAUDE.md",
                    "Use collab_check_trust before editing sensitive files",
                ];
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(response, null, 2),
                        },
                    ],
                };
            }
            case "collab_list_proposals": {
                const { status } = args;
                const proposals = await loadProposals();
                const filtered = status === "all"
                    ? proposals
                    : proposals.filter((p) => p.status === (status || "pending"));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                count: filtered.length,
                                proposals: filtered.map((p) => ({
                                    id: p.id,
                                    file: p.file_path,
                                    description: p.description,
                                    confidence: p.confidence,
                                    status: p.status,
                                    created_at: p.created_at,
                                })),
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_apply_proposal": {
                const { proposal_id } = args;
                const proposals = await loadProposals();
                const proposal = proposals.find((p) => p.id === proposal_id);
                if (!proposal) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ error: `Proposal ${proposal_id} not found` }, null, 2),
                            },
                        ],
                    };
                }
                // Return the proposal details for the caller to apply
                await deleteProposal(proposal_id);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "approved",
                                proposal: proposal,
                                message: "Proposal approved. Apply the change using Edit tool.",
                            }, null, 2),
                        },
                    ],
                };
            }
            case "collab_reject_proposal": {
                const { proposal_id, reason } = args;
                await deleteProposal(proposal_id);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "rejected",
                                proposal_id,
                                reason: reason || "No reason provided",
                            }, null, 2),
                        },
                    ],
                };
            }
            default:
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
                        },
                    ],
                };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: errorMessage }, null, 2),
                },
            ],
        };
    }
});
// ============================================
// Start Server
// ============================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Collab MCP Server running on stdio");
}
main().catch(console.error);
