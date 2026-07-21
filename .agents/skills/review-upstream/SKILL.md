---
name: review-upstream
description: Sync and review custom skill updates from upstream repositories. Use when the user requests to check for skill updates, sync custom skills, review upstream skills, or runs /review-upstream.
---

# Review Upstream Skills

Sync, compare, and merge custom skill updates from external repositories.

## Workflows

### 1. Run Sync Script
Run the sync command to fetch upstream skills:
```powershell
node sync-upstream.js --all
```

### 2. Review New Skills
For each new skill found at upstream:
1. Explain what the skill does (read the description in its yaml frontmatter).
2. Ask the user: "Do you want to add this new skill to the official repository?"

### 3. Review Modified Skills
For each modified skill, perform this self-reflection before talking to the user:
1. **Self-Reflection (Internal Thought)**:
   - Identify where the two versions differ.
   - What part of the local (old) version is an extension compared to the upstream (new) version?
   - What part of the upstream (new) version is an extension compared to the local (old) version?
   - Do they complement each other?
     - **No** -> Decide which version is better.
     - **Yes** -> Draft a combined 3rd version.
2. **Present to User**:
   - Explain what the skill does.
   - Summarize the key differences between the local and upstream versions.
   - State your recommendation and reasoning.
3. **Prompt User**: Ask the user to choose:
   - **a. Keep old version** (local)
   - **b. Use upstream version** (overwrite)
   - **c. Combine into a new version** (merge changes)

### 4. Deploy, Distribute, and Clean Up
After gathering decisions, apply them, distribute, and clean up the workspace:
1. Run the apply actions using the script:
   - To add a new skill:
     ```powershell
     node sync-upstream.js --apply <skill_name> --action add --category <category>
     ```
   - To overwrite a modified skill:
     ```powershell
     node sync-upstream.js --apply <skill_name> --action overwrite
     ```
   - If combining, edit the local file directly, then proceed to cleanup.
2. After processing all skills, clean up the entire `pending/` directory:
   ```powershell
   node sync-upstream.js --clear
   ```
3. Sync the updates to all workspaces:
   ```powershell
   node distribute-skills.js --all D:\Projects
   ```
4. Commit and push the updates:
   ```powershell
   git add .
   git commit -m "Sync upstream: update skills"
   git push
   ```
