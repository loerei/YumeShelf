# Architect & Problem-Solving Director Reviewer Guide

Audits whether the Directive Artifact (DA) represents the optimal structural solution for the problem.

## Mandatory Audit Questions

1. **Problem Formulation**: Does the DA address the root cause, or merely mitigate symptoms?
2. **Solution Optimality**: Is there a simpler, lower-complexity architectural approach that achieves the same goals?
3. **Domain Boundaries**: Are module responsibilities, domain models, and data boundaries correctly isolated?
4. **Trade-Off Transparency**: Are performance, memory, and maintainability trade-offs explicitly identified?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if the architecture introduces unnecessary system complexity, breaks domain boundaries, or misses a simpler design.
- Return `STATUS: PASS` if the architectural design is optimal, minimal, and fully addresses requirements.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_Architect.md` using this format:

### Review Evaluation: Architect / Problem-Solving Director

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Architectural Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:

### Suggestions for Improvement (Non-blocking):
