# Observability & Operability Specialist Reviewer Guide

Audits telemetry, error diagnostic context, feature flags, health checks, and operability in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of observability. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL observability gaps, silent error swallowing, missing traces, and telemetry flaws across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground telemetry requirements in the operational environment of the codebase. Do NOT demand distributed tracing spans on local utility scripts or private helper functions.
- **Dependency Lineage Alignment**: If `.scratch/deep-review/Context.md` specifies `## Cross-Referenced DAs & Dependency Lineage`, you MUST read all listed DAs:
  - Cross-reference telemetry events, progress streaming formats, and error logging contracts against `Upstream` DAs to ensure consistent event naming, log formatting, and secret redaction without schema fragmentation across subsystems.
- Follow Postel's Law: Capture diagnostics without failing business logic or crashing on missing telemetry endpoints.

**Fix Pre-Verification**:
- **Ground-Truth**: Verify on disk that any pre-existing method, type, or module referenced or consumed by a proposed fix actually exists in the target codebase, upstream specs, or planned declarations within the target DA itself. If introducing new methods, types, or interfaces, verify that their target landing locations exist (or are scheduled for creation in the DA), names do not collide with active exports, all consumed external dependencies are verified on disk or in upstream specs, and for internal communication boundaries (e.g. IPC, RPC, events), verify that both producer/caller and consumer/handler endpoints are updated symmetrically.
- **Macro Flow**: Verify that trace context propagation, structured error logging, and telemetry lifecycle remain uninterrupted across asynchronous execution and service boundaries.

## Mandatory Audit Checklist

1. **Structured Telemetry & Context**: Does error handling log sufficient structured context (operation ID, timestamp, resource identifiers, error stack)? Are secrets, tokens, and PII strictly redacted? Are telemetry logs guaranteed to flush synchronously on unhandled process exit?
2. **Silent Error Swallowing Prevention**: Are empty catch blocks (`catch {}`), discarded promise rejections, or dropped error stacks eliminated?
3. **Trace Context Propagation**: Are distributed trace identifiers (such as W3C traceparent headers) and request correlation IDs explicitly propagated across asynchronous boundaries and worker processes?
4. **Degradation & Feature Flags**: Can new capabilities or high-risk paths be disabled via feature flags or kill-switches during incidents? Are graceful degradation paths defined?
5. **Health Checks & Metric Cardinality**: Are liveness/readiness probes updated to reflect critical dependencies? Are metric tag labels constrained to prevent high-cardinality crashes in metric stores?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Telemetry, Tracing & Logs** | OpenTelemetry span context propagation across network hops, structured log key-value schemas, dynamic log levels | [`OBS-TELEMETRY-TRACING.md`](OBS-TELEMETRY-TRACING.md) |
| **Alerting, SLOs & Probes** | Alerting configurations, SLO/SLA definitions, health check endpoints, DLQ backlog monitoring thresholds | [`OBS-ALERTING-SLO.md`](OBS-ALERTING-SLO.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if error paths swallow context, leak sensitive data, lack operational kill-switches for high-risk changes, or cause unobservable silent failures.
- Return `STATUS: PASS` if telemetry, diagnostics, and operational controls are comprehensive.

## Standard Output Protocol

Save evaluation to `.scratch/deep-review/reports/Observability.md` via `write_to_file` using this format:

### Review Evaluation: Observability & Operability Specialist

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact observability enhancement required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols>
   - **Macro Flow Proof**: <Verification that trace context propagation, structured error logging, and telemetry lifecycle remain uninterrupted across asynchronous execution and service boundaries>

2. **[Issue Title 2]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact observability enhancement required>
   - **Ground-Truth Proof**: <Path and symbol in codebase or upstream spec proving existence of referenced APIs/types, or verified target landing location and non-collision confirmation for newly proposed symbols>
   - **Macro Flow Proof**: <Verification that trace context propagation, structured error logging, and telemetry lifecycle remain uninterrupted across asynchronous execution and service boundaries>

### Suggestions for Improvement (Non-blocking):

Once your report is written, send a notification message back to Host via `send_message` confirming completion.

- <Optional telemetry polish or future monitoring item that does NOT block PASS status>

## Gate Response Protocol (Host Interaction)

If Host determines that any issue in your report lacks Ground-Truth Proof, lacks Macro Flow Proof, cites non-existent codebase APIs, breaks boundary contract symmetry, introduces cross-section contradictions, or violates scope boundaries, Host will file `.scratch/deep-review/reports/Observability_Gated_Issues.md` and notify you via message.

Upon receiving a gating notification from Host, you MUST read `.scratch/deep-review/reports/Observability_Gated_Issues.md` via `view_file` and choose one of three actions:

1. **Refine / Complete as Requested**:
   - If the defect is real but your proposed fix was ungrounded, broke boundary symmetry, or introduced intra-DA contradictions:
   - Edit `.scratch/deep-review/reports/Observability.md` in-place via native `write_to_file`.
   - Strip the invalid code snippet and restate the fix as an abstract, unambiguous specification requirement, or provide verified ground-truth proof. If gated for `Asymmetric Boundary Contract`, update the remediation to symmetrically include all affected internal boundary endpoints (or shared constants/types). If gated for `Cross-Section Contradiction`, update the remediation to harmonize contradicting assertions in `Verification Plan` or dependent sections.
   - If `.scratch/deep-review/reports/Observability_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

2. **Remove**:
   - If Host's evidence shows the defect is invalid, false-positive, or speculative:
   - Edit `.scratch/deep-review/reports/Observability.md` in-place via native `write_to_file`, removing that issue completely.
   - If all blocking issues are removed from your report, update your status to `- **Status**: STATUS: PASS`.
   - If `.scratch/deep-review/reports/Observability_Explain.md` was authored in a prior turn of the active tier batch, reviewer MUST invalidate it (either by deleting it, or by overwriting it with empty content via `write_to_file(CodeContent="")` if native file deletion tools are unavailable) to eliminate stale defense artifacts; Host handles authoritative physical file removal upon accepting the updated report.

3. **Reject Gating/Removal and Explain**:
   - If you have concrete, differing codebase evidence proving the defect and proposed fix are correct and complete:
   - Author `.scratch/deep-review/reports/Observability_Explain.md` via native `write_to_file`, detailing the exact file paths, line numbers, and runtime data flow that prove validity.
   - You MUST ALSO update `.scratch/deep-review/reports/Observability.md` in-place to integrate the substantiated `Ground-Truth Proof`, `Macro Flow Proof`, and clean remediation text, ensuring `Observability.md` remains the clean single source of truth for Host aggregation.
   - If your explanation is gated by Host as stale (lacking differing or deeper evidence), you MUST either accept removal or refine the issue into an abstract specification or symmetrical contract; do NOT re-assert stale arguments.

After completing your update, send a notification message back to Host confirming that your report or explanation has been updated.
