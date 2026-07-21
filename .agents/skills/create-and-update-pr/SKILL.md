---
name: create-and-update-pr
description: >
  Create GitHub Pull Requests and dynamically update their descriptions to match recent commit changes. Use when opening a new PR, updating a PR description, or tracking branch commits to prevent description drift.
---

# Create and Update Pull Requests

Use this skill to automate the creation of Pull Requests on GitHub and keep their descriptions synchronized with local branch commits to avoid description drift.

---

## 1. Draft the Description
Refer to the formatting guidelines, commit naming conventions, and templates defined in the [write-pr](file:///c:/Users/sayus/.gemini/.agents/skills/productivity/write-pr/SKILL.md) skill to draft a compliant PR title and body.

---

## 2. Create the Pull Request
1. Retrieve the current repository status and branch name.
2. Call the `github:create_pull_request` tool with the appropriate parameters (`title`, `body`, `head`, `base`, `owner`, `repo`).
3. Store the returned pull request number for subsequent updates.

---

## 3. Continuous Sync Workflow (Drift Prevention)
During execution, particularly before declaring a task completed:
1. **Detect Changes**: Check recent branch commits and diffs (`git log` or `git diff`) to verify if the implementation details, affected files, or scope have changed since the PR was first created.
2. **Update Remote PR**: If changes or new commits are detected:
   - Re-draft the description using the [write-pr](file:///c:/Users/sayus/.gemini/.agents/skills/productivity/write-pr/SKILL.md) template.
   - Call the `github:update_issue` tool using the PR number as `issue_number` to update the `body` (and `title` if needed) on GitHub.
   - Ensure the description remains completely up to date before finishing.
