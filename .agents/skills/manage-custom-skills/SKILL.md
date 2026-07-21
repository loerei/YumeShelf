---
name: manage-custom-skills
description: >
  Create, update, and distribute custom agent skills. Scaffolds new skill folders or updates existing ones,
  registers them in the skill installer script, and syncs them across all project workspaces. Use when the 
  user wants to create, edit, update, or manage custom skills.
---

# Manage Custom Skills

This skill guides the agent through building or updating custom skills, registering them with the global setup, and distributing them to all project workspaces.

---

## 1. Gather Requirements

Ask the user:
1. What is the name of the new or existing skill? (e.g. `my-awesome-skill`)
2. What does it do? (for the YAML description block)
3. Under what conditions should the agent trigger it? (triggers)
4. What instructions, guidelines, and commands should be included?

---

## 2. Scaffold Custom Skill

Create a new directory inside the custom skills source repository and write the `SKILL.md` file:
Path: `<projects-dir>/myskills/<skill-name>/SKILL.md`

Ensure it contains the correct YAML frontmatter:
```yaml
---
name: <skill-name>
description: >
  <One sentence on what it does>. Use when [specific triggers].
---
```

---

## 3. Distribute

Since the script dynamically reads the source directory, the new skill is automatically detected. Run the distribution script to deploy it to all projects:
```powershell
node <projects-dir>/distribute-skills.js --all <projects-dir>
```
Or to a specific project:
```powershell
node <projects-dir>/distribute-skills.js --target <projects-dir>/<project-folder>
```

Navigate to `<projects-dir>/myskills/`, commit the new skill, and push it to the GitHub remote repository to keep it synced:
```powershell
git add .
git commit -m "Create skill: <skill-name>"
git push
```

Confirm to the user that the skill has been created, synced locally, and pushed to GitHub.

---

## 4. Updating & Redistributing Existing Skills

When editing or updating an existing custom skill:
1. **Apply changes to source repository**: Copy the updated files from the local workspace to the custom skills source repository directory: `<projects-dir>/myskills/<skill-name>/`
2. **Redistribute**: Run the distribution script to sync the updates across all project workspaces:
   ```powershell
   node <projects-dir>/distribute-skills.js --all <projects-dir>
   ```
3. **Push to GitHub**: Commit the modifications or deletion, and push to GitHub:
   ```powershell
   git add .
   git commit -m "Update/Delete skill: <skill-name>"
   git push
   ```

---

## 5. Update Global Policy Matrix

When a new custom skill is added, you MUST update the task-to-skill classification table in the Global Policy file (typically `AGENTS.md` or `GEMINI.md` at the repository/global configurations root):
- Locate the **Task-Specific Workflows** table.
- Categorize the new skill into one of the 5 standard categories:
  1. **Design & Frontend UI** (styling, layout, taste, mockups)
  2. **Engineering & Development** (testing, codebase architecture, debugging, prototyping)
  3. **Code Quality & CI/CD** (sonar quality gates, CI logs)
  4. **Productivity & Management** (triage, write-pr, to-issues, handoff, AI-writing)
  5. **Content & Notes** (obsidian, drafts, writing beats)
- Add the new skill name as a code block backtick item under the **Required Skills to Read** column for the matching category.
