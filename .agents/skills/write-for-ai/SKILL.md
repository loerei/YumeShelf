---
name: write-for-ai
description: Use when asked to review, edit, or deslop AI-facing text (prompts, rules, schemas).
---

# Write for AI

Text written for AI must directly drive decisions, constraints, or routing. It should never market, reassure, speculate, or over-explain.

## Core Rules

1. **One sentence = one decision signal.** Every sentence must help the AI choose a tool, set a parameter, or enforce a constraint. If removing a sentence changes nothing in AI execution, cut it.
2. **Cut noise, never signal.** Deslopping means stripping conversational fluff, marketing adjectives, and tautology, NEVER dropping domain mechanics, failure recovery procedures, parameter contracts, or operational constraints. If removing a detail deprives the agent of a recovery action or a decision branch, it MUST be preserved.
3. **Only add information to resolve ambiguity.** Add context only if two tools or rules could be confused. Do not explain what a tool name or parameter name already makes obvious.
4. **State failure modes and recovery actions.** Tell the AI *when* an action fails and *what to do next*.
5. **Delete the trigger instead of banning the artifact.** When removing an unwanted behavior created by a previous prompt or revision, delete the trigger instruction. Do not add negative constraints (`"NEVER do X"`) against artifacts that the AI has no natural baseline tendency to generate. Reserve `NEVER` and `MUST NOT` for overriding default LLM biases (e.g., sycophancy, conversational filler, hallucinating code).
6. **Use plain English, no fluff.** Say things simply with simple active verbs (`get`, `set`, `run`, `check`, `edit`, `delete`). Avoid pompous buzzwords (`orchestrate`, `leverage`, `facilitate`, `paradigm`), marketing adjectives (`robust`, `seamless`, `powerful`, `intelligent`), and conversational padding (`Please note`, `Make sure to`).
7. **Preserve domain terms.** Keep exact code symbols, API names, and domain terms intact. Do not substitute synonyms for established domain concepts.
8. **Preserve rule-strength imperatives.** Words like `MUST`, `NEVER`, `ALWAYS`, and `do NOT` carry critical constraint weight. Keep them sharp and unambiguous.
9. **Keep "e.g." on non-exhaustive lists.** Removing "e.g." signals that a list is complete when it may only be representative.
10. **Use tables for lookups & decision matrices; Mermaid for multi-step workflows.** Use 2-column tables (`| Condition | Action |`) for rule branching, mappings, and enums. Use Mermaid diagrams ONLY for sequential state machines, multi-step execution loops, and cross-agent handoffs.
11. **Do not force-escort bullets with decorative titles.** Never force-escort every bullet with a title if decoration is the only reason. Make sure bullet titles are to help calling and referring to a rule shortly, not to put a pretty name on it. If titling, use only plain English, not fancy names.
12. **No theatrical or hollow headers.** Do not create section headers or sub-headers for 1–2 sentences. Merge directly into parent flow.
13. **Frontmatter description is trigger condition only.** Answer ONLY "When to choose this skill?" in 10–15 words. Never summarize features (What), explain benefits (Why), or include slash command mentions.
14. **Use universal, self-contained examples.** NEVER write examples, lookup tables, or case studies that depend on specific context from a random repository or proprietary domain that an LLM does not always have. All examples MUST be universally understandable from first principles ("Hello World examples", e.g. canonical scenarios like resizing an image, sending an email, user auth, or basic CRUD pagination) that any LLM can understand and generalize instantly.

## Workflows

### 1. Deslop & Optimize Existing Text
1. Read as the AI model to assess decision value.
2. Strip buzzwords, marketing claims, and Latinate verbs.
3. Eliminate redundancy: schema duplication, circular naming, hedging, motivation history, synonym stacking, and reference over-specification.
4. Test each sentence: if removing it does not change AI execution, delete it.
5. Present Original -> Deslopped with concise rationale for cuts.

### 2. Write New AI-Facing Text
Answer only these 4 questions before writing:
1. What does this do? (One concrete verb phrase)
2. When should the AI choose this over alternatives? (Unique trigger or differentiator)
3. What inputs are required vs optional? (State only if not obvious from schema)
4. How does it fail and what is the recovery step? (Actionable error signal)

---

## Subdoc Reference

- Reference tables, before/after case studies, and Noise Checklist: see [REFERENCE.md](REFERENCE.md).
