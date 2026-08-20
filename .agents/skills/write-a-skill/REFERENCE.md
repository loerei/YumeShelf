# Building Great Skills: Theory & Glossary

A skill exists to wrangle determinism out of a stochastic system. **Predictability** (the agent executing the exact same *process* across runs, not generating static text output) is the root virtue; every concept below serves it.

---

## 1. Invocation Axis (How Skills Are Reached)

| Concept | Definition & Mechanism | Trade-off / Decision Rule |
| :--- | :--- | :--- |
| **Model-Invoked** | Keeps `description` in frontmatter. Visible in system prompt; agent and peer skills can invoke autonomously. | Costs **Context Load** (permanent token presence). Use only when autonomous trigger is required. |
| **User-Invoked** | Sets `disable-model-invocation: true`. Hidden from agent; invoked ONLY by human typing the slash command. | Zero **Context Load**, but spends **Cognitive Load** (human must remember it exists). |
| **Context Load** | Token budget and attention spent by keeping descriptions in the system prompt. | Brake on creating too many model-invoked skills. |
| **Cognitive Load** | Mental burden on the human to remember available user-invoked skills. | Spend where human judgment is needed; eliminate elsewhere. |
| **Router Skill** | A single user-invoked skill that indexes and describes other user-invoked skills. | The cure for cognitive load when user-invoked skills multiply. |
| **Granularity** | How finely skills are split. | **By Invocation**: Split when a distinct leading word triggers it.<br/>**By Sequence**: Split when post-completion steps pull agent into rushing. |

---

## 2. Information Hierarchy Axis (How Content is Arranged)

Rank skill content along the 4-rung hierarchy based on retrieval immediacy:

```
1. Decision Diagrams (Mermaid)  ──> 3+ branch workflows, cyclic recovery, state machines
2. In-Skill Steps               ──> Primary actions executed in order (with Completion Criteria)
3. In-Skill Reference           ──> Flat peer-set definitions and rules needed every run
4. Disclosed Reference Subdocs  ──> Branch-specific material, heavy tables, schemas, templates
```

### Key Principles of Content Placement:
- **Progressive Disclosure**: Moving reference material down the hierarchy into subdocs behind **Context Pointers** (`[SUBDOC.md](SUBDOC.md)`).
- **Co-Location**: Keeping a concept's definition, rules, and caveats grouped under one heading so reading one section brings all related context.
- **Context Pointer Wording**: The phrasing of the link (trigger condition), not its target path, determines whether the agent loads the subdoc reliably.
- **External Reference**: Plain documentation files outside the skill system that multiple skills can point to.

---

## 3. Steering Axis (Shaping Runtime Behavior)

| Lever | Definition & Operational Rule | Failure Mode Prevented |
| :--- | :--- | :--- |
| **Branch** | A distinct execution path through a skill. | Unnecessary context loading (isolate via progressive disclosure). |
| **Leading Word (Leitwort)** | A pretrained compact concept (e.g. *tight loop*, *red*, *tracer bullets*, *sediment*). Anchors execution in body and invocation in description. | Wordy multi-sentence explanations; recruits model priors free of charge. |
| **Completion Criterion** | Condition defining when a step is done.<br/>• **Clarity**: Can agent tell done from not-done?<br/>• **Demand**: Exhaustiveness bar (e.g. *"every model accounted for"*). | **Premature Completion** (agent declaring done and rushing forward). Sets depth of **Legwork**. |
| **Legwork** | Latent behind-the-scenes work (file reading, exploring, verifying) within a single step. | Thin/superficial execution; offloading work to the user. |
| **Post-Completion Steps** | Steps visible ahead of the active step. | Acts as a forward gravitational pull toward premature completion. |

---

## 4. Pruning Axis & Failure Modes Catalog

| Term / Failure Mode | Definition & Symptom | Remediation / Cure |
| :--- | :--- | :--- |
| **Single Source of Truth** | Desired state where every meaning lives in exactly one authoritative location. | Any change to behavior is an edit in one place. |
| **Duplication** | Same meaning defined in more than one place. | Maintain Single Source of Truth; delete redundant definitions. |
| **Relevance** | Whether a line still bears on the skill's purpose. | Prune stale lines that drifted out of date. |
| **Sediment** | Stale layers accumulating because adding feels safe and removing feels risky. | Active pruning discipline; core down through historical cruft. |
| **Sprawl** | Skill file simply too long, even when all lines are live and unique. | Apply the hierarchy: push reference to subdocs; split by sequence/branch. |
| **No-Op** | Instructions the model already obeys by default. | Run the **No-Op Sentence Test**: Does deleting the sentence change behavior? If no, delete entire sentence. |
| **Premature Completion** | Attention slips from doing the work to *being done*. | 1. Sharpen completion criterion (make checkable & exhaustive).<br/>2. If fuzzy, hide later steps behind context boundaries (subagents/split). |
| **Negation (The Elephant)** | Steering by prohibition (*"NEVER do X"*) drags the forbidden behavior into context. | Prompt the **positive target behavior**; reserve `NEVER` strictly for hard guardrails. |
