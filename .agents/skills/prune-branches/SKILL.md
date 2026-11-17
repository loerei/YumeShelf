---
name: prune-branches
description: Use when auditing, reviewing, or deleting merged and stale Git branches.
---

# Prune Branches

Audit-first branch pruning. ALWAYS report branch classifications and obtain explicit user approval before deleting any branch.

## Classification Heuristics

| Branch Condition | Action |
| :--- | :--- |
| **Directly Merged**: Listed by `git branch --merged <default>` or `git branch -r --merged origin/<default>` | Mark safe to delete |
| **Squash-Merged**: `git diff origin/<default>...origin/<branch> --stat` is empty (`0 insertions, 0 deletions`) OR `git cherry` returns `-` | Mark safe to delete (squash-merged) |
| **Unmerged Active**: `git cherry` returns `+` and tree diff has changes | Recommend: PR & merge, cherry-pick, or abandon |

## Workflow

1. **Audit (Read-Only)**:
   - Detect default branch: `git symbolic-ref refs/remotes/origin/HEAD` (fallback to `main`).
   - Sync tracking refs: `git fetch --all --prune`.
   - Classify all local and remote branches against the table above.
   - Present the categorized audit report (Directly Merged, Squash-Merged, Active Unmerged), then **STOP** and await explicit user confirmation.
2. **Prune (Post-Approval Only)**:
   - If the active branch is slated for deletion, switch first: `git checkout <default>`.
   - Delete local branches: `git branch -d <branch>` (use `-D` ONLY for confirmed squash-merged branches).
   - Delete remote branches: `git push origin --delete <branch1> <branch2> ...`.
   - Resync tracking refs: `git fetch --all --prune`.
