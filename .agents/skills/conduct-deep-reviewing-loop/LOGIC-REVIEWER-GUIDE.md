# General Logic Reviewer Guide

Audits operational workflows, algorithmic correctness, and state consistency in the DA.

## Cognitive Calibration (Anti-Anchoring Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Past edits are NOT evidence of logical correctness. Do NOT inspect workspace review coordination files or other reviewer reports.

## Mandatory Audit Questions

1. **Workflow Correctness**: Are execution steps sequential, complete, and free of logical gaps?
2. **State Machine Integrity**: Are all state transitions defined with explicit entry/exit conditions?
3. **Data Flow Validation**: Do inputs correctly transform into expected outputs across processing boundaries?
4. **Invariant Preservation**: Are core operational invariants maintained during error states?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if logic gaps, invalid state transitions, or deadlocks exist.
- Return `STATUS: PASS` if logic is fully deterministic and complete.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/reports/Logic.md` using this format:

### Review Evaluation: General Logic Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Logic Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
