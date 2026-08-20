---
name: chestertons-fence
description: Execute a 4-Quadrant Intent Audit before deleting, refactoring, or diluting legacy code, database schemas, validation rules, or CI/CD pipelines. Use when user mentions "chesterton", "chestertons fence", "intent audit", "why was this built", "audit before delete", or invokes /chestertons-fence or /intent-audit.
---

# Chesterton's Fence

Analyze why an existing system structure, feature, validation rule, or configuration was built BEFORE deleting, disabling, or modifying it.

## Decision Workflow

```mermaid
flowchart TD
    Trigger["Friction / Refactor Candidate Identified"] --> Q1["Q1: Primary Objective<br/>What active goal does this fulfill?"]
    Q1 --> Q2["Q2: Latent Shielding<br/>What edge cases or security concerns does it protect?"]
    Q2 --> Q3["Q3: Dependency Graph<br/>What callers, APIs, or DB queries rely on this?"]
    Q3 --> Q4["Q4: Failure Surface<br/>Is contract broken or is upstream input invalid?"]
    Q4 --> Decision{"Is Entity 100% Obsolete?"}
    Decision -->|"No (Goal remains valid)"| PreserveFix["Fix defect while preserving contract"]
    Decision -->|"Yes (Dead code)"| DocumentRemoval["Document Audit & Execute Safe Removal"]
```

## Audit Report Output

Output this structured report and obtain user alignment BEFORE making code changes:

```markdown
### Chesterton's Fence Intent Audit

**Target Entity**: `<file-path / symbol-name / feature-name>`

1. **Primary Objective (Q1)**: Problem this logic was originally built to solve.
2. **Latent Edge-Case Shielding (Q2)**: Edge cases, security checks, or flows relying on this.
3. **Downstream Dependency Graph (Q3)**: Modules, callers, or DB queries depending on this contract.
4. **Failure Surface Diagnosis (Q4)**: `[Broken Contract]` vs `[Implementation Defect]`. Upstream vs local failure.

---

**Recommendation**:
- `[PRESERVE & FIX]`: Fix code bug while preserving domain contract.
- `[SAFE REMOVAL]`: Verified 100% dead code / obsolete contract.
```

## Directives

1. **Distinguish Contract vs Defect**: If the feature's goal remains valid, fix the implementation defect; NEVER delete or dilute the contract.
2. **Trace Upstream First**: MUST verify if runtime errors originate from invalid upstream data providers before altering downstream enforcers.
