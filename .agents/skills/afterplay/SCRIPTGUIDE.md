# Afterplay Scripts Guide & CLI Reference

Invoke helper scripts using `<skill-dir>/scripts/<script>.js` so execution works regardless of the target repository's working directory.

## 1. `scripts/get-pr-description.js`

Fetches PR title, body, metadata, and branch refs from GitHub into `<appDataDir>/brain/<conversation-id>/PR.md` (used in Phase 1 when `!GPR<PR_ID/URL>` is supplied).

```sh
node <skill-dir>/scripts/get-pr-description.js <PR_NUMBER_OR_URL> [options]
```

| Flag | Long Option | Description |
| :--- | :--- | :--- |
| `-o` | `--output <file>` | Output file path (`.md` or `.json`). Default: stdout. |
| | `--raw` | Output only the raw PR description markdown body. |
| | `--json` | Output full PR metadata in JSON (`number`, `title`, `body`, `author`, `state`, `url`, `headRefName`, `baseRefName`). |
| `-R` | `--repo <owner/repo>` | Target GitHub repository when running outside a git working tree. |
| `-t` | `--token <token>` | GitHub Personal Access Token (or set `GH_TOKEN` / `GITHUB_TOKEN`). |
| | `--host <hostname>` | Custom GitHub Enterprise host (e.g., `github.example.com`). |
| `-h` | `--help` | Show help and exit. |

```sh
# Export PR description to PR.md
node <skill-dir>/scripts/get-pr-description.js https://github.com/owner/repo/pull/42 -o "<appDataDir>/brain/<conversation-id>/PR.md"

# Export private repo PR metadata as JSON
node <skill-dir>/scripts/get-pr-description.js 42 -R owner/private-repo -t "<token>" --json -o PR.json
```

## 2. `scripts/export-diffs.js`

Scans modified files against a base ref (`git diff --name-only`), writes sanitized per-file `.diff` files into `<output-dir>`, and tracks SHA-256 checksums for incremental re-audits (Phase 5).

```sh
node <skill-dir>/scripts/export-diffs.js [TARGET_REF] -o <OUTPUT_DIR> [options]
```

| Flag | Long Option | Description |
| :--- | :--- | :--- |
| `-o` | `--output <dir>` | (Required) Output directory for `.diff` files. |
| `-u` | `--update` | Compute SHA-256 hashes, overwrite only changed diffs, and purge diffs for reverted files. |
| | `--json` | Output JSON manifest with `targetFile`, `relativePath`, `diffFile`, `status`, and `isUpdated`. |
| | `--clean` | Purge existing `.diff` files in `<output-dir>` before exporting. |
| `-f` | `--files <list>` | Comma-separated list of target files to filter. |
| `-C` | `--cwd <dir>` | Path to the target git repository (Default: `process.cwd()`). |
| `-h` | `--help` | Show help and exit. |

```json
{
  "targetRef": "<base-commit-or-branch>",
  "totalFiles": 1,
  "updatedCount": 0,
  "diffs": [
    {
      "targetFile": "<workspace>/src/module/TargetFile.ext",
      "relativePath": "src/module/TargetFile.ext",
      "diffFile": "<appDataDir>/brain/<conversation-id>/TargetFile.ext.diff",
      "diffFileName": "TargetFile.ext.diff",
      "status": "UNCHANGED",
      "isUpdated": false,
      "checksum": "<sha256-hex>"
    }
  ]
}
```

```sh
# Standard per-file diff export
node <skill-dir>/scripts/export-diffs.js <base-commit> -o "<appDataDir>/brain/<conversation-id>" -C "<workspace>"

# Incremental update with JSON manifest
node <skill-dir>/scripts/export-diffs.js origin/main -o "<appDataDir>/brain/<conversation-id>" --update --json
```
