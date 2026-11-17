# Mode B: Post-Implementation Coverage Validation Reference

> [!IMPORTANT]
> **Audience: MAIN AGENT ONLY.**  
> This document contains prompt synthesis templates and orchestration protocols for the Main Agent.  
> **NEVER** pass this file or its path under `Required Reading` to Subagent Reviewers. Subagents must be given [REVIEWER-CODE-VALIDATION.md](REVIEWER-CODE-VALIDATION.md) and [REVIEWER-ANTI-LAZINESS.md](REVIEWER-ANTI-LAZINESS.md).

Templates, checklist builders, and .diff artifact protocols for validating codebase implementation against an approved plan.

---

## 1. Mode B: Post-Implementation Coverage Validation Prompt Template

Use when creating `scratch/reviewer_prompt_v1.md` to audit actual code changes against an APPROVED plan:

```markdown
You are Implementation Coverage Validator #<N>. Audit the codebase implementation against the approved Implementation Plan.

### Audit Goal:
Verify that 100% of the features, safety guarantees, edge-case fixes, and schema definitions specified in the approved plan are accurately, completely, and correctly implemented in the real codebase. Do NOT invent new requirements or alter the approved implementation plan.

### Required Reading (MUST read using your native file-reading or search tools):
1. Approved Implementation Plan: `<plan_path>`
2. Diff Artifact: `<diff_path>` (e.g. `<scratch_dir>/patch_changes.diff`)
3. Key Codebase Implementation Files: `<code_file_paths>`
4. Repository Guidelines: `AGENTS.md`
5. Reviewer Discipline & Output Protocol: `<skill_dir>/REVIEWER-CODE-VALIDATION.md`
6. Anti-Laziness Audit Criteria: `<skill_dir>/REVIEWER-ANTI-LAZINESS.md`
7. Task-Specific Domain Skills: `<task_domain_skill_paths>`

### Dynamic Coverage Verification Checklist:
1. **Plan Feature Coverage**: Does the `.diff` and codebase implement 100% of the specified features in the plan?
2. **Task Checklist Verification**: Is every planned edit and verification item in `implementation_plan.md` backed by actual code in the `.diff` patch?
3. **Safety & Transactional Guarantees**: Are rollback, directory creation, cleanup, and crash recovery mechanisms fully present?
4. **Edge-Case & Line Handling**: Are empty/new file creation, boundary checks, and line end encodings handled correctly?
5. **Validation & State Consistency**: Are duplicate path checks, cache flags, and state initializations accurate?
6. **Backward Compatibility**: Are legacy wrappers and public API schemas fully preserved?

*Evaluate strictly per `<skill_dir>/REVIEWER-CODE-VALIDATION.md` and `<skill_dir>/REVIEWER-ANTI-LAZINESS.md` (resolving `<skill_dir>` relative to the active skill location).*
```

---

## 2. Post-Implementation Coverage Validation Checklist (Main Agent Guidance)

When synthesizing the prompt checklist, ensure coverage across:

- [ ] 100% of plan targets and verification checks verified in `.diff` and target files
- [ ] Zero forbidden placeholder comments (`// ...`, `// TODO`, empty stubs) per [REVIEWER-ANTI-LAZINESS.md](REVIEWER-ANTI-LAZINESS.md)
- [ ] Adherence to task-specific domain skills (`<task_domain_skill_paths>`) verified
- [ ] Unit tests added covering new edge cases specified in plan
- [ ] Tool/API schemas and parameter contracts match plan definitions
- [ ] Optimistic locking, cleanup post-rollback, and startup recovery verified in code
- [ ] Zero unhandled exception paths or hidden `AttributeError` / `NameError` bugs
- [ ] Out-of-Scope / Non-Goals exclusions explicitly recorded

---

## 3. Mode B .diff Artifact & Immutable Plan Protocol

1. **Generate `.diff` Artifact**: Run `git diff origin/<default-branch>` (or target base branch, capturing both committed and working tree edits) and save the untruncated patch to `<scratch_dir>/patch_changes.diff`.
2. **Provide 3-Way Context**: Supply the subagent reviewer with:
   - Approved `implementation_plan.md` path.
   - `.diff` artifact path (`<scratch_dir>/patch_changes.diff`).
   - Core codebase implementation and test files.
3. **Iterative `.diff` Regeneration**: In Mode B, after applying codebase fixes in iteration $N$, the Main Agent MUST re-generate `scratch/patch_changes.diff` before spawning Reviewer $N+1$.
4. **Immutable Plan Principle**: In Mode B, the approved plan is treated as immutable. Reviewers must NOT request edits to the plan; any discrepancy between plan and code must be resolved by fixing the **codebase**.
