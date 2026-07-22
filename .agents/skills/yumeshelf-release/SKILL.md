---
name: yumeshelf-release
description: Master skill for building, compiling release notes, verifying assets, and publishing YumeShelf releases to GitHub. Use when preparing, compiling, building, or publishing a new release for YumeShelf or when user mentions release, release notes, or publish release.
---

# YumeShelf Release & Publishing Skill

Use this skill when preparing, compiling, building, signing, or publishing a new release for `YumeShelf`.

## Quick Start

To execute a complete release for version `X.Y.Z`:

```bash
npm run release <version>
```

Example:

```bash
npm run release 1.5.12
```

For a dry-run check without committing or pushing:

```bash
node scripts/release.js <version> --dry-run
```

---

## What the One-Click Pipeline Does

When running `npm run release <version>`, the master orchestrator (`scripts/release.js`) automatically performs:

1. **Version Synchronization**: Bumps version in `package.json` if needed.
2. **Release Notes Compilation**: Runs `compile-release-notes.js --release`, writing `docs/changelogs/compiled.release-notes.<version>.md` and marking version as `released` in `CHANGELOG.md`.
3. **Metadata Synchronization**: Runs `sync-release-metadata.js` across language packs and templates.
4. **Production Build**: Sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and executes production NSIS packaging via `electron-builder --win`.
5. **Checksum Generation**: Calculates SHA-256 hash file for installer binary under `build_output/nsis/sha256/`.
6. **Asset Integrity Verification**: Asserts existence of all 4 required release assets:
   - `build_output/nsis/application/YumeShelf-Setup-<version>.exe`
   - `build_output/nsis/feed/latest.yml`
   - `build_output/nsis/blockmap/YumeShelf-Setup-<version>.exe.blockmap`
   - `build_output/nsis/sha256/YumeShelf-Setup-<version>.exe.sha256`
7. **Git Automation**: Stages release files, creates commit `release: v<version>`, pushes `main`, creates tag `v<version>`, and pushes tag to GitHub.
8. **GitHub Release Publication**: Clears dummy `GITHUB_TOKEN` and runs `gh release create v<version>` uploading release notes and all 4 assets.

---

## Rules & Constraints

- **Single Source of Truth**: `CHANGELOG.md` at root stores incremental feature logs.
- **Required Release Assets**: Never publish without verifying all 4 mandatory installer and auto-updater assets.
- **Environment Isolation**: Always set `CSC_IDENTITY_AUTO_DISCOVERY=false` to prevent network timeouts during `electron-builder` compilation.
- **Authentication**: Always clear `GITHUB_TOKEN` before invoking `gh` CLI commands to allow fallback to system keyring.
