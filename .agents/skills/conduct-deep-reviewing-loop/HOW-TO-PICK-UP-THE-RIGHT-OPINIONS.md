# How to Pick Up the Right Opinions (Critical Gate Guide)

Instructions for Layer 2 Critical Gate Agent to evaluate, filter, and reject Layer 3 Reviewer feedback.

## Core Evaluation Principles

1. **Evidence over Assertion**: Reject reviewer feedback that lacks concrete line/section citations or codebase evidence.
2. **Zero Sycophancy**: Reject over-engineered suggestions added merely to generate review content.
3. **Scope Boundary Protection**: Reject unrequested features, premature refactorings, or unnecessary abstractions outside user criteria.
4. **Clean Integration**: Convert accepted feedback into direct, native specification requirements without meta-tags or reviewer references.

## Triage Matrix

| Reviewer Finding Category | Gate Criterion | Action |
| :--- | :--- | :--- |
| **Architectural Invalidation** | Design reduces complexity, removes bottlenecks, or fixes contract breaks. | **ACCEPT**: Add to `Changelog.md`. Invalidate downstream tiers. |
| **Missing Edge Case / Safety** | Unhandled empty state, race condition, security flaw, or data corruption path. | **ACCEPT**: Add concrete guard requirement to `Changelog.md`. |
| **Codebase Unreadiness** | Dependency missing, target file missing/locked, API contract mismatch. | **ACCEPT**: Add prerequisite task step to `Changelog.md`. |
| **UX/UI Redundancy** | UI element adds user friction, duplicates existing component, or breaks consistency. | **ACCEPT**: Instruct removal or simplification in `Changelog.md`. |
| **Speculative Over-Engineering** | Demands premature optimization, unnecessary abstractions, or unrequested features. | **REJECT**: Record rejection rationale in `Analyzation.md`. |
| **Pedantic / Stylistic Preference** | Requests rephrasing, renaming, or cosmetic adjustments without functional impact. | **REJECT**: Mark as non-blocking in `Analyzation.md`. |

## Decision Rules for Round Verdict

| Condition | Gate Verdict | Output Artifacts |
| :--- | :--- | :--- |
| 1+ Accepted Blocking Defects | `ROUND_REVISION_NEEDED` | Write `Analyzation.md` (rationale) and `Changelog.md` (clean edits). |
| 0 Accepted Blocking Defects (Targeted Pass) | `TARGETED_PASS` | Trigger Full Sweep Round. |
| 0 Accepted Blocking Defects (Full Sweep Pass) | `ROUND_PASS` (Increment `PassCount`) or `FINAL_PASS` (if `PassCount >= SP`) | Write `Analyzation.md`. |
