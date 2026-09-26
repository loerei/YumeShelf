# Skill Complexity Heuristics

Rules for evaluating when to inline content in `SKILL.md` versus extracting to subdocs.

## 1. Optimization Goal

Minimize tokens loaded per execution path while keeping `SKILL.md` self-contained for standard runs:
- **Inline**: content required by all execution paths.
- **Extract**: content required only by specific branches or that causes context bloat.

---

## 2. Extraction Signals

### High-Priority Signals (Extract to Subdocs)
- **Lookup Tables**: parameter schemas, tool maps, error code tables, reference matrices.
- **Large Templates**: code scaffolds, boilerplate configs, multi-line prompt templates.
- **Branch-Specific Guides**: rules or checklists serving only one specific scenario or tool.
- **Repeated Checklists**: multi-item audit lists used across review iterations.

### Size Threshold
- **Audit Trigger (`~100 lines`)**: inspect for unextracted lookup tables or branch-specific material. Purely linear instructions under 150 lines without tables or templates may remain inline.

---

## 3. Structural Routing

| Condition | Target Location |
| :--- | :--- |
| Needed by all paths and under 100 lines | Inline in `SKILL.md` |
| Reference material or heavy tables needed across runs | Single subdoc `REFERENCE.md` |
| Rules or setup instructions isolated to specific branches | Scoped subdoc `<DOMAIN>.md` |

NEVER combine independent branch guides into a monolithic subdoc if execution paths load irrelevant bytes.

---

## 4. Extraction Tool

To extract subdocs using these heuristics, invoke the `write-skill-subdocs` skill.
