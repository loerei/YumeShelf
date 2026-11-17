# Mode A: Pre-Implementation Design Audit Reference

> [!IMPORTANT]
> **Audience: MAIN AGENT ONLY.**  
> This document contains prompt synthesis templates and orchestration protocols for the Main Agent.  
> **NEVER** pass this file or its path under `Required Reading` to Subagent Reviewers. Subagents must be given 1-2 matching `<Role>-REVIEWER-GUIDE.md` files from `../conduct-deep-reviewing-loop/`.

Templates, checklist builders, and anti-anchoring protocols for stress-testing and auditing unapproved plans, RFCs, PRDs, or skill drafts BEFORE writing code.

---

## 1. Mode A: Pre-Implementation Design Audit Prompt Template

Use when creating `scratch/reviewer_prompt_v1.md` to audit an unapproved plan, RFC, PRD, or skill draft:

```markdown
You are <Domain> Reviewer #<N>. Audit the proposed <Artifact Type> draft.

### Required Reading (MUST read using your native file-reading or search tools):
1. Target Artifact Draft: `<draft_path>`
2. Repository Guidelines & Rules: `AGENTS.md`
3. Domain Reviewer Guide(s): `<1-2 matching ../conduct-deep-reviewing-loop/<Role>-REVIEWER-GUIDE.md paths>`
4. Task-Specific Domain Skills: `<task_domain_skill_paths>` (e.g., `/write-a-skill`, `/write-for-ai`, `/tdd`, `/ui-design`)

### Dynamic Task Audit Checklist:
1. **User Requirements**: <Synthesized ticket/feature requirements and constraints>
2. **System Guidelines & Architecture**: <Key architectural rules from AGENTS.md and referenced skills>
3. **Domain & Edge-Case Completeness**: <Specific edge-case handling, error paths, and safety criteria>
4. **Plan Structure & Status Markers** *(For Implementation Plans)*: Verify `AGENTS.md` plan layout (`[ ]` on file headers/test commands; no standalone execution checklist sections).
5. **Coverage Completeness** *(For Implementation Plans)*: Verify proposed edits, schema changes, and edge cases are backed by verification commands.

### Mode A Output & Workspace Override (STRICT):
Use the loaded `<Role>-REVIEWER-GUIDE.md` (and any matching subdocuments inferred directly from the target draft and prompt) ONLY for audit criteria, defect signatures, and miss-probability classification.
IGNORE `<review_dir>`, `Context.md`, `sandbox/`, `reports/`, and Gate Response (`Section 6`) instructions inside those guides.
Conclude by returning your complete evaluation directly via `send_message` using this exact format (and `STATUS: PASS` or `STATUS: REVISIONS NEEDED` only; if technically impossible, explain why under Blocking Issues with `STATUS: REVISIONS NEEDED`):

```markdown
### Review Evaluation: Reviewer #<N>

- **Status**: `STATUS: PASS` or `STATUS: REVISIONS NEEDED`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
1. **[Issue Title]**: <Concrete flaw, gap, or broken requirement>
   - **Target Section**: `<Section Name / Draft Path>`
   - **Required Edit**: <Exact modification to be made to the draft document>

### Suggestions for Improvement (Optional / Non-blocking):
- <Optional polish that does NOT block PASS status>
```
```

---

## 2. Pre-Implementation Audit Checklist (Main Agent Guidance)

When synthesizing the prompt checklist, ensure coverage across:

### General Checks (All Draft Artifacts):
- [ ] User goals & constraints explicitly addressed
- [ ] Adherence to task-specific domain skills (`<task_domain_skill_paths>`) verified
- [ ] Neutral document check: No past reviewer references, meta-changelogs, or anchoring tags inside draft content
- [ ] No hardcoded env values, magic numbers, or fixed pixel layouts
- [ ] Surgical changes: only touch required files
- [ ] Empirical verification plan included (build, test, lint)
- [ ] Rollback or failure recovery strategy present
- [ ] Boundary validation, path normalization, and payload ambiguity prevented
- [ ] Out-of-Scope / Non-Goals exclusions explicitly recorded

### Plan-Specific Checks (Implementation Plans Only):
- [ ] Adherence to `AGENTS.md` plan layout (`[ ]` on file headers/test commands; no standalone steps section) verified
- [ ] Proposed file edits, schema changes, and edge cases mapped to verification checks

---

## 3. Clean & Neutral Artifact Protocol (Anti-Anchoring)

When updating draft artifacts between review iterations, integrate all fixes seamlessly as native, first-class specifications. NEVER include past reviewer references, version tags based on reviewers, or meta-changelogs inside the document body.

- **BAD (Meta-Contaminated / Anchoring Bias)**:
  > `# Plan v4 (Per Reviewer #3 Feedback)`  
  > `This plan resolves 100% of technical requirements and barriers raised by Reviewer #3.`  
  > `Fixes edgecase A pointed out by Reviewer #3 by...` *(Impact on Reviewer #4: Anchors on "This is THE resolved edgecase" rather than auditing freshly)*

- **GOOD (Clean Specification / Neutral)**:
  > `# Comprehensive Feature Upgrade Plan`  
  > `### Media-Only Message PairKey Deduplication`  
  > `Normalizes effectiveText using cleanText || media.url to ensure unique pairKey generation for media-only messages.` *(Impact on Reviewer #4: Evaluates the problem/solution neutrally as a standard, first-class specification)*
