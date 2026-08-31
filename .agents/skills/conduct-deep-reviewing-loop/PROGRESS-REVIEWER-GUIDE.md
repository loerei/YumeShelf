# Progress & Work Breakdown Reviewer Guide

Audits whether the Directive Artifact (DA) establishes an optimal, incremental, and dependency-sound execution progression across phases, milestones, and tickets.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat all phase breakdowns, ticket boundaries, and sequencing as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL progress, sequencing, and work-breakdown defects across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground ticket breakdowns in actual codebase dependencies and test suites. Do NOT demand speculative ticket splits for stable, working modules.
- Follow Postel's Law: Preserve backward-compatible decoding during transitional milestone phases.

## Mandatory Audit Questions

1. **Tracer-Bullet Granularity**: Is each ticket a thin, independently testable, single-responsibility vertical slice that can be implemented and verified without waiting for the entire phase? Are monolithic tickets (> 300-500 LOC or multi-concern scopes) identified for splitting?
2. **Dependency & Sequencing Soundness**: Is the execution order topologically sound? Are there forward-dependencies (e.g. Ticket N depending on unbuilt APIs from Ticket N+2) or circular dependencies across tickets and phases?
3. **Phase & Milestone Boundaries**: Does Phase 0 / baseline milestones deliver an MVP / verifiable foundation without scope creep from subsequent phases? Are phase prerequisites explicitly specified?
4. **Prerequisite & Seam Unlocking**: Does early ticket sequencing prioritize unblocking test seams, fixtures, and interfaces needed by subsequent tickets?

## Work Breakdown Restructuring Actions Catalog

When restructuring multi-phase PRDs or tickets, reviewers MUST formulate findings using these structured action primitives:

### 1. Macro & Phase-Level Actions (PRD ↔ PRD)
- **`MERGE_PRDS`**: Consolidate tightly coupled or circular PRDs into a single unified phase to eliminate artificial boundaries.
- **`SPLIT_PRD`**: Decompose an overloaded PRD into sequential phases (e.g., Phase A: Core Engine MVP -> Phase B: Ecosystem/UI).
- **`REORDER_PHASES`**: Re-sequence execution order when a downstream phase contains mandatory architectural prerequisites for an upstream phase.

### 2. Cross-Level Actions (PRD ↔ Ticket)
- **`EXTRACT_PRD_FROM_TICKETS`**: Extract a cluster of related tickets from an existing PRD into a new standalone PRD/Phase when they form an independent subsystem.
- **`RELOCATE_TICKET`**: Move a ticket from a later phase to an earlier phase (e.g., promoting test fixtures or binary parsers to Phase 0) or defer a non-essential ticket to a later phase.
- **`DEMOTE_PRD_TO_TICKET`**: Demote an overly trivial PRD into a single ticket within an existing parent PRD.

### 3. Micro & Ticket-Level Actions (Ticket ↔ Ticket)
- **`SPLIT_TICKET_TRACER_BULLETS`**: Split a monolithic ticket into sequential tracer bullets using **Hierarchical Dot Notation** (e.g., `Ticket 3` $\rightarrow$ `Ticket 3.1` and `Ticket 3.2`; `Ticket 3.2` $\rightarrow$ `Ticket 3.2.1` and `Ticket 3.2.2`). NEVER renumber subsequent tickets (`04 -> 05`).
- **`MERGE_TICKETS`**: Combine fragmented tickets that cannot be independently tested or delivered in isolation into a single cohesive ticket.
- **`REORDER_TICKETS`**: Re-sequence tickets within a phase to build data models, contracts, and test seams before consuming logic.
- **`INJECT_SCAFFOLDING_TICKET`**: Author a new prerequisite ticket for missing test byte fixtures, mock providers, or CLI developer utilities (`.devutil/`).

### Hierarchical Dot-Splitting & Anti-Renumbering Directives
1. **Hierarchical Dot Notation (`X.1, X.2 ... X.n`)**: When decomposing a ticket, MUST use symmetrical dot notation (`3.1, 3.2` rather than `3, 3b` or `3a, 3b`). Arbitrary nesting depth (`3.2.1, 3.2.2 ... 3.2.n`) is fully authorized and encouraged whenever sub-scopes require granular tracer bullets.
2. **Anti-Cascading Renumbering**: NEVER shift/renumber downstream tickets (e.g. do NOT rename `04` to `05` when splitting `03`). Downstream dependencies that depended on `3` automatically converge to depend on the terminal child node (`3.2` or `3.2.n`).
3. **No Splitting Immunity (Ticket Number/Depth is NOT a Metric)**: A ticket having a deeply nested number (e.g., `3.2.1.2`) does NOT grant it immunity from further splitting, nor does it make the work breakdown "clean". Audit tickets purely on technical scope, cyclomatic complexity, and tracer-bullet boundaries. If a deeply nested ticket still violates granularity criteria, SPLIT IT FURTHER without hesitation. Ticket numbering/depth must NEVER be used as an evaluation metric.

### 4. Nano & Step-Level Actions (Step ↔ Step / Checkbox Inside Ticket)
- **`SPLIT_STEP`**: Decompose a multi-concern, overloaded checkbox (`- [ ]`) into atomic, single-turn executable steps.
- **`REORDER_STEPS`**: Re-sequence checkboxes within a ticket (e.g. interfaces/fixtures first -> core logic -> edge cases -> verification).
- **`EXTRACT_STEP_TO_TICKET`**: Promote a high-complexity or scope-creeping step out of a ticket into a dedicated prerequisite/subsequent ticket.
- **`INJECT_VERIFICATION_STEP`**: Add a dedicated automated test/harness execution step (`- [ ]`) with stdout verification after complex modifications.
- **`ISOLATE_STEP_TIDYING`**: Separate structural refactoring steps ($S$) from behavioral feature steps ($B$) within ticket execution checklists.

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Feature WBS & Slicing** | Feature breakdown structure, PR line-count thresholds, vertical tracer-bullet slicing, S -> B structural tidying isolation, Kent Beck 4 Decision Gates | [`PROG-FEATURE-BREAKDOWN.md`](PROG-FEATURE-BREAKDOWN.md) |
| **Migration Phasing & Rollout** | Multi-phase system migrations, legacy deprecations, blue/green rollout schedules | [`PROG-MIGRATION-PHASING.md`](PROG-MIGRATION-PHASING.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if tickets are monolithic/unsplit, have broken/forward dependencies, leak scope across phase boundaries, or lack incremental verifiability.
- Return `STATUS: PASS` if the work breakdown structure is strictly incremental, dependency-sound, and granularly decomposed into tracer bullets.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/Progress.md` via `write_to_file` using this format:

### Review Evaluation: Progress & Work Breakdown Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[<ACTION_NAME>] <Issue Title 1>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Target Destination**: `<Target_Files_or_New_PRD_Path>`
   - **Technical Rationale**: <Why this restructuring is required for incremental deliverability or dependency soundness>
   - **Required Transformation**: <Step-by-step instructions on splitting, merging, extracting, or reordering>

2. **[<ACTION_NAME>] <Issue Title 2>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Target Destination**: `<Target_Files_or_New_PRD_Path>`
   - **Technical Rationale**: <Why this restructuring is required for incremental deliverability or dependency soundness>
   - **Required Transformation**: <Step-by-step instructions on splitting, merging, extracting, or reordering>

### Suggestions for Improvement (Non-blocking):

- <Optional roadmap polish or backlog consideration that does NOT block PASS status>
