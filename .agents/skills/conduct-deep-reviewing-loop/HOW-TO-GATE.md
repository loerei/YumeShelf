# How to Pick Up the Right Opinions (Critical Gate Guide)

Instructions for Layer 2 Critical Gate Agent to evaluate, filter, and reject Layer 3 Reviewer feedback.

## Core Evaluation Principles

1. **Evidence over Assertion**: Reject reviewer feedback that lacks concrete line/section citations or codebase evidence.
2. **Zero Sycophancy**: Reject over-engineered suggestions added merely to generate review content.
3. **Scope Boundary Protection**: Reject unrequested features, premature refactorings, or unnecessary abstractions outside user criteria.
4. **Clean Integration**: Convert accepted feedback into direct, native specification requirements without meta-tags or reviewer references.
5. **Ground-Truth Verification**: Reject feedback that introduces theoretical error classes, fail-fast deserialization barriers, or breaking contract changes on active modules unless existing code and tests support that invariant without regression.
6. **Dependency Lineage & Boundary Protection**:
   - **ACCEPT** findings where the target DA contradicts or drifts from an `Upstream` DA schema/seam (*Spec Drift*), or where the target DA duplicates responsibilities belonging to an `Upstream` DA (*Spec Bloat*).
   - **REJECT** findings where a reviewer claims unreadiness or missing files on disk that are explicitly declared to be implemented in an un-implemented `Upstream` DA (*False-Positive Upstream Unreadiness*).
   - **REJECT** findings where a reviewer demands tightly coupling the target DA to future `Downstream` epics (*Premature Downstream Coupling*).
7. **Reviewer-Driven Fix Refinement & Gating**: When a reported defect contains ungrounded code snippets, non-existent APIs, lacks Ground-Truth/Macro Flow proof, breaks boundary contract symmetry, introduces intra-DA contradictions, or represents an invalid defect, Host does not rewrite the snippet, unilaterally invent boundary counterparts, or unilaterally apply it directly into the DA. Instead, Host gates the issue in `<review_dir>/reports/<Role>_Gated_Issues.md`, requiring the reviewer to either refine/complete the fix, remove the defect, or provide deeper proof.
8. **System Invariants over Implementation Mechanics**: Gate against findings on internal code snippet mechanics (e.g. syntax, types, barrel exports, regex flags) or Acceptance Criteria that dictate internal call signatures and local null-checks. If an underlying behavioral requirement or system invariant is valid, demand the reviewer refine the Acceptance Criterion to enforce the system invariant (e.g. cache persistence, fallback continuity) without dictating internal mechanics. If no underlying invariant exists, demand removal.
9. **Technical Impasse & Grounded Infeasibility Verification**: When a reviewer reports `STATUS: INFEASIBLE` or an unfixable defect with `Infeasibility Proof`, Host verifies that the impasse is grounded in concrete technical evidence (e.g. sandbox restriction, protocol header, deprecated/missing external API, hardware bound). Host gates against speculative refusal or laziness where a standard architectural seam or configuration resolves the issue. If the impasse is verified, Host halts loop execution with verdict `PLAN_INFEASIBLE` and MUST NOT unilaterally mutate the DA to force an architectural pivot.

## Triage Matrix

