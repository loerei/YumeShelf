---
name: sonar-remediation
description: Use when querying, fixing, accepting, or automating SonarQube and SonarCloud issues.
---

# Sonar Remediation & Quality Gate Workflows

Inspect, remediate, accept, and automate SonarQube/SonarCloud code quality issues across single files, PRs, or entire repositories (supports `sonarcloud:` and `sonarqube:` MCP servers).

## Directives

1. **Safety Boundaries**: NEVER delete, rename, or move standalone entrypoints, child processes, worker scripts, or dynamic IPC/service handlers.
2. **Preserve Public Signatures**: NEVER modify exported module interfaces, public API signatures, or database schemas during Sonar remediation.
3. **Domain Contract Preservation (`S1854`, `S1481`)**: NEVER alter returned object keys or state properties (e.g. `favorite`, `id`, `status`) to consume an unused variable. Safely delete the dead variable calculation instead.
4. **Issue Verification Before Status Change**: Before calling `change_sonar_issue_status` to flag `"accept"` or `"falsepositive"`, MUST search the issue key using `search_sonar_issues` with `issueStatuses: ["OPEN"]`.
5. **PR Scope Parameter**: When analyzing an active PR, MUST pass `pullRequestId` or `pullRequest`. Omitting PR ID queries the default branch.
6. **Quality Gate Priority over Zero-Smell Churn**: Quality Gate conditions (Reliability, Security, Duplications, Coverage, Security Hotspots) define PR merge eligibility. Maintainability Rating A is passing. NEVER destabilize heavily tested domain logic, complex transaction runners, or migration flows merely to reduce informational code smells.
7. **Defensive Boundary Preservation (`S7744`)**: NEVER strip defensive fallback object spreads `{ ...(obj || {}) }` or empty fallbacks at untrusted external boundaries (IPC inputs, user configs, storage files). Flag `"accept"` instead of compromising runtime safety.
8. **Serialization & Proxy Compatibility (`S7784`)**: NEVER blindly replace `JSON.parse(JSON.stringify(val))` with `structuredClone(val)` when objects may be Proxies, host objects, or require plain JSON serialization (`structuredClone` throws `DataCloneError` on Proxies). Flag `"accept"` or use targeted shallow cloning.
9. **Bounded Path & Filename Regexes (`S8786`)**: Flag `"accept"` on path normalization regexes (e.g. `/[\\/]+$/`) operating on bounded strings (paths, filenames). ReDoS is impossible on paths of standard lengths.

---

## Query Scope Decision Matrix

| Scope | MCP Query Call |
| :--- | :--- |
| **File** | `search_sonar_issues({ projectKey, componentKeys: ['<projectKey>:<filePath>'], issueStatuses: ['OPEN'] })` |
| **Commit** | `git show --name-only <hash>` $\rightarrow$ `search_sonar_issues({ projectKey, componentKeys, inNewCodePeriod: true })` |
| **Pull Request (PR)** | `search_sonar_issues({ projectKey, pullRequest: '<pr_id>', issueStatuses: ['OPEN'] })` |
| **Branch** | `search_sonar_issues({ projectKey, branch: '<branch_name>', issueStatuses: ['OPEN'] })` |
| **Repository** | `search_sonar_issues({ projectKey, issueStatuses: ['OPEN'] })` |
| **File + PR** | `search_sonar_issues({ projectKey, pullRequest: '<pr_id>', componentKeys: ['<projectKey>:<filePath>'], issueStatuses: ['OPEN'] })` |

---

## Issue Triage & Remediation Matrix

| Issue Category / Rule Key | Action | Requirements & Protocol |
| :--- | :--- | :--- |
| **Cognitive Complexity (`S3776`)** | **Flag `accept`** | NEVER split functions solely for S3776. Structural splits require `/improve-codebase-architecture`. |
| **Deep Nesting (`S2004`)** | **Flag `accept`** | Deep nesting in UI/event/search closures is intentional design. |
| **Theme Contrast (`css:S7924`)** | **Flag `accept`** | Brand color palettes take precedence over automated WCAG checks. |
| **Path/File Regex Backtracking (`S8786`)** | **Flag `accept`** | Bounded strings (paths, filenames) have zero ReDoS risk in practice; flag `accept` directly. |
| **Defensive Spreads (`S7744`)** | **Flag `accept`** | Preserve defensive coding `{ ...(x \|\| {}) }` at external IPC, config, and storage boundaries. |
| **Plain JSON Serialization (`S7784`)** | **Flag `accept` or Targeted Clone** | Do NOT use `structuredClone` on Proxies or where plain JSON serialization is expected. |
| **Duplications (CPD)** | **Fix code / Exclude tests** | Test fixtures belong in `sonar.cpd.exclusions` or `sonar.tests`. Consolidate real production duplications. |
| **Language Smells (`S1854`, `S1481`, etc.)** | **Fix code** | Follow domain-specific patterns in [REFERENCE.md](REFERENCE.md). |

---

## Continuous CI Verification Loop

```mermaid
flowchart TD
    ApplyChanges["Apply Code Fixes / Flag Accept"] --> LocalVerify["Run Local Verification (typecheck, vitest)"]
    LocalVerify --> CommitPush["Commit & Push to Remote Branch"]
    CommitPush --> Wait60s["Wait 60s for CI Analysis (schedule)"]
    Wait60s --> CheckPending{"Status Pending / Analysis In Progress?"}
    CheckPending -->|"Yes (Still Pending)"| Poll10s["Wait 10s & Re-check Status (schedule)"] --> CheckPending
    CheckPending -->|"No (Analysis Ready)"| ReQuery["Re-query Sonar Open Issues (search_sonar_issues)"]
    ReQuery --> CheckZero{"total === 0?"}
    CheckZero -->|"No (Issues remain)"| ApplyChanges
    CheckZero -->|"Yes (0 issues)"| Complete["Goal Complete / Safe to Merge PR"]
```

---

## Automation Scripts (Large Backlogs)

For batch fixes across large repositories, run helper scripts in `.agents/skills/sonar-remediation/scripts/`:
- `count_issues.py`: Aggregate issues by rule and component.
- `generate_plan.py`: Generate structured remediation plan (`request_feedback: true`).
- `generate_task.py`: Generate atomic task files (`user_facing: true`).

---

## Subdoc Reference

- **Rule Cookbook, Code Examples & Argument Schemas**: see [REFERENCE.md](REFERENCE.md).
