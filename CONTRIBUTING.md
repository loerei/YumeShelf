# Contributing to YumeShelf

First off, thank you for your interest in contributing to YumeShelf! We appreciate your help in making this a better application for game launchers and save game editing.

Please review this document to understand our workflow, branch structure, and code standards before submitting your pull request.

---

## 1. Branching Strategy (GitHub Flow)

We follow a clean **GitHub Flow** branching model with only one long-lived branch:

* **`main`**: The absolute source of truth. Always compilable and containing the latest production-ready features.
* **Short-lived Feature Branches**: All development (features, bugfixes, refactoring, documentation) must be done in short-lived branches branched off `main`.
  * **Naming convention**: `feat/your-feature-name`, `fix/bug-description`, `docs/update-readme`.
  * Once your Pull Request is merged into `main`, the branch will be deleted automatically.

---

## 2. Setting Up Your Environment Locally

Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

```bash
# Clone the repository
git clone https://github.com/loerei/YumeShelf.git
cd YumeShelf

# Install dependencies
npm install

# Start the application in development mode
npm run dev
```

---

## 3. Strict Coding Standards

All contributions, particularly in the **Main Process** (`src/main`), must align with our modernization guidelines:

### A. Strict TypeScript Compliance
* The compiler is configured with `"strict": true`. Do **not** use `// @ts-nocheck` or `// @ts-ignore` to suppress compilation errors.
* Avoid `any` types wherever possible. Declare precise type interfaces for configurations, options, and callbacks (e.g. `TranslationJob`, `StartupServicesOptions`).

### B. Standard ES Modules (ESM)
* Use standard ESM imports and exports (`import` / `export`) instead of CommonJS (`require` / `module.exports`).
* Do **not** use dynamic `require()` in runtime loops. Use static `import` at the top of the file to allow reliable tree-shaking and static type checks.

### C. Surgical Edits & Code Style
* Match the existing codebase style and formatting.
* Keep your changes focused. Do not combine unrelated refactorings or stylistic tweaks into a single functional pull request.

---

## 4. Verification Checklists

Before pushing your changes and submitting a Pull Request, you **must** verify the compilation locally.

```bash
# Run TypeScript compilation check for the Main Process
npm run build:main
```

Ensure this command exits with **`0` errors**. Pull Requests with compilation or type errors will not be merged.

---

## 5. Pull Request Guidelines

* **Focused Scope**: Keep PRs small and focused on a single issue or feature.
* **Commit Messages**: Use clean, descriptive commit messages (e.g., `feat: add unity save folder auto-detection` or `fix: handle local translation proxy server port binding crash`).
* **Self-Review**: Review your own diff before submitting the PR to ensure no accidental debug logs, comments, or orphaned imports are present.

Thank you again for contributing to YumeShelf!
