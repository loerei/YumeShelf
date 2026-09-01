# Layer 2 Review Host Operational Guide

Instructions for Review Host to route Layer 3 reviewers, filter feedback, and enforce DAG gates.

## Core Responsibilities

0. **Scope Analysis & Dynamic Roster Selection**:
   - If `.scratch/deep_review/host/Reviewer_Choice_Rationale.md` exists (Round N+1): Load and preserve the active roster without re-evaluating exclusions.
   - Else (Round 1): Inspect target DA scope, `## Cross-Referenced DAs & Dependency Lineage` in `Context.md`, and user criteria; write `.scratch/deep_review/host/Reviewer_Choice_Rationale.md` using the standard table layout:
     ```markdown
     | Role Identifier | Selection Status (INCLUDED / EXCLUDED) | Technical Rationale |
     ```
     Ensure `Architect` and `Logic` are `INCLUDED`, and explicitly mark remaining 9 roles as `INCLUDED` or `EXCLUDED` (`Progress` MUST be `INCLUDED` for multi-phase/multi-ticket epics, roadmaps, or work-breakdown structures; `EXCLUDED` for single-ticket/simple plans).
1. **Workspace Preparation**: Purge all files in `.scratch/deep_review/reports/` and recursively purge all diagnostic probe files in `<repo-root>/.scratch/` (excluding `.scratch/deep_review/`, idempotently handling missing directories) strictly at round start (before executing the first active tier) and before launching a Full Sweep pass (preserving intra-tier reports within an active pass). Validate `.scratch/deep_review/Context.md` (verifying presence of target DA, dependency lineage table, and criteria) without overwriting criteria or `SP`.
2. **DAG Routing & Targeted Execution**:
   - If `.scratch/deep_review/host/Changelog.md` exists: Reset `PassCount = 0`, determine highest modified tier for Targeted DAG routing per `PROTOCOL.md` Section 6, then delete `.scratch/deep_review/host/Changelog.md` before invoking reviewers.
   - If `.scratch/deep_review/host/Changelog.md` is absent:
     - If previous `host/Analyzation.md` recorded `ROUND_PASS`: Read active `PassCount` and run Full Sweep on the static DA across all active roles.
     - Else (Round 1): Initialize `PassCount = 0` and run Full DAG across all active roles (Tier 3.1 -> 3.2 -> 3.3 -> 3.4).
   - Vacuous Tier Handling: If all roles in an active tier are `EXCLUDED`, treat the tier as passed and advance immediately.
   - MUST use the invariant invocation template from `PROTOCOL.md` Section 3 with `<guide_path>` dynamically resolved to the primary `<Role>-REVIEWER-GUIDE.md` relative to the active skill location and neutral tool metadata (`toolAction: "Summoning reviewer"`, `toolSummary: "Domain review"`). Reviewers autonomously load domain subdocuments referenced in their guide's routing table as needed via `view_file`. NEVER inject round numbers or phase names into reviewer prompts.
3. **Subagent Liveness & Heartbeat Monitoring (Deadlock Prevention)**:
   - When summoning Layer 3 reviewers, set a 180s liveness check timer via `schedule` (`DurationSeconds=180, TimerCondition="any"`).
   - If a reviewer stops responding without outputting its report to `.scratch/deep_review/reports/<Role>.md`:
     1. Inspect subagent status via `manage_subagents(Action="list")`.
     2. If idle, hung, or stuck in background execution, send a status check ping via `send_message` (`"Status check: Please finalize your review report or disclose blockers."`).
     3. If non-responsive or errored, terminate and respawn that specific reviewer.
4. **Early Suspension**: If a tier returns `REVISION NEEDED`, cancel downstream tiers for that round.
5. **Snapshot Delta Backfill & Full Sweep Clearance**:
   - When all targeted roles pass on snapshot $S_N$:
     - If un-evaluated active upstream roles exist (e.g. Layer 3.1 skipped during Layer 3.2 targeted re-review): Summon **ONLY those skipped upstream roles in topological DAG sequence** on snapshot $S_N$, preserving intra-round reports in `reports/`.
     - If all active roles in the frozen roster have now passed on snapshot $S_N$ (either via Full DAG execution or Targeted + Backfill): Record Full Sweep Clearance, increment `PassCount += 1`, and evaluate against `SP`.
     - If `PassCount < SP`: Purge `reports/` and initiate the next Full Sweep round on the unchanged static DA.
     - If `PassCount >= SP`: Issue `FINAL_PASS` and recursively purge all temporary diagnostic files in `<repo-root>/.scratch/*` (including `.scratch/deep_review/`, idempotently handling missing directories).
6. **Reporting & Final Teardown**: Evaluate Layer 3 reports from `.scratch/deep_review/reports/` using `HOW-TO-PICK-UP-THE-RIGHT-OPINIONS.md`. Record `Current PassCount: <N> / <SP>`, write `.scratch/deep_review/host/Analyzation.md` and `.scratch/deep_review/host/Changelog.md` via native `write_to_file`. When accepted feedback alters the DA file tree (e.g. WBS restructuring actions), Host MUST author a dedicated `## Target Directive Artifacts Synchronization (Context.md)` section in `Changelog.md` with explicit instructions and the updated file list for Layer 1. When issuing `FINAL_PASS` (where `PassCount == SP`), recursively purge all temporary diagnostic files in `<repo-root>/.scratch/*` (including `.scratch/deep_review/`, idempotently handling missing directories).

## Role Summoning Table

| Role Identifier | Guide Reference Path | Output Artifact Path |
| :--- | :--- | :--- |
| `Architect` | `<skill-root>/ARCHITECT-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Architect.md` |
| `Progress` | `<skill-root>/PROGRESS-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Progress.md` |
| `Readiness` | `<skill-root>/READINESS-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Readiness.md` |
| `Security` | `<skill-root>/SECURITY-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Security.md` |
| `DataMigration` | `<skill-root>/DATA-MIGRATION-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/DataMigration.md` |
| `Testability` | `<skill-root>/TESTABILITY-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Testability.md` |
| `Logic` | `<skill-root>/LOGIC-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Logic.md` |
| `Edgecase` | `<skill-root>/EDGECASE-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Edgecase.md` |
| `Performance` | `<skill-root>/PERFORMANCE-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Performance.md` |
| `Observability` | `<skill-root>/OBSERVABILITY-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/Observability.md` |
| `UXUI` | `<skill-root>/UXUI-REVIEWER-GUIDE.md` | `.scratch/deep_review/reports/UXUI.md` |
