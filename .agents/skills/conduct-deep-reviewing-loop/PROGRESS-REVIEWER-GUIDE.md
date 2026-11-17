# Progress Reviewer Guide

Audits whether the Directive Artifact (DA) establishes an incremental, dependency-ordered execution progression across phases, milestones, and tickets.

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, and this guide. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Finding Capture (`<review_dir>/sandbox/Progress/Findings.md`)**: To prevent "lost-in-the-middle" context drift across large multi-ticket epics, immediately append every discovered WBS gap, dependency cycle, unsequenced step, or horizontal slicing defect to `<review_dir>/sandbox/Progress/Findings.md` as lightweight notes (ticket/file location, defect description, affected dependencies, proposed restructuring) as you audit each section. NEVER write prematurely to `<review_dir>/reports/Progress.md` while reading.
  - **Cross-Ticket Synthesis & Forward Simulation**: Once the entire DA is scanned end-to-end, review `Findings.md` holistically to reconcile cross-ticket execution ordering, eliminate false positives, group shared root causes, mentally apply all proposed transformations, and re-audit the projected ticket DAG. Report all WBS, sequencing, and slicing defects in one pass, then synthesize and write the final evaluation to `<review_dir>/reports/Progress.md` via your native file-writing tool.
- **Lineage & Operational Continuity Alignment**:
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md` so target tickets do not duplicate or invert `Upstream` milestones.
  - Read `## Operational Continuity` in `<review_dir>/Context.md` and enforce the matching phasing/slicing model:

| Operational Continuity Mode | Required Phasing & Verification Model |
| :--- | :--- |
| `CONTINUOUS_OPERATION` *(default: 24/7 live service)* | Enforce vertical tracer-bullet slicing (UI-to-DB), zero-downtime $N$ & $N+1$ compatibility, and expand-contract phasing at every ticket. |
| `NON_CONTINUOUS_OPERATION` *(tag `!NC`: offline upgrades/refactors, local/desktop/CLI apps, greenfield builds, or isolated rewrite branches)* | Permit horizontal foundation phasing during implementation; BAN throwaway UI mocks on early tickets and BAN 24/7 multi-deploy dual-write shims; enforce headless atomic testability on early tickets, sequential migration script staging ($S \to B$) when persistent schemas evolve, and full system cutover with bootable verification + legacy decommissioning at the terminal ticket. |
| `NON_CONTINUOUS_INTERMEDIATE` *(tag `!NC0` / `!NCI`: intermediate scaffolding)* | Enforce headless contract verification (unit tests, typecheck, export schemas) and downstream handoff integrity only. BAN demanding application bootability, UI rendering, migration runners, or runtime cutovers during OR after the epic. |
- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced modules, files, and tickets exist and boundary contracts remain symmetrical across split/reordered tickets.
  - Never flag syntax/type trivia in illustrative code snippets as blocking; demand an Acceptance Criterion instead.
  - **Observer Identity**: Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  - Classify as **Blocking Defect** only issues that silently cause delivery deadlocks, unverified big-bang integration accumulation, forward/circular dependencies, or unexecutable slices for a headless AI implementer (include `Why This Would Be Missed`). If a ticket premise is impossible under platform bounds, return `STATUS: INFEASIBLE`.

## 2. Mandatory Audit Checklist & WBS Action Primitives

1. **Ticket Granularity & Atomic Checkboxes**: Is every ticket an independently verifiable slice, and is every `- [ ]` step a single-turn atomic modification followed by automated verification?
2. **Topological DAG Soundness**: Are ticket and step sequences strictly acyclic with zero forward dependencies (e.g. Ticket $N$ consuming APIs built in Ticket $N+2$)?
3. **Tidy First Isolation ($S \to B$)**: Are preparatory structural refactorings ($S$), config modernizations, and schema migration runner setups isolated into prerequisite steps/tickets before behavioral feature steps ($B$)?
4. **Plan Decomposition Threshold**: Does a single-file plan bundle 2+ discrete deliverables requiring staged sequential verification gates (requiring `DECOMPOSE_PLAN_TO_PRD_AND_TICKETS`), or is it a single cohesive deliverable verifiable in one test run (which MUST remain a single file)?

