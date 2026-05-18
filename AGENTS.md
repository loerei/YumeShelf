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

---

## 📌 2. Core Operational Commandments

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

---

Let's build a beautiful, bulletproof application together! 🚀
