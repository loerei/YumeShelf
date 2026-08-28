# How to Pick Up the Right Opinions (Critical Gate Guide)

Instructions for Layer 2 Critical Gate Agent to evaluate, filter, and reject Layer 3 Reviewer feedback.

## Core Evaluation Principles

1. **Evidence over Assertion**: Reject reviewer feedback that lacks concrete line/section citations or codebase evidence.
2. **Zero Sycophancy**: Reject over-engineered suggestions added merely to generate review content.
3. **Scope Boundary Protection**: Reject unrequested features, premature refactorings, or unnecessary abstractions outside user criteria.
4. **Clean Integration**: Convert accepted feedback into direct, native specification requirements without meta-tags or reviewer references.
5. **Ground-Truth Verification**: Reject feedback that introduces theoretical error classes, fail-fast deserialization barriers, or breaking contract changes on active modules unless existing code and tests support that invariant without regression (Chesterton's Fence).

## Triage Matrix

| Reviewer Finding Category | Gate Criterion | Action |
| :--- | :--- | :--- |
| **Architectural Invalidation** | Design reduces complexity, removes bottlenecks, or fixes contract breaks. | **ACCEPT**: Add to `host/Changelog.md`. Invalidate downstream tiers. |
| **Progress / Roadmap Invalidation** | Monolithic ticket blocks incremental delivery, forward/circular ticket dependency, or phase boundary leak. | **ACCEPT**: Add ticket splitting/re-ordering or scope isolation requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Missing Edge Case / Safety** | Unhandled empty state, race condition, security flaw, or data corruption path. | **ACCEPT**: Add concrete guard requirement to `host/Changelog.md`. |
| **Codebase Unreadiness** | Dependency missing, target file missing/locked, API contract mismatch. | **ACCEPT**: Add prerequisite task step to `host/Changelog.md`. |
| **Schema / Migration Breakage** | Incompatible JSON payload, unbatched table lock, missing rollback or ACID violation. | **ACCEPT**: Add migration safety requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Untestable Design / Missing Seams** | Tightly coupled globals/clocks, flaky test strategies, missing verification coverage. | **ACCEPT**: Add test seam or test requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Performance & Resource Leaks** | O(N^2) complexity in hot-path, N+1 queries, unclosed handles or unbounded memory cache. | **ACCEPT**: Add optimization/resource cleanup requirement to `host/Changelog.md`. |
| **Unobservable Operational Path** | Missing contextual telemetry in catch blocks, unredacted secrets/PII, missing kill-switch. | **ACCEPT**: Add telemetry/flag requirement to `host/Changelog.md`. |
| **UX/UI Redundancy** | UI element adds user friction, duplicates existing component, or breaks consistency. | **ACCEPT**: Instruct removal or simplification in `host/Changelog.md`. |
| **Speculative Over-Engineering** | Demands premature optimization, unnecessary abstractions, or unrequested features. | **REJECT**: Record rejection rationale in `host/Analyzation.md`. |
| **Pedantic / Stylistic Preference** | Requests rephrasing, renaming, or cosmetic adjustments without functional impact. | **REJECT**: Mark as non-blocking in `host/Analyzation.md`. |
| **Spec-Induced Regression** | Demands strict exceptions or error classes on ingress/decode paths that contradict active codebase behavior or break existing unit tests without explicit user request. | **REJECT**: Record rejection citing codebase conflict in `host/Analyzation.md`. |

## Specialist Trade-Off & Conflict Resolution

When specialist reviewer opinions conflict (e.g. `Performance` requesting aggressive caching vs `Observability` requesting unbuffered logging, or `Testability` demanding seam indirection vs `Architect` enforcing minimum complexity):
1. **Favor Correctness & Foundation over Optimization**: Structural seams and transactional safety take priority over premature caching.
2. **Favor Observability over Opaque Concurrency**: Telemetry context propagation takes priority over micro-benchmarked CPU cycle savings.
3. **Resolve Speculation**: If a requested abstraction or optimization does not solve an immediate requirement, reject it under Speculative Over-Engineering.

## Decision Rules for Round Verdict

| Condition | Gate Verdict | Output Artifacts |
| :--- | :--- | :--- |
| 1+ Accepted Blocking Defects | `ROUND_REVISION_NEEDED` | Write `host/Analyzation.md` (rationale) and `host/Changelog.md` (clean edits). |
| 0 Accepted Blocking Defects (Targeted Pass with Pending Upstream) | `TARGETED_PASS` *(Ephemeral Internal Host State)* | Trigger Snapshot Delta Backfill for skipped upstream roles in topological DAG sequence (preserving intra-round reports). |
| 0 Accepted Blocking Defects (100% Roster Passed on Snapshot) | `ROUND_PASS` (Increment `PassCount`) or `FINAL_PASS` (if `PassCount >= SP`) | Write `host/Analyzation.md`. |

## Changelog.md Authoring Standards

When authoring `scratch/deep_review/host/Changelog.md` for `ROUND_REVISION_NEEDED`:
1. **Clean & Native Spec Diffs**: Write direct, actionable modification instructions without meta-tags or reviewer references.
2. **Mandatory Context DA Tree Synchronization**: If accepted feedback splits, merges, creates, deletes, or moves Directive Artifact files (e.g. Progress Reviewer WBS actions), include a dedicated section:
   - `## Target Directive Artifacts Synchronization (Context.md)`: Instruct Layer 1 to update `## Target Directive Artifacts` in `scratch/deep_review/Context.md` with the updated list of active DA paths.
