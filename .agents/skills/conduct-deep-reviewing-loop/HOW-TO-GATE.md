# How to Pick Up the Right Opinions (Critical Gate Guide)

Instructions for Layer 2 Critical Gate Agent to evaluate, filter, and reject Layer 3 Reviewer feedback.

## Core Evaluation Principles

1. **Evidence over Assertion**: Reject reviewer feedback that lacks concrete line/section citations or codebase evidence.
2. **Zero Sycophancy**: Reject over-engineered suggestions added merely to generate review content.
3. **Scope Boundary Protection**: Reject unrequested features, premature refactorings, or unnecessary abstractions outside user criteria.
4. **Clean Integration**: Convert accepted feedback into direct, native specification requirements without meta-tags or reviewer references.
5. **Ground-Truth Verification**: Reject feedback that introduces theoretical error classes, fail-fast deserialization barriers, or breaking contract changes on active modules unless existing code and tests support that invariant without regression (Chesterton's Fence).
6. **Dependency Lineage & Boundary Protection**:
   - **ACCEPT** findings where the target DA contradicts or drifts from an `Upstream` DA schema/seam (*Spec Drift*), or where the target DA duplicates responsibilities belonging to an `Upstream` DA (*Spec Bloat*).
   - **REJECT** findings where a reviewer claims unreadiness or missing files on disk that are explicitly declared to be implemented in an un-implemented `Upstream` DA (*False-Positive Upstream Unreadiness*).
   - **REJECT** findings where a reviewer demands tightly coupling the target DA to future `Downstream` epics (*Premature Downstream Coupling*).
7. **Reviewer-Driven Fix Refinement & Gating**: When a reported defect contains ungrounded code snippets, non-existent APIs, lacks Ground-Truth/Macro Flow proof, breaks boundary contract symmetry, introduces intra-DA contradictions, or represents an invalid defect, Host does not rewrite the snippet, unilaterally invent boundary counterparts, or unilaterally sanitize/reject it into Changelog.md. Instead, Host gates the issue in `.scratch/deep-review/reports/<Role>_Gated_Issues.md`, requiring the reviewer to either refine/complete the fix, remove the defect, or provide deeper proof.


## Triage Matrix

| Reviewer Finding Category | Gate Criterion | Action |
| :--- | :--- | :--- |
| **Architectural Invalidation** | Design reduces complexity, removes bottlenecks, or fixes contract breaks. | **ACCEPT**: Add to `host/Changelog.md`. Invalidate downstream tiers. |
| **Lineage Contract Drift** | Target DA contradicts data models, types, or seams defined in an `Upstream` DA. | **ACCEPT**: Align target DA with upstream contracts in `host/Changelog.md`. Invalidate downstream tiers. |
| **Lineage Spec Bloat** | Target DA duplicates or re-implements mechanisms already governed by an `Upstream` DA. | **ACCEPT**: Remove duplicated scope and delegate to upstream DA in `host/Changelog.md`. |
| **Progress / Roadmap Invalidation** | Monolithic ticket blocks incremental delivery, forward/circular ticket dependency, or phase boundary leak. | **ACCEPT**: Add ticket splitting/re-ordering or scope isolation requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Missing Edge Case / Safety** | Unhandled empty state, race condition, security flaw, or data corruption path. | **ACCEPT**: Add concrete guard requirement to `host/Changelog.md`. |
| **Codebase Unreadiness** | Dependency missing, target file missing/locked, API contract mismatch. | **ACCEPT**: Add prerequisite task step to `host/Changelog.md`. |
| **Schema / Migration Breakage** | Incompatible JSON payload, unbatched table lock, missing rollback or ACID violation. | **ACCEPT**: Add migration safety requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Untestable Design / Missing Seams** | Tightly coupled globals/clocks, flaky test strategies, missing verification coverage. | **ACCEPT**: Add test seam or test requirement to `host/Changelog.md`. Invalidate downstream tiers. |
| **Performance & Resource Leaks** | O(N^2) complexity in hot-path, N+1 queries, unclosed handles or unbounded memory cache. | **ACCEPT**: Add optimization/resource cleanup requirement to `host/Changelog.md`. |
| **Unobservable Operational Path** | Missing contextual telemetry in catch blocks, unredacted secrets/PII, missing kill-switch. | **ACCEPT**: Add telemetry/flag requirement to `host/Changelog.md`. |
| **UX/UI Redundancy** | UI element adds user friction, duplicates existing component, or breaks consistency. | **ACCEPT**: Instruct removal or simplification in `host/Changelog.md`. |
| **Ungrounded Fix Proposal** | Primary defect is valid and accepted under a domain category, but proposed remediation cites non-existent APIs, creates ordering/scoping defects, prescribes concrete CSS/DOM code snippets from analytical UXUI reviewers, forces root theme tokens on fixed dark surfaces, uses native HTML disabled on focused controls causing focus eviction, or lacks Ground-Truth/Macro Flow proof. | **GATE**: Demand reviewer refinement in `<Role>_Gated_Issues.md`. Reviewer refines `<Role>.md` in-place (converting into an abstract behavioral specification with acceptance criteria or supplying verified surface-scoped/non-evicting tokens/lifecycles) or explains in `<Role>_Explain.md` (updating `<Role>.md`). |
| **Asymmetric Boundary Contract** | Primary defect is valid, but proposed remediation modifies an internal communication boundary (IPC, RPC, Event, API route, Message queue) while omitting the synchronized update for the corresponding caller, listener, or shared constants/types file. | **GATE**: Demand reviewer completion in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to include all internal boundary endpoints or shared constants. |
| **Cross-Section Contradiction** | Primary defect is valid, but proposed remediation modifies component behavior or data types in a way that directly contradicts existing assertions in the DA's `Verification Plan` or architectural specifications without including synchronized updates for those sections. | **GATE**: Demand reviewer alignment in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to harmonize dependent sections and test assertions. |
| **False-Positive Upstream Unreadiness** | Reviewer fails readiness for missing codebase files/methods that are explicitly assigned to an `Upstream` (Unimplemented) DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md` citing upstream DA ownership. Reviewer removes from `<Role>.md` or explains (updating `<Role>.md`). |
| **Premature Downstream Coupling** | Reviewer demands implementing features or specialized data types belonging to a `Downstream` DA inside the target DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md` citing downstream boundary. Reviewer removes from `<Role>.md` or explains (updating `<Role>.md`). |
| **Speculative Over-Engineering** | Demands premature optimization, unnecessary abstractions, or unrequested features. *Protection Exception: Demanding End-to-End Parameter Seams (options/constructor injection across leaf and intermediary layers), Orthogonal Governance Decoupling & Placement (extracting watchdogs/helpers into shared `src/utils/` directories, including scheduling new shared folders), or Scale Invariance is a valid architectural requirement and MUST be accepted, NOT gated as over-engineering or ungrounded.* | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md` citing lack of empirical evidence. Reviewer removes from `<Role>.md` or explains (updating `<Role>.md`). |
| **Pedantic / Stylistic Preference** | Requests rephrasing, renaming, or cosmetic adjustments without functional impact. Micro-copy and wording critiques MUST default to non-blocking suggestions unless phrasing is factually misleading or induces dangerous actions/destructive data loss. | **GATE FOR REMOVAL**: Demand reviewer removal or mark as non-blocking. Reviewer removes from blocking issues in `<Role>.md`. |
| **Spec-Induced Regression** | Demands strict exceptions or error classes on ingress/decode paths that contradict active codebase behavior or break existing unit tests without explicit user request. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md` citing codebase conflict. Reviewer removes from `<Role>.md` or explains (updating `<Role>.md`). |

### Tier Batch Gate & Reviewer Negotiation Protocol

Host evaluates Layer 3 reviewer reports strictly in **tier batches** (after all active roles in the current tier produce initial reports):

1. **Fully Accepted Reports**:
   - If all reported issues in a reviewer's report satisfy Ground-Truth and Macro Flow proofs and cite verified codebase/spec symbols: Host **ACCEPTS** the report.
   - Host does NOT author `<Role>_Gated_Issues.md` and does NOT send a message to that reviewer.

2. **Gated Reports & Action Demands**:
   - If any reported issue in a reviewer's report lacks proof, cites non-existent APIs, breaks macro flow, or constitutes an invalid defect: Host marks the issue as GATED.
   - Host authors `.scratch/deep-review/reports/<Role>_Gated_Issues.md` for each affected role simultaneously via native `write_to_file`.
   - In `<Role>_Gated_Issues.md`, Host explains why each issue failed the gate. Host places a single top-level `## Required Reviewer Action` section at the top of the file (defining the 3 Gate Response Protocol choices), followed by `## Gated Issues` listing each failure with its `Gate Failure Classification` and `Rationale`. Host MUST NOT suggest fix solutions or code snippets, and MUST NOT repeat the 3 action choices per individual issue.
   - **Host Suggestion Ban**: Host MUST NOT suggest alternative fix implementations, code snippets, or workarounds in `<Role>_Gated_Issues.md`. Remediation design is the sole specialist domain of the reviewer.
   - Host notifies all gated reviewers in the active tier batch via `send_message` in a single coordination wave.

3. **Reviewer Response Actions**:
   Upon receiving a notification, each gated reviewer inspects `<Role>_Gated_Issues.md` and chooses one of three actions:
   - **Action 1: Refine / Complete as Requested**: When the defect is real but the fix was ungrounded, asymmetric across boundaries, or introduces intra-DA contradictions, reviewer edits `<Role>.md` in-place via native `write_to_file`, resolving the gate failure (e.g. converting ungrounded code into an abstract specification, supplying missing caller/callee boundary endpoints, or harmonizing contradicting assertions in `Verification Plan`) with verified proofs. If `.scratch/deep-review/reports/<Role>_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.
   - **Action 2: Remove**: When the defect is invalid or false-positive, reviewer removes the issue from `<Role>.md` in-place. If all blocking defects are removed, reviewer changes status to `- **Status**: STATUS: PASS`. If `.scratch/deep-review/reports/<Role>_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.
   - **Action 3: Reject Gating/Removal and Explain**: When reviewer maintains the defect/fix is strictly valid and already complete, reviewer authors `.scratch/deep-review/reports/<Role>_Explain.md` via native `write_to_file`, providing deeper, differing codebase evidence. The reviewer MUST ALSO update `.scratch/deep-review/reports/<Role>.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text, ensuring `<Role>.md` remains the clean single source of truth for Host aggregation. Reviewer MUST NOT repeat stale arguments already addressed in `<Role>_Gated_Issues.md`.
   - After updating, reviewer sends a completion message back to Host.

4. **Host Re-Evaluation**:
   - Host waits for all gated reviewers in the tier batch to complete their responses.
   - Host inspects the updated `<Role>.md` and any `<Role>_Explain.md`.
   - If Host agrees with the update or explanation, Host accepts the role. Host does NOT send a confirmation message back to the reviewer once agreed.
   - If an issue remains ungrounded or explanation in `<Role>_Explain.md` is stale without differing/deeper ground-truth evidence, reviewer MUST either accept removal or refine the issue into an abstract specification or symmetrical contract; reviewer MUST NOT re-assert stale arguments. Host gates again until resolved.

## Specialist Trade-Off & Conflict Resolution

When specialist reviewer opinions conflict (e.g. `Performance` requesting aggressive caching vs `Observability` requesting unbuffered logging, or `Testability` demanding seam indirection vs `Architect` enforcing minimum complexity):
1. **Favor Correctness & Foundation over Optimization**: Structural seams and transactional safety take priority over premature caching.
2. **Favor Observability over Opaque Concurrency**: Telemetry context propagation takes priority over micro-benchmarked CPU cycle savings.
3. **Resolve Speculation**: If a requested abstraction or optimization does not solve an immediate requirement, reject it under Speculative Over-Engineering (preserving End-to-End Parameter Seams, Orthogonal Governance Decoupling, and Placement Altitude as valid structural requirements).
4. **Resolve GUI Layout vs Accessibility Conflicts (and Loading States)**: When visual layout stability (CLS), loading indicators, or empty accessibility landmarks conflict:
   - Enforce the Universal 3-tier precedence: (1) `Context.md` explicit user directives, (2) existing codebase conventions, (3) Default standards: smooth animated accordion transitions for empty dynamic slots (strictly preserving error recovery controls in `catch` blocks), top progress lines or inline spinners over heavy skeleton blocks (preventing skeleton shimmer flashes on fast local/desktop loads), and ephemeral Toast-based Undo rather than in-place layout-stalling slots.
   - For in-flight async actions, enforce `aria-disabled="true"` with interaction blocking over native HTML `disabled` to preserve continuous keyboard focus without eviction to `document.body`.
5. **Resolve Optimistic UI vs Transactional Safety**: When UXUI demands optimistic UI on transactional or destructive operations (e.g. file deletions, binary overwrites, database schema migrations, irreversible disk writes), reject the finding under Speculative Over-Engineering; optimistic updates are strictly reserved for non-destructive, idempotently reversible interactions.

## Decision Rules for Round Verdict

| Condition | Gate Verdict | Output Artifacts |
| :--- | :--- | :--- |
| 1+ Accepted Blocking Defects | `ROUND_REVISION_NEEDED` | Write `host/Analyzation.md` (accepted issues only with rationale), `host/Changelog.md` (clean edits aggregated from accepted `<Role>.md`), and `host/Untouched_Reviewers.md`. Intermediate round teardown terminates reviewer subagents via process control, but strictly preserves `.scratch/deep-review/` artifacts for Layer 1. |
| 0 Accepted Blocking Defects (Targeted Pass with Pending Skipped Roles) | `TARGETED_PASS` *(Ephemeral Internal Host State)* | Trigger Snapshot Delta Backfill for skipped roles (upstream + untouched) in topological DAG sequence (preserving intra-round reports). |
| 0 Accepted Blocking Defects (100% Roster Passed on Snapshot) | `ROUND_PASS` (Increment `PassCount`) or `FINAL_PASS` (if `PassCount >= SP`) | Write `host/Analyzation.md`. Terminate reviewer subagents via process control, purge `reports/` and transient gating artifacts (if present, idempotently handling missing files), but strictly preserve `host/Analyzation.md` for Layer 1 handoff. On `FINAL_PASS`, Layer 1 executes directory teardown after presenting the verified DA. |

## <Role>_Gated_Issues.md Authoring Standards

When authoring `.scratch/deep-review/reports/<Role>_Gated_Issues.md`:
1. Place a single top-level `## Required Reviewer Action` block at the top of the file without repeating action choices per issue.
2. List gated issues under `## Gated Issues` with failure classification and technical rationale.
3. Strict suggestion ban: MUST NOT propose alternative fix implementations or code snippets.

Format template:
```markdown
# Gated Issues: <Role>

## Required Reviewer Action
Read the gated issues below. For each issue, choose ONE action:
1. **Refine / Complete as Requested**: Update `<Role>.md` in-place, resolving the gate failure (e.g. converting ungrounded snippets into an abstract specification, supplying missing symmetrical boundary endpoints, or harmonizing contradicting assertions in dependent sections) with verified proofs. Invalidate `<Role>_Explain.md` (delete or overwrite with empty content via `write_to_file(CodeContent="")`) if previously authored.
2. **Remove**: Remove the issue from `<Role>.md` in-place (set status to PASS if zero blocking issues remain). Invalidate `<Role>_Explain.md` (delete or overwrite with empty content via `write_to_file(CodeContent="")`) if previously authored.
3. **Reject Gating/Removal and Explain**: Author `<Role>_Explain.md` with differing/deeper codebase proof AND update `<Role>.md` in-place with verified proofs and clean remediation text.
Notify Host via message when done.

## Gated Issues

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Gate Failure Classification**: `Ungrounded Fix Proposal` | `Asymmetric Boundary Contract` | `Cross-Section Contradiction` | `False-Positive Upstream Unreadiness` | `Premature Downstream Coupling` | `Speculative Over-Engineering` | `Spec-Induced Regression`
   - **Gate Rationale**: <Exact technical reason why issue failed the gate without proposing fix code>
```

## Analyzation.md Authoring Standards

When authoring `.scratch/deep-review/host/Analyzation.md`:
1. **Mandatory Header & Gate Verdict**: Record the Executive Summary header containing:
   - `- **Gate Verdict**: ROUND_REVISION_NEEDED | ROUND_PASS | FINAL_PASS`
   - `- **Current PassCount**: <N> / <SP>`
   - `- **Active Roster**: <List of active roles>`
2. **Accepted Issues Only**: Record ONLY the blocking issues that successfully cleared the gate across active roles, along with their technical acceptance rationale. When the gate verdict is `ROUND_PASS` or `FINAL_PASS` (zero blocking defects across the active roster), record under Accepted Issues:
   ```markdown
   ## Accepted Issues
   *(None - All active roles cleared with zero blocking defects)*
   ```
3. **Zero Rejected / Gated Tables**: Do NOT include tables of rejected or gated issues in `Analyzation.md`. All rejection, removal, and refinement actions are resolved directly with reviewers in `reports/<Role>_Gated_Issues.md` and reflected in-place in clean `<Role>.md` files.

## Changelog.md Authoring Standards

When authoring `.scratch/deep-review/host/Changelog.md` for `ROUND_REVISION_NEEDED`:
1. **Structural Anchoring & Remediations**: Aggregate BOTH the structural destination anchor (`Target Section` for standard roles, or `Target Scope / Source` and `Target Destination` for Progress) AND the verified remediation (`Required Fix` or `Required Transformation`) from accepted `<Role>.md` reports.
2. **Clean & Native Spec Diffs**: Write direct, actionable modification instructions indicating precisely which file and section to modify, without meta-tags or reviewer references.
3. **Mandatory Context DA Tree Synchronization**: If accepted feedback splits, merges, creates, deletes, or moves Directive Artifact files (e.g. Progress Reviewer WBS actions), include a dedicated section:
   - `## Target Directive Artifacts Synchronization (Context.md)`: Instruct Layer 1 to update `## Target Directive Artifacts` in `.scratch/deep-review/Context.md` with the updated list of active DA paths.
4. **Verified Code Snippets**: When providing code snippets in `Changelog.md`, verify that all referenced pre-existing symbols exist and compile against the active codebase, or align with planned declarations in the target DA or upstream specs, and that newly proposed symbols do not collide with active exports.
5. **Boundary Contract Symmetry Validation**: `Changelog.md` MUST verify that any boundary interface modification already includes symmetrical updates for both producer/caller and all internal consumer/handler endpoints (or shared constants/types) directly from the accepted `<Role>.md` reports; Host MUST NOT emit 1-sided boundary modifications, and MUST NOT unilaterally author missing endpoints (gating them to reviewers instead).
6. **DA Cross-Section Coherence Validation**: `Changelog.md` MUST verify that any modification altering component contracts already includes synchronized updates for dependent sections (e.g. `Verification Plan` assertions) directly from accepted `<Role>.md` reports; Host MUST NOT emit self-contradicting DA diffs, and MUST NOT unilaterally author missing verification assertions (gating them to reviewers instead).

## Untouched_Reviewers.md Authoring Standards

When authoring `.scratch/deep-review/host/Untouched_Reviewers.md` for `ROUND_REVISION_NEEDED`:
1. **Active Roster Scope**: Evaluate all `INCLUDED` reviewers from `.scratch/deep-review/host/Reviewer_Choice_Rationale.md`.
2. **Strict Untouched Criteria**: A reviewer is listed ONLY IF the proposed diffs in `Changelog.md` introduce zero modifications, additions, or regressions relevant to that reviewer's domain checklist.
3. **Streamlined 2-Column Layout**: Write `.scratch/deep-review/host/Untouched_Reviewers.md` using this format:
   ```markdown
   # Untouched Reviewers

   | Role Identifier | Technical Rationale |
   | :--- | :--- |
   | `<Role>` | <Explanation why Changelog diffs do not touch this role's contracts or domain> |
   ```
   *When all active roles are affected (zero untouched roles), write explicitly:*
   ```markdown
   # Untouched Reviewers

   | Role Identifier | Technical Rationale |
   | :--- | :--- |
   | *(None)* | Diffs in Changelog touch shared core abstractions and data models, invalidating all active roles. |
   ```
4. **Conservative Fallback**: If there is any ambiguity on whether a diff might affect a role, omit it from `Untouched_Reviewers.md` to ensure immediate re-audit.