| Reviewer Finding Category | Gate Criterion | Action |
| :--- | :--- | :--- |
| **Architectural Invalidation** | Design reduces complexity, removes bottlenecks, or fixes contract breaks. | **ACCEPT**: Stage for direct Host DA mutation in Step 7. Invalidate downstream tiers. |
| **Lineage Contract Drift** | Target DA contradicts data models, types, or seams defined in an `Upstream` DA. | **ACCEPT**: Align target DA with upstream contracts during Host DA mutation. Invalidate downstream tiers. |
| **Lineage Spec Bloat** | Target DA duplicates or re-implements mechanisms already governed by an `Upstream` DA. | **ACCEPT**: Remove duplicated scope and delegate to upstream DA during Host DA mutation. |
| **Progress / Roadmap Invalidation** | Monolithic ticket blocks incremental delivery, forward/circular ticket dependency, or phase boundary leak. | **ACCEPT**: Apply ticket splitting/re-ordering or scope isolation during Host DA mutation. Invalidate downstream tiers. |
| **Missing Edge Case / Safety** | Unhandled empty state, race condition, security flaw, or data corruption path. | **ACCEPT**: Add concrete guard requirement to target DA during Host DA mutation. |
| **Codebase Unreadiness** | Dependency missing, target file missing/locked, API contract mismatch. | **ACCEPT**: Add prerequisite task step to target DA during Host DA mutation. |
| **Schema / Migration Breakage** | Incompatible JSON payload, unbatched table lock, missing rollback or ACID violation. | **ACCEPT**: Add migration safety requirement to target DA during Host DA mutation. Invalidate downstream tiers. |
| **Untestable Design / Missing Seams** | Tightly coupled globals/clocks, flaky test strategies, missing verification coverage. | **ACCEPT**: Add test seam or test requirement to target DA during Host DA mutation. Invalidate downstream tiers. |
| **Performance & Resource Leaks** | O(N^2) complexity in hot-path, N+1 queries, unclosed handles or unbounded memory cache. | **ACCEPT**: Add optimization/resource cleanup requirement to target DA during Host DA mutation. |
| **Unobservable Operational Path** | Missing contextual telemetry in catch blocks, unredacted secrets/PII, missing kill-switch. | **ACCEPT**: Add telemetry/flag requirement to target DA during Host DA mutation. |
| **UX/UI Redundancy** | UI element adds user friction, duplicates existing component, or breaks consistency. | **ACCEPT**: Simplify or remove UI element in target DA during Host DA mutation. |
| **Ungrounded Fix Proposal** | Primary defect is valid, but proposed remediation cites non-existent APIs, creates ordering/scoping defects, prescribes concrete CSS/DOM code snippets from analytical UXUI reviewers, forces root theme tokens on fixed dark surfaces, uses native HTML disabled on focused controls causing focus eviction, or lacks Ground-Truth/Macro Flow proof. | **GATE**: Demand reviewer refinement in `<Role>_Gated_Issues.md`. Reviewer refines `<Role>.md` in-place or explains in `<Role>_Explain.md`. |
| **Asymmetric Boundary Contract** | Primary defect is valid, but proposed remediation modifies an internal communication boundary while omitting synchronized update for caller, listener, or shared constants/types file. | **GATE**: Demand reviewer completion in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to include all internal boundary endpoints. |
| **Cross-Section Contradiction** | Primary defect is valid, but proposed remediation modifies component behavior or data types contradicting existing assertions in the DA's `Verification Plan` without including synchronized updates for those sections. | **GATE**: Demand reviewer alignment in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to harmonize dependent sections and test assertions. |
| **False-Positive Upstream Unreadiness** | Reviewer fails readiness for missing codebase files/methods explicitly assigned to an `Upstream` (Unimplemented) DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Premature Downstream Coupling** | Reviewer demands implementing features or specialized data types belonging to a `Downstream` DA inside the target DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Speculative Over-Engineering** | Demands premature optimization, unnecessary abstractions, or unrequested features. *Protection Exception: Parameter Seams, Governance Decoupling, and Scale Invariance MUST be accepted.* | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Pedantic / Stylistic Preference** | Requests rephrasing, renaming, or cosmetic adjustments without functional impact. Micro-copy and wording critiques MUST default to non-blocking suggestions unless phrasing is factually misleading or induces dangerous actions/destructive data loss. | **GATE FOR REMOVAL**: Demand reviewer removal or mark as non-blocking. |
| **Spec-Induced Regression** | Demands strict exceptions or error classes on ingress/decode paths that contradict active codebase behavior or break existing unit tests without explicit user request. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Internal Implementation Mechanics** | Finding critiques syntax, types, barrel exports, regex flags, or packages internal call signatures / local null-checks into Acceptance Criteria that standard compiler or TDD catches. | **GATE FOR REFINEMENT / REMOVAL**: Demand reviewer strip internal call mechanics and refine the Acceptance Criterion to enforce the underlying System Invariant (if one exists), or remove the defect if it is purely compiler/local trivia. |
| **Technical Impasse / Platform Infeasibility** | Reviewer proves a ticket requirement is technically impossible (e.g. sandbox restrictions, protocol blocks, physical bounds) with no viable in-scope fix. | **ACCEPT AS IMPASSE**: Escalate to `PLAN_INFEASIBLE`. Do NOT mutate DA or force local patching. Cancel downstream tiers and halt round. |
| **Ungrounded Infeasibility Claim** | Reviewer reports `STATUS: INFEASIBLE` or asserts a technical impasse without concrete proof, where a viable in-scope structural seam or standard configuration resolves the issue. | **GATE**: Demand reviewer refinement in `<Role>_Gated_Issues.md` to either convert to `STATUS: REVISIONS NEEDED` with verified fix or substantiate with empirical proof, or remove. |

