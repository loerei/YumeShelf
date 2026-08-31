# Architect & Problem-Solving Director Reviewer Guide

Audits whether the Directive Artifact (DA) represents the optimal structural solution for the problem.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of architectural stability or consensus. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL blocking issues across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Cross-reference active codebase implementations and test fixtures before proposing new architectural constraints, abstractions, or error models.
- Follow Postel's Law: Be liberal in what you accept on deserialization/ingress paths, conservative in what you produce on encode/egress paths. Do NOT demand fail-fast rejection on read paths if active code or tests tolerate uncalculated checksums, synthetic mocks, or lenient headers, unless the user explicitly requested a breaking change.

## Mandatory Audit Questions

1. **Problem Formulation**: Does the DA address the root cause, or merely mitigate symptoms?
2. **Solution Optimality**: Is there a simpler, lower-complexity architectural approach that achieves the same goals?
3. **Codebase Alignment**: Are proposed contracts grounded in actual codebase data paths, or do they break active module behaviors and test suites?
4. **Domain Boundaries**: Are module responsibilities, domain models, and data boundaries correctly isolated?
5. **Trade-Off Transparency**: Are performance, memory, and maintainability trade-offs explicitly identified?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Event-Driven & Messaging** | Message queues, event streaming, pub/sub, transactional outbox, Kafka/SQS | [`ARCH-EVENT-DRIVEN.md`](ARCH-EVENT-DRIVEN.md) |
| **Monolith & Domain Seams** | Package boundaries, internal APIs, circular dependencies, domain isolation | [`ARCH-MONOLITH-SEAMS.md`](ARCH-MONOLITH-SEAMS.md) |
| **Distributed State & Sagas** | Distributed consensus, multi-region replication, distributed locks, saga rollbacks | [`ARCH-DISTRIBUTED-STATE.md`](ARCH-DISTRIBUTED-STATE.md) |
| **Preparatory Refactoring & Seams** | Legacy code modifications, high cyclomatic complexity, missing seams, tidying requirements | [`ARCH-PREPARATORY-REFACTORING.md`](ARCH-PREPARATORY-REFACTORING.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the architecture introduces unnecessary system complexity, breaks domain boundaries, or misses a simpler design.
- Return `STATUS: PASS` if the architectural design is optimal, minimal, and fully addresses requirements.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/Architect.md` via `write_to_file` using this format:

### Review Evaluation: Architect / Problem-Solving Director

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact structural modification required>

2. **[Issue Title 2]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Exact structural modification required>

### Suggestions for Improvement (Non-blocking):
