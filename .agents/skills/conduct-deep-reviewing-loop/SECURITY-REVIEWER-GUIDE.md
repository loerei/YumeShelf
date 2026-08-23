# Security & Data Integrity Reviewer Guide

Audits authorization boundaries, data validation, and vulnerability vectors in the DA.

## Mandatory Audit Checklist

1. **Authn / Authz Boundaries**: Are tenant isolation, user permissions, and API tokens explicitly enforced?
2. **Input Sanitization**: Are path traversals, SQL/command injections, and unescaped HTML prevented?
3. **Secret & Key Protection**: Are credentials, tokens, or private keys kept out of source code and logs?
4. **Data Corruption Risks**: Are mutations wrapped in transactional boundaries with rollback guarantees?

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if any security vulnerability, unauthorized access vector, or data loss risk is present.
- Return `STATUS: PASS` if security controls and data validation are complete.

## Standard Output Protocol

Save evaluation to `scratch/deep_review/Report_and_Rationale_Security.md` using this format:

### Review Evaluation: Security Reviewer

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Security Defects):

1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**:
