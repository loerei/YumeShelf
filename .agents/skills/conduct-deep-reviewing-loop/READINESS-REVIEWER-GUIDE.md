# System & Codebase Readiness Reviewer Guide

Audits whether the existing codebase and infrastructure are fully prepared to support the DA implementation.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Inspect actual source code files, dependencies, and git history directly to verify system ground-truth. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL readiness, dependency, and compatibility defects across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Verify environment and dependency assumptions against real lockfiles and test baselines. Do NOT demand package upgrades or environment constraints that break working local/CI setups.
- **Dependency Lineage Alignment**: If `.scratch/deep_review/Context.md` specifies `## Cross-Referenced DAs & Dependency Lineage`, you MUST read all listed DAs:
  - For `Upstream` (`Unimplemented`) DAs: Treat their declared interfaces, types, and planned files as the *authoritative future baseline*. Do NOT fail readiness for files/methods scheduled to be created by an upstream DA. Verify that the target DA's imports and contract assumptions match the upstream spec.
  - For `Upstream` (`Implemented`) DAs: Codebase on disk is the ground-truth. Verify that target DA uses active exported symbols.
- Follow Postel's Law: Tolerate legacy configs and relaxed schemas where existing tests rely on them.

## Empirical Verification: Shadow Sandbox (.scratch/)

When auditing system prerequisites and dependencies, verify directly against codebase reality:
1. **Baseline Checks**: Run type-checks (`tsc --noEmit`), linters, and dependency tree inspections (`npm ls`, `pip check`) under a 30s execution timeout to verify compiler and environment health. Reviewers MUST NOT run mutating package commands (`npm install`, `pip install`) or modify lockfiles.
2. **Inline Import Check**: When the plan introduces new library APIs or imports, author `.scratch/check_readiness_<name>.*` via `write_to_file` attempting to import and instantiate the target package/symbol from existing installed dependencies using the appropriate runtime under a 15s execution timeout (or in `.scratch/shadow_readiness_<name>.*` with adjusted relative imports).
3. **Cite Proof**: Write evaluation to `.scratch/deep_review/reports/Readiness.md` via `write_to_file`, including missing symbol errors, version mismatch logs, compilation failures, or execution timeouts.

> [!CAUTION]
> **STRICT SOURCE CODE WRITE BAN**: You are authorized to create and run temporary files inside `.scratch/` ONLY. You MUST NOT modify or delete project source files. Write all findings to `.scratch/deep_review/reports/Readiness.md`.

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

Save evaluation to `.scratch/deep_review/reports/Readiness.md` via `write_to_file` using this format:

### Review Evaluation: Readiness Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>

2. **[Issue Title 2]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact fix required>

### Suggestions for Improvement (Non-blocking):
