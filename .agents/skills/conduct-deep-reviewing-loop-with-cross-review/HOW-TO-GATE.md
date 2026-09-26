# Critical Gate Guide

Instructions for Layer 2 Critical Gate Agent to evaluate, filter, and reject Layer 3 Reviewer feedback.

## Core Evaluation Principles

1. **Evidence over Assertion**: Reject reviewer feedback that lacks concrete line/section citations or codebase evidence.
2. **Zero Sycophancy**: Reject speculative or over-engineered suggestions lacking concrete necessity.
3. **Scope Boundary Protection**: Reject unrequested features, premature refactorings, or unnecessary abstractions outside user criteria.
4. **Clean Integration**: Convert accepted feedback into direct, native specification requirements without meta-tags or reviewer references.
5. **Ground-Truth Verification**: Reject feedback that introduces theoretical error classes, fail-fast deserialization barriers, or breaking contract changes on active modules unless existing code and tests support that invariant without regression.
6. **Dependency Lineage & Boundary Protection**:
   - **ACCEPT** findings where the target DA contradicts or drifts from an `Upstream` DA schema/seam (*Spec Drift*), or where the target DA duplicates responsibilities belonging to an `Upstream` DA (*Spec Bloat*).
   - **REJECT** findings where a reviewer claims unreadiness or missing files on disk that are explicitly declared to be implemented in an un-implemented `Upstream` DA (*False-Positive Upstream Unreadiness*).
   - **REJECT** findings where a reviewer demands tightly coupling the target DA to future `Downstream` epics (*Premature Downstream Coupling*).