## Tier Batch Gate & Reviewer Negotiation Protocol

Host evaluates Layer 3 reviewer reports strictly in **tier batches** (after all active roles in the current tier produce initial reports):

1. **Fully Accepted Reports**:
   - If all reported issues in a reviewer's report satisfy Ground-Truth and Macro Flow proofs and cite verified codebase/spec symbols (for fixable defects), OR if the reviewer report contains a verified technical impasse (`STATUS: INFEASIBLE`) providing verified empirical proof of an insurmountable platform constraint and alternative architectural paths per Principle 9: Host **ACCEPTS** the report immediately regardless of whether fixable defects are present or ungrounded.
   - Host does NOT author `<Role>_Gated_Issues.md` and does NOT send a message to that reviewer.

2. **Gated Reports & Action Demands**:
   - If any reported issue in a reviewer's report lacks proof, cites non-existent APIs, breaks macro flow, asserts ungrounded platform constraints without empirical evidence, or constitutes an invalid defect: Host marks the issue as GATED, *unless* the report contains a verified technical impasse per Principle 9 (which takes absolute precedence, immediately escalating to `PLAN_INFEASIBLE` and halting the round per Decision Rules without negotiating fixable defects).
   - Host authors `<review_dir>/reports/<Role>_Gated_Issues.md` for each affected role simultaneously via native `write_to_file`.
   - In `<Role>_Gated_Issues.md`, Host explains why each issue failed the gate. Host places a single top-level `## Required Reviewer Action` section at the top of the file (defining the 3 Gate Response Protocol choices), followed by `## Gated Issues` listing each failure with its `Gate Failure Classification` and `Rationale`. Host MUST NOT suggest fix solutions or code snippets, and MUST NOT repeat the 3 action choices per individual issue.
   - **Host Suggestion Ban**: Host MUST NOT suggest alternative fix implementations, code snippets, or workarounds in `<Role>_Gated_Issues.md`. Remediation design is the sole specialist domain of the reviewer.
   - Host notifies all gated reviewers in the active tier batch via `send_message` in a single coordination wave.

