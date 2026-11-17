---
name: code-review
description: Use when reviewing branch, PR, or work-in-progress changes against a fixed ref.
---

# Code Review

Review `git diff <fixed-point>...HEAD` along two independent axes in parallel subagents, then present both reports without merging or reranking findings.

## 1. Pin Fixed Point & Validate Diff

If the user did not supply a fixed point (commit SHA, branch, tag, `HEAD~N`), ask for one. Verify `git rev-parse <fixed-point>` succeeds and `git diff <fixed-point>...HEAD` is non-empty before spawning subagents; if invalid or empty, stop and report. Capture `git log <fixed-point>..HEAD --oneline`.

## 2. Locate Spec & Standards Sources

- **Spec source (check in order):**
  1. Issue/PR references in commits (`#123`, `Closes #45`) via the project's issue tracker or `gh` CLI / MCP.
  2. Explicit spec/PRD path supplied by the user.
  3. Matching spec/PRD file in `docs/`, `specs/`, or `.scratch/`.
  4. If none found, ask the user; if none exists, skip the Spec subagent and note `"No spec available"` in the final report.
- **Standards source:** Any documented repo standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md`), plus the Smell Baseline below. Documented repo standards always override the baseline; skip anything already enforced by linters/formatters.

### Smell Baseline (Judgement Calls Only)

| Smell | Definition & Fix |
| :--- | :--- |
| **Mysterious Name** | Name hides intent; rename or clarify the underlying design. |
| **Duplicated Code** | Same logic shape in multiple hunks/files; extract shared helper. |
| **Feature Envy** | Method accesses another object's data more than its own; move it there. |
| **Data Clumps** | Same parameters/fields travel together; bundle into one type. |
| **Primitive Obsession** | Primitive/string stands in for a domain concept; wrap in a small type. |
| **Repeated Switches** | Same `switch`/`if` chain on one type recurs; use polymorphism or a shared map. |
| **Shotgun Surgery** | One logical change scatters edits across many files; consolidate into one module. |
| **Divergent Change** | One module changes for unrelated reasons; split by responsibility. |
| **Speculative Generality** | Unused abstractions, params, or hooks; delete and inline until needed. |
| **Message Chains** | Deep `a.b().c().d()` navigation; expose one method on the root object. |
| **Middle Man** | Wrapper that mostly delegates; remove and call target directly. |
| **Refused Bequest** | Subclass ignores/overrides most inherited behavior; replace inheritance with composition. |

## 3. Spawn Parallel Subagents & Aggregate

Issue two `invoke_subagent` calls in a single turn (`TypeName: "research"` or `"self"`):
- **Standards subagent:** Pass the diff command, commit list, repo standards paths, and the full Smell Baseline table above. Instruct: *"Report per file/hunk (under 400 words): (a) documented standard violations with file + rule citation; (b) baseline smells as judgement calls with quoted hunk. Repo standards override baseline; skip linter-enforced rules."*
- **Spec subagent** (skip if no spec exists): Pass the diff command, commit list, and spec path/contents. Instruct: *"Report (under 400 words): (a) missing/partial spec requirements; (b) unrequested behavior (scope creep); (c) incorrect implementations, quoting the spec line."*

Present outputs under `## Standards` and `## Spec` without merging or reranking across axes. End with a one-line summary: total findings per axis and the worst issue within each axis.