7. **Reviewer-Driven Fix Refinement & Gating**: When a reported defect contains ungrounded code snippets, non-existent APIs, lacks Ground-Truth/Macro Flow proof, breaks boundary contract symmetry, introduces intra-DA contradictions, or represents an invalid defect, Host does not rewrite the snippet, unilaterally invent boundary counterparts, or unilaterally apply it directly into the DA. Instead, Host gates the issue in `<review_dir>/reports/<Role>_Gated_Issues.md`, requiring the reviewer to either refine/complete the fix, remove the defect, or provide deeper proof.
8. **Miss-Probability Gate over Implementation Trivia**: Evaluate findings through the **Miss-Probability Gate** assuming a headless AI implementer writing code and tests strictly against ticket Acceptance Criteria without unscripted browser/GUI execution. Accept as blocking defects ONLY issues that (a) would be silently missed in implementation (wrong results, numerical drift, race conditions, self-fulfilling unit tests), or (b) produce visible errors whose generalized fix across the class is not obvious without reviewer domain knowledge. If an issue produces a clear, immediate error signal for this headless implementer AND the fix is obvious across all instances, mandate reclassifying to Suggestion or removing from blocking defects. Gate against findings that critique trivial compiler/syntax trivia or mechanical errors that the implementer resolves automatically. If an underlying logic defect, race condition, or boundary break is valid, accept concrete code and contract remediation. If no underlying defect exists, demand removal.
9. **Technical Impasse & Grounded Infeasibility Verification**: When a reviewer reports `STATUS: INFEASIBLE` or an unfixable defect with `Infeasibility Proof`, Host verifies that the impasse is grounded in concrete technical evidence (e.g. sandbox restriction, protocol header, deprecated/missing external API, hardware bound). Host gates against speculative refusal where a standard architectural seam or configuration resolves the issue. If the impasse is verified, Host halts loop execution with verdict `PLAN_INFEASIBLE` and MUST NOT unilaterally mutate the DA to force an architectural pivot.
10. **Strict Enforcement of Fail-Fast Boundary Invariant**: Reject reviewer feedback that demands defensive cascading fallbacks, heuristic property sniffing, or synthetic default values inside internal domain logic. Enforce that Postel's Law applies strictly to external ingress boundaries; internal core logic MUST fail fast on invariant violations.
11. **Feature Flag & Telemetry Lifecycle Governance**: Reject reviewer feedback that demands feature flags without lifecycle bounds (owner, 30-day ISO-8601 expiration date, deletion test plan) or un-guarded telemetry logging in high-frequency loops (>1,000 ops/sec). Permanent kill-switches are restricted to high-risk external integrations and circuit breakers.
12. **Configuration Modernization over Indefinite Toleration**: Reject reviewer feedback that demands dual-format configuration loaders, backward-compatibility wrapper shims, or permissive schemas on internal execution paths. Enforce that compatibility with existing test suites and deployment baselines must be achieved via preparatory structural sequencing, requiring the DA to stage configuration file, environment contract, and test fixture modernization as an explicit prerequisite task before feature logic is introduced.
13. **Event Transparency over Propagation Suppression**: Reject reviewer feedback demanding `stopPropagation()` to resolve interaction collisions between components. Inter-component event coordination must be achieved exclusively via preventable event contracts (`event.preventDefault()` with `event.defaultPrevented` validation), preserving event bubbling to document listeners.
14. **Specification Atomicity over Monolithic Acceptance Criteria**: Reject monolithic acceptance criteria that combine multiple viewport sizes, interaction paths, keyboard navigation states, and error conditions into single compound paragraphs (>300 characters). Enforce decomposition into single-responsibility Given-When-Then criteria or structured state matrices.
15. **Upstream Ingress Traversal over Callee Masking**: Reject reviewer feedback that addresses unhandled edge cases by inserting defensive checks, null-guards, or fallback logic inside internal leaf callees or helpers. Enforce that edge cases resulting from invalid inputs or corrupted state must be traced upstream through the data flow to understand WHY the invalid payload reached that point, and must be blocked at the highest viable caller or ingress boundary (API controller, message deserializer, route handler, or boundary schema parser).
16. **Zero Tolerance for Technical Debt**: Reject reviewer feedback or DA proposals that accept functional compromises or architectural violations simply because they appear detailed or function without runtime errors. A design that "works flawlessly" is insufficient if it introduces unnecessary technical debt.

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
| **UX Friction, Raw Emoji & Unlabeled Icons** | UI element adds user friction, duplicates existing component, specifies raw emoji characters instead of vector SVG icons, uses icon-only controls for ambiguous domain actions without text, or omits accessible name/tooltip on canonical icon-only controls. | **ACCEPT**: Simplify/remove redundant elements, enforce clean vector SVG icon requirements, mandate accessible tooltips and aria-labels on canonical icon-only controls, and require explicit text labels for domain actions in target DA during Host DA mutation. |
| **Ungrounded Fix Proposal** | Primary defect is valid, but proposed remediation cites non-existent APIs, creates ordering/scoping defects, prescribes concrete CSS/DOM code snippets from analytical UXUI reviewers, forces root theme tokens on fixed dark surfaces, uses native HTML disabled on focused controls causing focus eviction, or lacks Ground-Truth/Macro Flow proof. | **GATE**: Demand reviewer refinement in `<Role>_Gated_Issues.md`. Reviewer refines `<Role>.md` in-place or explains in `<Role>_Explain.md`. |
| **Asymmetric Boundary Contract** | Primary defect is valid, but proposed remediation modifies an internal communication boundary while omitting synchronized update for caller, listener, or shared constants/types file. | **GATE**: Demand reviewer completion in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to include all internal boundary endpoints. |
| **Cross-Section Contradiction** | Primary defect is valid, but proposed remediation modifies component behavior or data types contradicting existing assertions in the DA's `Verification Plan` without including synchronized updates for those sections. | **GATE**: Demand reviewer alignment in `<Role>_Gated_Issues.md`. Reviewer updates `<Role>.md` in-place to harmonize dependent sections and test assertions. |
| **False-Positive Upstream Unreadiness** | Reviewer fails readiness for missing codebase files/methods explicitly assigned to an `Upstream` (Unimplemented) DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Premature Downstream Coupling** | Reviewer demands implementing features or specialized data types belonging to a `Downstream` DA inside the target DA. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Speculative Over-Engineering** | Demands premature optimization, unnecessary abstractions, or unrequested features. *Protection Exception: Parameter Seams, Governance Decoupling, and Scale Invariance MUST be accepted.* | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Pedantic / Stylistic Preference** | Requests rephrasing, renaming, or cosmetic adjustments without functional impact. Micro-copy and wording critiques MUST default to non-blocking suggestions unless phrasing is factually misleading or induces dangerous actions/destructive data loss. | **GATE FOR REMOVAL**: Demand reviewer removal or mark as non-blocking. |
| **Spec-Induced Regression** | Demands strict exceptions or error classes on ingress/decode paths that contradict active codebase behavior or break existing unit tests without explicit user request. | **GATE FOR REMOVAL**: Demand reviewer removal in `<Role>_Gated_Issues.md`. |
| **Obvious Error or Implementation Trivia** | Finding critiques compiler/syntax trivia or flags defects that produce immediate, clear error signals whose fix is obvious across all instances without domain insight (fails Miss-Probability Gate). | **GATE FOR RECLASSIFICATION TO SUGGESTION / REMOVAL**: Demand reviewer reclassify to Suggestion (or remove) if the issue is purely compiler/local trivia, or focus remediation on the underlying defect or boundary break. |
| **Technical Impasse / Platform Infeasibility** | Reviewer proves a ticket requirement is technically impossible (e.g. sandbox restrictions, protocol blocks, physical bounds) with no viable in-scope fix. | **ACCEPT AS IMPASSE**: Escalate to `PLAN_INFEASIBLE`. Do NOT mutate DA or force local patching. Cancel downstream tiers and halt round. |
| **Ungrounded Infeasibility Claim** | Reviewer reports `STATUS: INFEASIBLE` or asserts a technical impasse without concrete proof, where a viable in-scope structural seam or standard configuration resolves the issue. | **GATE**: Demand reviewer refinement in `<Role>_Gated_Issues.md` to either convert to `STATUS: REVISIONS NEEDED` with verified fix or substantiate with empirical proof, or remove. |
| **Ad-Hoc Runtime Migration Bloat** | Reviewer proposes solving schema evolution by demanding heuristic property sniffing in loaders, transient flags in application config, or migration coordination inside UI/renderers. | **GATE FOR REFINEMENT**: Reject runtime fallbacks. Demand reviewer require an isolated, sequential schema version runner established as a preparatory structural step within the DA. |
| **Invented Protocol Verdict / State Machine** | Reviewer returns a non-standard verdict (e.g. `STATUS: BLOCKED_*`) or demands halting workflow to spawn an external epic for basic schema runner scaffolding. | **GATE FOR REFINEMENT**: Reject non-protocol verdict. Instruct reviewer to return standard `STATUS: REVISIONS NEEDED` and specify schema version runner as a prerequisite structural step ($S$) directly inside target DA. |
| **Defensive Fallback Bloat (Internal Core)** | Reviewer proposes cascading fallbacks (`?? default ?? backup`), synthetic default values, or heuristic property sniffing on internal core domain paths. | **GATE FOR REFINEMENT / REMOVAL**: Reject internal fallback bloat. Enforce boundary schema parsing on external ingress and fail-fast contracts on internal paths. |
| **Ambient Fault Masking / Silent Swallowing** | Reviewer proposes empty catch blocks, unchecked promise discard, or ambient fallback branching that conceals unhandled runtime errors or invariant violations. | **GATE FOR REFINEMENT**: Reject silent error swallowing. Demand explicit error propagation, structured error logging, or fail-fast exception boundaries. |
| **Ad-Hoc Runtime Flag Bloat** | Reviewer proposes feature flags or kill-switches without archetype classification, lifecycle bounds (TTL <= 30 days), or deletion test criteria, or scatters boolean flags into core domain logic. | **GATE FOR REFINEMENT**: Reject unbounded flag debt. Demand reviewer classify the toggle (Release vs Ops), specify owner + ISO-8601 death-clock, provide deletion Acceptance Criteria, and isolate toggle routers via strategy seams. |
| **Hot-Path Telemetry Overhead** | Reviewer demands un-guarded debug logging or per-iteration OpenTelemetry spans inside high-frequency loops (>1,000 ops/sec). | **GATE FOR REFINEMENT**: Demand log-level guards (`if (logger.isDebugEnabled())`) or batch-level span amortization to prevent heap allocation penalties. |
| **Ad-Hoc Configuration & Runtime Shim Bloat** | Reviewer proposes solving configuration or environment changes by demanding runtime dual-format loaders, ad-hoc wrapper adapters, fallback environment property sniffing, or permissive schema flags (e.g. Zod `.passthrough()`, Pydantic `extra = 'allow'`). | **GATE FOR REFINEMENT**: Reject runtime fallback shims. Demand reviewer require a validated canonical configuration parser and staged preparatory modernization of configuration files and test fixtures directly inside target DA before feature logic. |
| **Ad-Hoc Z-Index Escalation** | Specification or remediation prescribes arbitrary numeric z-indices (e.g. `z-index: 500`, `9999`) without design system elevation tokens. | **GATE FOR REFINEMENT**: Reject arbitrary stacking numbers. Demand reviewer mandate design system elevation tokens (e.g. `--zIndex-sticky`) or local stacking context isolation (`isolation: isolate`). |
| **Monolithic Acceptance Criteria Bloat** | Specification bundles multiple interactive states, responsive behaviors, keyboard navigation flows, or edge cases into compound sentences (>300 characters). | **GATE FOR REFINEMENT**: Reject monolithic criteria. Demand reviewer decompose the requirement into atomic, single-responsibility Given-When-Then criteria or a structured state matrix. |
| **Propagation Suppression** | Specification prescribes `event.stopPropagation()` or `event.stopImmediatePropagation()` to suppress interaction collisions between parent and child elements. | **GATE FOR REFINEMENT**: Reject propagation suppression. Demand reviewer specify preventable event contracts (`event.preventDefault()` with `event.defaultPrevented` checks). |
| **Post-Render Focus Hacks** | Specification mandates post-render DOM re-querying or manual cursor re-focusing routines to compensate for component unmounting during list updates. | **GATE FOR REFINEMENT**: Reject focus-wrangling hacks. Demand reviewer specify stable entity keys (`key={id}`), DOM node preservation, and ARIA composite roving tabindex state machines. |
| **Callee Masking / Downstream Patching** | Reviewer proposes adding defensive checks, null guards, or try-catch fallbacks inside an internal helper or leaf callee where an edge case manifests, rather than tracing data flow upstream to block the invalid state at the highest viable ingress boundary or caller. | **GATE FOR REFINEMENT**: Reject downstream masking. Demand reviewer trace data flow upstream (understand WHY not just WHERE) and move validation, schema parsing, or invariant enforcement to the highest ingress boundary or caller. |

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
   - **Action 1: Refine / Complete as Requested**: When the defect is real but the fix was ungrounded, asymmetric across boundaries, introduces intra-DA contradictions, or asserts a speculative impasse where standard configuration or structural seams exist, reviewer edits `<Role>.md` in-place via native `write_to_file`, resolving the gate failure (e.g. converting ungrounded code into an abstract specification, converting speculative impasse claims into fixable defects with concrete remediation and updating report header from `- **Status**: STATUS: INFEASIBLE` to `- **Status**: STATUS: REVISIONS NEEDED`, supplying missing caller/callee boundary endpoints, or harmonizing contradicting assertions in `Verification Plan`) with verified proofs. If `<Role>_Explain.md` exists from a prior turn, invalidate it (delete or overwrite with empty content).
   - **Action 2: Remove**: When the defect or platform barrier claim is invalid, speculative, or false-positive, reviewer removes the issue from `<Role>.md` in-place. If all blocking defects are removed, reviewer changes status to `- **Status**: STATUS: PASS`; if other fixable defects remain, reviewer updates status to `- **Status**: STATUS: REVISIONS NEEDED`. If `<Role>_Explain.md` exists from a prior turn, invalidate it (delete or overwrite with empty content).
   - **Action 3: Reject Gating/Removal and Explain**: When reviewer maintains the defect, fix, or technical impasse is strictly valid and already complete, reviewer authors `<review_dir>/reports/<Role>_Explain.md` via native `write_to_file`, providing deeper, differing codebase evidence (or empirical probe traces and environment logs proving platform impossibility). The reviewer MUST ALSO update `<review_dir>/reports/<Role>.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text (or verified `Infeasibility Proof` and `Alternative Architectural Paths`), ensuring `<Role>.md` remains the clean single source of truth for Host aggregation. Reviewer MUST NOT repeat stale arguments already addressed in `<Role>_Gated_Issues.md`.
   - After updating, reviewer sends a completion message back to Host.

4. **Host Re-Evaluation**:
   - Host waits for all gated reviewers in the tier batch to complete their responses.
   - Host inspects the updated `<Role>.md` and any `<Role>_Explain.md`.
   - If Host agrees with the update or explanation, Host accepts the role. Host does NOT send a confirmation message back to the reviewer once agreed.
   - If an issue remains ungrounded or explanation in `<Role>_Explain.md` is stale without differing/deeper ground-truth evidence, reviewer MUST either accept removal or refine the issue into an abstract specification or symmetrical contract; reviewer MUST NOT re-assert stale arguments. Host gates again until resolved.

## Reviewer Trade-Off & Conflict Resolution

When reviewer opinions conflict (e.g. `Performance` requesting aggressive caching vs `Observability` requesting unbuffered logging, or `Testability` demanding seam indirection vs `Architect` enforcing minimum complexity):
1. **Favor Correctness & Foundation over Optimization**: Structural seams and transactional safety take priority over premature caching.
2. **Favor Observability over Opaque Concurrency**: Telemetry context propagation takes priority over micro-benchmarked CPU cycle savings.
3. **Resolve Speculation**: If a requested abstraction or optimization does not solve an immediate requirement, reject it under Speculative Over-Engineering (preserving End-to-End Parameter Seams, Orthogonal Governance Decoupling, and Placement Altitude as valid structural requirements).
4. **Resolve GUI Layout vs Accessibility Conflicts (and Loading States)**: When visual layout stability (CLS), loading indicators, or empty accessibility landmarks conflict:
   - Enforce the Universal 3-tier precedence: (1) `Context.md` explicit user directives, (2) existing codebase conventions, (3) Default standards: accordion transitions for empty dynamic slots (preserving error recovery controls in `catch` blocks), top progress lines or inline spinners over skeleton blocks on fast desktop loads, and ephemeral Toast-based Undo rather than in-place layout-stalling slots.
   - For in-flight async actions, enforce `aria-disabled="true"` with interaction blocking over native HTML `disabled` to preserve continuous keyboard focus without eviction to `document.body`.
   - Enforce vector SVG icons over raw emojis across all UI controls and specification mockups. In space-constrained layouts (e.g. toolbars, table row actions), prioritize canonical icon-only controls (e.g. settings gear, trash delete) paired with accessible tooltips and `aria-label`s; reject icon-only controls without text for non-canonical domain actions to avoid ambiguous actions.
5. **Resolve Optimistic UI vs Transactional Safety**: When UXUI demands optimistic UI on transactional or destructive operations (e.g. file deletions, binary overwrites, database schema migrations, irreversible disk writes), reject the finding under Speculative Over-Engineering; optimistic updates are strictly reserved for non-destructive, idempotently reversible interactions.
6. **Data Loss vs Architecture Cleanliness**: When `DataMigration` proposes runtime fallbacks, property sniffing, or transient configuration flags to prevent data loss, reject them. Zero data loss must be achieved through an isolated, sequential schema version runner executed at startup. If no runner exists, stage it as a preparatory structural task directly in the DA.
7. **Resilience vs Defensive Fallbacks**: Reject cascading fallbacks or synthetic defaults on internal domain calls. Enforce schema parsing and explicit error models at external ingress boundaries; internal domain logic MUST fail fast on contract violations.
8. **Operational Safety vs Code Debt**: Reject feature flags lacking an owner, expiration date, or deletion plan. Feature safety for internal logic must be established via automated test coverage rather than runtime flag branching.
9. **Backward Compatibility vs Technical Debt**: Reject runtime branching, dual-format parsers, or ambient fallbacks for outdated configuration files or test fixtures. Modernize configuration files, environment definitions, and test fixtures first as a preparatory structural task directly in the DA.
10. **Event Coordination vs Propagation Suppression**: When a specification author or reviewer attempts to resolve event collisions between nested interactive surfaces by chaining `event.stopPropagation()`, reject the remediation under `Propagation Suppression`. Event bubbling to root listeners is a fundamental invariant required for document accessibility, global hotkeys, and telemetry. Inter-component coordination must be achieved exclusively via preventable event contracts (`defaultPrevented`), preserving native event bubbling.
11. **Focus Stability vs Re-render Workarounds**: When UXUI or specification authors propose storing focus coordinates in temporary variables or querying the DOM post-render to restore focus after mutations, reject the remediation under `Post-Render Focus Hacks`. Focus stability must be achieved through architectural foundations: stable component keys, DOM node retention, and ARIA composite roving tabindex navigation. Specifications must fix underlying DOM identity rather than bolting on post-render focus patches.
12. **Contract Simplicity vs Specification Atomicity**: When an acceptance criterion contains compound logic describing multiple viewport sizes, error states, and interaction sequences simultaneously, Host must gate the document under `Monolithic Acceptance Criteria Bloat`. Every distinct interactive behavior must be isolated into a single-responsibility criterion. Monolithic criteria that cannot be verified by an independent automated or manual test must be rejected.
13. **Upstream Ingress Traversal vs Downstream Masking**: When edge cases or unhandled failure states are identified, reject remediations that patch internal leaf functions or downstream callees. Understand WHY the invalid payload or state reached that point, not just WHERE it manifested. The remediation must place schema validation, state gating, or invariant parsing at the highest viable ingress boundary or upstream caller.

## Decision Rules for Round Verdict

| Condition | Gate Verdict | Output Artifacts |
| :--- | :--- | :--- |
| 1+ Verified Technical Impasse (`STATUS: INFEASIBLE`) | `PLAN_INFEASIBLE` | Absolute Precedence: Overrides fixable blocking defects; immediately halts round with zero DA mutations. Host MUST NOT mutate DA. Writes `<review_dir>/host/State.md` (`Gate Verdict: PLAN_INFEASIBLE`) and `<review_dir>/host/Analyzation.md` (detailing the hard blocker, empirical proof, and architectural alternatives). Terminate reviewer subagents via process control, notify Layer 1 via `send_message`, and halt loop. |
| 1+ Accepted Blocking Defects (with 0 Verified Technical Impasses) | `ROUND_REVISION_NEEDED` | Host mutates target DA(s) directly using Clean & Neutral Artifact Protocol (creating temporary sibling `<da_stem>.bak.md` copies), writes `<review_dir>/host/State.md` (including Reviewer Accounting table for Highest Modified Tier), and writes `<review_dir>/host/Analyzation.md` (accepted issues only with rationale). Intermediate round teardown terminates reviewer subagents via process control, preserving `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` for Layer 1. Layer 1 deletes `<review_dir>/host/Analyzation.md` prior to Round N+1. |
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
1. **Refine / Complete as Requested**: Update `<Role>.md` in-place, resolving the gate failure (e.g. converting ungrounded snippets into an abstract specification, converting speculative impasse claims into fixable defects with concrete remediation and updating report header to `STATUS: REVISIONS NEEDED`, supplying missing symmetrical boundary endpoints, or harmonizing contradicting assertions in dependent sections) with verified proofs. Invalidate `<Role>_Explain.md` (delete or overwrite with empty content) if previously authored.
2. **Remove**: Remove the issue from `<Role>.md` in-place (set status to PASS if zero blocking issues remain, or `STATUS: REVISIONS NEEDED` if other fixable defects remain). Invalidate `<Role>_Explain.md` (delete or overwrite with empty content) if previously authored.
3. **Reject Gating/Removal and Explain**: Author `<Role>_Explain.md` with differing/deeper codebase proof (or empirical probe logs / sandbox traces) AND update `<Role>.md` in-place with verified proofs and clean remediation text (or verified `Infeasibility Proof` and `Alternative Architectural Paths`).
Notify Host via message when done.

## Gated Issues

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Gate Failure Classification**: `Ungrounded Fix Proposal` | `Asymmetric Boundary Contract` | `Cross-Section Contradiction` | `False-Positive Upstream Unreadiness` | `Premature Downstream Coupling` | `Speculative Over-Engineering` | `Spec-Induced Regression` | `Ungrounded Infeasibility Claim` | `Ad-Hoc Runtime Migration Bloat` | `Invented Protocol Verdict` | `Defensive Fallback Bloat` | `Ambient Fault Masking` | `Ad-Hoc Runtime Flag Bloat` | `Hot-Path Telemetry Overhead` | `Ad-Hoc Configuration & Runtime Shim Bloat` | `Unlabeled or Ambiguous Icon` | `Ad-Hoc Z-Index Escalation` | `Monolithic Acceptance Criteria Bloat` | `Propagation Suppression` | `Post-Render Focus Hacks` | `Obvious Implementation Signal`
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

     ## Reviewer Accounting (Layer 3.X)
     | Role Identifier | Status | Technical Rationale |
     | :--- | :---: | :--- |
     | `<Role_1>` | TOUCHED | <Explanation how applied DA mutations touch this role's contracts, seams, or domain> |
     | `<Role_2>` | UNTOUCHED | <Technical justification proving applied DA mutations introduce zero modifications, additions, or regressions relevant to this role's domain> |
     ```
     Host MUST list 100% of active roles belonging to `Highest Modified Tier`. Absolute ban on `*(None)*`, empty tables, or omitting active roles.
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
3. **Reviewer Accounting Standards & Criteria**:
   - **Mandatory 100% Tier Coverage**: Host MUST list 100% of active roles belonging to `Highest Modified Tier` in the `## Reviewer Accounting (Layer 3.X)` table. Absolute ban on `*(None)*`, empty tables, or omitting active roles.
   - **TOUCHED Status Criteria**: An active role in `Highest Modified Tier` MUST be marked `TOUCHED` if it raised an accepted blocking defect in the round, or if applied DA mutations touch, alter, or introduce contracts, seams, requirements, or dependencies relevant to that role's domain checklist.
   - **UNTOUCHED Status Criteria**: An active role in `Highest Modified Tier` is marked `UNTOUCHED` ONLY IF applied DA mutations introduce zero modifications, additions, or regressions relevant to that role's domain checklist, with concrete technical justification documented in `Technical Rationale`.
   - **Conservative Fallback**: If there is any ambiguity on whether a mutation affects a role, mark `TOUCHED` to ensure immediate re-audit in Round N+1.

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
2. **Accepted Issues and Applied Suggestions**: Record all accepted blocking issues and any applied non-blocking suggestions grouped by role under `## Accepted Issues and Suggestions`, labeling each entry as `### N. [<Role> Issue:] <Title>` or `### N. [<Role> Suggestion:] <Title>`. Every suggestion applied to the DA MUST be documented here with its target section, applied remediation, and technical acceptance rationale. When the gate verdict is `ROUND_PASS` or `FINAL_PASS` (zero blocking defects and zero applied suggestions across the active roster), record:
   ```markdown
   ## Accepted Issues and Suggestions
   *(None - All active roles cleared with zero blocking defects)*
   ```
