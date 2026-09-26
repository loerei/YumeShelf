---
name: write-a-skill
description: Use when asked to create, write, or build a new skill.
---

# Write a Skill

Create and distribute agent skills across workspaces.

## Directives

1. **Description Format**: MUST use format `Use when [specific triggers]` in 10–14 words. NEVER summarize internal features (What), explain benefits (Why), or include slash commands.
2. **Plain English**: State direct instructions; NEVER use self-important titles or marketing fluff (`orchestrate`, `robust`, `comprehensive pipeline`).
3. **Progressive Disclosure**: Keep `SKILL.md` lean. Disclose heavy tables, checklists, or domain guides into sub-documents (`REFERENCE.md` or `<DOMAIN>.md`) per [HEURISTICS.md](HEURISTICS.md).
4. **Mermaid Decision Trees**: Use flowcharts ONLY for workflows with 3+ branching paths or error recovery loops. Do NOT use for flat linear steps.
5. **Mindset Over Micro-Format**: Directives MUST state the thinking principle for the agent to adopt rather than rigid output templates. Do NOT prescribe arbitrary response structures.
6. **Prerequisite**: MUST read `write-for-ai/SKILL.md` before drafting or editing any skill.

| Bad (Bloated Fluff) | Good (Plain English) |
| :--- | :--- |
| `Comprehensive Execution Architecture` | `Workflow` |
| `Verify optimal state convergence across targets` | `Verify all tests pass` |
| `Forensic behavioral telemetry capture on anomalies` | `Save error logs to a file on failure` |

---

## SKILL.md Template

```markdown
---
name: <skill-name>
description: Use when [specific triggers].
---

# <Skill Title>

<1-sentence description of purpose and produced artifacts>.

## Directives

1. **<Rule 1>**: MUST/NEVER [Actionable constraint].

---

## Template / Output Format

<Clean markdown template or code block with placeholders>

---

## Workflow

1. <Step 1: Inspect/Audit>
2. <Step 2: Execute/Draft>
3. <Step 3: Verify & Sync via agents distribute>
```

---

## Subdoc References

- Extraction thresholds: see [HEURISTICS.md](HEURISTICS.md).
- Execution patterns and failure modes: see [REFERENCE.md](REFERENCE.md).

---

## Workflow

1. **Gather Requirements**: Identify domain scope, target category, and required tool integrations.
2. **Draft Skill**: Write `SKILL.md` following Directives and Template. Evaluate subdoc extraction per [HEURISTICS.md](HEURISTICS.md).
3. **Present Plan**: Review draft with user and incorporate feedback.
4. **Distribute & Audit**:
   - Write files to `<category>/<skill-name>/`.
   - Run `agents distribute` to sync all registered workspaces and IDE configs.
   - Run `agents audit -a -p` to verify Table 1 coverage in `AGENTS.md`. If audit reports missing Table 1 coverage, add skill to `AGENTS.md` and re-run.
