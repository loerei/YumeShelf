---
name: write-a-skill
description: Use when asked to create, write, or build a new skill.
---

# Write a Skill

Create and distribute agent skills across workspaces.

## Directives

1. **Prerequisite**: MUST read [write-for-ai/SKILL.md](../write-for-ai/SKILL.md) before drafting or editing any skill (rules on Occam compression, non-lossy invariants, Drop Test, and portable wording live there).
2. **Description / Trigger Gate**: Frontmatter `description` MUST use format `Use when [specific triggers].` in 10-15 words. NEVER summarize internal features (What), explain benefits (Why), or include slash commands.
3. **Mindset Over Micro-Format**: Directives MUST define thinking principles and decision criteria rather than rigid output layouts that get replayed verbatim.
4. **Match Structure to Job**: Pick the lightest structure that fits the skill instead of forcing a uniform multi-section template. NEVER invent section headers for 1-2 sentences or inject unrelated meta-commands (such as `agents distribute`) into domain skills.
5. **Progressive Disclosure**: Keep `SKILL.md` under 100 lines. Extract heavy tables, branch-bound checklists, and reference guides to subdocs (`REFERENCE.md`, `<DOMAIN>.md`) per [HEURISTICS.md](HEURISTICS.md) and [REFERENCE.md](REFERENCE.md).
6. **Context-Independent Portability**: Instructions MUST stand on first principles. NEVER leak local repository paths, dataset names, or project jargon into shared skills.

---

## Skill Shapes (Frontmatter + Shape by Role)

All skills require valid YAML frontmatter (`name`, `description`, optional `disable-model-invocation: true` per [REFERENCE.md](REFERENCE.md)). Choose the body format by execution complexity:

| Skill Role | Recommended Body Shape |
| :--- | :--- |
| **Micro-habit / constraint** | Frontmatter + 2-6 direct lines (+ optional minimal snippet/template). No `## Directives` / `## Workflow` boilerplate. |
| **Workflow / orchestrator** | Frontmatter + core invariants (`MUST`/`NEVER`), sequential steps or Mermaid state machine, and explicit completion/recovery gates. |
| **Audit / reviewer / tool guide** | Scope isolation, conditional subdoc routing (`When to Load`), concrete defect contrasts (`BAD`/`GOOD`) or 4-part tool doc, and exact verdict/output schema. |

---

## Workflow

1. Identify domain scope, target category, skill shape, and tool integrations; read [write-for-ai/SKILL.md](../write-for-ai/SKILL.md).
2. Draft `SKILL.md` using the lightest matching shape and evaluate subdoc extraction per [HEURISTICS.md](HEURISTICS.md).
3. Review draft with user and incorporate feedback.
4. Write files under `<category>/<skill-name>/`, run `agents audit` to validate frontmatter/duplicates/policies, then run `agents distribute` to sync workspaces and IDEs.