### Structured WBS Action Primitives
Formulate every blocking finding using one of these exact action tags:
- **Document-Level**: `DECOMPOSE_PLAN_TO_PRD_AND_TICKETS` (splits multi-gate single-file plan into `<epic_dir>/PRD.md` + `<epic_dir>/tickets/01-...md`).
- **Macro (PRD ↔ PRD)**: `MERGE_PRDS`, `SPLIT_PRD`, `REORDER_PHASES`.
- **Cross-Level (PRD ↔ Ticket)**: `EXTRACT_PRD_FROM_TICKETS`, `RELOCATE_TICKET`, `DEMOTE_PRD_TO_TICKET`.
- **Micro (Ticket ↔ Ticket)**: `SPLIT_TICKET_TRACER_BULLETS` (MUST use symmetrical **Hierarchical Dot Notation** `3.1, 3.2` or `3.2.1, 3.2.2`; **NEVER renumber downstream tickets** `04 -> 05`), `MERGE_TICKETS`, `REORDER_TICKETS`, `INJECT_SCAFFOLDING_TICKET`, `[IMPASSE]`.
- **Nano (Step ↔ Step inside Ticket)**: `SPLIT_STEP`, `REORDER_STEPS`, `EXTRACT_STEP_TO_TICKET`, `INJECT_VERIFICATION_STEP`, `ISOLATE_STEP_TIDYING`.

## 3. Domain Subdocuments Routing Table

Always load `PROG-COMMON-WBS.md`, plus the subdocument matching `## Operational Continuity` in `Context.md`:

| Target Operational Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Universal WBS Invariants** | Mandatory for all Progress audits | [`PROG-COMMON-WBS.md`](PROG-COMMON-WBS.md) |
| **24/7 Continuous Operation** | `Operational Continuity: CONTINUOUS_OPERATION` in `Context.md` | [`PROG-CONTINUOUS-OPERATION.md`](PROG-CONTINUOUS-OPERATION.md) |
| **Non-Continuous / Offline / Intermediate** | `NON_CONTINUOUS_OPERATION` (`!NC`) or `NON_CONTINUOUS_INTERMEDIATE` (`!NC0` / `!NCI`) in `Context.md` | [`PROG-NON-CONTINUOUS-OPERATION.md`](PROG-NON-CONTINUOUS-OPERATION.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Progress.md` via your native file-writing tool, then notify Host via `send_message`:
- `STATUS: PASS`: WBS is dependency-sound, properly sliced for its continuity mode, and incrementally verifiable.
- `STATUS: REVISIONS NEEDED`: Monolithic multi-gate plans, forward/circular dependencies, mixed $S+B$ steps, or missing verification gates exist.
- `STATUS: INFEASIBLE`: Core ticket/phase premise violates hard platform constraints (takes overall status precedence).

```markdown
### Review Evaluation: Progress

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable WBS Defects -->
1. **[<ACTION_NAME>] <Issue Title>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Target Destination**: `<Target_Files_or_New_PRD_Path>`
   - **Technical Rationale**: <Why restructuring is required for dependency soundness or continuity alignment>
   - **Why This Would Be Missed**: <Why headless AI implementation hits a deadlock, forward dependency, or big-bang failure>
   - **Required Transformation**: <Diff-ready WBS transformation specifying: (1) exact split/merged/reordered steps or tickets, (2) symmetrical interface, Blocked-by DAG, and [NEW]/[MODIFY]/[DELETE] file manifest updates across PRD and sibling tickets, and (3) synchronized Verification Command & Acceptance Criteria updates>
   - **Ground-Truth Proof**: <Verified codebase/spec paths and non-colliding target locations>
   - **Macro Flow Proof**: <Proof that the resulting phase/ticket DAG is acyclic and verifiable>

<!-- For Infeasible WBS Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[IMPASSE] <Issue Title>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Technical Rationale**: <Why the ticket/phase premise is impossible>
   - **Infeasibility Proof**: <Empirical proof of hard platform constraint>
   - **Alternative Architectural Paths**: <Viable pivot options>
   - **Macro Flow Proof**: <Impact on milestone dependency DAG>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Progress_Gated_Issues.md`, read it via your native file-reading tool, execute ONE action below, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `<review_dir>/reports/Progress.md` in-place via your native file-writing tool to supply verified Ground-Truth/Macro Flow proofs, symmetrical boundary updates, or harmonized section assertions.
2. **Remove**: Edit `<review_dir>/reports/Progress.md` in-place to remove the invalid/false-positive issue (e.g. demanding vertical slicing on `!NC` or decomposing a cohesive single-run plan) and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Progress_Explain.md` with deeper codebase dependency evidence AND update `<review_dir>/reports/Progress.md` in-place. NEVER repeat stale arguments.
