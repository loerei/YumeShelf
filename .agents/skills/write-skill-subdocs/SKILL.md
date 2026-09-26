---
name: write-skill-subdocs
description: Use when refactoring sprawling skills or extracting sub-documents.
---

# Write Skill Subdocs

Extract heavy reference material (lookup tables, schemas, templates) from `SKILL.md` into auxiliary sub-documents (`REFERENCE.md` or `<DOMAIN>.md`) via progressive disclosure.

## Directives

1. **Token Efficiency**: MUST minimize tokens loaded per execution path following `write-a-skill` heuristics.
2. **1-Level Depth Limit**: Extracted sub-documents MUST be 1-level deep relative to `SKILL.md`; NEVER link nested sub-documents from within a subdoc.
3. **No Over-Specification**: When linking extracted subdocs from `SKILL.md`, MUST use concise topic anchors (e.g. `- Domain rules: see [DOMAIN.md](DOMAIN.md)`) without cataloging internal contents.
4. **Approval Gate**: NEVER edit target `SKILL.md` or write subdocs before presenting the extraction rationale and obtaining explicit user approval.

---

## Routing Gates

| Gate | Condition | Action |
| :--- | :--- | :--- |
| **Gate 0 (No Extraction)** | No lookup tables/templates and linear prose < 150 lines | Present rationale and exit without modifying files |
| **Gate 1 (Single Subdoc)** | Tables or templates needed globally across all execution paths | Extract to single `REFERENCE.md` |
| **Gate 2 (Domain Subdocs)** | Material isolated to specific execution branches | Extract to domain-scoped subdocs (`<DOMAIN>.md`) |

---

## Workflow

1. **Audit Baseline**: Inspect target `SKILL.md` (line count, byte size, tables, templates) and evaluate against Routing Gates.
2. **Draft Plan**: Outline proposed subdocs, target file paths, and replacement relative links. Present baseline metrics and diff preview to user.
3. **Approval Gate**: Await explicit approval before modifying any files.
4. **Apply & Distribute**:
   - Write extracted content to target subdocs.
   - Replace extracted sections in `SKILL.md` with 1-level relative links.
   - Run `agents distribute` to sync all registered workspaces. If distribution fails or links break, revert edits and inspect paths.
