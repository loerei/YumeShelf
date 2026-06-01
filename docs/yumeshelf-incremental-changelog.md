---
name: yumeshelf-incremental-changelog
description: Multi-agent cooperative incremental changelog manager for YumeShelf. Use at the end of each task to document changes incrementally in English inside CHANGELOG.md at the repo root. Confirm the active version, locate the correct version block, and append new bullet points under the appropriate section.
---

# YumeShelf Incremental Changelog Manager

Use this skill when you finish a task, apply source changes, or prepare a new release for `YumeShelf`. The goal is to allow different agents working sequentially on the same version to accumulate version logs consistently without overwriting or losing previous contributions.

---

## 📌 Core Rules

1. **Version Confirmation & Git Discovery**:
   - Before writing any log entries, **ALWAYS** confirm with the user (or carefully check the current context) which specific version is being targeted (e.g., `1.5.9`).
   - **Self-Discovery using Git**: If the version is not explicitly stated in the context, run `git tag -n` to view already released versions/tags. Compare the latest tagged release with the version declared in `package.json` to verify the active working version.

2. **Codebase Version Synchronization**:
   - If the version declared in `package.json` is lower than the active confirmed version you are working on, you **MUST** automatically update the `"version"` field in `package.json` to match.

3. **Single Source of Truth**:
   - **`CHANGELOG.md` at the repo root** is the single source of truth for all version history.
   - It is **tracked by Git** and must never be gitignored.
   - When a release is triggered, compile it using:
     ```bash
     node scripts/compile-release-notes.js          # dry run / preview
     node scripts/compile-release-notes.js --release # marks version as released
     ```
     Refer to [yumeshelf-release-guide.md](./yumeshelf-release-guide.md) for full publishing instructions.

4. **Strict English Language Constraint**:
   - All changelog entries **MUST** be written in English for consistency across agents and public release note generation.

5. **Active Version Block Discovery**:
   - Open `CHANGELOG.md` and find the `## [<version>] - working` heading for the active version.
   - If **no such block exists** (i.e., a new version cycle has started): you are the first agent. Add a new block **below `## [Unreleased]`** using the **New Version Block Template** below.
   - If the block exists: read the existing entries first.

6. **Incremental Appending**:
   - **NEVER** delete or overwrite previous log entries unless explicitly replacing that exact feature.
   - Append new bullet points at the **bottom** of the matching section (`### ✨ What's New`, `### 🔧 What Changed`, `### 🛠️ For the Nerds`).

7. **No Specific Game Titles**:
   - **NEVER** mention specific game names or titles. Keep all descriptions generic and engine/format-agnostic (e.g., 'games utilizing plain JSON serialization', 'games using zlib compression').

---

## 🧩 Section Model

Strictly follow the section definitions from [yumeshelf-release-notes.md](./yumeshelf-release-notes.md):

- **`### ✨ What's New`**: Completely new, user-visible capabilities.
- **`### 🔧 What Changed`**: Modifications, bug fixes, UI polish, or updates to existing behaviors.
- **`### 🛠️ For the Nerds`**: Low-level technical details for developer/agent continuity. Purely internal updates with no user-facing impact (modularization, refactors, IPC bridges, CSS/JS architecture) **MUST** go here only.

---

## 🔍 How to Determine the Active Version using Git

1. Run `git tag -n` (or `git describe --tags --abbrev=0`) to discover the highest released tag.
2. Read `package.json` to get the current project version.
3. Open `CHANGELOG.md` and find the block for that version:
   - If it is marked `## [<version>] - released`, that version is done.
   - > [!WARNING]
   - > If the version is already released, **DO NOT** automatically bump to the next version. **MUST** halt and ask the user to confirm the next active development version (e.g., patch, minor, or major).
   - If it is marked `## [<version>] - working`, you are safe to append.

---

## 🛠️ Workflow

### Step 1: Confirm Active Version

- Check context, or run the **Git Discovery** step.
- Open `CHANGELOG.md` and find the version block.
- **Verify & Bump Codebase Version**: If `package.json` is behind the confirmed target version, update it.

### Step 2: Locate or Initialize the Version Block

- Find `## [<version>] - working` in `CHANGELOG.md`.
- If missing, insert a new block immediately after `## [Unreleased]` using the template below.

### Step 3: Append Changelog Bullet Points

- Write clear, concise bullet points in English under the appropriate `###` section.
- Prefix your bullet points with your agent name or feature focus in brackets (e.g., `- [parallel-downloader] ...`).
- Add new points at the **bottom** of the section to maintain chronological order.

### Step 4: Commit the Change

- Stage `CHANGELOG.md` (and `package.json` if bumped) and commit with a clear message.

---

## 📄 Templates

### New Version Block (insert below `## [Unreleased]` in `CHANGELOG.md`):

```markdown
## [1.5.10] - working

### ✨ What's New

- ...

### 🔧 What Changed

- ...

---

### 🛠️ For the Nerds

- ...

---
```

### Multi-Agent Incremental Example (after multiple updates):

```markdown
## [1.5.10] - working

### 🔧 What Changed

- [parallel-downloader] Accelerated update installer downloading by downloading 8 segments in parallel.
- [parallel-downloader] Added seamless single-stream downloading fallback for CDNs that do not support Range Requests.

---

### 🛠️ For the Nerds

- [parallel-downloader] Implemented concurrent segment requests using native fetch and concurrent `fileHandle.write` calls at distinct byte offsets.
- [parallel-downloader] Throttled IPC progress updates to a minimum interval of 300ms to eliminate main thread UI lag.
- [save-editor] Fixed internal renderer state leak when closing the editor mid-save cycle.
```
