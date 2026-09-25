---
name: deep-research-prompt
description: Use when drafting self-contained deep research prompts or research-driven refactor briefs.
---

# Deep Research Prompt

Draft a self-contained, single-file markdown prompt for autonomous deep research or research-driven refactoring across any domain.

## Directives

1. **Macro Scope Only**: Define the problem statement, macro intent, and constraints. NEVER micromanage with lists of micro-questions or predetermined answers. Deep research exists to discover unknowns.
2. **Actionable Deliverable Mandate**: Prompt MUST demand concrete output, not an abstract essay:
   - For file modification: require exact file paths, rationale, and concrete line-anchored patches or complete replacement content.
   - For new architecture or files: require concrete file topology, anti-patterns (BAD vs GOOD code or schemas), failure modes, and mitigations.
   - For migrations: require cleanup plans, retirement steps for obsolete assets, and verification criteria.
3. **Autonomous Research Directive**: Prompt MUST instruct the researcher not to artificially constrain research to pre-selected tools or vendors, but to synthesize broad industry consensus.
4. **Self-Contained Single-File Invariant**: The final artifact MUST be a single `.md` file containing the task directives followed by inlined baseline files, reference documents, and applicable quality skills.
5. **Quality Standards Constraint**: Enforce writing quality (e.g. plain English, RFC 2119 imperatives, self-contained examples) within the prompt directives.

---

## Output Template

Generate a single markdown file at the target path (e.g. `.scratch/research_prompt_<topic>.md`) following this structure:

```markdown
# TASK PROMPT: Deep Research & <Action> for <Topic>

You are <Role/Expertise>.
Your task is to conduct deep research on <Broad Domain Area> and deliver <Concrete Deliverable / Target State>.

---

## 1. Problem Statement & Current Gap

<Current state limitations, observed failures, or missing information. Ground the research without dictating solutions.>

---

## 2. Objectives & Target State

<Macro goals and system boundaries. Define what success looks like at the high level.>

---

## 3. Scope of Autonomy & Research Guidelines

- Do NOT artificially restrict research scope to specific vendors or pre-selected tools. Investigate modern industry consensus.
- Research broad focus areas:
  - <Macro Area 1>
  - <Macro Area 2>
  - <Macro Area 3>
- Deliver concrete anti-patterns (BAD vs GOOD illustrations), failure modes with mitigations, and actionable evaluation criteria.

---

## 4. Deliverables & Output Contract

<Strict specification of output format:>
- If modifying existing files: Provide exact file path, rationale, and complete replacement content or line-anchored patch.
- If authoring new files: Provide complete file content, structure, and integration points.
- If deprecating files: Provide retirement checklist and migration steps.

---

## 5. Execution Workflow

1. Phase 1: Deep Research & Domain Synthesis
2. Phase 2: Structural Design & Solution Architecture
3. Phase 3: Concrete Implementation / Deliverable Generation

---

# Attached Context & Reference Files

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

## Workflow

1. **Analyze Requirements**: Identify research domain, target deliverable type (modify, create, or evaluate), and relevant baseline files.
2. **Draft Prompt File**: Populate Output Template. Define macro boundaries and explicit deliverable contracts. Inline all required reference files into the bundle.
3. **Verify Bundle**: Check that no micro-questionnaire exists, reference files are fully inlined, and output contracts require concrete patches or content.
