# SOP 04: RELEASE PACKAGING & DEVELOPER CHANGELOG PROTOCOL

This SOP instructs you on the standard procedure for recording developer logs (Changelogs) and executing production releases without system locks or conflicts.

---

## 📝 1. Developer Changelog Process

Upon completing any feature task, bug fix, or codebase modification, you **MUST** record your changes inside the local changelog file at: `local/changelogs/changelog.<version>.md`.

### Format & Classification Rules:
1. **Developer Language:** Use English strictly for all developer logs, code comments, and technical documentation.
2. **"For the Nerds" Structuring:**
   * If a change is purely technical or system-oriented (e.g., modularizing source files, refactoring logic, linter updates, or modifying these `/SOP` guidelines) without changing end-user features or Renderer UI:
   * **MANDATORY:** Log these under the **`## For the Nerds`** section at the bottom of the changelog file. Do not mix technical refactoring into the user-facing `What's New` section.
3. **No Manual Release Note Cleaning:**
   * **NEVER** clean up markdown brackets or YAML frontmatter manually when creating a release. Always run:
     ```powershell
     npm run compile:release-notes
     ```
     This script automatically parses raw changelogs and outputs a production-ready file under `local/changelogs/compiled.release-notes.<version>.md`.

---

## 🔒 2. Anti-Build Lock Production Packaging

To guarantee that the production build compiler (`npm run build`) does not hit file lock errors on Windows:

1. **Step 1: Close all Running Dev Processes**
   * Close all active dev instances started via `npm start` or `npm run dev`.
2. **Step 2: Run Production Compilation**
   * Execute the official production build command:
     ```powershell
     npm run build
     ```
   * **STRICTLY PROHIBITED** from using fast compile or validator-bypass variants (like `:fast`) when packaging an official production release.
