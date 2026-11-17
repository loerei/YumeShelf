# Skill Design Reference

Execution patterns, information hierarchy, and failure mode remediation for skill authors.

## 1. Invocation Routing

| Trigger Condition | Frontmatter Configuration |
| :--- | :--- |
| **Model-Invoked** (autonomous trigger on user intent) | Provide `description` (10-15 words, trigger-only) |
| **User-Invoked** (human slash command or sensitive manual flow) | Set `disable-model-invocation: true` |
| **Router Skill** (single command indexing peer user-invoked skills) | Set `disable-model-invocation: true` |

Split a skill **by invocation** when distinct triggers indicate independent tasks, or **by sequence** when later steps cause the model to rush past prerequisite work.

## 2. Information Hierarchy

Place content by retrieval immediacy:
1. **Mermaid diagrams**: ONLY for sequential state machines, multi-step loops, and cross-agent handoffs.
2. **In-skill steps**: Primary sequential actions with checkable completion criteria.
3. **In-skill reference**: Universal definitions and constraints needed on every run.
4. **Disclosed subdocs** (`[SUBDOC.md](SUBDOC.md)`): Branch-specific guides, lookup tables, and schemas, linked with trigger phrasing stating the exact condition to load the file; co-locate each concept's definition and constraints under one heading.

## 3. Execution Levers

| Lever | Operational Rule |
| :--- | :--- |
| **Anchor Keywords** | Use established compact domain terms (*tight loop*, *tracer bullets*) instead of multi-sentence explanations |
| **Completion Criteria** | Define checkable, exhaustive exit conditions before advancing to the next step |
| **Isolated Steps** | Hide downstream stages behind subagents or separate skills when visibility causes rushing |

## 4. Failure Modes & Remediation

| Failure Mode & Symptom | Remediation |
| :--- | :--- |
| **Stale Content & Sprawl**: Redundant definitions, outdated rules, or files exceeding 150 lines | Prune dead rules; extract branch-bound tables to subdocs per [HEURISTICS.md](HEURISTICS.md) |
| **No-Op Instructions**: Rules the model already follows by default | Run Drop Test: if removing the sentence changes nothing in execution, delete it |
| **Premature Completion**: Agent declares done without verifying intermediate output | Define explicit, checkable completion criteria per step |
| **Negative Prompting Trap**: Banning custom artifacts with `NEVER` | Delete the original trigger instruction; reserve `NEVER` for default LLM biases |
| **Micro-Format Lock-In**: Rigid templates replayed verbatim regardless of context | Express directives as mindset principles rather than rigid output layouts |

## 5. Case Study: Mindset vs. Micro-Format Directives

**Before (Micro-Format):**
```markdown
1. Present candidates in flat bullets, then caveats in a separate paragraph.
2. Only mention constraints when there is a real tradeoff.
3. NEVER package conclusions as Option A / Option B / Option C.
Workflow: 1. Answer -> 2. List candidates -> 3. Surface caveats -> 4. Pass turn.
```
*Result*: Agent replayed the bullet-paragraph template on every turn regardless of context.

**After (Thinking Principles):**
```markdown
1. Answer the question directly; do not jump to premature implementation plans.
2. Discuss tradeoffs plainly without forced A/B/C menus.
3. Keep turns concise for back-and-forth exchange.
```
*Result*: Natural context-adapted response without template replay. Three to five core principles stick; bloated checklists get selectively ignored.
