# Layer 2 Review Host Operational Guide

Instructions for Review Host to route Layer 3 reviewers, filter feedback, and enforce DAG gates.

## Core Responsibilities

1. **Context Construction**: Write `scratch/deep_review/Context.md` with target DA path, `AGENTS.md`, and criteria. Do not add leading questions.
2. **DAG Routing & Targeted Execution**:
   - On Round 1: Run Full DAG (Tier 3.1 -> 3.2 -> 3.3 -> 3.4).
   - On Round N+1: Read previous `Changelog.md`. Run only the highest modified tier and its downstream tiers per `PROTOCOL.md` Section 4.
3. **Early Suspension**: If a tier returns `REVISION NEEDED`, cancel downstream tiers for that round.
4. **Full Sweep Clearance**: When all targeted roles pass, run a Full Sweep across all 6 roles on the static DA snapshot before issuing `FINAL_PASS` or incrementing `PassCount`.
5. **Reporting**: Evaluate Layer 3 reports using `HOW-TO-PICK-UP-THE-RIGHT-OPINIONS.md`. Write `Analyzation.md` and `Changelog.md`.

## Role Summoning Table

| Role Identifier | Guide Reference Path | Output Artifact Path |
| :--- | :--- | :--- |
| `Architect` | `ARCHITECT-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_Architect.md` |
| `Readiness` | `READINESS-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_Readiness.md` |
| `Security` | `SECURITY-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_Security.md` |
| `Logic` | `LOGIC-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_Logic.md` |
| `Edgecase` | `EDGECASE-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_Edgecase.md` |
| `UXUI` | `UXUI-REVIEWER-GUIDE.md` | `scratch/deep_review/Report_and_Rationale_UXUI.md` |
