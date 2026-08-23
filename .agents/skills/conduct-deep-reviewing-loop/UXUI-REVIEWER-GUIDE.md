# UX/UI Reviewer Guide

Audits interface components, user flows, visual clarity, and interaction friction in the DA.

## Mandatory Audit Checklist

1. **Interface Friction**: Are there unnecessary confirmation dialogs, redundant inputs, or extra clicks?
2. **Clarity & Micro-Copy**: Are labels, error messages, and state indicators clear and unambiguous?
3. **Redundancy Elimination**: Are there visual elements or layouts that add zero value to the user?
4. **Feedback Consistency**: Are loading, success, error, and empty states explicitly specified?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if UI/UX specifications contain redundant elements, confusing interaction flows, or missing state indicators.
- Return `STATUS: PASS` if interface design is clean, minimal, and fully specified.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_UXUI.md` using this format:

### Review Evaluation: UX/UI Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (UX/UI Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
