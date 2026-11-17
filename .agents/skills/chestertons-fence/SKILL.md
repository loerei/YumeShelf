---
name: chestertons-fence
description: Use before deleting, disabling, or weakening existing code, schemas, validation rules, or pipelines.
---

# Chesterton's Fence

Verify why an existing structure, validation rule, schema, or configuration exists BEFORE deleting, disabling, or weakening it.

## Directives

1. **Gather Evidence First**: Before proposing removal or relaxation, inspect callers/importers, tests, and git history (`git log -S` / `git blame`) to establish original intent.
2. **Distinguish Contract vs. Defect**: If the underlying goal remains valid, fix the implementation defect; NEVER delete or dilute the contract.
3. **Trace Upstream First**: Verify whether runtime errors originate from invalid upstream data providers before altering downstream enforcers.
4. **Approval Gate**: Output the Intent Audit report and obtain explicit user approval BEFORE modifying or deleting code.

## Decision & Failure Matrix

| Condition | Recommendation | Action |
| :--- | :--- | :--- |
| Goal remains valid; bug is in local implementation | `[PRESERVE & FIX]` | Fix the defect while preserving the contract. |
| Goal remains valid; error comes from invalid upstream input | `[FIX UPSTREAM]` | Fix the upstream provider; keep downstream enforcement intact. |
| Verified 100% obsolete (0 callers, no security or edge-case contract) | `[SAFE REMOVAL]` | Document evidence and remove safely after user approval. |
| Intent cannot be confirmed from code, tests, or git history | `[BLOCKED: UNKNOWN INTENT]` | Do NOT delete or weaken; present findings and ask the user. |

## Audit Report Output

```markdown
### Chesterton's Fence Intent Audit

**Target Entity**: `<file-path / symbol-name / rule>`

1. **Primary Objective**: Problem this logic was built to solve (cite code/tests/commit).
2. **Latent Shielding**: Edge cases, invariants, or security checks relying on this.
3. **Downstream Dependencies**: Callers, APIs, schemas, or pipelines depending on this contract.
4. **Failure Surface**: `[Implementation Defect]` vs `[Upstream Invalid Input]` vs `[Obsolete]` vs `[Unknown]`.

**Recommendation**: `[PRESERVE & FIX | FIX UPSTREAM | SAFE REMOVAL | BLOCKED: UNKNOWN INTENT]`
```
