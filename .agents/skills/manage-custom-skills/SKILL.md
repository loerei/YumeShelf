---
name: manage-custom-skills
description: Use when creating, editing, auditing, or distributing custom skills in myskills.
---

# Manage Custom Skills

Author skills in the central `myskills/` catalog, then validate and distribute them to registered workspaces and IDE configs (`~/.gemini`, `~/.claude`, `~/.cursor`).

## Core Rules

1. **Source-First**: ALWAYS edit skills in `<myskills-root>/<category>/<skill-name>/SKILL.md`. NEVER edit project-local `.agents/skills/` copies (they are overwritten on distribution unless frontmatter sets `local: true`).
2. **Lookup**: Locate a skill path with `agents info skill.<skill-name>` (or `agents where` for root), and print raw skill content with `agents read skill.<skill-name>`.
3. **Frontmatter Contract**: Every `SKILL.md` frontmatter `description` MUST be 10-15 words stating ONLY when to trigger (`Use when [specific triggers].`), with no feature summaries, benefits, or slash commands:

```yaml
---
name: <skill-name>
description: Use when [specific triggers].
---
```

| Category | Domain Scope |
| :--- | :--- |
| `design/` | UI/UX, styling, frontend aesthetics, mobile/web layouts |
| `engineering/` | Architecture, TDD, debugging, domain modeling, refactoring |
| `quality/` | Sonar remediation, code reviews, benchmark testing |
| `productivity/` | Automation workflows, PRs, AI writing, issue triage |
| `personal/` | Notes, writing drafts, Obsidian vault management |

## Workflow

1. Edit source `SKILL.md` (and any subdocs) under `<myskills-root>/<category>/<skill-name>/`.
2. Run `agents audit` to validate frontmatter, duplicate names, and policy files.
3. Run `agents distribute` to sync all registered workspaces and IDEs, or `agents distribute -t <path>` for a specific project directory.
4. Commit and push changes in `myskills`.
