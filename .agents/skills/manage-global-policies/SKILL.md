---
name: manage-global-policies
description: >
  Create, update, or edit global policy rules for AI agents. Use when the user wants to add, modify, delete, or rearrange rules in the global policy files across any IDE or machine.
---

# Manage Global Policies

This skill guides the agent through modifying the global policy files, ensuring consistency between the local IDE configurations and the remote custom skills repository.

## Workflows

### 1. Locate Target Files Dynamically
Before making edits, locate the two configuration paths on the current system:
1. **Repository Source File (`AGENTS.md`):** Locate the root of the custom skills repository (look for the workspace directory containing `distribute-skills.js` or `AGENTS.md`). We refer to this path as `<custom-skills-repo-root>/AGENTS.md`.
2. **Active IDE Global Config File:** Detect the active IDE and locate its global policy file in the user's home directory (e.g., `~/.gemini/GEMINI.md` for Google Antigravity, or the corresponding global rule file for Cursor/Windsurf/etc.). We refer to this path as `<active-global-config-file>`.

### 2. Apply Changes Globally
Whenever a change is approved by the user, apply it identically to both detected policy files:
1. Modify `<active-global-config-file>`
2. Modify `<custom-skills-repo-root>/AGENTS.md`

Ensure the contents of both files remain completely synchronized.

### 3. Verify Policy Skill Coverage
Run the automated coverage audit script to ensure 100% of skills are documented:
```powershell
node audit-policy-coverage.js
```

### 4. Commit & Push to GitHub
Navigate to the `<custom-skills-repo-root>/` directory, commit the policy updates, and push to the remote repository:
```powershell
git add AGENTS.md
git commit -m "Update global policies: <brief description of changes>"
git push
```
