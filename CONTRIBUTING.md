# Contributing to YumeShelf

First off, thank you for your interest in contributing to YumeShelf! We appreciate your help in making this a premium game launcher and local save game editor.

Please review this document to understand our workflow, branch structure, and strict code quality standards before submitting your pull request.

---

## 1. Branching Strategy & Issue Linking (GitHub Flow)

We follow a clean **GitHub Flow** branching model with only one long-lived branch:

* **`main`**: The absolute source of truth. Always compilable and containing the latest production-ready features.
* **Short-lived Feature Branches**: All development (features, bugfixes, refactoring, documentation) must be done in short-lived branches branched off `main`.
  * **Naming convention**: `feat/your-feature-name`, `fix/bug-description`, `docs/update-readme`.
  * Once your Pull Request is merged into `main`, the branch will be deleted automatically.

> [!IMPORTANT]
> **Mandatory Issue Linking:** Every Pull Request **must** be linked to an existing, pre-approved GitHub Issue. In your PR description, please use GitHub keywords to close the corresponding issue (e.g., `Closes #123` or `Fixes #45`). Unlinked Pull Requests will not be reviewed.

---

## 2. Commit Message Convention

To automate changelog generation and keep history structured, we strictly enforce **Conventional Commits** formatting. All commit messages must follow the format:

`<type>(<scope>): <short description>`

### Acceptable Types:
* **`feat`**: A new feature (e.g., `feat(save-editor): add support for unity mono binary saves`).
* **`fix`**: A bug fix (e.g., `fix(translation): resolve github api authentication crash`).
* **`docs`**: Documentation changes only (e.g., `docs(contributing): update quality gate requirements`).
* **`style`**: Changes that do not affect the meaning of the code (formatting, white-space, semi-colons, etc.).
* **`refactor`**: A code change that neither fixes a bug nor adds a feature.
* **`perf`**: A code change that improves performance.
* **`test`**: Adding missing tests or correcting existing tests.
* **`chore`**: Updates to build tasks, package manager configs, etc.

---

## 3. Strict Coding Standards

### A. Main Process (TypeScript & ESM)
* The compiler is configured with `"strict": true`. Do **not** use `// @ts-nocheck` or `// @ts-ignore` to suppress compilation errors.
* Avoid `any` types. Declare precise type interfaces for configurations, options, and callbacks.
* Use standard ESM imports and exports (`import` / `export`) instead of CommonJS (`require`).

### B. Renderer Process (React, Vite & Premium CSS)
YumeShelf is committed to visual and aesthetic excellence. When contributing to the Renderer:
* **Premium Styling (CSS)**: Use vanilla CSS for maximum control. Avoid generic, plain colors. Always prioritize vibrant, curated, harmonious palettes (e.g. HSL tailored colors) and modern typography (Google Fonts like Outfit, Inter) rather than browser defaults.
* **Dynamic Aesthetics**: Leverage smooth CSS transitions, interactive hover effects, and subtle micro-animations to make the interface feel responsive and alive.
* **Modular React**: Keep React components small, focused, and highly reusable.
* **TypeScript Support**: Strictly type all React props and state variables.

---

## 4. Code Quality Gates (CI/CD)

Before committing and submitting your PR, your changes must pass our local quality gates:

### 1. Code Formatting (Prettier)
All code must be formatted using Prettier. You can format the entire project by running:
```bash
npm run format
```

### 2. Code Linting (ESLint)
Ensure there are no linting warnings or errors:
```bash
npm run lint
```

### 3. Static Type Verification
The Main process must compile cleanly with strict flags:
```bash
npm run build:main
```

### 4. Static Code Analysis (SonarQube Gate)
Similar to our core tools, pull requests are subjected to a automated Quality Gate. Contributions must maintain:
* **0 Critical Code Smells** and **0 Security Hotspots**.
* **Type Coverage**: No regression in type coverage (strict typing must be maintained).
* **Test Coverage**: Any new core business logic should be accompanied by appropriate tests.

Thank you again for helping to build a premium experience for YumeShelf!
