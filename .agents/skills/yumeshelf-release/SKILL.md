---
name: yumeshelf-release
description: Master skill for building, compiling release notes, verifying assets, and publishing YumeShelf releases to GitHub. Use when preparing, compiling, building, or publishing a new release for YumeShelf or when user mentions release, release notes, or publish release.
local: true
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
4. **Production Build**: Sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and executes production packaging via `electron-builder --win` (or `--linux` / `--win --linux` via `npm run build:all`).
5. **Checksum Generation**: Calculates SHA-256 hash files for all generated installer & binary packages under `build_output/nsis/sha256/` and `build_output/linux/sha256/`.
6. **Asset Integrity Verification**: Asserts existence of mandatory Windows release assets and discovers all present Linux artifacts:
   - **Windows Assets**:
     - `build_output/nsis/application/YumeShelf-Setup-<version>.exe`
     - `build_output/nsis/feed/latest.yml`
     - `build_output/nsis/blockmap/YumeShelf-Setup-<version>.exe.blockmap`
     - `build_output/nsis/sha256/YumeShelf-Setup-<version>.exe.sha256`
   - **Linux Assets** (when built):
     - `build_output/linux/application/YumeShelf-<version>.AppImage`
     - `build_output/linux/application/YumeShelf-<version>.tar.gz`
     - `build_output/linux/feed/latest-linux.yml`
     - `build_output/linux/sha256/YumeShelf-<version>.AppImage.sha256`
     - `build_output/linux/sha256/YumeShelf-<version>.tar.gz.sha256`
7. **Git Automation**: Stages release files, creates commit `release: v<version>`, pushes `main`, creates tag `v<version>`, and pushes tag to GitHub.
8. **GitHub Release Publication**: Clears dummy `GITHUB_TOKEN` and runs `gh release create v<version>` uploading release notes and all verified Windows assets.
9. **Automated Linux CI Build & Attachment**: Automatically triggers GitHub Actions workflow (`build-linux-release.yml`) to compile native Linux binaries (Rust helper, C# converter) on `ubuntu-latest`, package `YumeShelf-<version>.AppImage` and `.tar.gz`, and upload them directly into the published GitHub Release.

---

## Rules & Constraints

- **Single Source of Truth**: `CHANGELOG.md` at root stores incremental feature logs.
- **Required Release Assets**: Never publish without verifying mandatory installer and auto-updater assets.
- **Cross-Platform Packaging**: Windows installer is built locally during release, while Linux packages (`.AppImage`, `.tar.gz`) are automatically built and attached via GitHub Actions (`.github/workflows/build-linux-release.yml`).
- **Manual Linux Build Fallback**: If needed, trigger Linux CI build manually via `gh workflow run build-linux-release.yml -f tag=v<version>`.
- **Environment Isolation**: Always set `CSC_IDENTITY_AUTO_DISCOVERY=false` to prevent network timeouts during `electron-builder` compilation.
- **Authentication**: Always clear `GITHUB_TOKEN` before invoking `gh` CLI commands to allow fallback to system keyring.
