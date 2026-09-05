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

## MultiOS Architecture & Cross-Platform Standards

YumeShelf supports Windows, Linux, and macOS (defined in `docs/specs/02-codebase-readiness-multios/PRD.md`). All code and bug fixes **MUST** adhere to MultiOS standards:

- **Zero Hardcoded Path Assumptions**:
  - Never assume Windows backslashes (`\`), drive letters (`C:`), or call `path.win32.*` directly on generic paths. On POSIX platforms (Linux/macOS), `\` is a valid filename character, not a directory separator. Using `path.win32.normalize` on POSIX paths corrupts them and causes `fs.stat` to fail with `ENOENT`. Always use cross-platform normalization (`path.normalize` or platform-aware utilities like `normalizeExecutablePath`).
  - Always handle both CRLF (`\r\n`) and LF (`\n`) when parsing text files, engine configs (e.g. `app.info`), manifests, or logs.
- **Abstract Platform Environments Behind Deep Seams**:
  - Never access `%APPDATA%`, `~/Library`, or XDG paths directly in business logic. Always route directory queries through `IEnvironmentPaths` or `FileSystemProvider`.
  - Platform-specific capabilities (e.g. NSIS vs. DMG auto-updaters, Win32 vs. Linux `/proc` vs. macOS `libproc` process trees) must be isolated behind polymorphic strategy interfaces (`AppUpdaterStrategy`, native conditional compilation `#[cfg(target_os = "...")]`), providing defensive fallback stubs for unsupported targets.
- **Cross-Platform Executable Recognition & Bundles**:
  - Never assume an executable is a single file ending with `.exe`. Support Windows (`.exe`), Linux (ELF binaries, `.sh`, `.appimage`), and macOS (`.app` bundles, standalone Mach-O).
  - macOS `.app` bundles are directories treated as atomic leaves. Scanners must intercept `.app` directories before recursive traversal and resolve internal binary paths (`Contents/MacOS/...`) via `AppBundleInspector`.
  - Use `pickPreferredExecutable` tiered priority ranking instead of hardcoded extension checks.
- **100% In-Memory Virtual Testability**:
  - All platform-dependent logic must accept injectable target platform parameters (`targetPlatform?: NodeJS.Platform = process.platform`) and filesystem providers (`IFileSystem` / `MockFileSystemProvider`).
  - Cross-platform behavior must be fully testable in-memory on any host OS in CI (`Test (ubuntu-latest)`, `Test (windows-latest)`) without requiring a live instance of each target OS or leaking host filesystem I/O.

