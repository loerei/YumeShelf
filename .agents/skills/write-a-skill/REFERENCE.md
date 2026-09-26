# Skill Design Reference

Execution patterns, information hierarchy, and failure mode remediation for skill authors.

---

## 1. Invocation Routing

| Mode | Frontmatter Configuration | When to Use |
| :--- | :--- | :--- |
| **Model-Invoked** | Provide `description` (10–14 words, trigger-only) | Autonomous triggering based on user intent |
| **User-Invoked** | Set `disable-model-invocation: true` | Human-only slash commands or sensitive manual workflows |
| **Router Skill** | Set `disable-model-invocation: true` | Single command indexing peer user-invoked skills |

### Splitting Criteria
- **By Invocation**: Split when distinct trigger keywords indicate independent tasks.
- **By Sequence**: Split when later steps pull the model into rushing past prerequisite work.

---

## 2. Information Hierarchy

Place content based on retrieval immediacy:

```
1. Decision Diagrams (Mermaid)  ──> 3+ branch workflows, cyclic recovery, state machines
2. In-Skill Steps               ──> Primary actions executed sequentially with checkable completion criteria
3. In-Skill Reference           ──> Universal definitions and constraints required on every run
4. Disclosed Subdocs            ──> Branch-specific guides, lookup tables, and schemas
```

### Content Placement Rules
- **Progressive Disclosure**: Move reference material into subdocs (`[SUBDOC.md](SUBDOC.md)`).
- **Co-Location**: Group a concept's definition, rules, and constraints under one heading.
- **Trigger Pointers**: Phrasing of the link label must state the exact condition for loading the subdoc.

---

## 3. Execution Levers

| Lever | Definition | Operational Rule |
| :--- | :--- | :--- |
| **Anchor Keywords** | Pretrained compact concepts (e.g. *tight loop*, *tracer bullets*) | Use established domain terms instead of multi-sentence explanations |
| **Completion Criteria** | Exact conditions defining when a step is complete | Must be checkable and exhaustive before advancing to the next step |
| **Isolated Steps** | Breaking complex tasks into discrete stages | Hide downstream steps behind subagents or separate skills to prevent rushing |

---

## 4. Failure Modes & Remediation

| Failure Mode | Symptom | Remediation |
| :--- | :--- | :--- |
| **Stale Content & Sprawl** | Redundant definitions, outdated rules, or files exceeding 150 lines | Prune dead rules; extract branch-bound tables to subdocs per HEURISTICS.md |
| **No-Op Instructions** | Instructions the model already follows by default | Run No-Op Sentence Test: if removing the sentence does not alter execution, delete it |
| **Premature Completion** | Agent declares work done without verifying intermediate output | Define explicit, checkable completion criteria for each step |
| **Negative Prompting Trap** | Forbidding unwanted custom artifacts with `NEVER` | Remove the original trigger prompt; reserve `NEVER` for core platform guardrails |
| **Micro-Format Lock-In** | Directives prescribe rigid response templates that get replayed verbatim | Write directives as mindset principles rather than rigid output templates |

---

## 5. Case Study: Mindset vs. Micro-Format Directives

### Before (Micro-Format Specifications):
```markdown
1. Present candidates in flat bullets, then caveats in a separate paragraph.
2. Only mention constraints when there is a real tradeoff.
3. NEVER package conclusions as Option A / Option B / Option C.
Workflow: 1. Answer -> 2. List candidates -> 3. Surface caveats -> 4. Pass turn.
```
*Result*: Agent replayed the exact bullet-paragraph template on every turn regardless of user context.

### After (Thinking Principles):
```markdown
1. Answer the question directly; do not jump to premature implementation plans.
2. Conversational dialogue: discuss tradeoffs plainly without forced A/B/C menus.
3. Keep turns concise for back-and-forth exchange.
```
*Result*: Natural response adapted to context; zero template replay.

### Key Takeaways:
1. **Transmit mindset, not format**: Define how the agent should think rather than output layouts.
2. **Address root bias, not symptoms**: One directive against over-engineering replaces multiple negative rules.
3. **Fewer rules yield higher compliance**: 3–5 core principles stick; bloated checklists get selectively ignored.
