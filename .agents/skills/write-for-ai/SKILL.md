---
name: write-for-ai
description: Use when asked to review, edit, or deslop AI-facing text (prompts, rules, schemas).
---

# Write for AI

Text written for AI must directly drive decisions, constraints, or routing. It should never market, reassure, speculate, or over-explain.

## The Two Deslop Vectors

### Vector 1: De-fluffing (Jargon Elimination)
Strip pompous phrasing, marketing fluff, and pseudo-technical vocabulary. Replace with direct, plain English.
- **Cut marketing adjectives & adverbs:** `robust`, `seamless`, `powerful`, `smart`, `intelligent`, `best-in-class`, `safely`.
- **Cut pseudo-technical buzzwords:** `orchestrate`, `leverage`, `facilitate`, `paradigm`, `synergy`.
- **Cut self-important titles:** Replace grandiose section headers with simple nouns (*"Workflow"*).
- **Use simple, active verbs:** Prefer `get`, `set`, `run`, `check`, `edit`, `delete` over Latinate verbs.

### Vector 2: De-overexplaining (Redundancy Elimination)
Strip information the AI already knows, cannot act upon, or that duplicates existing definitions. Target the 6 universal forms of redundancy:
- **Schema & Location Duplication:** Repeating types, default values, enums, or layout rules already defined in parameter schemas or global configs.
- **Tautology / Circular Naming:** Explaining what the identifier, tool name, or section title already makes obvious (e.g., `# Tool delete_user` -> `"This tool deletes a user"`).
- **Conversational Chaff & Hedging:** Polite filler, introductory padding, and weak modals (`"Please note that you should try to..."`). Replace with direct imperatives (`MUST`, `NEVER`).
- **Motivational & Historical Justification:** Explaining why a feature was built, its architectural history, or how much time/tokens it saves.
- **Synonym Stacking:** Chaining redundant synonyms and qualifiers (`"strict, absolute, mandatory, and non-negotiable boundary"`).
- **Reference Over-Specification:** Explaining, summarizing, or itemizing the sub-topics, case studies, or internal contents of a referenced document inside the link sentence (e.g., write `see [REFERENCE.md](REFERENCE.md)` instead of `see [REFERENCE.md](REFERENCE.md) (Topic A, Topic B, Topic C)`).

## Core Rules

1. **One sentence = one decision signal.** Every sentence must help the AI choose a tool, set a parameter, or enforce a constraint. If removing a sentence changes nothing in AI execution, cut it.
2. **Use plain English, no fluff.** Say things simply. Avoid pompous, pseudo-technical, or corporate jargon.
3. **Preserve domain terms.** Keep exact code symbols, API names, and domain terms intact. Do not substitute synonyms for established domain concepts.
4. **State failure modes and recovery actions.** Tell the AI *when* an action fails and *what to do next*.
5. **Use tables for lookups & decision matrices; Mermaid for multi-step workflows.** Use 2-column tables (`| Condition | Action |`) for rule branching, mappings, and enums. Use Mermaid diagrams ONLY for sequential state machines, multi-step execution loops, and cross-agent handoffs.
6. **Preserve rule-strength imperatives.** Words like `MUST`, `NEVER`, `ALWAYS`, and `do NOT` carry critical constraint weight. Keep them sharp and unambiguous.
7. **Keep "e.g." on non-exhaustive lists.** Removing "e.g." signals that a list is complete when it may only be representative.
8. **Only add information to resolve ambiguity.** Add context only if two tools or rules could be confused. Do not explain what a tool name or parameter name already makes obvious.
9. **Delete the trigger, do not ban the artifact (No Phantom Bans).** When removing an unwanted behavior created by a previous prompt or revision, delete the trigger instruction. Do not add negative constraints (`"NEVER do X"`) against artifacts that the AI has no natural baseline tendency to generate. Reserve `NEVER` and `MUST NOT` for overriding default LLM biases (e.g., sycophancy, conversational filler, hallucinating code).
10. **Frontmatter description = Trigger condition only (Use when...).** Answer ONLY "When to choose this skill?" in 10–15 words. Never summarize features (What), explain benefits (Why), or include slash command mentions.
11. **Cut noise, never signal (The Zero-Info-Drop Invariant).** Deslopping means stripping conversational fluff, marketing adjectives, and tautology — NEVER dropping domain mechanics, failure recovery procedures, parameter contracts, or operational constraints. If removing a detail deprives the agent of a recovery action or a decision branch, it MUST be preserved.
12. **Universal, Self-Contained Examples (The 'Hello World' Invariant).** NEVER write examples, lookup tables, or case studies that depend on specific context from a random repository or proprietary domain that an LLM does not always have. All examples MUST be universally understandable from first principles — "Hello World examples" (e.g. canonical scenarios like adding avatars to comments, simple user auth, or basic CRUD pagination) that any LLM can understand and generalize instantly are always better than "A problem in a random repo A".

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

- [ ] **Fluff adjectives:** `robust`, `seamless`, `powerful`, `atomic`, `crash-resilient`, `intelligent`
- [ ] **Pompous verbs:** `utilize`, `leverage`, `orchestrate`, `facilitate`, `operationalize`
- [ ] **Schema duplicates:** Restating type, required status, or default values present in schema
- [ ] **Tautology / Circular naming:** Rephrasing the tool/parameter identifier without adding new decision criteria
- [ ] **Conversational chaff & hedging:** `Please note`, `You should try to`, `Keep in mind that`, `Make sure to`
- [ ] **Motivational & historical justification:** Explaining why a feature exists or what tokens/speed it saves
- [ ] **Synonym stacking:** Chaining multiple near-identical descriptors (`strict, mandatory, non-negotiable`)
- [ ] **Reference over-specification:** Listing sub-topics, case study titles, or cataloging contents inside link references
- [ ] **Phantom bans / Reactionary negative rules:** Forbidding custom artifacts introduced by previous iterations instead of deleting the original trigger prompt
- [ ] **Implementation trivia:** Internal algorithms, memory caches, languages, or threading models

---

## Reference

For target matrices, transformation tables, and before/after case studies, see [REFERENCE.md](REFERENCE.md).
