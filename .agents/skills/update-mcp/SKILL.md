---
name: update-mcp
description: Update Model Context Protocol (MCP) servers from their upstream source repositories, rebuild their packages, and resolve file-lock conflicts. Use when the user requests to update, upgrade, or pull changes for one or more MCP servers.
---

# Update MCP

Guide to updating local or standard Model Context Protocol (MCP) servers.

## Quick Start

1. Find the target MCP server in the config file.
2. Locate its source directory and fetch/merge changes from its remote repository.
3. Handle file-locks or process conflicts dynamically.

## Workflows

### Phase 1: Locate & Inspect MCP
- Read the active MCP configuration file depending on the current IDE or environment:
  - **Antigravity**: `mcp_config.json` (typically under the application data path)
  - **Cursor**: `storage.json` (under global storage folder)
  - **VS Code**: `settings.json` (under user configurations folder)
- Locate the entry matching the requested MCP name.
- Extract the command or arguments to identify the server's repository source directory (e.g., `<projects-dir>/<mcp-folder-name>`).

### Phase 2: Upstream Updates
- Check the git remotes in the MCP directory using `git remote -v`.
- Fetch and merge changes from the remote repository (prefer `upstream/<default-branch>` if configured as a fork, otherwise `origin/<default-branch>`):
  ```powershell
  git fetch upstream
  git merge upstream/<default-branch>
  ```
  *(If there are uncommitted lock files or local edits, stash them using `git stash` first)*.

### Phase 3: Rebuilding & Lock Resolution
- Determine the package manager or build system from the repository structure:
  - **Python (pyproject.toml/uv.lock)**: Run `uv sync`.
  - **Node.js (package.json)**: Run `npm install && npm run build` (or the compile script defined in `package.json`).
- **File Lock Resolution**: If the tool fails to build because the executable or module is currently in use, immediately construct a one-shot terminal command block for the user to run manually:
  ```powershell
  # Close your IDE/Antigravity completely, run this block in PowerShell, then reopen:
  cd "<path-to-mcp-directory>"
  <sync-or-build-command>
  ```
  Provide the command, request the user to close the app, run the command, and message back to resume.

### Phase 4: Verification & Changelog Brief
- Once the update completes, query the repository's changelog files (e.g., `CHANGELOG.md`, `whatsnew.json`) or recent git commits (`git log -n 5 --oneline`) to summarize new features or fixes.
- Prompt the user to reload the MCP servers and verify with a test tool call.