3. **Reviewer Response Actions**:
   Upon receiving a notification, each gated reviewer inspects `<Role>_Gated_Issues.md` and chooses one of three actions:
   - **Action 1: Refine / Complete as Requested**: When the defect is real but the fix was ungrounded, asymmetric across boundaries, introduces intra-DA contradictions, or asserts a speculative impasse where standard configuration or structural seams exist, reviewer edits `<Role>.md` in-place via native `write_to_file`, resolving the gate failure (e.g. converting ungrounded code into an abstract specification, converting speculative impasse claims into fixable defects with concrete remediation and updating report header from `- **Status**: STATUS: INFEASIBLE` to `- **Status**: STATUS: REVISIONS NEEDED`, supplying missing caller/callee boundary endpoints, or harmonizing contradicting assertions in `Verification Plan`) with verified proofs. If `<review_dir>/reports/<Role>_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.
   - **Action 2: Remove**: When the defect or platform barrier claim is invalid, speculative, or false-positive, reviewer removes the issue from `<Role>.md` in-place. If all blocking defects are removed, reviewer changes status to `- **Status**: STATUS: PASS`; if other fixable defects remain, reviewer updates status to `- **Status**: STATUS: REVISIONS NEEDED`. If `<review_dir>/reports/<Role>_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.
   - **Action 3: Reject Gating/Removal and Explain**: When reviewer maintains the defect, fix, or technical impasse is strictly valid and already complete, reviewer authors `<review_dir>/reports/<Role>_Explain.md` via native `write_to_file`, providing deeper, differing codebase evidence (or empirical probe traces and environment logs proving platform impossibility). The reviewer MUST ALSO update `<review_dir>/reports/<Role>.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text (or verified `Infeasibility Proof` and `Alternative Architectural Paths`), ensuring `<Role>.md` remains the clean single source of truth for Host aggregation. Reviewer MUST NOT repeat stale arguments already addressed in `<Role>_Gated_Issues.md`.
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
   - Enforce the Universal 3-tier precedence: (1) `Context.md` explicit user directives, (2) existing codebase conventions, (3) Default standards: accordion transitions for empty dynamic slots (preserving error recovery controls in `catch` blocks), top progress lines or inline spinners over skeleton blocks on fast desktop loads, and ephemeral Toast-based Undo rather than in-place layout-stalling slots.
   - For in-flight async actions, enforce `aria-disabled="true"` with interaction blocking over native HTML `disabled` to preserve continuous keyboard focus without eviction to `document.body`.
5. **Resolve Optimistic UI vs Transactional Safety**: When UXUI demands optimistic UI on transactional or destructive operations (e.g. file deletions, binary overwrites, database schema migrations, irreversible disk writes), reject the finding under Speculative Over-Engineering; optimistic updates are strictly reserved for non-destructive, idempotently reversible interactions.

## Decision Rules for Round Verdict

| Condition | Gate Verdict | Output Artifacts |
| :--- | :--- | :--- |
| 1+ Verified Technical Impasse (`STATUS: INFEASIBLE`) | `PLAN_INFEASIBLE` | Absolute Precedence: Overrides fixable blocking defects; immediately halts round with zero DA mutations. Host MUST NOT mutate DA. Writes `<review_dir>/host/State.md` (`Gate Verdict: PLAN_INFEASIBLE`) and `<review_dir>/host/Analyzation.md` (detailing the hard blocker, empirical proof, and architectural alternatives). Terminate reviewer subagents via process control, notify Layer 1 via `send_message`, and halt loop. |
| 1+ Accepted Blocking Defects (with 0 Verified Technical Impasses) | `ROUND_REVISION_NEEDED` | Host mutates target DA(s) directly using Clean & Neutral Artifact Protocol (creating temporary sibling `<da_stem>.bak.md` copies), writes `<review_dir>/host/State.md` (including Untouched Reviewers section), and writes `<review_dir>/host/Analyzation.md` (accepted issues only with rationale). Intermediate round teardown terminates reviewer subagents via process control, preserving `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` for Layer 1. Layer 1 deletes `<review_dir>/host/Analyzation.md` prior to Round N+1. |
| Write Verification / Filesystem Failure | `ABORTED_MUTATION_FAILURE` | Host restores modified and deleted target DAs from backups where present, restores `<review_dir>/Context.md` from `<review_dir>/Context.bak.md`, deletes newly created DAs, terminates reviewer subagents, writes `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` detailing the failure, notifies Layer 1 via `send_message`, and halts without issuing `ROUND_REVISION_NEEDED`. |
| 0 Accepted Blocking Defects (Targeted Pass with Pending Skipped Roles) | `TARGETED_PASS` *(Ephemeral Internal Host State)* | Trigger Snapshot Delta Backfill for skipped roles (upstream + untouched) in topological DAG sequence (preserving intra-round reports). |
| 0 Accepted Blocking Defects (100% Roster Passed on Snapshot) | `ROUND_PASS` (Increment `PassCount`) or `FINAL_PASS` (if `PassCount >= SP`) | Write `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md`. Terminate reviewer subagents via process control, purge `<review_dir>/reports/` and transient gating artifacts, preserving `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` for Layer 1 handoff. Layer 1 deletes `<review_dir>/host/Analyzation.md` prior to launching next round. On `FINAL_PASS`, Layer 1 executes final directory purge of `<repo-root>/<review_dir>/*` after presenting verified DA. |

## <Role>_Gated_Issues.md Authoring Standards

When authoring `<review_dir>/reports/<Role>_Gated_Issues.md`:
1. Place a single top-level `## Required Reviewer Action` block at the top of the file without repeating action choices per issue.
2. List gated issues under `## Gated Issues` with failure classification and technical rationale.
3. Strict suggestion ban: MUST NOT propose alternative fix implementations or code snippets.

Format template:
```markdown
# Gated Issues: <Role>

## Required Reviewer Action
Read the gated issues below. For each issue, choose ONE action:
1. **Refine / Complete as Requested**: Update `<Role>.md` in-place, resolving the gate failure (e.g. converting ungrounded snippets into an abstract specification, converting speculative impasse claims into fixable defects with concrete remediation and updating report header to `STATUS: REVISIONS NEEDED`, supplying missing symmetrical boundary endpoints, or harmonizing contradicting assertions in dependent sections) with verified proofs. Invalidate `<Role>_Explain.md` (delete or overwrite with empty content via `write_to_file(CodeContent="")`) if previously authored.
2. **Remove**: Remove the issue from `<Role>.md` in-place (set status to PASS if zero blocking issues remain, or `STATUS: REVISIONS NEEDED` if other fixable defects remain). Invalidate `<Role>_Explain.md` (delete or overwrite with empty content via `write_to_file(CodeContent="")`) if previously authored.
3. **Reject Gating/Removal and Explain**: Author `<Role>_Explain.md` with differing/deeper codebase proof (or empirical probe logs / sandbox traces) AND update `<Role>.md` in-place with verified proofs and clean remediation text (or verified `Infeasibility Proof` and `Alternative Architectural Paths`).
Notify Host via message when done.

## Gated Issues

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Gate Failure Classification**: `Ungrounded Fix Proposal` | `Asymmetric Boundary Contract` | `Cross-Section Contradiction` | `False-Positive Upstream Unreadiness` | `Premature Downstream Coupling` | `Speculative Over-Engineering` | `Spec-Induced Regression` | `Ungrounded Infeasibility Claim`
   - **Gate Rationale**: <Exact technical reason why issue failed the gate without proposing fix code>
```

## State.md Authoring Standards

When authoring `<review_dir>/host/State.md`:
1. **Purpose**: Machine-readable routing state consumed exclusively by Host N+1 for DAG calculation, completely decoupled from `Analyzation.md` to eliminate cognitive anchoring.
2. **Standard Markdown Layout**:
   - **When verdict is `ROUND_REVISION_NEEDED`**:
     ```markdown
     # Gate State
     - Gate Verdict: ROUND_REVISION_NEEDED
     - Highest Modified Tier: Layer 3.X
     - Current PassCount: 0 / <SP>

     ## Untouched Reviewers
     | Role Identifier | Technical Rationale |
     | :--- | :--- |
     | `<Role>` | <Explanation why applied DA mutations do not touch this role's contracts or domain> |
     ```
     If ALL active roles were touched by applied mutations, record:
     ```markdown
     ## Untouched Reviewers
     *(None)*
     ```
   - **When verdict is `PLAN_INFEASIBLE`**:
     ```markdown
     # Gate State
     - Gate Verdict: PLAN_INFEASIBLE
     - Highest Modified Tier: None
     - Current PassCount: 0 / <SP>
     ```
   - **When verdict is `ROUND_PASS` or `FINAL_PASS`**:
     ```markdown
     # Gate State
     - Gate Verdict: ROUND_PASS | FINAL_PASS
     - Highest Modified Tier: None
     - Current PassCount: <N> / <SP>
     ```
   - **When verdict is `ABORTED_MUTATION_FAILURE`**:
     ```markdown
     # Gate State
     - Gate Verdict: ABORTED_MUTATION_FAILURE
     - Highest Modified Tier: None
     - Current PassCount: 0 / <SP>
     ```
3. **Untouched Reviewers Criteria & Fallback**:
   - **Strict Untouched Criteria**: A reviewer is listed under `## Untouched Reviewers` ONLY IF the applied DA mutations introduce zero modifications, additions, or regressions relevant to that reviewer's domain checklist. If a role's domain is affected by the applied changes, it MUST NOT be listed in this section.
   - **Conservative Fallback**: If there is any ambiguity on whether a mutation might affect a role, omit it from `Untouched Reviewers` to ensure immediate re-audit in Round N+1.

## Analyzation.md Authoring Standards

When authoring `<review_dir>/host/Analyzation.md`:
1. **Mandatory Header & Gate Verdict**: Record the Executive Summary header containing:
   - `- **Gate Verdict**: ROUND_REVISION_NEEDED | ROUND_PASS | FINAL_PASS | ABORTED_MUTATION_FAILURE | PLAN_INFEASIBLE`
   - `- **Current PassCount**: <N> / <SP>`
   - `- **Active Roster**: <List of active roles>`
   - `- **Highest Modified Tier**: Layer 3.X` (Mandatory when verdict is `ROUND_REVISION_NEEDED`: identifies highest tier containing accepted blocking defects; record `None` for `ROUND_PASS`, `FINAL_PASS`, `ABORTED_MUTATION_FAILURE`, or `PLAN_INFEASIBLE`)
   When verdict is `PLAN_INFEASIBLE`, the header strictly preserves the canonical 4-key layout:
   ```markdown
   - **Gate Verdict**: PLAN_INFEASIBLE
   - **Current PassCount**: 0 / <SP>
   - **Active Roster**: <List of active roles>
   - **Highest Modified Tier**: None
   ```
   followed by `## Technical Impasse Analysis` documenting: (1) The insurmountable technical barrier(s) (synthesizing all verified impasses if multiple active roles reported impasses), (2) Grounded empirical proof, and (3) Documented trade-offs and `Alternative Architectural Paths` for user decision.
2. **Accepted Issues Only**: Record ONLY the blocking issues that successfully cleared the gate across active roles, along with their technical acceptance rationale. When the gate verdict is `ROUND_PASS` or `FINAL_PASS` (zero blocking defects across the active roster), record under Accepted Issues:
   ```markdown
   ## Accepted Issues
   *(None - All active roles cleared with zero blocking defects)*
   ```
3. **Zero Rejected / Gated Tables**: Do NOT include tables of rejected or gated issues in `Analyzation.md`. All rejection, removal, and refinement actions are resolved directly with reviewers in `<review_dir>/reports/<Role>_Gated_Issues.md` and reflected in-place in clean `<Role>.md` files.

## Host DA Mutation & Verification Standards

When applying accepted remediations directly to target DA(s) for `ROUND_REVISION_NEEDED`:
1. **Clean & Neutral Spec Diffs**: Apply modifications directly to the specified target files and sections using the Clean & Neutral Artifact Protocol (no meta-tags, no reviewer references, no defensive diff markers).
2. **Verified Code Snippets**: When integrating code snippets into the DA, verify that all referenced pre-existing symbols exist and compile against the active codebase, or align with planned declarations in the target DA or upstream specs, and that newly proposed symbols do not collide with active exports.
3. **Boundary Contract Symmetry Validation**: Host MUST verify that any boundary interface modification includes symmetrical updates for both producer/caller and all internal consumer/handler endpoints (or shared constants/types) directly from the accepted `<Role>.md` reports; Host MUST NOT apply 1-sided boundary modifications.
4. **DA Cross-Section Coherence Validation**: Host MUST verify that any modification altering component contracts includes synchronized updates for dependent sections (e.g. `Verification Plan` assertions) directly from accepted `<Role>.md` reports; Host MUST NOT introduce self-contradicting DA diffs.
5. **Mandatory Context DA Tree Synchronization**: If accepted feedback splits, merges, creates, or deletes Directive Artifact files (e.g. Progress Reviewer WBS actions), Host MUST copy deleted DA files to `<da_stem>.bak.md` before deletion, create `<review_dir>/Context.bak.md` first, directly create/restructure the files on disk, and update `## Target Directive Artifacts` in `<review_dir>/Context.md`.
6. **Write Verification & Abort Recovery**: Host verifies on disk that all DA mutations and restructured files were successfully written and are non-empty. If write verification fails (file missing, write error, or 0 bytes): Host executes abort recovery (deleting newly created DAs, restoring `<review_dir>/Context.md` from `<review_dir>/Context.bak.md`, restoring target DAs from existing sibling `<da_stem>.bak.md` backups where present, and cleaning backup files), terminates active reviewer subagents via `manage_subagents(Action="kill")`, aborts round conclusion without issuing `ROUND_REVISION_NEEDED`, writes `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` with `- **Gate Verdict**: ABORTED_MUTATION_FAILURE` detailing the exact filesystem error, affected paths, and recovery status, and notifies Layer 1 via `send_message`.
