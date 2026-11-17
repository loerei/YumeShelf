---
name: manage-global-policies
description: Use when editing, auditing, or distributing global agent policy files (AGENTS.md).
---

# Manage Global Policies

Author global policies in the central `myskills/` catalog, then validate and distribute them to IDE global configs (`~/.gemini`, `~/.claude`, `~/.cursor`) and project workspaces.

## Core Rules

1. **Source-First**: ALWAYS edit policy files in `<myskills-root>/`. NEVER edit deployed destination copies in `~/.gemini/` or `.claude/` (they are overwritten on distribution).
2. **Policy Targets**: Universal root policy lives at `<myskills-root>/AGENTS.md`; platform delta overrides live at `<myskills-root>/<platform>/AGENTS.md` (e.g. `gemini/AGENTS.md`).
3. **Lookup**: Locate policy paths with `agents info policy.general` or `agents info policy.<platform>`, and print raw subdoc content with `agents read policy.<subdocname>`.

## Workflow

1. Edit `<myskills-root>/AGENTS.md` or `<myskills-root>/<platform>/AGENTS.md`.
2. Run `agents audit` to validate skill frontmatter and policy files.
3. Run `agents distribute` to deploy policies across IDE home configs and registered project workspaces.
4. Commit and push changes in `myskills`.
