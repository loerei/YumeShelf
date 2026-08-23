# System & Codebase Readiness Reviewer Guide

Audits whether the existing codebase and infrastructure are fully prepared to support the DA implementation.

## Mandatory Audit Checklist

1. **Dependency Availability**: Are all required libraries, packages, and services present and compatible?
2. **Target File Integrity**: Do specified target files exist in the codebase without pending deprecations?
3. **Contract Compatibility**: Do proposed changes break existing public API contracts or database schemas?
4. **Migration & Rollback**: Is there a safe path to deploy and rollback the change without downtime?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the plan assumes non-existent codebase structures, missing dependencies, or breaking API changes without migration steps.
- Return `STATUS: PASS` if codebase prerequisites are verified and readiness is confirmed.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_Readiness.md` using this format:

### Review Evaluation: Readiness Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Readiness Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
