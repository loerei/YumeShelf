---
name: yumeshelf-release-guide
description: Master guide for building, packaging, verifying, and publishing YumeShelf releases. Explains how to compile release notes from changelogs, build the installer, and manage required auxiliary release assets like latest.yml, blockmap, and sha256 files.
---

# YumeShelf Release & Publishing Guide

Use this skill when the task is to prepare, compile, build, sign, or publish a new release for `YumeShelf`. 

This guide is the master document for the build, packaging, asset verification, and publishing workflows. It coordinates with two specialized sub-skills:
- **[yumeshelf-incremental-changelog.md](./yumeshelf-incremental-changelog.md)**: For documenting code changes incrementally during development.
- **[yumeshelf-release-notes.md](./yumeshelf-release-notes.md)**: For guidelines on writing style, formatting, and tone of user-facing release notes.

---

## 🚀 1. The Release Notes Compilation

Before compiling the binaries, you must finalize and compile the release notes. Version logs are accumulated incrementally by agents directly inside `CHANGELOG.md` at the repo root, following the [yumeshelf-incremental-changelog.md](./yumeshelf-incremental-changelog.md) skill.

To prepare user-facing, clean release notes:
1. Run the automated compiler script:
   - **For Dry Run / Validation** (does not modify `CHANGELOG.md`):
     ```bash
     node scripts/compile-release-notes.js
     ```
   - **For Final Release** (marks the version as `released` in `CHANGELOG.md`):
     ```bash
     node scripts/compile-release-notes.js --release
     ```
   This will read the version block from `CHANGELOG.md` and:
   - Strip technical bracket prefix tags (e.g. `[parallel-downloader]`, `[system-tray]`) to make bullet points readable for end-users.
   - Auto-remove empty or placeholder sections.
   - Write the finalized public notes to `docs/changelogs/compiled.release-notes.<version>.md`.
   - Update the version heading in `CHANGELOG.md` to mark it as released (only when using `--release`).
2. Read and verify `docs/changelogs/compiled.release-notes.<version>.md`. Copy its content to use as the GitHub Release description.

---

## 📦 2. Building the Installer

When preparing and compiling a public release, you must adhere to these strict constraints:

1. **Close All Running Dev App Instances**:
   - You **MUST** ensure all active instances of the application (e.g., those started via `npm start` or running in the background) are completely closed before initiating the build.
   - If any instance is left running, Windows will place a write-protection file lock on `YumeShelf.exe` inside the build output directories, causing the compiler (`electron-builder`) to fail with a file permission error.

2. **Sync Release Metadata**:
   - Run the metadata sync script to ensure all translation templates, pack lists, and version configurations match the target release version:
     ```bash
     npm run sync:release-metadata
     ```

3. **Build strictly with the Production Command**:
   - **You MUST compile the final release using strictly the production command:**
     ```bash
     npm run build
     ```
   - **NEVER** use alternative testing commands such as `npm run build:fast` or `npm run build:dir` for public releases. These alternative commands bypass crucial signing procedures, optimizations, and production configuration pipelines.

---

## 🔧 3. Required Release Assets (Critical)

When creating a new GitHub Release for `YumeShelf`, you **MUST** upload the following 4 files. Missing any of these auxiliary files will break the in-app automatic updater for client installations:

1. **The Primary Setup Installer**:
   - Filename: `YumeShelf-Setup-X.Y.Z.exe` (e.g., `YumeShelf-Setup-1.5.3.exe` from `build_output/nsis/`)
2. **`latest.yml`**:
   - Path: `build_output/nsis/feed/latest.yml`
   - **Why**: Crucial for the `electron-updater` client-side auto-update system to discover the update, file sizes, and binary integrity checksums. Without this manifest, client updates will fail.
3. **Differential blockmap (`.blockmap`)**:
   - Path: `build_output/nsis/blockmap/` (e.g., `YumeShelf-Setup-X.Y.Z.exe.blockmap`)
   - **Why**: Required by electron-updater to support high-efficiency, bandwidth-saving differential updates (downloading only modified binary block segments).
4. **Binary Hash Signature (`.sha256`)**:
   - Path: `build_output/nsis/sha256/` (e.g., `YumeShelf-Setup-X.Y.Z.exe.sha256`)
   - **Why**: Used as the formal verification hash signature for binary downloads.

---

## 📢 4. Publishing the Release

Once built and verified:
1. Review the writing guidelines and templates in **[yumeshelf-release-notes.md](./yumeshelf-release-notes.md)** to ensure perfect tone and style.
2. Create and publish the release on GitHub. You can use the GitHub CLI (`gh release create`) or upload them manually.
3. Make sure all 4 required assets (Setup `.exe`, `latest.yml`, `.blockmap`, `.sha256`) are uploaded together.
4. Ensure the corresponding git tag (e.g. `v1.5.3`) is created and pushed.
