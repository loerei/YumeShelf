---
name: yumeshelf-release
description: Master skill for building, compiling release notes, verifying assets, and publishing YumeShelf releases to GitHub. Use when preparing, compiling, building, or publishing a new release for YumeShelf or when user mentions release, release notes, or publish release.
local: true
---

# YumeShelf Release & Publishing Skill

Use this skill when preparing, compiling, building, signing, or publishing a new release for `YumeShelf`.

## Quick Start

To execute an instant multi-platform release for version `X.Y.Z`:

```bash
npm run release <version>
```

Example:

```bash
npm run release 2.0.2
```

For offline local Windows packaging:

```bash
npm run release <version> --local
```

For a dry-run check without committing or pushing:

```bash
node scripts/release.js <version> --dry-run
```

---

## What the Cloud-Parallel Release Pipeline Does

When running `npm run release <version>`, the process takes $\approx 3$ seconds locally and delegates multi-platform compilation to GitHub Actions:

1. **Version Synchronization**: Bumps version in `package.json` if needed.
2. **Release Notes Compilation**: Runs `compile-release-notes.js --release`, generating `docs/changelogs/compiled.release-notes.<version>.md` and marking the version as `released` in `CHANGELOG.md`.
3. **Metadata Synchronization**: Runs `sync-release-metadata.js` across language packs and templates.
4. **Git Automation**: Stages release files, creates commit `release: v<version> - release notes & version bump`, pushes `main`, creates tag `v<version>`, and pushes tag to GitHub.
5. **Parallel Cloud Matrix on GitHub Actions (`.github/workflows/release.yml`)**:
   - **`build-windows` Job (`windows-latest`)**: Compiles Windows NSIS setup package (`YumeShelf-Setup-<version>.exe`), `.blockmap`, `latest.yml`, and SHA-256 hashes.
   - **`build-linux` Job (`ubuntu-latest`)**: Compiles native Rust playtime helper, C# converter, packages `YumeShelf-<version>.AppImage` and `.tar.gz`, `latest-linux.yml`, and SHA-256 hashes.
   - **`publish-release` Job**: Downloads all Windows and Linux artifacts, consolidates them, and publishes the official GitHub Release with release notes in one single transaction.

---

## Rules & Constraints

- **Single Source of Truth**: `CHANGELOG.md` at root stores incremental feature logs.
- **Environment Isolation**: Cloud runners automatically set `CSC_IDENTITY_AUTO_DISCOVERY=false` to prevent network timeouts during `electron-builder` compilation.
- **Authentication**: `release.yml` automatically uses the workflow's authenticated `GITHUB_TOKEN` secret to publish releases.
