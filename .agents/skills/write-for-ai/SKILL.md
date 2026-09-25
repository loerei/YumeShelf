---
name: write-for-ai
description: Use when asked to review, edit, or deslop AI-facing text (prompts, rules, schemas).
---

# Write for AI

Text written for AI must directly drive decisions, constraints, or routing. It should never market, reassure, speculate, or over-explain.

## The Two Deslop Vectors

### Vector 1: De-fluffing (Jargon Elimination)
Strip pompous phrasing, marketing fluff, and pseudo-technical vocabulary. Replace with direct, plain English.
- Cut marketing adjectives and adverbs: `robust`, `seamless`, `powerful`, `smart`, `intelligent`, `best-in-class`, `safely`.
- Cut pseudo-technical buzzwords: `orchestrate`, `leverage`, `facilitate`, `paradigm`, `synergy`.
- Cut self-important titles: replace grandiose section headers with simple nouns (*"Workflow"*).
- Use simple, active verbs: prefer `get`, `set`, `run`, `check`, `edit`, `delete` over Latinate verbs.
- Never force-escort bullets with decorative titles: bullet titles exist only to call and refer to a rule shortly, not for decoration.
- Cut theatrical and hollow headers: do not create section headers or sub-headers for 1–2 sentences. Merge directly into parent flow.

### Vector 2: De-overexplaining (Redundancy Elimination)
Strip information the AI already knows, cannot act upon, or that duplicates existing definitions. Target the 6 universal forms of redundancy:
- Schema and location duplication: repeating types, default values, enums, or layout rules already defined in parameter schemas or global configs.
- Circular naming: explaining what the identifier, tool name, or section title already makes obvious (e.g., `# Tool delete_user` -> `"This tool deletes a user"`).
- Conversational chaff and hedging: polite filler, introductory padding, and weak modals (`"Please note that you should try to..."`). Replace with direct imperatives (`MUST`, `NEVER`).
- Motivation and history: explaining why a feature was built, its architectural history, or how much time or tokens it saves.
- Synonym stacking: chaining redundant synonyms and qualifiers (`"strict, absolute, mandatory, and non-negotiable boundary"`).
- Reference over-specification: explaining, summarizing, or itemizing the sub-topics, case studies, or internal contents of a referenced document inside the link sentence (e.g., write `see [REFERENCE.md](REFERENCE.md)` instead of `see [REFERENCE.md](REFERENCE.md) (Topic A, Topic B, Topic C)`).

## Core Rules

1. **One sentence = one decision signal.** Every sentence must help the AI choose a tool, set a parameter, or enforce a constraint. If removing a sentence changes nothing in AI execution, cut it.
2. **Cut noise, never signal.** Deslopping means stripping conversational fluff, marketing adjectives, and tautology, NEVER dropping domain mechanics, failure recovery procedures, parameter contracts, or operational constraints. If removing a detail deprives the agent of a recovery action or a decision branch, it MUST be preserved.
3. **Only add information to resolve ambiguity.** Add context only if two tools or rules could be confused. Do not explain what a tool name or parameter name already makes obvious.
4. **State failure modes and recovery actions.** Tell the AI *when* an action fails and *what to do next*.
5. **Delete the trigger instead of banning the artifact.** When removing an unwanted behavior created by a previous prompt or revision, delete the trigger instruction. Do not add negative constraints (`"NEVER do X"`) against artifacts that the AI has no natural baseline tendency to generate. Reserve `NEVER` and `MUST NOT` for overriding default LLM biases (e.g., sycophancy, conversational filler, hallucinating code).
6. **Use plain English, no fluff.** Say things simply. Avoid pompous, pseudo-technical, or corporate jargon.
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
1. **Read as the AI:** Put yourself in the model's context.
2. **Jargon Pass:** Strip buzzwords and marketing claims. Replace with concrete verbs.
3. **Redundancy Pass:** Check against the 6 redundancy forms (Schema duplication, Tautology, Chaff/Hedging, Motivation, Synonym stacking, Reference over-specification).
4. **Signal Test:** For each remaining sentence: *"Does this change what action the AI takes?"* If no, delete.
5. **Present Output:** Show Original -> Deslopped with concise rationale for cuts.

### 2. Write New AI-Facing Text
Answer only these 4 questions before writing:
1. **What does this do?** (One concrete verb phrase)
2. **When should AI choose this over alternatives?** (Unique trigger / differentiator)
3. **What inputs are required vs. optional?** (Only add if not obvious from schema)
4. **How does it fail and what is the recovery step?** (Actionable error signal)

## Noise Checklist (What to Cut)

- [ ] Fluff adjectives: `robust`, `seamless`, `powerful`, `atomic`, `crash-resilient`, `intelligent`
- [ ] Pompous verbs: `utilize`, `leverage`, `orchestrate`, `facilitate`, `operationalize`
- [ ] Schema duplicates: restating type, required status, or default values present in schema
- [ ] Circular naming: rephrasing the tool or parameter identifier without adding new decision criteria
- [ ] Conversational chaff and hedging: `Please note`, `You should try to`, `Keep in mind that`, `Make sure to`
- [ ] Motivation and history: explaining why a feature exists or what tokens/speed it saves
- [ ] Synonym stacking: chaining multiple near-identical descriptors (`strict, mandatory, non-negotiable`)
- [ ] Reference over-specification: listing sub-topics, case study titles, or cataloging contents inside link references
- [ ] Phantom bans: forbidding custom artifacts introduced by previous iterations instead of deleting the original trigger prompt
- [ ] Implementation trivia: internal algorithms, memory caches, languages, or threading models
- [ ] Decorative bullet titles: pseudo-titles forced onto bullet items (`**Action Name**: ...`) without taxonomy or routing value
- [ ] Theatrical and hollow headers: section headers or sub-headers wrapping 1–2 trivial sentences

---

## Reference

For target matrices, transformation tables, and before/after case studies, see [REFERENCE.md](REFERENCE.md).
