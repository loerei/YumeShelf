# General Logic Reviewer Guide

Audits operational workflows, algorithmic correctness, and state consistency in the DA.

## Mandatory Audit Questions

1. **Workflow Correctness**: Are execution steps sequential, complete, and free of logical gaps?
2. **State Machine Integrity**: Are all state transitions defined with explicit entry/exit conditions?
3. **Data Flow Validation**: Do inputs correctly transform into expected outputs across processing boundaries?
4. **Invariant Preservation**: Are core operational invariants maintained during error states?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if logic gaps, invalid state transitions, or deadlocks exist.
- Return `STATUS: PASS` if logic is fully deterministic and complete.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_Logic.md` using this format:

### Review Evaluation: General Logic Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Logic Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
