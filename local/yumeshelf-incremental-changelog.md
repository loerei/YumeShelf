---
name: yumeshelf-incremental-changelog
description: Multi-agent cooperative incremental changelog manager for YumeShelf. Use at the end of each task to document changes incrementally in English inside local/changelogs/changelog.<version>.md. Ensure the active version is confirmed with the user, initialize files if missing, and maintain the frontmatter metadata.
---

# YumeShelf Incremental Changelog Manager

Use this skill when you finish a task, apply source changes, or prepare a new release for `YumeShelf`. The goal is to allow different agents working sequentially on the same version to accumulate version logs consistently without overwriting or losing previous contributions.

---

## 📌 Core Rules

1. **Version Confirmation & Git Discovery**:
   - Before writing any log entries, **ALWAYS** confirm with the user (or carefully check the current context) which specific version is being targetted (e.g., `1.5.3`).
   - **Self-Discovery using Git**: If the version is not explicitly stated in the context, you can run `git tag -n` to view the already released versions/tags. Compare the latest tagged release (e.g., `v1.5.2`) with the version declared in `package.json` to verify the active working version (e.g., if latest tag is `v1.5.2` and `package.json` version is `1.5.3`, then you are working on version `1.5.3`).

2. **Codebase Version Synchronization**:
   - If the current version declared in the project's codebase (specifically inside `package.json` at the root) is lower than the active confirmed version you are working on (the one in the changelog), you **MUST** automatically update the `"version"` field in `package.json` to match this target version.

3. **Release Synchronization**:
   - The accumulated changelog file `local/changelogs/changelog.<version>.md` is the **absolute source of truth** when publishing a release.
   - When a release is triggered, you must compile and package the release notes using the automated script:
     ```bash
     npm run compile:release-notes
     ```
     This will generate `local/changelogs/compiled.release-notes.<version>.md`. Refer to [yumeshelf-release-guide.md](./yumeshelf-release-guide.md) for full compilation, build, asset verification (including `latest.yml`, blockmaps, and signatures), and publishing instructions.

4. **Strict English Language Constraint**:
   - **Both this skill file AND all generated changelog entries MUST be written in English.** This guarantees consistency across different agents and simplifies public release note generation.

5. **Auto-Initialization**:
   - Check if the target changelog file exists at `local/changelogs/changelog.<version>.md`.
   - If it **DOES NOT EXIST**: You are the first agent to work on this version. You must automatically create the `local/changelogs/` directory and initialize the `.md` file with the default YAML Frontmatter metadata and empty section headers.
   - If it **EXISTS**: Read the existing file first to understand the previous changes made by other agents.

6. **Incremental Appending**:
   - **NEVER** delete or overwrite previous log entries unless you are explicitly refactoring or replacing that exact feature.
   - Append your new change descriptions as bullet points at the bottom of the matching sections (`✨ What's New`, `🔧 What Changed`, `🛠️ For the Nerds`).

7. **Metadata Preservation**:
   - Every `changelog.<version>.md` file must contain a YAML Frontmatter block at the top to track the version's release status and update timestamps.

---

## 📊 Metadata Schema (YAML Frontmatter)

Each `changelog.<version>.md` file must start with the following frontmatter block:

```yaml
---
version: "1.5.3"
status: "working"  # Allowed values: "working" or "released"
released_at: null  # ISO-8601 date string when transitioned to "released", otherwise null
last_updated_by: "agent-name-or-purpose"
last_updated_at: "2026-05-19T02:11:18+07:00"
---
```

---

## 🔍 How to Determine the Active Version using Git

When starting a new session or task, run the following steps to self-determine the current version:
1. Propose `git tag -n` using `run_command`. Note the highest tag number (e.g. `v1.5.2`).
2. Read `package.json` to get the current project version.
3. Compare them:
   - If the `package.json` version matches the latest tag, you may be preparing a hotfix or minor bump. Confirm with the user.
   - If the `package.json` version (e.g., `1.5.3`) is higher than the latest tag (e.g., `v1.5.2`), you are working on the next development cycle version (`1.5.3`).

---

## 🧩 Section Model

Strictly follow the section definitions from [yumeshelf-release-notes.md](./yumeshelf-release-notes.md):

- **`## ✨ What's New`**: For completely new, user-visible capabilities that the end-user can directly notice and experience.
- **`## 🔧 What Changed`**: For modifications, bug fixes, UI polish, or updates to existing behaviors.
- **`## 🛠️ For the Nerds`**: Low-level technical details for developer/agent continuity. This covers refactoring, API changes, caching, fallback pipelines, and structural modifications. **Importantly, any purely internal system or infrastructure updates that DO NOT alter any user-facing functionality (e.g., codebase file modularization, process isolation refactors, IPC bridge setup, or decoupled CSS/JS architecture) MUST be placed strictly here to avoid cluttering user-facing logs.**

---

## 🛠️ Workflow

### Step 1: Confirm Active Version
- Look at current context, or run the **Git Discovery** step (Step 1 of active version determination).
- If still in doubt, ask the user directly:
  > *"Confirm: Which YumeShelf version are we currently targetting for the changelog?"*
- **Verify & Bump Codebase Version**: Check the current version declared in `package.json` at the root. If it is lower than the confirmed active version, update the `"version"` field in `package.json` to match the confirmed version immediately.

### Step 2: Check or Initialize the Changelog File
- Targeted path: `local/changelogs/changelog.<version>.md` (e.g., `local/changelogs/changelog.1.5.3.md`).
- If missing:
  - Initialize the new file using the **New Changelog Template** below.
  - Set `status: "working"`, `version: "<version>"`, and `released_at: null`.
- If present:
  - Read and parse the file contents to locate the sections.

### Step 3: Append Changelog Bullet Points
- Write clear, concise bullet points in English under the appropriate sections.
- Prefix your bullet points with your agent name or feature focus in brackets (e.g., `- [parallel-downloader] ...`).
- Put new points at the bottom of the section list to maintain chronological progression.

### Step 4: Update YAML Frontmatter
- Update `last_updated_by` to your agent/purpose identifier.
- Update `last_updated_at` to the current time in ISO-8601 format with timezone offset (e.g., `2026-05-19T02:12:00+07:00`).

---

## 📄 Templates

### 1. New Changelog Template (`changelog.<version>.md`):
```markdown
---
version: "1.5.3"
status: "working"
released_at: null
last_updated_by: "initial-initializer"
last_updated_at: "2026-05-19T02:11:18+07:00"
---

# YumeShelf Changelog - v1.5.3

## ✨ What's New

- [initial-initializer] Initialized version v1.5.3 changelog tracker.

## 🔧 What Changed

- ...

---

## 🛠️ For the Nerds

- ...
```

### 2. Multi-Agent Incremental Example (After multiple updates):
```markdown
---
version: "1.5.3"
status: "working"
released_at: null
last_updated_by: "parallel-downloader"
last_updated_at: "2026-05-19T02:15:30+07:00"
---

# YumeShelf Changelog - v1.5.3

## ✨ What's New

- [initial-initializer] Initialized version v1.5.3 changelog tracker.

## 🔧 What Changed

- [parallel-downloader] Accelerated update installer downloading by downloading 8 segments in parallel.
- [parallel-downloader] Added seamless single-stream downloading fallback for CDNs that do not support Range Requests.

---

## 🛠️ For the Nerds

- [parallel-downloader] Implemented concurrent segment requests using native fetch and concurrent `fileHandle.write` calls at distinct byte offsets.
- [parallel-downloader] Throttled IPC progress updates to a minimum interval of 300ms to eliminate main thread UI lag.
```
