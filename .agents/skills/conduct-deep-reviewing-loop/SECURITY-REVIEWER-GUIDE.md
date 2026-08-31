# Security & Data Integrity Reviewer Guide

Audits authorization boundaries, data validation, and vulnerability vectors in the DA.

## Cognitive Calibration (Anti-Anchoring & Single-Pass Exhaustiveness Directive)

Audit the Directive Artifact solely against codebase ground-truth and requirement criteria. Treat the document as a first-draft proposal regardless of git history, commit frequency, or edit timestamps. Verify authorization middleware, input boundaries, and secrets in actual codebase files. Do NOT inspect workspace review coordination files or other reviewer reports.

**Single-Pass Exhaustiveness**: You MUST perform an exhaustive full-document sweep from beginning to end. Report an unabridged inventory of ALL security vulnerabilities, auth gaps, and data validation flaws across the entire document in a single pass. Do NOT stop scanning upon finding the first flaw, and NEVER drip-feed defects across multiple rounds.

**Ground-Truth Alignment**:
- Ground security demands in the actual threat model of the project (e.g. local desktop/CLI vs public cloud). Do NOT demand enterprise auth on internal IPC paths if it breaks internal test suites.
- Follow Postel's Law: Allow lenient validation on internal mock fixtures; enforce strict validation on untrusted external boundaries.

## Mandatory Audit Checklist

1. **Authn / Authz Boundaries**: Are tenant isolation, user permissions, and API tokens explicitly enforced?
2. **Input Sanitization**: Are path traversals, SQL/command injections, and unescaped HTML prevented?
3. **Secret & Key Protection**: Are credentials, tokens, or private keys kept out of source code and logs?
4. **Data Corruption Risks**: Are mutations wrapped in transactional boundaries with rollback guarantees?

## Domain Subdocuments Routing Table

When the target Directive Artifact touches specific subsystem archetypes below, MUST call `view_file` on the corresponding subdocument for specialized audit criteria (OWASP ASVS Alignment):

| Target Subsystem Archetype | Triggers & Indicators | Subdocument |
| :--- | :--- | :--- |
| **Identity & Session Integrity** | Authentication flows, session tokens, JWT verification, OAuth2/OIDC, password/MFA controls | [`SEC-AUTH-IDENTITY.md`](SEC-AUTH-IDENTITY.md) |
| **API Security & Injection** | Parameterized input handling, SQL/Command injection vectors, XSS context sanitization, SSRF | [`SEC-API-INJECTION.md`](SEC-API-INJECTION.md) |

## Verdict Rules

- Return `STATUS: REVISIONS NEEDED` if any security vulnerability, unauthorized access vector, or data loss risk is present.
- Return `STATUS: PASS` if security controls and data validation are complete.

## Standard Output Protocol

Save evaluation to `.scratch/deep_review/reports/Security.md` via `write_to_file` using this format:

### Review Evaluation: Security Reviewer

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
