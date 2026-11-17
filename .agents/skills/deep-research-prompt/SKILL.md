---
name: deep-research-prompt
description: Use when drafting self-contained deep research prompts or research-driven refactor briefs.
---

# Deep Research Prompt

Draft a self-contained, single-file markdown prompt for autonomous deep research or research-driven refactoring across any domain.

## Directives

1. **Anti-Prescription & Objective Triad (<objective>, <known_baseline>, <target_scope>)**: The prompt MUST define the research task using three explicit boundaries:
   - **Problem Objective (`<objective>`)**: The overarching problem statement, intent, and constraints.
   - **Known Baseline (`<known_baseline>`)**: Established architectures, known patterns, existing findings, and current limitations. The prompt MUST prohibit reporting baseline elements as novel discoveries. Frame all attached files or preliminary observations strictly under this category as "What is currently claimed/known", NEVER as expected answers to echo.
   - **Target Scope (`<target_scope>`)**: Unknown dynamics, deeper relationships, edge cases, or alternative architectures to investigate, explicitly including any other emergent high-value areas discovered during research that directly contribute to `<objective>`.
   - NEVER spoon-feed predetermined answers, leading questions, or confirmation-bias framing (e.g. do not ask to "prove why solution A is better than B"; ask to "evaluate A and B against criteria C").
2. **Definition of New Discoveries**: The prompt MUST define "new discoveries" to include both external solutions outside `<known_baseline>` and unmentioned relationships, friction points, trade-offs, or latent interactions between known elements within `<known_baseline>`.
3. **Anti-Hallucination Exit Hatch**: The prompt MUST instruct the researcher that if `<known_baseline>` is already optimal or if no meaningful new dynamics exist, it MUST report that no changes are warranted. Prohibit fabricating flaws, artificial complexity, or unnecessary refactoring to justify research effort.
4. **Actionable Deliverable Mandate**: The prompt MUST demand concrete output, not an abstract essay:
   - For file modification: exact file paths, rationale, and concrete line-anchored patches or complete replacement content.
   - For new architecture or files: concrete file topology, anti-patterns (BAD vs GOOD code or schemas), failure modes, and mitigations.
   - For migrations: cleanup plans, retirement steps for obsolete assets, and verification criteria.
5. **Autonomous Primary-Source Research**: The prompt MUST instruct the researcher to synthesize broad industry consensus, primary documentation, formal specifications, and empirical benchmarks, without artificially constraining research to pre-selected tools or vendors.
6. **Self-Contained Single-File Invariant**: The final artifact MUST be a single `.md` file containing the task directives followed by fully inlined baseline files, reference documents, and applicable quality skills.
7. **Quality Standards Constraint**: The prompt MUST use RFC 2119 imperatives (`MUST`, `MUST NOT`, `SHOULD`) and plain English. Ban ambiguous suggestions ("consider", "try to") in favor of testable constraints.

---

## Output Template

Generate a single markdown file at the target path (e.g. `.scratch/research_prompt_<topic>.md`) following this structure:

```markdown
# TASK PROMPT: Deep Research & <Action> for <Topic>

You are <Role/Expertise>.
Your task is to conduct deep research on <Broad Domain Area> and deliver <Concrete Deliverable / Target State>.

---

## 1. Problem Statement & Objective (<objective>)

<Overarching problem statement, high-level intent, and system boundaries. Ground the research without dictating solutions or leading conclusions.>

---

## 2. Known Baseline & Context (<known_baseline>)

<What is already known, established architecture, current limitations, or existing findings. The researcher must NOT re-report these as novel discoveries.>

---

## 3. Target Scope & Unknowns to Discover (<target_scope>)

- <Macro Focus Area 1>
- <Macro Focus Area 2>
- <Macro Focus Area 3>
- Other emergent area(s), if any valuable area that contributes directly to <objective> is discovered during the research process.

---

## 4. Scope of Autonomy & Research Guidelines

- **Anti-Prescription & Objectivity**: Do NOT bias research toward specific pre-selected tools, vendors, or predetermined conclusions. Synthesize modern industry consensus and primary source documentation.
- **Definition of New Discoveries**: New discoveries include novel solutions outside baseline (<known_baseline>), as well as deeper, unmentioned relationships, conflicts, or trade-offs between known elements in (<known_baseline>).
- **Anti-Hallucination Exit Hatch**: If investigation reveals that baseline (<known_baseline>) is already optimal or that no meaningful new dynamics exist, explicitly conclude that no changes are warranted. Do NOT fabricate flaws or propose artificial complexity to justify research effort.

---

## 5. Deliverables & Output Contract

<Strict specification of output format:>
- If modifying existing files: Provide exact file path, rationale, and complete replacement content or line-anchored patch.
- If authoring new files: Provide complete file content, structure, and integration points.
- If deprecating files: Provide retirement checklist and migration steps.
- Illustrate recommendations with concrete anti-patterns (BAD vs GOOD examples), failure modes with mitigations, and actionable evaluation criteria.

---

## 6. Execution Workflow

1. Phase 1: Deep Research, Primary-Source Synthesis & Ground-Truth Verification
2. Phase 2: Structural Design, Trade-off Evaluation & Solution Architecture
3. Phase 3: Concrete Implementation / Deliverable Generation

---

# Attached Context & Reference Files

> [!NOTE]
> All attached reference files, baseline documents, and supplementary context below represent "What is already known / What is currently claimed". The researcher MUST treat them as the baseline context to challenge or build beyond, NOT as predetermined truths or answers to echo.

## File: <File Label 1>
Path: `<file_path_1>`
```<lang>
<Inlined file content>
```

## File: <File Label 2>
Path: `<file_path_2>`
```<lang>
<Inlined file content>
```
```

---

## Execution

1. **Analyze Requirements**: Identify the research domain, `<objective>`, `<known_baseline>`, `<target_scope>`, deliverable type (modify, create, or evaluate), and baseline files to inline.
2. **Draft & Verify Bundle**: Populate the template at the target path (e.g. `.scratch/research_prompt_<topic>.md`), ensuring `<known_baseline>` is framed strictly as baseline context to challenge, no leading questions exist, the anti-hallucination exit hatch is included, baseline files are inlined completely, and deliverables require concrete patches or content.
