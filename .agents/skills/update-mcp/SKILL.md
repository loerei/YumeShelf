---
name: update-mcp
description: Update Model Context Protocol (MCP) servers from upstream repositories, rebuild packages, and resolve binary file-lock conflicts. Use when user requests to update, upgrade, or pull changes for MCP servers.
---

# Update MCP

## 1. Locate Target MCP Source

Read active IDE configuration to extract MCP server command arguments and working directory:

| Environment | Configuration File Path | Target Key |
| :--- | :--- | :--- |
| **Antigravity** | `<appDataDir>/mcp_config.json` | `mcpServers.<name>` |
| **Cursor** | Global Storage `storage.json` | `mcpServers.<name>` |
| **VS Code** | User Settings `settings.json` | `mcp.servers.<name>` |

---

## 2. Fetch & Merge Upstream

Inside the target MCP repository directory:

```powershell
# 1. Stash uncommitted lockfiles or local edits if dirty
git stash

# 2. Prefer upstream remote if configured as a fork, otherwise origin
git fetch upstream 2>$null || git fetch origin
git merge upstream/<default-branch> 2>$null || git merge origin/<default-branch>
```

---

## 3. Build & Handle File Locks

Run the build command matching the project root markers:

| Project Marker | Build / Sync Command |
| :--- | :--- |
| `pyproject.toml` / `uv.lock` | `uv sync` |
| `package.json` | `npm install && npm run build` (or `pnpm`/`bun` equivalent) |
| `Cargo.toml` | `cargo build --release` |
| `go.mod` | `go build ./...` |

### File Lock Recovery (Process In-Use)
If build fails due to locked binaries (`EPERM`, `EBUSY`, or access denied):
1. Construct this terminal block for manual execution:
   ```powershell
   # 1. Close IDE/Antigravity completely
   # 2. Run in external PowerShell:
   cd "<path-to-mcp-directory>"
   <build-command>
   # 3. Reopen IDE and message back to resume
   ```
2. Prompt user to close IDE, execute the block, and notify upon completion.

---

## 4. Verification & Changelog Brief

1. Query recent changes: `git log -n 5 --oneline` or read `CHANGELOG.md` / `whatsnew.json`.
2. Summarize key fixes/features in 2-3 bullet points.
3. Instruct user to reload MCP server and test with a lightweight tool call.