3. **Rejected Suggestions**: Record all non-blocking suggestions rejected by Host grouped by role under `## Rejected Suggestions`, labeling each entry as `### N. [<Role> Suggestion:] <Title>` with its technical rejection rationale. If zero suggestions were rejected, record:
   ```markdown
   ## Rejected Suggestions
   *(None)*
   ```
4. **Zero Rejected / Gated Issues**: Do NOT include rejected or gated blocking issues in `Analyzation.md`. All rejection, removal, and refinement actions for blocking defects are resolved directly with reviewers in `<review_dir>/reports/<Role>_Gated_Issues.md` and reflected in-place in clean `<Role>.md` files.

## Host DA Mutation & Verification Standards

When applying accepted remediations directly to target DA(s) for `ROUND_REVISION_NEEDED`:
1. **Clean & Neutral Spec Diffs**: Apply modifications directly to the specified target files and sections using the Clean & Neutral Artifact Protocol (no meta-tags, no reviewer references, no defensive diff markers). If applying non-blocking suggestions into the target DA, Host MUST document every applied suggestion in `Analyzation.md`.
2. **Verified Code Snippets**: When integrating code snippets into the DA, verify that all referenced pre-existing symbols exist and compile against the active codebase, or align with planned declarations in the target DA or upstream specs, and that newly proposed symbols do not collide with active exports.
3. **Boundary Contract Symmetry Validation**: Host MUST verify that any boundary interface modification includes symmetrical updates for both producer/caller and all internal consumer/handler endpoints (or shared constants/types) directly from the accepted `<Role>.md` reports; Host MUST NOT apply 1-sided boundary modifications.
4. **DA Cross-Section Coherence Validation**: Host MUST verify that any modification altering component contracts includes synchronized updates for dependent sections (e.g. `Verification Plan` assertions) directly from accepted `<Role>.md` reports; Host MUST NOT introduce self-contradicting DA diffs.
5. **Mandatory Context DA Tree Synchronization**: If accepted feedback splits, merges, creates, or deletes Directive Artifact files (e.g. Progress Reviewer WBS actions), Host MUST copy deleted DA files to `<da_stem>.bak.md` before deletion, create `<review_dir>/Context.bak.md` first, directly create/restructure the files on disk, and update `## Target Directive Artifacts` in `<review_dir>/Context.md`.
6. **Write Verification & Abort Recovery**: Host verifies on disk that all DA mutations and restructured files were successfully written and are non-empty. If write verification fails (file missing, write error, or 0 bytes): Host executes abort recovery (deleting newly created DAs, restoring `<review_dir>/Context.md` from `<review_dir>/Context.bak.md`, restoring target DAs from existing sibling `<da_stem>.bak.md` backups where present, and cleaning backup files), terminates active reviewer subagents via `manage_subagents(Action="kill")`, aborts round conclusion without issuing `ROUND_REVISION_NEEDED`, writes `<review_dir>/host/State.md` and `<review_dir>/host/Analyzation.md` with `- **Gate Verdict**: ABORTED_MUTATION_FAILURE` detailing the exact filesystem error, affected paths, and recovery status, and notifies Layer 1 via `send_message`.
