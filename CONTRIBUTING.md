# Contributing to YumeShelf

Hi. If you want to help make YumeShelf better, contributions are very welcome.

If you want to work together, request a feature, or discuss something directly with me, feel free to DM me on Discord at https://discord.com/users/1440660675314585732.

You do not need to follow a 10-step corporate process here. Just keep things simple and follow the practical rules below.

---

## Opening Pull Requests

- **Small fixes and bugs**: you do not need to open an issue first or ask for permission. If you spotted a bug, a broken path, or a typo, just fix it and open a PR.
- **Big features or architectural changes**: please open an issue, start a discussion, or ping me first. That way we can talk through whether it fits where the app is heading before you spend an entire weekend writing code.
- **Keep PRs small**: smaller PRs that touch one specific thing get reviewed and merged quickly. Massive PRs that rewrite half the codebase usually sit around forever because they are painful to review.

---

## Getting Started

1. **Clone the repo**:
   ```bash
   git clone https://github.com/loerei/YumeShelf.git
   cd YumeShelf
   ```

2. **Install dependencies**:
   We use `pnpm` for package management:
   ```bash
   pnpm install
   ```

3. **Run dev mode**:
   ```bash
   npm start
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

---

## Architectural Rules (The Important Stuff)

A few things will get your PR blocked if ignored:

1. **No hardcoded Windows paths (MultiOS)**:
   YumeShelf runs on Windows, Linux, and macOS. Never hardcode backslashes (`\`), drive letters (`C:`), or use `path.win32` on generic paths. Always use `path.normalize` or cross-platform utilities. (I mostly test on Windows because I do not have spare Mac hardware lying around, so Linux and Mac testing help is always appreciated).

2. **Game engine and save logic belongs in `@yumeshelf/engine`**:
   All low-level binary inspection, save folder discovery, and save file decoders/encoders live inside `packages/yume-engine/`.
   The main process (`src/main/`) is just an orchestration layer. Do not put raw PE binary parsers or custom crypto loops directly in `src/main/`. Put them in `packages/yume-engine/` and expose them through `YumeEngine`.

3. **Frontend is vanilla TypeScript**:
   The UI is built with plain TypeScript and standard DOM manipulation, bundled via Vite. There is no React here. Please keep components straightforward and do not try to introduce heavy frontend frameworks.

---

## Commit Messages

We use Conventional Commits so the release script can automatically generate changelogs and release notes without manual copy-pasting:

- `feat(scope): short description` for new features
- `fix(scope): short description` for bug fixes
- `docs(scope): short description` for documentation
- `refactor(scope): short description` for code cleanup
- `test(scope): short description` for tests

Examples:
- `fix(library-state): prevent empty config wipe on degraded read`
- `feat(save-editor): add renpy protocol 5 decoder`

---

## Before You Push

Run the test suite locally:

```bash
npm test
```

If the TypeScript build passes and all tests are green, your PR should sail through GitHub Actions CI and SonarCloud without issues.
