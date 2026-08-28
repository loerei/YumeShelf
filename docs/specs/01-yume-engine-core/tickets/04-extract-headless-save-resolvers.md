# 04 — Extract Headless Save Resolvers into YumeEngine

## Epic
Epic 01: YumeEngine Core Extraction & 100% F95zone PE Binary Inspector

## What to build
Extract save directory resolution logic into `YumeEngine.resolveSaveDirectory()` using the abstract `IEnvironmentPaths` interface, fully decoupling save folder discovery from Electron runtime environment.

## Blocked by
- 03.2.3 — Declarative Engine Rule Registry (Classic Japanese Visual Novel Engines)

## Status
closed

## Acceptance criteria
- [x] Route all OS environment path lookups (`%APPDATA%`, `%LOCALAPPDATA%`, `Saved Games`, `Documents`, Wine prefix roots, XDG data directories) through abstract `IEnvironmentPaths` methods (`getAppDataPath()`, `getLocalAppDataPath()`, `getUserProfilePath()`, `getDocumentsPath()`, `getSavedGamesPath()`, `getWinePrefixRoots()`, `getWineAppDataPaths()`, `getXdgDataHome()`, `getXdgConfigHome()`).
- [x] Implement mock path configurations in `MockFileSystemProvider` for deterministic, cross-platform CI testing without touching `process.env`.
- [x] Move and refactor deterministic save resolvers into `YumeEngine.resolveSaveDirectory(profile, exePath, fs: FileSystemProvider)` returning structured `ResolvedSaveLocation` (`path`, `confidence`, `source`, `matchedStrategy`, `files`).
- [x] Execute automated unit tests via `pnpm --filter @yumeshelf/engine test` verifying 100% passing tests and zero regressions across save folder discovery.
