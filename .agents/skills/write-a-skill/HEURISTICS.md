# Skill Complexity Heuristics

Reference framework for evaluating and refactoring skill complexity via objective-driven progressive disclosure.

## 1. Optimization Objective

**Goal**: Minimize $\sum(\text{reference bytes loaded per execution path})$ while keeping `SKILL.md` readable.

Every decision to inline or extract material must serve this mathematical invariant:
- **Inline** what every execution path needs to run cleanly.
- **Disclose** behind pointers what only specific paths require or what bloats context.

---

## 2. Component Evaluation Criteria

Evaluate every information component in a skill across two binary axes:

### Axis 1: Execution Frequency
- **`Needed for every run of SKILL.md`**: Core workflow steps, primary decision tree, and universal rules required by all execution paths.
- **`Not Needed for every run of SKILL.md`**: Branch-bound guides, environment setup snippets, or edge-case troubleshooting needed only on specific runs.

### Axis 2: Extraction Value
- **`Worth Extracting to Subdocs`**: Material triggering primary/secondary signals where extraction reduces context bloat without adding pointer friction.
- **`Not Worth Extracting to Subdocs`**: Trivial 1-2 line notes or core protocol steps where extraction creates unnecessary pointer friction.

---

## 3. Complexity Signals

### Primary Signals
High-density or branch-bound material that inflates retrieval cost:
- **Heavy Lookup Tables**: Parameter schemas, tool maps, error code tables, reference matrices.
- **Large Templates**: Code scaffolds, prompt templates, configuration snippets.
- **Branch-Specific References**: Rules or checklists serving only one specific execution branch.
- **Long Repeated Checklists**: Multi-item verification lists used across review iterations.

### Secondary Signal
- **Audit Threshold (`~100 lines` or large byte footprint)**: Trigger to inspect unextracted primary signals. Purely linear, unbranched prose under the `~150 lines` upper ceiling without primary signals may remain inline.

---

## 4. Structural Routing

- **Inline Execution**: Keep material inline if needed by all execution paths without triggering primary signals.
- **Single Subdoc (`REFERENCE.md`)**: Disclose into a single reference file when primary signals are triggered globally across all execution paths.
- **Multiple Subdocs (`TYPE/DOMAIN.md`)**: Disclose into domain-scoped subdocs when primary signals are isolated to specific execution branches.
- **Overlapping Subdocs Principle**: Structure sub-documents to minimize $\sum(\text{reference bytes loaded per execution path})$ across all execution branches. NEVER force a combined monolithic subdoc if independent paths load unnecessary bytes.

---

## 5. Protocol Reference

To execute subdoc extraction based on these heuristics, invoke the [`write-skill-subdocs`](../write-skill-subdocs/SKILL.md) skill.
