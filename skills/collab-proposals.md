# collab-proposals

Review and manage pending code change proposals.

## Instructions

When the user invokes this command:

1. **List pending proposals** using `collab_list_proposals` MCP tool

2. **If no proposals**, say:
   - "No pending proposals. Proposals are created when I suggest changes to SUGGEST_ONLY files or when I'm uncertain about a change."

3. **For each proposal**, display:

```
┌──────────────────────────────────────────────────────────────┐
│ PROPOSAL #{id}                                               │
├──────────────────────────────────────────────────────────────┤
│ File: {file_path}                                            │
│ Description: {description}                                   │
│ Confidence: {confidence}                                     │
│ Created: {created_at}                                        │
├──────────────────────────────────────────────────────────────┤
│ Rationale:                                                   │
│ {rationale}                                                  │
├──────────────────────────────────────────────────────────────┤
│ Risks:                                                       │
│ • {risk_1}                                                   │
│ • {risk_2}                                                   │
├──────────────────────────────────────────────────────────────┤
│ Changes:                                                     │
│                                                              │
│ - {old_code}                                                 │
│ + {new_code}                                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

4. **Ask what to do with each proposal**:
   - **Apply**: Use `collab_apply_proposal`, then use the Edit tool to make the actual change
   - **Reject**: Use `collab_reject_proposal` with a reason
   - **Skip**: Move to next proposal
   - **Ask question**: Let user ask about the proposal

5. **After applying a proposal**:
   - Use the Edit tool to apply the change (old_code → new_code)
   - Confirm: "Applied proposal #{id}. The change has been made to {file_path}."

6. **After rejecting a proposal**:
   - Confirm: "Rejected proposal #{id}. Reason: {reason}"

## Arguments

- `/collab-proposals` - List all pending proposals
- `/collab-proposals apply {id}` - Apply specific proposal
- `/collab-proposals reject {id} {reason}` - Reject specific proposal
- `/collab-proposals all` - Show all proposals including applied/rejected
