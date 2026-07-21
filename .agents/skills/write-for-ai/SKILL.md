---
name: write-for-ai
description: Review, edit, or write AI-facing text — tool descriptions, MCP instructions, system prompts, AGENTS.md, GEMINI.md, SKILL.md frontmatter, parameter docs, error messages — so the AI reads it correctly with minimum tokens. Use when user asks to review, optimize, rewrite, or create any text that an AI model will read rather than a human.
---

# Write for AI

Text written for AI must help it make decisions — not explain how things work, not reassure, not market.

## Core Rules

1. **One sentence = one decision signal.** Each sentence must help the AI distinguish this tool/concept from alternatives. If removing it changes nothing, remove it.
2. **No mechanism explanations.** Say what happens, not how it's implemented internally.
3. **No marketing adjectives.** Cut: robust, seamless, powerful, atomic, crash-resilient, smart, advanced, best-in-class.
4. **Don't repeat the schema.** Tool descriptions must not restate what parameter descriptions already say.
5. **Keep failure conditions.** AI needs to know *when it will fail* to plan its next step.
6. **Prefer tables for decision rules.** Tables cost fewer tokens than equivalent prose for the same information density.
7. **Don't rename domain terms.** If a word is used consistently in the codebase or spec, keep it -- even if a synonym sounds simpler.
8. **Only add information to resolve ambiguity.** Add a purpose statement only if it helps AI distinguish this tool from an alternative. Don't add what the tool name already implies.
9. **Don't cut "e.g." from enum lists** unless you've confirmed the list is exhaustive. Removing it signals to AI that the list is complete when it may not be.
10. **Preserve rule-strength signals.** MUST, NEVER, do NOT, 100%, always in rule context are not filler -- they signal non-negotiability. Only cut if the surrounding sentence already carries absolute force without them.

## Noise Checklist (things to cut)

- Implementation details the AI can't act on ("uses SHA-256", "Fuzz = 0", "ephemeral backup files")
- Reassurance phrases ("safely", "no corrupted files", "with a safety lock")
- Restatements of parameter descriptions
- Reasons the feature was built ("cutting token usage roughly in half")
- Filler qualifiers ("robust", "powerful", "seamlessly")
- Synonym swaps that add no meaning ("Max" -> "Maximum", "Retrieve" -> "Get")

## Workflow

### Review / Optimize
1. Read the text as if you are the AI receiving it
2. For each sentence: "Does this change what action I would take?" -- if no, cut
3. Present: original -> trimmed, with one-line rationale per cut
4. Apply only after user confirms

### Write New
Ask before writing:
- What does this thing do (one verb phrase)?
- When should AI choose this over alternatives?
- What happens when it fails -- does AI need to know to recover?
- Is any of this already in the parameter schema or a linked doc?

## Text Types

| Type | Must answer |
|---|---|
| Tool / function description | When to call this vs. other tools? |
| Parameter description | What value is valid / what does wrong input cause? |
| instructions.md / system prompt section | What rule governs every call to this server? |
| SKILL.md description: frontmatter | What exact phrases trigger loading this skill? |
| AGENTS.md / GEMINI.md rule | What must the agent always / never do? |
| Error message returned by tool | What should the agent do next? |

See REFERENCE.md for before/after examples of each type.
