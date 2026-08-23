# Edgecase Detector Reviewer Guide

Audits boundary conditions, failure paths, and unexpected environment states in the DA.

## Mandatory Audit Checklist

1. **Boundary Values**: Empty collections, zero values, max string lengths, numeric overflows.
2. **Resource Failures**: Network timeouts, disk space exhaustion, API rate limits, database lock timeouts.
3. **Concurrency & Race Conditions**: Simultaneous requests, stale cache hits, re-entrancy risks.
4. **Malformed Payload Handling**: Missing JSON keys, invalid data types, unescaped special characters.

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if an unhandled edge case could cause crashes, unhandled exceptions, or silent data corruption.
- Return `STATUS: PASS` if all failure paths have explicit mitigation specifications.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_Edgecase.md` using this format:

### Review Evaluation: Edgecase Detector

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Edge Case Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
