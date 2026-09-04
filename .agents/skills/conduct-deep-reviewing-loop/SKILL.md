---
name: conduct-deep-reviewing-loop
description: Use when asked to conduct an exhaustive multi-role review loop on implementation plans.
---

# Conduct Deep Reviewing Loop

Multi-agent review loop using isolated domain reviewers, topological dependency routing, and independent gatekeeping to verify Directive Artifacts (DA).

## Execution Architecture

| Layer | Agent | Primary Responsibility |
| :--- | :--- | :--- |
| **Layer 1** | Main Agent | Spawns Layer 2 Host, applies clean DA mutations from `Changelog.md`, presents final output. |
| **Layer 2** | Review Host & Critical Gate | Dynamically selects active reviewers in `Reviewer_Choice_Rationale.md`, summons active reviewers using invariant prompts, purges `reports/` before passes, isolates host artifacts in `host/`, executes Reviewer-level DAG routing, enforces Tier Batch Gate negotiation and in-place fix pre-verification, terminates subagent processes upon tier batch resolution, executes Snapshot Delta Backfill for skipped roles (upstream and untouched), writes `Analyzation.md`, `Changelog.md`, and `Untouched_Reviewers.md`. |
| **Layer 3** | Domain Reviewers | Independent specialist subagents (up to 11 roles across 4 Tiers) executing domain audits per `<Role>-REVIEWER-GUIDE.md`. |

## Workflow

```mermaid
flowchart TD
    Start["Round 1: Full DAG Sweep"] --> Eval{"All Roles PASS?"}
    Eval -->|"No"| Apply["Layer 1: Apply Changelog.md to DA"]
    Eval -->|"Yes"| Accumulate["PassCount += 1"]
    Apply --> TargetRun["Round N+1: Targeted Re-Review<br/>(Run affected roles excluding Untouched_Reviewers)"]
    CheckTarget{"Targeted Roles PASS?"}
    TargetRun --> CheckTarget
    CheckTarget -->|"No"| Apply
    CheckTarget -->|"Yes (Pending Skipped Roles)"| Backfill["Snapshot Delta Backfill<br/>(Topologically summon skipped roles on SN)"]
    Backfill --> BackfillCheck{"Skipped Roles PASS?"}
    BackfillCheck -->|"No"| Apply
    BackfillCheck -->|"Yes"| Accumulate
    CheckTarget -->|"Yes (100% Roster Audited)"| Accumulate
    Accumulate --> SPCheck{"PassCount >= SP?"}
    SPCheck -->|"No"| FullSweep["Next Full Sweep Round<br/>(Run active roles on static DA)"]
    FullSweep --> SweepCheck{"All Active Roles PASS?"}
    SweepCheck -->|"No"| Apply
    SweepCheck -->|"Yes"| Accumulate
    SPCheck -->|"Yes"| FinalPass["Issue FINAL_PASS & Conclude"]
```

### Step 1: Initialize Workspace

Create `<repo-root>/.scratch/deep-review/host/`, `<repo-root>/.scratch/deep-review/reports/`, and `<repo-root>/.scratch/deep-review/sandbox/`. Initialize `.scratch/deep-review/Context.md` with target DA path, cross-referenced DAs with dependency lineage (`Upstream` / `Downstream` and `Implemented` / `Unimplemented`), codebase rules (`AGENTS.md`), task domain skills, criteria, and static `SP` threshold.

### Step 2: Spawn Review Host & Critical Gate (Layer 2)

#### 2A. Define Host Subagent Type (Prerequisite)
If `review_host` is not already defined in the active session, call `define_subagent` to register the subagent type:
- `name`: `"review_host"`
- `description`: `"Host and Critical Gate for multi-agent deep reviewing loop"`
- `enable_subagent_tools: true` *(Mandatory: equips Host with `invoke_subagent` and `manage_subagents` to summon Layer 3 reviewers)*
- `enable_write_tools: true` *(Mandatory: equips Host to write `Analyzation.md`, `Changelog.md`, and `Reviewer_Choice_Rationale.md`)*
- `enable_mcp_tools: true`
- `system_prompt`: Provide Host operational instructions referencing `REVIEW-HOST-GUIDE.md` and `HOW-TO-GATE.md`.

#### 2B. Summon Review Host
Invoke the registered `review_host` subagent via `invoke_subagent`:
- `TypeName`: `"review_host"`
- `Role`: `"Review Host & Critical Gate"`
- `Prompt`:
`You are Review Host & Critical Gate. Target DA: <da_path>. System Rules: AGENTS.md. Execution Protocol: REVIEW-HOST-GUIDE.md. Gating Standards: HOW-TO-GATE.md. Context File: .scratch/deep-review/Context.md. Dynamically select active reviewers in .scratch/deep-review/host/Reviewer_Choice_Rationale.md, execute Reviewer-level DAG routing (consuming Changelog.md and Untouched_Reviewers.md), spawn reviewers using invariant prompts, enforce Tier Batch Gate negotiation and in-place fix pre-verification, terminate subagent processes upon tier batch resolution, filter feedback, generate Analyzation.md, Changelog.md, and Untouched_Reviewers.md in .scratch/deep-review/host/, and preserve Analyzation.md for Layer 1 handoff upon FINAL_PASS.`

### Step 3: Handle Host Verdict

Read `.scratch/deep-review/host/Analyzation.md`.

| Verdict in `Analyzation.md` | Action |
| :--- | :--- |
| `ROUND_REVISION_NEEDED` | Read `.scratch/deep-review/host/Changelog.md`.<br>• **If `!PA` / `!WA` active**: STOP execution immediately before modifying DA. Output standardized quota pause message (requesting keyword `"C"` to apply edits and proceed).<br>• **Upon receiving `"C"` (or if no pause tag)**: Apply edits to DA using Clean & Neutral Artifact Protocol. Preserve `.scratch/deep-review/host/Untouched_Reviewers.md` alongside `Changelog.md`. If `Changelog.md` includes `## Target Directive Artifacts Synchronization (Context.md)`, update `.scratch/deep-review/Context.md`. Re-spawn/revive Layer 2 Host for Round N+1 (Host consumes Changelog and Untouched_Reviewers on start). |
| `ROUND_PASS` | Re-spawn Layer 2 Host for next Full Sweep round on unchanged DA. |
| `FINAL_PASS` | Conclude review loop (`PassCount >= SP`). Read `.scratch/deep-review/host/Analyzation.md` to confirm verified clearance, present fully verified DA to user, and execute final directory purge of `<repo-root>/.scratch/deep-review/*`. |

## Modifiers

| Command | Action |
| :--- | :--- |
| `!SP<N>` | Set required continuous Full Sweep PASS rounds threshold to N (Default: 1). |
| `!PA` / `!WA` | Pre-mutation pause gate: When Host returns `ROUND_REVISION_NEEDED`, Main Agent stops immediately before mutating DA, prompts user to check quota, and awaits keyword `"C"` to apply `Changelog.md` (and update `Context.md` if DA list changed) and launch Round N+1. Remains active across the entire review loop until `FINAL_PASS`. |
| `!FPA` | Instantly kill running subagents and pause execution. |
