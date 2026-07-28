---
name: git-lifecycle-management
description: Manage the git lifecycle for large sessions, including branch creation, atomic commits, continuous PR updates, 150s CI audit loops, mandatory 2-step Sonar/Sourcery gate checks, and rollback strategies. Use when starting a new feature/bugfix, creating/updating PRs, making atomic commits, or needing to revert/rollback changes.
---

# Git Lifecycle Management

Use this skill to maintain a clean git history with atomic commits, manage pull requests dynamically, execute reliable 150s CI audit loops, and handle safe rollbacks during complex coding sessions.

## Quick Start

```bash
# 1. Start a feature branch from fresh main
git fetch origin
git checkout -b feature/user-auth

# 2. Make an atomic edit, test it, and commit
# (edit code/tests...)
npm run typecheck && npm run build:vite
git add -A && git commit -m "feat(auth): implement basic JWT validation"

# 3. Create PR (use --body-file to avoid PowerShell escaping issues)
$env:GITHUB_TOKEN=$null; gh pr create --title "feat(auth): implement JWT validation" --body-file "scratch/pr-body.md" --head "feature/user-auth" --base "main"

# 4. Schedule 150s timer for CI audit loop
# (Wait for SonarCloud Scan & Sourcery review to complete)
```

## Workflows & Operational Rules

```mermaid
flowchart TD
    Start["Start Session / Task"] --> Branch["1. Branch Creation & Naming"]
    Branch --> Edit["2. Atomic Edits & Local Build Checks"]
    Edit --> Verify{"Verification Pass?"}
    Verify -->|"Pass"| Commit["Commit (Conventional Commit)"]
    Verify -->|"Fail (under 2 retries)"| FixEdit["Fix edit locally"]
    FixEdit --> Edit
    Verify -->|"Fail (2+ retries)"| RollbackTest{"5. Test Failure Rollback"}
    RollbackTest -->|"Save work"| Stash["git stash"]
    RollbackTest -->|"Discard changes"| ResetHard["git reset --hard HEAD"]
    
    Commit --> PRSync["3. PR Synchronization & Pushing"]
    PRSync --> Push["git push origin feature-branch"]
    Push --> CreatePR["Create PR using --body-file"]
    
    CreatePR --> TimerLoop["4. Mandatory 150s CI Audit Loop"]
    TimerLoop --> WaitCI{"Check statusCheckRollup<br/>SonarCloud Scan & Code Analysis"}
    WaitCI -->|"Status: IN_PROGRESS"| SleepTimer["Schedule 150s timer & wait"]
    SleepTimer --> WaitCI
    WaitCI -->|"Status: COMPLETED (SUCCESS)"| QuerySonar["Run search_sonar_issues"]
    
    QuerySonar --> IssuesCheck{"Sonar Issues = 0 & Sourcery Clean?"}
    IssuesCheck -->|"No (Issues found)"| FixIssues["Fix issues, commit & push"]
    FixIssues --> CommentResolve["Post @sourcery-ai resolve on PR"]
    CommentResolve --> TimerLoop
    
    IssuesCheck -->|"Yes (0 issues & Status COMPLETED)"| MergePR["Merge PR & Delete Branch"]
    MergePR --> ReturnMain["Checkout main & git pull origin main"]
```

---

### 1. GitHub CLI & Sandbox Credentials
- **Dummy Token Bypass**: Sandbox environments inject `GITHUB_TOKEN=github_pat_...` by default, causing `gh` CLI commands to fail with `401 Unauthorized`.
- **Action**: Always prefix `gh` commands with `$env:GITHUB_TOKEN=$null` in PowerShell (or `set GITHUB_TOKEN=` in CMD) to fall back to the system keyring (e.g. `$env:GITHUB_TOKEN=$null; gh pr view <id>`).

---

### 2. PowerShell Escape Safeguard for PR Descriptions
- **Rule**: Never pass complex Markdown strings containing backticks (```) directly via `--body "..."` in PowerShell strings to avoid Unicode/Escape parser errors.
- **Action**: Always write the PR description to a local markdown file under `scratch/pr<id>-body.md` and use `gh pr create --body-file "scratch/pr<id>-body.md"`.

---

### 3. Mandatory 2-Step Sonar & Sourcery Audit Gate Check
When running the 150s timer audit loop after pushing commits or opening PRs:

1. **Step 1 — Verify CI Run Completion First (`statusCheckRollup`)**:
   - MUST check `$env:GITHUB_TOKEN=$null; gh pr view <id> --json statusCheckRollup` FIRST.
   - MUST confirm that both `SonarCloud Scan` AND `SonarCloud Code Analysis` have status **`COMPLETED`** with conclusion **`SUCCESS`**.
   - **CRITICAL**: If CI check status is still `IN_PROGRESS`, DO NOT run `search_sonar_issues` or claim 0 issues prematurely! Wait for the 150s timer to expire or re-check `statusCheckRollup`.

2. **Step 2 — Query Sonar Issues After CI Completion**:
   - ONLY AFTER `statusCheckRollup` is confirmed `COMPLETED`, run `search_sonar_issues({ projectKey, pullRequest })`.
   - If any issues exist, remediate them, commit, push, and post `$env:GITHUB_TOKEN=$null; gh pr comment <id> --body "@sourcery-ai resolve"`.
   - Repeat the 150s timer loop until `search_sonar_issues` returns `total: 0` AND all CI checks are `COMPLETED`.

---

### 4. Branch Creation, Atomic Commits & Merging
- **Branch Naming**: Format branch names as `feature/<desc>`, `bugfix/<issue-id>`, or `refactor/<desc>`.
- **Atomic Commits**: Each commit must contain exactly one logical change with conventional formatting (`feat:`, `fix:`, `refactor:`, `test:`).
- **Merge & Return**: Once 0 issues remain and all status checks pass 100%, execute `$env:GITHUB_TOKEN=$null; gh pr merge <id> --merge --delete-branch`.
- **Clean Main State**: After merging, run `git checkout main && git pull origin main` to ensure local workspace is clean and up-to-date.

---

### 5. Rollback and Revert Strategies
- **Test Failure**: If a change fails verification/tests and is not fixable within 2 iterations:
  - Run `git stash` to save current work, or `git reset --hard HEAD` to discard the failing iteration.
- **Incorrect Path**: If a design approach is deemed incorrect:
  - Find the commit hash before the path diverged.
  - Run `git reset --soft <commit-hash>` to keep changes for modification, or `git reset --hard <commit-hash>` to discard them completely.
