---
name: sonar-remediation
description: Inspect, remediate, accept, and automate SonarQube and SonarCloud code quality, duplication, and security issues across any language or repository. Use when fixing Sonar issues, querying open smells/bugs, resolving code duplications, running automated Sonar batch fixes, or executing /goal Sonar remediation.
---

# Sonar Remediation & Quality Gate Workflows

Inspect, remediate, accept, and automate SonarQube/SonarCloud code quality issues across single files, PRs, or entire repositories. (Works with both `sonarcloud:` and `sonarqube:` MCP servers).

## Workflows

### 1. Issue Query & Inspection (MCP)

| Task | MCP Tool (`sonarcloud:` / `sonarqube:`) | Required Arguments & Constraints |
| :--- | :--- | :--- |
| **Search Projects** | `search_my_sonarqube_projects` | None |
| **Search Open Issues** | `search_sonar_issues_in_projects` | `projects: ["<key>"]`, `issueStatuses: ["OPEN"]`<br>PR scope: add `pullRequestId: "<id>"`. File scope: `files: ["<key>:<relPath>"]` |
| **Search Duplications** | `search_duplicated_files`, `get_duplications` | `projectKey: "<key>"`, `key: "<fileKey>"`, optional `pullRequest: "<id>"` |
| **Component Measures** | `get_component_measures` | `projectKey: "<key>"` (Note: parameter is `projectKey`, not `component`), `metricKeys: [...]` |
| **Show Rule Details** | `show_rule` | `key: "<ruleKey>"` |
| **Quality Gate Status** | `get_project_quality_gate_status` | `projectKey: "<key>"` |

> [!IMPORTANT]
> When analyzing an active PR, MUST pass `pullRequestId`. Omitting `pullRequestId` queries the default branch (`main`), leading to unintended refactoring of pre-existing code.

### 2. Issue Triage & Decision Policy

| Domain | Issue Category | Rule Keys | Action | Rationale & Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **General** | **Cognitive Complexity** | `S3776` | **Flag `accept`** via `change_sonar_issue_status` | MUST search issue key first. NEVER split functions solely for S3776. Structural splits require `/improve-codebase-architecture`. |
| **General** | **Function Nesting** | `S2004` | **Flag `accept`** via `change_sonar_issue_status` | Deep nesting in UI/search/event closures is intentional design. |
| **General** | **Backtracking Regex** | `S8786` | **Fix or Flag `accept`** | Simplify regex if possible; flag `accept` if regex is already minimal. |
| **CSS** | **Theme / Contrast** | `css:S7924` | **Flag `accept`** via `change_sonar_issue_status` | Brand theme colors override generic WCAG contrast checks. |
| **JS/TS/CSS** | **Language Smells** | `S1854`, `S1481`, `S6582`, `S6606`, `S7780`, `S7758`, `S6594`, `S4666`, `S1874` | **Fix code** | Follow domain-specific refactoring patterns in [REFERENCE.md](REFERENCE.md). |

> [!IMPORTANT]
> Before calling `change_sonar_issue_status` to flag any issue as `"accept"` or `"falsepositive"`, you MUST search for the exact issue key using `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]`.

### 3. Remediation Safety Boundaries

- **NEVER delete, rename, or move** standalone entrypoints, child processes, worker scripts, or dynamic IPC/service wrappers.
- **NEVER modify** exported module interfaces, public API signatures, or database schemas during Sonar remediation.
- **Domain Contract Preservation (`S1854`, `S1481`)**: NEVER alter returned object keys or state properties (e.g. `favorite`, `id`, `status`) to consume an unused variable. Safely delete the dead variable calculation instead.

### 4. Code Duplication Resolution (CPD)

- MUST call `get_duplications` to retrieve exact duplicated lines and read actual code on disk.
- For structural duplication, read `/improve-codebase-architecture` to design a unified module.

### 5. Continuous Zero-Issue Remediation Loop (Goal-Driven Batching)

Triggered via `/goal` or explicit user instruction to fix/accept open issues until **0 open issues remain**:

1. **Query Open Issues**: Call `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]`.
2. **Check Exit Condition**: If `total === 0`, report completion (`<!-- GOAL_COMPLETE -->`).
3. **Triage & Apply**: Apply Table 2 actions (Flag `accept` or Fix code).
4. **Local Verification**: Run project-specific typechecks, linters, or test suites (e.g. `npm run typecheck`, `pytest`, `cargo check`).
5. **Commit & Push**: Stage changes, commit (`git commit -m "refactor: remediate <details>"`), and push.
6. **Schedule 150s Timer**: Schedule a 150-second timer (`schedule({ DurationSeconds: "150", Prompt: "150s timer expired. Re-query open Sonar issues" })`) for remote CI scan completion.
7. **Repeat**: Upon timer expiry, re-query open issues until `total === 0`.

### 6. Script-Automated Task Execution

For large backlogs, run bundled companion scripts in `.agents/skills/sonar-remediation/scripts/`:
- `python .agents/skills/sonar-remediation/scripts/count_issues.py "<issues_json>" "<session_dir>\scratch\issues_details.md"`
- `python .agents/skills/sonar-remediation/scripts/generate_plan.py "<issues_json>" "<session_dir>\implementation_plan.md"` (Set `request_feedback: true`)
- `python .agents/skills/sonar-remediation/scripts/generate_task.py "<issues_json>" "<session_dir>\task.md"` (Set `user_facing: true`)

**Task Execution Loop**: Check out fix branch -> For each file in `task.md`: Mark `[/]` -> Patch via `patchitright` (`patch_file`) -> Mark `[x]` -> Verify via project build/typecheck/test tools before committing.

---

## Detailed Rules & Code Examples

See [REFERENCE.md](REFERENCE.md) for Preemptive Code Inspection, domain-scoped **Before / After** code examples, and specific rule remediation patterns. (You MUST read [REFERENCE.md](REFERENCE.md) using `view_file` before applying code fixes).
