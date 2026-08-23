# Layer 2 Review Host Operational Guide

Instructions for Review Host to route Layer 3 reviewers, filter feedback, and enforce DAG gates.

## Core Responsibilities

1. **Workspace Preparation**: Purge all files in `scratch/deep_review/reports/` strictly at round start (before executing the first active tier) and before launching a Full Sweep pass (preserving intra-tier reports within an active pass). Validate `scratch/deep_review/Context.md` without overwriting criteria or `SP`.
2. **DAG Routing & Targeted Execution**:
   - If `scratch/deep_review/host/Changelog.md` exists: Reset `PassCount = 0`, determine highest modified tier for Targeted DAG routing per `PROTOCOL.md` Section 4, then delete `scratch/deep_review/host/Changelog.md` before invoking reviewers.
   - If `scratch/deep_review/host/Changelog.md` is absent:
     - If previous `host/Analyzation.md` recorded `ROUND_PASS`: Read active `PassCount` and run Full Sweep on the static DA.
     - Else (Round 1): Initialize `PassCount = 0` and run Full DAG (Tier 3.1 -> 3.2 -> 3.3 -> 3.4).
   - MUST use the invariant invocation template from `PROTOCOL.md` Section 3 with `<guide_path>` dynamically resolved relative to the active skill location and neutral tool metadata (`toolAction: "Summoning reviewer"`, `toolSummary: "Domain review"`). NEVER inject round numbers or phase names into reviewer prompts.
3. **Early Suspension**: If a tier returns `REVISION NEEDED`, cancel downstream tiers for that round.
4. **Full Sweep Clearance**: When all targeted roles pass (`TARGETED_PASS`), purge `reports/` and run a Full Sweep across all 6 roles on the static DA snapshot before issuing `FINAL_PASS` or incrementing `PassCount`.
5. **Reporting**: Evaluate Layer 3 reports from `scratch/deep_review/reports/` using `HOW-TO-PICK-UP-THE-RIGHT-OPINIONS.md`. Record `Current PassCount: <N> / <SP>`, write `scratch/deep_review/host/Analyzation.md` and `scratch/deep_review/host/Changelog.md`.

## Role Summoning Table

| Role Identifier | Guide Reference Path | Output Artifact Path |
| :--- | :--- | :--- |
| `Architect` | `<skill-root>/ARCHITECT-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/Architect.md` |
| `Readiness` | `<skill-root>/READINESS-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/Readiness.md` |
| `Security` | `<skill-root>/SECURITY-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/Security.md` |
| `Logic` | `<skill-root>/LOGIC-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/Logic.md` |
| `Edgecase` | `<skill-root>/EDGECASE-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/Edgecase.md` |
| `UXUI` | `<skill-root>/UXUI-REVIEWER-GUIDE.md` | `scratch/deep_review/reports/UXUI.md` |
