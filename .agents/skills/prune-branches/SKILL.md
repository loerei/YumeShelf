---
name: prune-branches
description: >
  Audit, deep-review, and prune stale or merged Git branches locally and on remotes. Use when the user asks to clean up repository branches, prune merged branches, audit stale git branches, or run /prune-branches.
---

# Pruning Stale Git Branches

Perform an audit-first review of local and remote branches. Do NOT delete any branch until the user explicitly approves the audit report.

## Workflows

```mermaid
flowchart TD
    Start["Trigger Audit"] --> Detect["Detect Default Branch (e.g. main/master)"]
    Detect --> Fetch["git fetch --all --prune"]
    Fetch --> ListLocal["Check local: git branch --merged <default>"]
    Fetch --> ListRemote["Check remote: git branch -r --merged origin/<default>"]
    Fetch --> CheckUnmerged["Inspect unmerged: git branch -r --no-merged origin/<default>"]
    
    CheckUnmerged --> DeepReview{"Deep Review per Unmerged Branch"}
    
    DeepReview -->|"git cherry = - OR diff = 0"| IndirectMerged["Indirectly Merged (Squash/Cherry-pick)"]
    DeepReview -->|"git cherry = +"| Unmerged["Active / Unmerged Branch"]
    
    IndirectMerged --> Report["Generate Audit Report & Recommendations"]
    ListLocal --> Report
    ListRemote --> Report
    Unmerged --> Classify3["Classify into 1 of 3 Recommendations:<br/>1. Create PR & Merge<br/>2. Direct commit to default branch<br/>3. Abandon branch"]
    Classify3 --> Report
    
    Report --> UserChoice{"User Directs Action?"}
    UserChoice -->|"Approved"| SwitchBranch["Checkout default branch if on branch to delete"]
    SwitchBranch --> Prune["Execute Deletion & Sync Cache"]
    UserChoice -->|"Not Approved"| Stop["STOP - Wait for directive"]
```

## Step-by-Step Execution

### Phase 1: Audit & Classification (Strict Read-Only)

1. **Detect Default Branch**: Resolve target default branch (`DEFAULT_BRANCH`):
   - Query remote HEAD: `git symbolic-ref refs/remotes/origin/HEAD` (e.g. `main` or `master`). If unresolved, check current branch or fallback to `main`.
2. **Sync Tracking Refs**: Run `git fetch --all --prune`.
3. **Find Directly Merged Branches**:
   - Local: `git branch --merged <DEFAULT_BRANCH>`
   - Remote: `git branch -r --merged origin/<DEFAULT_BRANCH>`
4. **Deep Review Unmerged Branches**: For each branch in `git branch -r --no-merged origin/<DEFAULT_BRANCH>`:
   - Check patch equivalence: `git cherry origin/<DEFAULT_BRANCH> origin/<branch>`
   - Check 3-dot diff: `git diff origin/<DEFAULT_BRANCH>...origin/<branch> --stat`
   - **Classification Rules**:
     - **Indirectly Merged (Safe to prune)**: `git cherry` returns `-` or 3-dot diff has 0 changes.
     - **Unmerged Active**: `git cherry` returns `+`. Assess changes and assign 1 of 3 recommendations:
       1. *Create PR & Merge*: Large feature/fix needing code review.
       2. *Direct Commit to default branch*: Small doc/config tweak safe for direct cherry-pick.
       3. *Abandon Branch*: Hardcoded secrets, obsolete code, or rejected draft.

### Phase 2: Report & Pause

Present a structured report containing:
1. **Local & Direct Remote Merged Branches** (Safe to prune).
2. **Indirectly Merged Branches** (Safe to prune with rationale).
3. **Unmerged Branches & Recommendations** (Categorized with 1/2/3 options).

> [!IMPORTANT]
> **Audit-First Guardrail**: STOP and wait for the user's explicit directive before executing any deletion (`git branch -d`/`-D` or `git push origin --delete`).

### Phase 3: Prune (Upon Explicit Directive)

1. **Active Branch Switch Guard**: Check current branch via `git branch --show-current`. If currently on a branch targeted for deletion, switch first: `git checkout <DEFAULT_BRANCH>`.
2. **Delete Local Branches**: `git branch -d <branch>` (or `-D` if squash-merged).
3. **Delete Remote Branches**: `git push origin --delete <branch_1> <branch_2> ...`
4. **Sync Local Tracking Cache**: `git fetch --all --prune`.
