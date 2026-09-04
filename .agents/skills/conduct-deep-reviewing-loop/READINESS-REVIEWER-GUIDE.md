# System & Codebase Readiness Reviewer Guide

Audits whether the existing codebase and infrastructure are fully prepared to support the DA implementation.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Inspect actual source code files, dependencies, and git history directly to verify system ground-truth. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL readiness, dependency, and compatibility defects across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Verify environment and dependency assumptions against real lockfiles and test baselines. Do NOT demand package upgrades or environment constraints that break working local/CI setups.
- **Dependency Lineage Alignment**: If `.scratch/deep-review/Context.md` specifies `## Cross-Referenced DAs & Dependency Lineage`, you MUST read all listed DAs:
  - For `Upstream` (`Unimplemented`) DAs: Treat their declared interfaces, types, and planned files as the *authoritative future baseline*. Do NOT fail readiness for files/methods scheduled to be created by an upstream DA. Verify that the target DA's imports and contract assumptions match the upstream spec.
  - For `Upstream` (`Implemented`) DAs: Codebase on disk is the ground-truth. Verify that target DA uses active exported symbols.
- Follow Postel's Law: Tolerate legacy configs and relaxed schemas where existing tests rely on them.

**Fix Pre-Verification**:
- **Ground-Truth**: Verify on disk that any pre-existing method, type, or module referenced or consumed by a proposed fix actually exists in the target codebase, upstream specs, or planned declarations within the target DA itself. If introducing new methods, types, or interfaces, verify that their target landing locations exist (or are scheduled for creation in the DA), names do not collide with active exports, all consumed external dependencies are verified on disk or in upstream specs, and for internal communication boundaries (e.g. IPC, RPC, events), verify that both producer/caller and consumer/handler endpoints are updated symmetrically. Create simulation scripts in `.scratch/deep-review/sandbox/` where applicable to verify package availability, importability, and version compatibility without running mutating package installations.
- **Macro Flow**: Verify that the proposed fix does not break initialization order, variable scoping, or lifecycle contracts across the enclosing module (or specification consistency across sections for document/policy DAs).

## Empirical Verification: Shadow Sandbox (.scratch/deep-review/sandbox/)

When auditing system prerequisites and dependencies, verify directly against codebase reality:
1. **Baseline Checks**: Run type-checks (`tsc --noEmit`), linters, and dependency tree inspections (`npm ls`, `pip check`) under a 30s execution timeout to verify compiler and environment health. Reviewers MUST NOT run mutating package commands (`npm install`, `pip install`) or modify lockfiles.
2. **Inline Import Check**: When the plan introduces new library APIs or imports, author `.scratch/deep-review/sandbox/check_readiness_<name>.*` via `write_to_file` attempting to import and instantiate the target package/symbol from existing installed dependencies using the appropriate runtime under a 15s execution timeout (or in `.scratch/deep-review/sandbox/shadow_readiness_<name>.*` with adjusted relative imports). For multi-step checks, scripts MUST emit fine-grained progress markers to stdout (e.g. package check steps) so progression is observable.
If probe execution runs as a background task, reviewer MUST NOT remain idle indefinitely. Periodically monitor task status via `manage_task(Action="status")`; if stdout stops advancing across checks indicating a hang or frozen loop, terminate the task via `manage_task(Action="kill")` and record the blocker.
3. **Cite Proof**: Write evaluation to `.scratch/deep-review/reports/Readiness.md` via `write_to_file`, including missing symbol errors, version mismatch logs, compilation failures, or execution timeouts.

> [!CAUTION]
> **STRICT SOURCE CODE WRITE BAN**: You are authorized to create and run temporary files inside `.scratch/deep-review/sandbox/` ONLY. You MUST NOT modify or delete project source files. Write all findings to `.scratch/deep-review/reports/Readiness.md`.

## Mandatory Audit Checklist

