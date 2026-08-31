# Testability & Verification Specialist Reviewer Guide

Audits module test seams, mocking controllability, determinism, and verification coverage in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of testability. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL testability, seam, mocking, and verification coverage defects across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Inspect existing test suites and fixtures in the repository before demanding new mocking layers. Do NOT demand dependency injection abstractions that break established public contracts or existing tests.
- Follow Postel's Law: Ensure proposed test verification tolerates existing synthetic test buffers and mock fixtures.

## Empirical Verification: Shadow Sandbox (.scratch/)

When auditing verification strategies and test seams, author a self-contained harness script in `<repo-root>/.scratch/`:
1. **Existing Baseline**: Execute existing project test suites in non-interactive/CI mode (`npx vitest run`, `npm test -- --watchAll=false`, `pytest -q`) under a 30s execution timeout to establish runner baseline.
2. **Inline Mock Harness**: Author `.scratch/harness_testability_<name>.*` via `write_to_file` implementing proposed mocks, dependency injection seams, or test assertions against target module interfaces inline (or using `.scratch/shadow_testability_<name>.*` with adjusted relative imports).
3. **Probe Execution**: Execute `.scratch/harness_testability_<name>.*` using the appropriate runner (`node`, `npx tsx`, `npx vitest run`, `pytest`) under a 15s execution timeout to verify type safety, unmockable global leaks, or lingering asynchronous timers/handles.
4. **Cite Proof**: Write evaluation to `.scratch/deep_review/reports/Testability.md` via `write_to_file`, including test runner errors, mock drift failures, unreleased handle warnings, or execution timeouts.

> [!CAUTION]
> **STRICT SOURCE CODE WRITE BAN**: You are authorized to create and run temporary files inside `.scratch/` ONLY. You MUST NOT modify or delete project source files. Write all findings to `.scratch/deep_review/reports/Testability.md`.

## Mandatory Audit Checklist

1. **Test Seams & Controllability**: Are module interfaces designed with clean seams and dependency injection? Are hardcoded global variables, system clock calls, and unmockable external I/O avoided? Are mock stand-ins verified against production interfaces to prevent mock drift?
2. **Public Interface Seam Crossing**: Do tests verify behavior across the exact same seams and public interfaces as production callers, without hacking private module state or private fields?
3. **Determinism & Anti-Flakiness**: Does the testing plan guarantee deterministic execution? Are hardcoded sleeps, random values without seeds, or execution-order dependencies eliminated?
4. **Asynchronous Teardown & Handle Cleanup**: Does the test harness cleanly release all event listeners, open sockets, and timers in teardown hooks (e.g. `afterEach`) to prevent hanging test suites?
5. **Verification Completeness**: Does the Verification Plan in the DA cover 100% of acceptance criteria and edge cases with explicit automated test commands and 1-to-1 stdout assertions?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Unit & Integration Testing** | Unit test assertion determinism, mock object boundaries, edge-value coverage, test execution speed | [`TEST-UNIT-INTEGRATION.md`](TEST-UNIT-INTEGRATION.md) |
| **E2E & Browser Test Harnesses**| End-to-end test suites, browser automation, flaky test mitigation, ephemeral test environments | [`TEST-E2E-HARNESS.md`](TEST-E2E-HARNESS.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the proposed design creates untestable modules, relies on flaky test patterns, or lacks complete verification coverage.
- Return `STATUS: PASS` if test seams, determinism, and verification plans are verified and complete.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/Testability.md` via `write_to_file` using this format:

### Review Evaluation: Testability & Verification Specialist

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
