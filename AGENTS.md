# YumeShelf AI Agent Guidelines

Welcome, fellow AI Agent! To ensure consistency, high-quality development, and seamless collaboration across sequential or parallel sessions, you **MUST** read, understand, and adhere to these guidelines immediately upon starting any task in this repository.

---

## 🗺️ 1. Master Agent Skills (Must Read)

Before performing any research, reading large files, or writing code, you must locate the specialized instructions under the `local/` directory:

1. **[yumeshelf-release-guide.md](./local/yumeshelf-release-guide.md) (Master Release Index)**:
   - **When**: Preparing a release, building binaries, packaging auxiliary files, or updating release-notes.
   - **Focus**: The definitive manual for standard production builds, file lock avoidance, and required update assets (`latest.yml`, `.blockmap`, `.sha256`).

2. **[yumeshelf-incremental-changelog.md](./local/yumeshelf-incremental-changelog.md) (Changelog Manager)**:
   - **When**: At the end of **every** feature task, bug fix, or codebase modification.
   - **Focus**: Instructions for cooperatively recording incremental developer logs in English inside `local/changelogs/changelog.<version>.md` without overwriting other agents' work.

3. **[yumeshelf-release-notes.md](./local/yumeshelf-release-notes.md) (Release Note Style Rules)**:
   - **When**: Drafting user-facing summaries or public GitHub Release announcements.
   - **Focus**: Formatting guidelines, section separation (`What's New`, `What Changed`, `For the Nerds`), tone checks, and language rules.

4. **[yumeshelf-code-modularization.md](./local/yumeshelf-code-modularization.md) (Code Modularization Guidelines)**:
   - **When**: Creating new features, refactoring existing code, or adding new UI components/modules.
   - **Focus**: Ensuring strict process isolation (Main vs Renderer), proper preload IPC bridging, and decoupled CSS/JS architecture.

5. **[yumeshelf-save-editor.md](./local/yumeshelf-save-editor.md) (Save Editor & Serialization Guidelines)**:
   - **When**: Modifying save game formats, working with compression/encoders, or changing the save editor's state and rendering logic.
   - **Focus**: Core serialization and bitstream alignment specifications, live state mutation practices, and cross-validation/differential testing loops.

---

## 📂 2. Project Domain Guidelines Map

Find the task type that matches your user request and read the designated YumeShelf-specific guidelines **before** beginning development.

| Task Category | Repository-Specific Files to Load & Read | Focus / Section |
| :--- | :--- | :--- |
| **🎨 UI / Renderer / Styling** | [yumeshelf-code-modularization.md](./local/yumeshelf-code-modularization.md) | Section 6: Container-level Componentization |
| **⚙️ Core Logic / Database / IPC** | [yumeshelf-code-modularization.md](./local/yumeshelf-code-modularization.md)<br>[yumeshelf-save-editor.md](./local/yumeshelf-save-editor.md) | Sections 2 & 3: Process Boundaries and Preload IPC<br>All Sections: Save Serialization & Alignment specifications |
| **🔧 Structural Refactoring / Migration** | [yumeshelf-code-modularization.md](./local/yumeshelf-code-modularization.md) | Full File: Structural Isolation & Decoupled Architecture |
| **📦 Production Build / Release Notes** | [yumeshelf-release-guide.md](./local/yumeshelf-release-guide.md)<br>[yumeshelf-release-notes.md](./local/yumeshelf-release-notes.md)<br>[yumeshelf-incremental-changelog.md](./local/yumeshelf-incremental-changelog.md) | Full File: Production compilation guides<br>Full File: Release announcement guidelines<br>Full File: Developer log writing rules |

---

## 📌 3. Core Operational Commandments

* **Commandment 1: English Only for Documentation**
  - Both your custom skills and all generated changelog entries or release notes **MUST** be written strictly in English.

* **Commandment 2: Zero Manual Release Note Cleaning**
  - Never manually clean up tag brackets or YAML frontmatter when preparing releases. Always run:
    ```bash
    npm run compile:release-notes
    ```
    This automated tool will clean and parse everything into a production-ready notes file under `local/changelogs/compiled.release-notes.<version>.md`.

* **Commandment 3: Self-Determine Active Versions**
  - Use Git tags (`git tag -n`) and `package.json` to verify the active working version. If `package.json` lags behind the target changelog version, automatically update the `"version"` field in `package.json` to match immediately.

* **Commandment 4: Avoid Build File Locks**
  - Ensure all running dev instances (started via `npm start`) are completely closed before calling the production compilation command (`npm run build`).

* **Commandment 5: The Boy Scout Rule (TypeScript Migration)**
  - The codebase is currently running with `// @ts-nocheck` on many `.ts` files to silence compiler errors from the initial JavaScript to TypeScript migration.
  - Whenever you open an existing file to modify a feature or fix a bug, you **MUST** remove the `// @ts-nocheck` pragma at the top of the file, fix all resulting TypeScript compilation errors, and ensure strong typings are applied to that file before completing your task.

---

Let's build a beautiful, bulletproof application together! 🚀
