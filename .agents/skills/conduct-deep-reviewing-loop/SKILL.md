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
| **Layer 2** | Review Host & Critical Gate | Validates `Context.md`, summons Layer 3 reviewers using invariant prompts, purges `reports/` before each pass, isolates host artifacts in `host/`, runs Full Sweep before Final PASS, writes `Analyzation.md` and `Changelog.md`. |
| **Layer 3** | Domain Reviewers | Independent subagents executing domain audits per `<Role>-REVIEWER-GUIDE.md`. |

## Workflow

```mermaid
flowchart TD
    Start["Round 1: Full DAG Sweep"] --> Eval{"Host Verdict?"}
    Eval -->|"ROUND_REVISION_NEEDED"| Apply["Layer 1: Apply Changelog.md to DA"]
    Apply --> TargetRun["Round N+1: Targeted Re-Review<br/>(Run modified tier + downstream tiers)"]
    TargetRun --> CheckTarget{"Targeted Roles PASS?"}
    CheckTarget -->|"No"| Apply
    CheckTarget -->|"Yes"| FullSweep["Full Sweep Round<br/>(Run all 6 roles on static DA)"]
    FullSweep --> SweepCheck{"All 6 Roles PASS?"}
    SweepCheck -->|"No"| Apply
    SweepCheck -->|"Yes"| Accumulate["PassCount += 1"]
    Accumulate --> SPCheck{"PassCount >= SP?"}
    SPCheck -->|"No"| FullSweep
    SPCheck -->|"Yes"| FinalPass["Issue FINAL_PASS & Conclude"]
    Eval -->|"FINAL_PASS"| FinalPass
```

### Step 1: Initialize Workspace

Create `scratch/deep_review/host/` and `scratch/deep_review/reports/`. Initialize `scratch/deep_review/Context.md` with target DA path, codebase rules (`AGENTS.md`), task domain skills, criteria, and static `SP` threshold.

### Step 2: Spawn Review Host & Critical Gate (Layer 2)

Spawn Layer 2 Subagent with prompt:
`You are Review Host & Critical Gate. Target DA: <da_path>. System Rules: AGENTS.md. Execution Protocol: PROTOCOL.md. Opinion Filtering: HOW-TO-PICK-UP-THE-RIGHT-OPINIONS.md. Context File: scratch/deep_review/Context.md. Execute DAG routing, spawn Layer 3 domain reviewers using invariant prompts, filter feedback, and generate Analyzation.md and Changelog.md in scratch/deep_review/host/.`

### Step 3: Handle Host Verdict

Read `scratch/deep_review/host/Analyzation.md`.

| Verdict in `Analyzation.md` | Action |
| :--- | :--- |
| `ROUND_REVISION_NEEDED` | Read `scratch/deep_review/host/Changelog.md`. Apply edits to DA using Clean & Neutral Artifact Protocol. Re-spawn Layer 2 Host for Round N+1 (Host consumes Changelog on start). |
| `ROUND_PASS` | Re-spawn Layer 2 Host for next Full Sweep round on unchanged DA. |
| `FINAL_PASS` | Conclude review loop (`PassCount >= SP`). Present fully verified DA to user. |

## Modifiers

| Command | Action |
| :--- | :--- |
| `!SP<N>` | Set required continuous Full Sweep PASS rounds threshold to N (Default: 1). |
| `!PA` | Pause execution after applying Layer 2 `Changelog.md` edits; await user confirmation before starting next round. |
| `!FPA` | Instantly kill running subagents and pause execution. |
