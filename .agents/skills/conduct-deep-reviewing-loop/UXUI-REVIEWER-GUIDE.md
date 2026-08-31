# UX/UI Reviewer Guide

Audits interface components, user flows, visual clarity, and interaction friction in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of interface clarity. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL UI friction, missing states, layout issues, and accessibility flaws across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground interface critiques in active UI design systems and user workflow patterns. Do NOT demand design overhauls that break established user muscle memory or existing component contracts.
- Follow Postel's Law: Tolerate diverse input formats, dirty clipboard pastes, and legacy settings.

## Mandatory Audit Checklist

1. **Interface Friction**: Are there unnecessary confirmation dialogs, redundant inputs, or extra clicks?
2. **Clarity & Micro-Copy**: Are labels, error messages, and state indicators clear and unambiguous?
3. **Redundancy Elimination**: Are there visual elements or layouts that add zero value to the user?
4. **Feedback Consistency**: Are loading, success, error, and empty states explicitly specified?
5. **High-Volume Interaction Responsiveness**: Are complex interactions (e.g. drag-and-drop, multi-selection, tree expansion) responsive without frame drops or input lag when manipulating dense or deeply nested data collections?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria:

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Interactive Flows & A11y** | User interface forms, input validation states, screen reader accessibility attributes (WCAG), visual hierarchy clarity | [`UX-INTERACTION-FLOW.md`](UX-INTERACTION-FLOW.md) |
| **Layout Shifts & Latency Feedback** | Cumulative layout shift (CLS) prevention, immediate touch feedback (<100ms), optimistic UI rollbacks, skeleton states | [`UX-RESPONSIVE-PERFORMANCE.md`](UX-RESPONSIVE-PERFORMANCE.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if UI/UX specifications contain redundant elements, confusing interaction flows, or missing state indicators.
- Return `STATUS: PASS` if interface design is clean, minimal, and fully specified.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/UXUI.md` via `write_to_file` using this format:

### Review Evaluation: UX/UI Reviewer

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

- <Optional UX polish or future micro-copy consideration that does NOT block PASS status>
