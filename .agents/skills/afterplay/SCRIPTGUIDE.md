# Afterplay Scripts Guide & CLI Reference

This document provides complete usage instructions, CLI flags, output formats, and environment variable options for the helper scripts bundled inside the **Afterplay** skill (`scripts/`).

---

## 1. `scripts/get-pr-description.js`

### Purpose
Used in **Phase 1** (when `!GPR<PR_ID/URL>` is invoked) to fetch the target Pull Request title, description body, metadata, author, and branch refs from GitHub, saving them to `<appDataDir>\brain\<conversation-id>\PR.md` as the authoritative Goal specification for subagent audits.

### CLI Syntax
```bash
node scripts/get-pr-description.js <PR_NUMBER_OR_URL> [options]
```

### Options & Flags
| Flag | Long Option | Description |
| :--- | :--- | :--- |
| `-o` | `--output <file>` | Output file path (`.md` or `.json`). Default: prints to stdout. |
| | `--raw` | Output only the raw PR description markdown body. |
| | `--json` | Output full PR metadata in JSON format (`number`, `title`, `body`, `author`, `state`, `url`, `headRefName`, `baseRefName`). |
| `-R` | `--repo <owner/repo>` | Specify target GitHub repository when executing outside a git repo working tree. |
| `-t` | `--token <token>` | GitHub Personal Access Token (PAT) for private repositories or CI environments. |
| | `--host <hostname>` | Custom GitHub Enterprise host (e.g. `github.mycompany.com`). |
| `-h` | `--help` | Show help message and exit. |

### Environment Variables
- `GH_TOKEN` / `GITHUB_TOKEN`: Injected automatically if passed via `--token <token>`.

### Usage Examples
```bash
# Export PR #1857 description to PR.md in conversation brain folder
node scripts/get-pr-description.js https://github.com/Automattic/simplenote-android/pull/1857 -o "<appDataDir>/brain/<id>/PR.md"

# Export private repo PR #42 to JSON format using token
node scripts/get-pr-description.js 42 -R owner/private-repo -t ghp_xxxx --json -o PR.json
```

---

## 2. `scripts/export-diffs.js`

### Purpose
Used in **Phase 5** to automatically scan modified files against a base branch/commit (`git diff --name-only`), sanitize file names, export individual `.diff` files into the conversation `brain` directory, and track incremental updates using SHA-256 checksums.

### CLI Syntax
```bash
node scripts/export-diffs.js [TARGET_REF] -o <OUTPUT_DIR> [options]
```

### Options & Flags
| Flag | Long Option | Description |
| :--- | :--- | :--- |
| `-o` | `--output <dir>` | **(Required)** Output directory path inside `brain` to save `.diff` files. |
| `-u` | `--update` | **Incremental Update Mode**. Computes SHA-256 hashes of diffs and only overwrites changed diffs. Automatically purges diffs of files reverted from the PR. |
| | `--json` | Outputs a machine-readable JSON manifest containing file mappings, status (`NEW`, `MODIFIED`, `UNCHANGED`), and `isUpdated` flags. |
| | `--clean` | Purges all existing `.diff` files in the output directory before exporting. |
| `-f` | `--files <list>` | Comma-separated list of target source files to filter. |
| `-C` | `--cwd <dir>` | Path to the target Git repository working tree (Default: `process.cwd()`). |
| `-h` | `--help` | Show help message and exit. |

### JSON Manifest Output Format (`--json`)
```json
{
  "targetRef": "24f01a07",
  "totalFiles": 6,
  "updatedCount": 0,
  "diffs": [
    {
      "targetFile": "D:\\Projects\\Simplenote\\simplenote-android\\Simplenote\\src\\main\\java\\com\\automattic\\simplenote\\NoteEditorFragment.java",
      "relativePath": "Simplenote/src/main/java/com/automattic/simplenote/NoteEditorFragment.java",
      "diffFile": "C:\\Users\\sayus\\.gemini\\antigravity\\brain\\90938acb-9f56-4615-9c0f-ab025c170625\\NoteEditorFragment.java.diff",
      "diffFileName": "NoteEditorFragment.java.diff",
      "status": "UNCHANGED",
      "isUpdated": false,
      "checksum": "d5d1c754cf011e4dc3a13fd5a1a92729fcd3035472316a20c7d3b3b99508f9f7"
    }
  ]
}
```

### Usage Examples
```bash
# Standard per-file diff export against base commit 24f01a07
node scripts/export-diffs.js 24f01a07 -o "<appDataDir>/brain/<id>" -C "d:/Projects/Simplenote/simplenote-android"

# Incremental update mode with JSON manifest output
node scripts/export-diffs.js origin/trunk -o "<appDataDir>/brain/<id>" --update --json
```
