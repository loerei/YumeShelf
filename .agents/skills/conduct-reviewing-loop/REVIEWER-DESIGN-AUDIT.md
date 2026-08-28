# Reviewer Discipline: Design & Plan Audit Reference (Mode A)

Core operational rules, anti-pedantry constraints, and output formatting for Subagent Reviewers auditing draft plans, PRDs, RFCs, or specifications BEFORE coding.

---

## 1. Reviewer Discipline & Anti-Pedantry Directives

As a Design/Plan Reviewer, audit strictly against verified gaps, missing requirements, and concrete defects. Do NOT invent speculative feedback to justify the review invocation.

1. **Strict Scope Boundary**:
   - Audit ONLY against explicit checklist items provided in the prompt, repository rules (`AGENTS.md`), and referenced domain skills.
   - NEVER demand features, configs, abstractions, or hypothetical future-proofing not requested in the task.
2. **High Threshold for `STATUS: REVISIONS NEEDED`**:
   Reserve `REVISIONS NEEDED` STRICTLY for real blocking defects in the draft document:
   - Architectural flaws, contract breaks, or missing user requirements.
   - Unhandled edge-case failures, data corruption risks, or crash bugs.
   - Security vulnerabilities (path traversal, command injection, unescaped queries).
   - Incomplete test surface (`tdd`) or missing edge cases in the verification plan.
   - For Implementation Plans: Missing mandatory section scaffold (`AGENTS.md` Section 2) or incomplete Execution Checklist (`- [ ]`).
   DO NOT return `REVISIONS NEEDED` for subjective phrasing preferences, cosmetic naming debates, or speculative polish.
3. **Restrain Non-Blocking Wishlists**:
   - If the draft satisfies 100% of requirements and handles edge cases cleanly, return `STATUS: PASS`.
   - Do NOT manufacture non-blocking suggestions just to produce output.
4. **Single-Pass Exhaustiveness & Zero Drip-Feeding**:
   - MUST perform an exhaustive full-document sweep from beginning to end before formulating conclusions.
   - Finding a blocking issue early in the document MUST NOT trigger early termination. Report an unabridged inventory of ALL blocking issues across the entire document in a single pass.
   - Do NOT defer discovered flaws to subsequent rounds.
5. **Ground-Truth Alignment & Postel's Law**:
   - Cross-reference active codebase implementations and test suites before demanding strict validation or new error classes.
   - Follow Postel's Law: Be liberal in what you accept on deserialization/decode paths, conservative in what you produce on encode/save paths.
   - NEVER demand theoretical contract purities that break established working tests or mock data.

---

## 2. Review Target & Standard Output Protocol

- The review target is the **draft document** (`implementation_plan.md`, PRD, RFC).
- All findings MUST specify numbered required edits to the text of the draft document.

Conclude evaluation and report back to the parent agent using `send_message` with this exact structure:

```markdown
### Review Evaluation: Reviewer #<N>

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- Compile an exhaustive, unabridged list of EVERY blocking flaw found across the entire document. Do NOT truncate or defer issues. -->

1. **[Issue Title 1]**: <Concrete description of flaw, gap, or broken requirement>
   - **Target Section**: `<Section Name / Draft Path>`
   - **Required Edit**: <Exact modification to be made to the draft document>

2. **[Issue Title 2]**: <Concrete description of flaw, gap, or broken requirement>
   - **Target Section**: `<Section Name / Draft Path>`
   - **Required Edit**: <Exact modification to be made to the draft document>

### Suggestions for Improvement (Optional / Non-blocking):
- <Optional polish or future backlog considerations that do NOT block PASS status>
```

Conclude explicitly with either:
- **`STATUS: REVISIONS NEEDED`** (if one or more blocking issues exist).
- **`STATUS: PASS`** (if zero blocking issues exist).
