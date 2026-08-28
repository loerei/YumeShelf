# YumeShelf Repository Guidelines

> [!IMPORTANT]
> Global Policies apply to this repository by default. This file contains repository-specific rules for YumeShelf.

## GitHub CLI & Authentication

- **Dummy Token Bypass**: The agent sandbox environment automatically injects a dummy `GITHUB_TOKEN=github_pat_antigravitydummytoken` by default. This will cause all `gh` CLI commands to fail with `401 Unauthorized (Bad credentials)`.
- **Action**: Whenever running `gh` commands, you **MUST** temporarily clear the `GITHUB_TOKEN` environment variable so that the CLI correctly falls back to the user's valid authenticated system keyring (e.g., run `cmd.exe /c "set GITHUB_TOKEN=& gh <command>"` or `$env:GITHUB_TOKEN=$null; gh <command>` in PowerShell).

## Changelogs & Releases

- **Single Source of Truth**: Document all codebase changes incrementally in English inside `CHANGELOG.md` at the repository root under `## [<version>] - working`. Do not create temporary version changelog files inside `docs/changelogs/`.
- **One-Click Release Pipeline**: Use the local skill `.agents/skills/yumeshelf-release/SKILL.md` or execute `npm run release <version>` to trigger the unified release pipeline. The orchestrator script automatically handles release notes compilation, metadata sync, offline NSIS packaging, asset verification, git commit/tag/push, and GitHub Release publication.

## Architectural Boundaries & Engine Core (@yumeshelf/engine)

- **Headless Single Source of Truth**: All game engine inspection (PE binary headers, section mapping, import tables, declarative engine rules), save folder resolution (deterministic paths, Wine/Proton prefixes, heuristic scans), and save codecs (decoding, encoding, ciphers/crypto, sandboxed deserialization) **MUST** reside strictly inside `packages/yume-engine/`.
- **Zero Calculation in App Main Process (`src/main/`)**: Modules in `src/main/` (e.g. `save-folder-resolver`, `save-editor`, `translation`) must remain lightweight consumer/orchestration adapters. Never implement low-level binary parsing, bespoke cipher/encryption loops, or standalone heuristic scanners directly in `src/main/`. Always implement engine capabilities in `@yumeshelf/engine` and expose them cleanly through the `YumeEngine` facade.

