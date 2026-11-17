---
name: update-mcp
description: Use when updating, upgrading, or pulling upstream changes for local MCP servers.
---

# Update MCP

## 1. Locate Target MCP Source

Read the active IDE MCP config to extract the server's command, args, and working directory:

| Environment | Configuration File Path | Target Key |
| :--- | :--- | :--- |
| **Antigravity** | `<appDataDir>/mcp_config.json` | `mcpServers.<name>` |
| **Cursor** | Global Storage `storage.json` | `mcpServers.<name>` |
| **VS Code** | User Settings `settings.json` | `mcp.servers.<name>` |

If the command invokes a package runner (`npx`, `uvx`, `pipx`) rather than a local git repository, upgrade or refresh via that runner instead of running Steps 2-3.

## 2. Fetch & Merge Upstream

Inside the target MCP repository directory (compatible with Windows PowerShell 5.1 and `pwsh`):

```powershell
if (git status --porcelain) { git stash push -m "pre-mcp-update" }
$remote = if ((git remote) -contains "upstream") { "upstream" } else { "origin" }
git fetch $remote
$headRef = git symbolic-ref --short "refs/remotes/$remote/HEAD" 2>$null
$target = if ($headRef) { $headRef } else { "$remote/main" }
git merge $target
```

Abort and report to the user if `git fetch` fails or `git merge` produces conflicts.

## 3. Build & Handle File Locks

Run the build command matching the repository root markers:

| Project Marker | Build / Sync Command |
| :--- | :--- |
| `pyproject.toml` / `uv.lock` | `uv sync` |
| `package.json` | `npm install && npm run build` (or `pnpm`/`bun` equivalent) |
| `Cargo.toml` | `cargo build --release` |
| `go.mod` | `go build ./...` |

### File Lock Recovery (Process In-Use)

If the build fails with locked binaries (`EPERM`, `EBUSY`, or access denied):
1. Provide this terminal block for manual execution:
   ```powershell
   # 1. Stop the MCP server process (or close your IDE completely)
   # 2. Run in an external PowerShell window:
   cd "<path-to-mcp-directory>"
   <build-command>
   # 3. Reopen the IDE and message back to resume
   ```
2. Ask the user to close the locking process/IDE, run the block, and confirm when done.

## 4. Verification & Changelog Brief

1. Check `git log -n 5 --oneline` or `CHANGELOG.md` and summarize key fixes or features in 2-3 bullets.
2. Prompt the user to reload the MCP server and verify with a lightweight tool call.