1. **Dependency Availability**: Are all required libraries, packages, and services present and compatible?
2. **Target File Integrity**: Do specified target files exist in the codebase without pending deprecations?
3. **Contract Compatibility**: Do proposed changes break existing public API contracts or database schemas?
4. **Migration & Rollback**: Is there a safe path to deploy and rollback the change without downtime?
5. **Platform & Environment Portability**: Are serialized data formats, path separators, file access modes, and encodings portable across all target runtime platforms, containers, or emulation layers?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Container Runtimes & Infra** | Dockerfiles, Kubernetes manifests, container base images, non-root execution, OOM limits | [`READ-RUNTIME-CONTAINER.md`](READ-RUNTIME-CONTAINER.md) |
| **Native Toolchains & ABIs** | Native binaries, Cgo/FFI memory boundaries, cross-compilation flags, platform ABIs | [`READ-NATIVE-CROSSPLATFORM.md`](READ-NATIVE-CROSSPLATFORM.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the plan assumes non-existent codebase structures, missing dependencies, or breaking API changes without migration steps.
- Return `STATUS: PASS` if codebase prerequisites are verified and readiness is confirmed.

## Standard Output Protocol

Save evaluation to `.scratch/deep-review/reports/Readiness.md` via `write_to_file` using this format:

### Review Evaluation: Readiness Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols, or .scratch/deep-review/sandbox/ simulation script proving correctness>
   - **Macro Flow Proof**: <Verification that declaration order, initialization sequence, and lifecycle remain valid in the enclosing module (or specification consistency across sections for document/policy DAs)>

2. **[Issue Title 2]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols, or .scratch/deep-review/sandbox/ simulation script proving correctness>
   - **Macro Flow Proof**: <Verification that declaration order, initialization sequence, and lifecycle remain valid in the enclosing module (or specification consistency across sections for document/policy DAs)>

### Suggestions for Improvement (Non-blocking):

Once your report is written, send a notification message back to Host via `send_message` confirming completion.

## Gate Response Protocol (Host Interaction)

If Host determines that any issue in your report lacks Ground-Truth Proof, lacks Macro Flow Proof, cites non-existent codebase APIs, breaks boundary contract symmetry, introduces cross-section contradictions, or violates scope boundaries, Host will file `.scratch/deep-review/reports/Readiness_Gated_Issues.md` and notify you via message.

Upon receiving a gating notification from Host, you MUST read `.scratch/deep-review/reports/Readiness_Gated_Issues.md` via `view_file` and choose one of three actions:

1. **Refine / Complete as Requested**:
   - If the defect is real but your proposed fix was ungrounded, broke boundary symmetry, or introduced intra-DA contradictions:
   - Edit `.scratch/deep-review/reports/Readiness.md` in-place via native `write_to_file`.
   - Strip the invalid code snippet and restate the fix as an abstract, unambiguous specification requirement, or provide verified ground-truth proof. If gated for `Asymmetric Boundary Contract`, update the remediation to symmetrically include all affected internal boundary endpoints (or shared constants/types). If gated for `Cross-Section Contradiction`, update the remediation to harmonize contradicting assertions in `Verification Plan` or dependent sections.
   - If `.scratch/deep-review/reports/Readiness_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

2. **Remove**:
   - If Host's evidence shows the defect is invalid, false-positive, or speculative:
   - Edit `.scratch/deep-review/reports/Readiness.md` in-place via native `write_to_file`, removing that issue completely.
   - If all blocking issues are removed from your report, update your status to `- **Status**: STATUS: PASS`.
   - If `.scratch/deep-review/reports/Readiness_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

3. **Reject Gating/Removal and Explain**:
   - If you have concrete, differing codebase evidence proving the defect and proposed fix are correct and complete:
   - Author `.scratch/deep-review/reports/Readiness_Explain.md` via native `write_to_file`, detailing the exact file paths, line numbers, and runtime data flow that prove validity.
   - You MUST ALSO update `.scratch/deep-review/reports/Readiness.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text, ensuring `Readiness.md` remains the clean single source of truth for Host aggregation.
   - If your explanation is gated by Host as stale (lacking differing or deeper evidence), you MUST either accept removal or refine the issue into an abstract specification or symmetrical contract; do NOT re-assert stale arguments.

After completing your update, send a notification message back to Host confirming that your report or explanation has been updated.
