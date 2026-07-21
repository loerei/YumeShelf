---
name: prune-branches
description: >
  Find and safely delete stale, merged, or abandoned Git branches locally and on remotes. Use when the user asks to clean up repository branches, prune merged branches, or check for stale git branches.
---

# Pruning Stale Git Branches

## Quick start

Find local branches already merged into `main`:
```bash
git branch --merged main
```

Find remote branches already merged into `origin/main`:
```bash
git branch -r --merged origin/main
```

## Workflows

### 1. Identify Merged & Stale Branches

- **Local fully-merged:** Run `git branch --merged main` (or the default branch name). These are 100% safe to delete.
- **Remote fully-merged:** Run `git branch -r --merged origin/main`.
- **Squash-merged or Rebased (Stale):**
  If branches were squash-merged or rebased, they might not show up in `--merged`. To detect them:
  1. For each suspect branch, check its commit history relative to main: `git log main..<branch> --oneline`.
  2. If the unique commits on the branch already exist on `main` (possibly with a different SHA due to squashing/rebase), the branch is stale and safe to delete.
  3. Validate by diffing: `git diff <branch> main --stat` (if main has all additions/revisions and no critical code is deleted, it is safe).

### 2. Safely Delete Stale Branches

Delete local branches:
```bash
git branch -d <branch_name>  # Safe delete (warns if not merged)
git branch -D <branch_name>  # Force delete (use for squash-merged branches)
```

Delete remote branches:
```bash
git push origin --delete <branch_name>
```

Sync local tracking cache:
```bash
git fetch --all --prune
```
