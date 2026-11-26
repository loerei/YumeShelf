# Library Save Probe Utility (`probe-library-saves`)

Diagnostic CLI tool that hooks into YumeShelf's compiled production modules (`scanner.js`, `save-folder-resolver`, `SaveEditorService`, and `SaveEditorIpcController`) to scan a game library directory, discover every game and its save files, and verify both read (`loadSaveData`) and isolated temp-copy write round-trips (`writeSaveData` -> `loadSaveData`).

## Usage

```bash
node .devutil/probe-library-saves/index.cjs "<library-path>" [options]
```

### Arguments & Options

- `<library-path>` (required): Path to the game library root directory.
- `--probe-write`: Copy each save file to an isolated temp directory, apply a surgical delta update via `SaveEditorService.writeSaveData`, reload, and verify the updated value persists (never modifies real save files).
- `--max-depth=<n>`: Maximum directory scan depth (default: `5`).
- `--rebuild`: Force `npm run build:main` before running.
- `--json`: Print machine-readable JSON report to stdout.
- `--verbose`, `-v`: Print per-file results for every game with saves.
- `--help`, `-h`: Show usage help.
