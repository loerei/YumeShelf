# Observability & Operability Specialist Reviewer Guide

Audits telemetry, error diagnostic context, feature flags, health checks, and operability in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of observability. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL observability gaps, silent error swallowing, missing traces, and telemetry flaws across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground telemetry requirements in the operational environment of the codebase. Do NOT demand distributed tracing spans on local utility scripts or private helper functions.
- **Dependency Lineage Alignment**: If `.scratch/deep_review/Context.md` specifies `## Cross-Referenced DAs & Dependency Lineage`, you MUST read all listed DAs:
  - Cross-reference telemetry events, progress streaming formats, and error logging contracts against `Upstream` DAs to ensure consistent event naming, log formatting, and secret redaction without schema fragmentation across subsystems.
- Follow Postel's Law: Capture diagnostics without failing business logic or crashing on missing telemetry endpoints.

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

Save evaluation to `.scratch/deep_review/reports/Observability.md` via `write_to_file` using this format:

### Review Evaluation: Observability & Operability Specialist

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

- <Optional telemetry polish or future monitoring item that does NOT block PASS status>
