# Edgecase Detector Reviewer Guide

Audits boundary conditions, failure paths, and unexpected environment states in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of boundary robustness. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL edge-case failures, unhandled exceptions, resource leaks, and concurrency hazards across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Cross-reference edge cases against active codebase handlers. Do NOT demand fail-fast exception boundaries on ingress/decode paths that cause regressions for synthetic mock data or lenient user files.
- Follow Postel's Law: Handle edge-case input malformations gracefully on read paths with fallback values.

## Empirical Verification: Shadow Sandbox (.scratch/)

When auditing boundary conditions or failure paths, author a self-contained inline probe script in `<repo-root>/.scratch/`:
1. **Inline Probe**: Author `.scratch/repro_edgecase_<name>.*` via `write_to_file` directly importing unmodified project dependencies and defining or wrapping the uncommitted proposed logic inline (or clone the target file into `.scratch/shadow_edgecase_<name>.*` with adjusted relative imports if full-module replacement is required).
2. **Probe Execution**: Execute the probe using the appropriate runtime (`node .scratch/...`, `npx tsx .scratch/...`, `python .scratch/...`) with boundary payloads (null, 0, empty collection, overflow, concurrent bursts) under a 15s execution timeout.
3. **Cite Proof**: Write evaluation to `.scratch/deep_review/reports/Edgecase.md` via `write_to_file`, including thrown stack traces, unexpected return values, unhandled promise rejections, or execution timeouts/process hangs.

> [!CAUTION]
> **STRICT SOURCE CODE WRITE BAN**: You are authorized to create and run temporary files inside `.scratch/` ONLY. You MUST NOT modify or delete project source files. Write all findings to `.scratch/deep_review/reports/Edgecase.md`.

## Mandatory Audit Checklist

1. **Boundary Values**: Empty collections, zero values, max string lengths, numeric overflows.
2. **Resource Contention & Teardown Failures**: Network timeouts, disk exhaustion, API rate limits, filesystem/database lock contentions (e.g. external process locks, unreleased handles), and recovery from aborted cleanups.
3. **Concurrency & Race Conditions**: Simultaneous requests, stale cache hits, re-entrancy risks.
4. **Malformed Payload Handling**: Missing JSON keys, invalid data types, unescaped special characters.

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Resource Lifecycle & Teardown** | Process resource allocation (defer/RAII), OS file handles, signal handling (SIGTERM), orphan prevention | [`EDGE-RESOURCE-CLEANUP.md`](EDGE-RESOURCE-CLEANUP.md) |
| **Network Faults & Partitions** | Network partitions, RPC timeouts, circuit breaker state integrity, exponential backoff jitter | [`EDGE-NETWORK-PARTITION.md`](EDGE-NETWORK-PARTITION.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if an unhandled edge case could cause crashes, unhandled exceptions, or silent data corruption.
- Return `STATUS: PASS` if all failure paths have explicit mitigation specifications.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/Edgecase.md` via `write_to_file` using this format:

### Review Evaluation: Edgecase Detector

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
