---
name: sonar-remediation
description: Inspect, remediate, accept, and automate SonarQube and SonarCloud code quality, duplication, and security issues across any language or repository. Use when fixing Sonar issues, querying open smells/bugs, resolving code duplications, running automated Sonar batch fixes, or executing /goal Sonar remediation.
---

# Sonar Remediation & Quality Gate Workflows

Inspect, remediate, accept, and automate SonarQube/SonarCloud code quality issues across single files, PRs, or entire repositories. (Works with `sonarcloud:` and `sonarqube:` MCP servers).

## Workflows

### 1. Issue Query Scope Flowchart

```mermaid
flowchart TD
    Start["Sonar Issue Query Request"] --> DetermineScope{"Determine Query Scope"}
    DetermineScope -->|"1. By File Name"| FileScope["File Scope"]
    FileScope --> FileCall["search_sonar_issues({ projectKey, componentKeys: ['<projectKey>:<filePath>'], issueStatuses: ['OPEN'] })"]
    DetermineScope -->|"2. By Commit"| CommitScope["Commit Scope"]
    CommitScope --> CommitCall["git show --name-only <commit_hash> -> search_sonar_issues({ projectKey, componentKeys, inNewCodePeriod: true })"]
    DetermineScope -->|"3. By Pull Request (PR)"| PRScope["Pull Request Scope"]
    PRScope --> PRCall["search_sonar_issues({ projectKey, pullRequest: '<pr_id>', issueStatuses: ['OPEN'] })"]
    DetermineScope -->|"4. By Branch"| BranchScope["Branch Scope"]
    BranchScope --> BranchCall["search_sonar_issues({ projectKey, branch: '<branch_name>', issueStatuses: ['OPEN'] })"]
    DetermineScope -->|"5. Repository Scope"| RepoScope["Repository Scope"]
    RepoScope --> RepoCall["search_sonar_issues({ projectKey, issueStatuses: ['OPEN'] })"]
    DetermineScope -->|"6. Combined (File + PR)"| CombinedScope["Combined Scope"]
    CombinedScope --> CombinedCall["search_sonar_issues({ projectKey, pullRequest: '<pr_id>', componentKeys: ['<projectKey>:<filePath>'], issueStatuses: ['OPEN'] })"]
    FileCall --> ProcessIssues["Analyze & Apply Remediation"]
    CommitCall --> ProcessIssues
    PRCall --> ProcessIssues
    BranchCall --> ProcessIssues
    RepoCall --> ProcessIssues
    CombinedCall --> ProcessIssues
```

> [!IMPORTANT]
> When analyzing an active PR, MUST pass `pullRequestId` or `pullRequest`. Omitting PR ID queries the default branch (`main`).
> See [REFERENCE.md](REFERENCE.md) for full MCP Tool Parameter Reference & Argument Schemas.

### 2. Issue Triage & Action Decision Flowchart

```mermaid
flowchart TD
    Start["Query Open Issues (search_sonar_issues)"] --> Triage{"Issue Category / Rule Key"}
    Triage -->|"S3776 / S2004 / css:S7924"| FlagAccept["DO NOT EDIT CODE / DO NOT SPLIT FUNCTIONS - Flag 'ACCEPT' via change_sonar_issue_status"]
    Triage -->|"S8786 (Regex Backtracking)"| CheckRegex{"Regex Simplifiable?"}
    CheckRegex -->|"Yes"| FixCode["Fix Code (Eliminate Backtracking)"]
    CheckRegex -->|"No"| FlagAccept
    Triage -->|"CPD / Duplications"| GetDup["Call get_duplications & inspect disk"]
    GetDup --> FixCode
    Triage -->|"S1854, S1481, S7781, S2933..."| FixCode
    FlagAccept --> VerifyLoop["Continuous Verification Loop"]
    FixCode --> VerifyLoop
```

> [!IMPORTANT]
> Before calling `change_sonar_issue_status` to flag any issue as `"accept"` or `"falsepositive"`, MUST search for the issue key using `search_sonar_issues` with `issueStatuses: ["OPEN"]`.
> See [REFERENCE.md](REFERENCE.md) for Detailed Rule Remediation & Triage Matrix.

### 3. Remediation Safety Boundaries

- **NEVER delete, rename, or move** standalone entrypoints, child processes, worker scripts, or dynamic IPC/service wrappers.
- **NEVER modify** exported module interfaces, public API signatures, or database schemas during Sonar Remediation.
- **Domain Contract Preservation (`S1854`, `S1481`)**: NEVER alter returned object keys or state properties (e.g. `favorite`, `id`, `status`) to consume an unused variable. Safely delete the dead variable calculation instead.

### 4. Continuous Zero-Issue & Remote CI Verification Flowchart

```mermaid
flowchart TD
    ApplyChanges["Apply Code Fixes / Flag Accept"] --> LocalVerify["Run Local Verification (typecheck, vitest)"]
    LocalVerify --> CommitPush["Commit & Push to Remote Branch"]
    CommitPush --> ScheduleTimer["MUST Schedule 150s Timer (schedule)"]
    ScheduleTimer --> TimerExpire["150s Timer Expired Notification"]
    TimerExpire --> ReQuery["Re-query Sonar Open Issues (search_sonar_issues)"]
    ReQuery --> CheckZero{"total === 0?"}
    CheckZero -->|"No (Issues remain)"| ApplyChanges
    CheckZero -->|"Yes (0 issues)"| Complete["Goal Complete / Safe to Merge PR"]
```

### 5. Script-Automated Task Execution

For large backlogs, run companion scripts in `.agents/skills/sonar-remediation/scripts/`: `count_issues.py`, `generate_plan.py` (`request_feedback: true`), `generate_task.py` (`user_facing: true`).
**Task Execution Loop**: Fix branch -> For each file in `task.md`: Mark `[/]` -> Patch via `patch_file` -> Mark `[x]` -> Verify via project build/test tools before committing.

---

## Detailed Rules & Code Examples

See [REFERENCE.md](REFERENCE.md) for Preemptive Code Inspection, domain-scoped **Before / After** code examples, MCP argument schemas, and specific rule remediation patterns. (MUST read [REFERENCE.md](REFERENCE.md) before applying code fixes).
