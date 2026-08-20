# Changelog

All notable changes to YumeShelf are documented here. Entries are written incrementally by agents and compiled for public releases using `npm run compile:release-notes`.

---

## [1.6.0] - 2026-08-20 — released

### 🔧 Fixes & Improvements

- [i18n] Updated and completed Japanese (`ja.json`), Simplified Chinese (`zh.json`), and Vietnamese (`vi.json`) language packs to achieve 100% key parity with the master English dictionary.
- [i18n] Standardized localized application brand names in Japanese (`ユメシェルフ`) and Simplified Chinese (`梦之架`), eliminating lingering Latin references in UI text and documentation (`README.md`).
- [i18n] Synchronized Vietnamese language pack version to `1.0.2` and updated manifest SHA256 checksums.
- [title-pipeline] Introduced modular `TitleCleaningPipeline` decomposing monolithic folder sanitization into isolated single-responsibility rules (`ProductCodeRule`, `LanguageTagRule`, `VersionTagRule`, `DistributionSourceRule`).
- [title-resolver] Introduced deep `TitleResolutionEngine` implementing a multi-tier title ingestion architecture: Tier 1 (Engine Manifests like RPG Maker `data/System.json` & `package.json`), Tier 2 (Unity `*_Data/app.info` manifests), Tier 3 (Cleaned executable stem extraction), and Tier 4 (Cleaned folder pipeline fallback).
- [title-resolver] Replaced brittle wrapper directory heuristics with a dynamic execution-anchored directory explorer (`directory-explorer.ts`), climbing upward ancestor chains from the binary to the package root and exploring nested structures dynamically.
- [title-resolver] Added Language-Aware Cascade matching the user's active YumeShelf locale (`vi` -> `en` -> default native title), automatically prioritizing official translated titles over messy uploader directory names.
- [title-resolver] Added generic engine name rejection blocklist (`"Game"`, `"nwjs"`, `"Unity Player"`), preventing identical generic titles from polluting library cards.
- [settings] Added Title Display Mode dropdown (`title-display-select`) in Preferences with full multilingual localization (EN, JA, ZH, VI), allowing users to choose between `Game Title (Default)` and `Folder Name (Legacy)`.
- [settings] Added Display Product Codes toggle (`display-codes-select`) in Preferences (default: Off), giving users the choice to hide or show DLsite/DMM product code tags (`[RJxxxxxx]`) in library titles.
- [settings] Standardized Preferences dropdown and stepper dimensions into a reusable common CSS control rule, preventing layout shifts and misalignment.
- [title-resolver] **Notice on Custom Game Names**: With the transition to dynamic title resolution, legacy database records are now refreshed to reflect official metadata titles. If you manually renamed games in previous versions, these names might have been munched by Yume-chan (we sincerely apologize for this one-time inconvenience!). Moving forward, all manual renames via the Rename action are explicitly flagged and permanently preserved.
- [icon-pipeline] Refactored local game image discovery into a centralized helper `findLocalGameImage` and normalized symmetries across IPC `get-game-icon` and `game-icon://` custom protocol handlers.
- [icon-pipeline] Added support for nested subfolder icon discovery (`icon/icon.*`, `icon/cover.*`, `www/icon/icon.*`), enabling games built with NW.js / RPG Maker MV & MZ to automatically resolve their custom game icons directly in Branch A (`local-image`).
- [ipc] Restored missing startup and app lifecycle IPC handlers (`bootstrap-app`, `get-language-state`, `open-external-url`, `log-app-update-debug`, and update download/install handlers) in `AppIpcController`.
- [lifecycle] Reordered `startMainRuntime` sequence to register all IPC handlers before initializing the main BrowserWindow, eliminating startup race conditions.

### 🛠️ For the Nerds

- [devutil] Added official developer utility suite under `.devutil/` (`simulate-icon-pipeline.cjs`, `inspect-exe-icon.cjs`, `inspect-engine-icon.cjs`, and `README.md`) for end-to-end icon pipeline simulation, PE binary icon frame matrix inspection, and game engine asset discovery.
- [core-adapters] Added zero-dependency cross-platform ZIP archive extractor (`src/main/core/zip-extractor.ts`) with End of Central Directory (EOCD) parsing and built-in Zip Slip path traversal security defenses (#42).
- [core-adapters] Added platform-adaptive filesystem helper (`src/main/core/filesystem-adapter.ts`) supporting NTFS junctions on Windows and POSIX directory symlinks on Linux/macOS with idempotent link recreation (#42).
- [playtime-helper] Adapted Rust `playtime-helper` for cross-platform compilation (ELF on Linux, `.exe` on Windows) with conditional `windows-sys` dependency scoping (#44).
- [playtime-helper] Implemented pure `/proc/[pid]/stat` process line parser and `/proc` process tree polling on Linux to track game lifecycles across forks and runners without Win32 Job Objects (#44).
- [playtime-helper] Made `playtime-helper-paths.ts` and `ensure-playtime-helper.js` platform-adaptive with `getHelperExeName` and dependency injection for cross-platform testing (#44).
- [scanner] Implemented cross-platform executable discovery (`src/main/library-state/scanner.ts`) recognizing Linux native binaries (`.x86_64`, `.x86`, `.AppImage`, `.sh`, and POSIX executable mode) alongside Windows `.exe` files (#43).
- [scanner] Implemented 5-tier composite prioritization in `pickPreferredExecutable` that dynamically prioritizes host-native binaries on Linux and Windows while maintaining seamless cross-platform fallbacks (#43).
- [scanner] Expanded wrapper directory promotion for Linux package layouts (`linux/`, `linux64/`, `x86_64/`) and preserved `platform` metadata across promotion and loader cycles (#43).
- [continuity] Updated `getExecutableStem` in `continuity.ts` and `game-annotations.ts` to strip Linux extensions, ensuring stable continuity signatures across platforms and moves (#43).
- [title-resolver] Added generic Linux script and binary names (`game.x86_64`, `start.sh`, `run.sh`, `launch.sh`, `apprun`) to `GENERIC_TITLE_BLOCKLIST` (#43).
- [translation] Refactored `TranslationService` to use native Node.js archive extraction and cross-platform directory symlinks, removing `powershell.exe` shell execution and hardcoded NTFS junction dependencies (#42).
- [packaging] Configured Electron-builder Linux targets (`AppImage` and `tar.gz`) with icon, category, and platform-specific `extraResources` for `playtime-helper` (#48).
- [release] Extended release orchestration and build artifact management (`release.js`, `organize-build-output.js`, `release-artifacts.js`, `write-release-checksum.js`) to categorize Linux assets into `build_output/linux/{application,feed,sha256}/`, compute multi-binary SHA-256 checksums, and publish unified GitHub Releases (#48).
- [game-runner] Added Game Runner architecture (`src/main/game-runner/`) with runner auto-detection (`detector.ts`) for System Wine (`wine`/`wine64`), Steam Proton (compatibility tools & SteamApps common paths), UMU Launcher (`umu-run`), and Bottles/Lutris environments (#47).
- [game-runner] Implemented game launch resolver (`resolver.ts`) with automated execution permission enforcement (`chmod +x` / `0o755`) for native Linux binaries and scripts, and environment synthesis (`WINEPREFIX`, `STEAM_COMPAT_DATA_PATH`, `STEAM_COMPAT_CLIENT_INSTALL_PATH`) (#47).
- [playtime-helper] Extended `SessionJournal` schema and Rust helper `launch_game_process` to spawn games via configured compatibility runners while monitoring their entire `/proc` process trees (#47).
- [icon-pipeline] Implemented pure TypeScript Portable Executable (PE32 / PE32+) resource decoder (`src/main/icon-pipeline/pe-resource-decoder.ts`) to parse `.rsrc` structures, extract 256px PNG / synthesized ICO frames, and read `VS_VERSIONINFO` metadata directly from Windows `.exe` files on Linux and Windows without Win32 native addon dependencies (#46).
- [icon-pipeline] Added Linux Desktop Entry asset resolver (`src/main/icon-pipeline/desktop-entry.ts`) to extract and resolve `Icon=` references from `.desktop` files in game folders and standard XDG icon theme directories (#46).
- [icon-pipeline] Established unified 4-stage icon resolution cascade (Local assets & `.desktop` -> Cache -> Pure TS PE `.rsrc` decoder -> Platform fallback) with dynamic MIME type dispatching and strict non-Windows guards on `extract-file-icon` (#46).
- [save-resolver] Expanded `SaveFolderResolver` and `FileSystemProvider` to support Linux XDG directories (`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `~/.renpy`) and multi-source Wine/Proton prefix AppData paths with dynamic user traversal (#45).
- [save-resolver] Added cross-platform save discovery for Ren'Py, Unity, Unreal, and Godot engines across Linux native and Wine/Proton prefix environments (#45).
- [save-editor] Adapted `unity-mono-bin.ts` to locate and execute self-contained native `ModernSaveConverter` binaries, refactored subprocess invocations to `execFileSync` with explicit argument arrays, and added platform-adaptive Python dispatcher (`python3`/`python`) with `app.asar.unpacked` path resolution (#45).
- [save-resolver] Consolidated engine detection, deterministic path discovery, and heuristic fallback scanning behind a unified `SaveFolderResolver` deep module class.
- [save-resolver] Added `FileSystemProvider` interface (`DefaultFileSystemProvider` and `MockFileSystemProvider`) enabling virtual filesystem unit testing without real OS path dependencies.
- [save-resolver] Standardized return DTO `ResolvedSaveDirectory` with `path`, `engine`, `confidence`, and `source` fields while preserving backward-compatible `resolveSaveFolder` export.
- [save-resolver] Added engine detection and path resolution rules for Godot Engine (`.pck`, `project.godot`) and TyranoBuilder (`tyrano/`, `tyrano/savedata`).
- [save-resolver] Added comprehensive vitest suite (`save-folder-resolver.test.ts`) covering all engine resolvers and fallbacks.

---

## [1.5.12] - 2026-07-26 — released

### 🔧 Fixes & Improvements

- [save-editor] Fixed `.rmmzsave` RPG Maker MZ save file encoding format by converting compressed binary zlib streams to UTF-8 character string representation expected by RPG Maker MZ's `StorageManager` (`pako.inflate`).
- [save-editor] Automatically strip internal UI metadata (`_userMappings`) prior to encoding `.rmmzsave` files to prevent save file corruption and pollution.

---

## [1.5.11] - 2026-07-22 — released

### ✨ What's New

- Added a floating glassmorphism toast pill feedback notification ("Launching {game_name}...") when launching a game, featuring smooth slide-up and fade transitions.

### 🔧 What Changed

- Fixed Unity Mono binary save file editing inside packaged app.asar production builds by unpacking `ModernSaveConverter.dll` from the ASAR archive.
- Added support for detecting RPG Developer Bakin games, preventing false-positive Unity save folder matching and crashes on Bakin save files.
- Added `https://translate.googleapis.com` to renderer Content Security Policy (`connect-src`), restoring Save Editor translation feature.
- Added localization strings for game launching feedback in English, Vietnamese, Japanese, and Chinese.

### 🛠️ For the Nerds

- [ui] Implemented `ToastPillController` in `src/renderer/ui/toast-pill.ts` and `src/styles/toast-pill.css` with auto-dismiss timers and glassmorphic styling.
- [renderer] Integrated `showToastPill` in `onGameLaunched` callback in `src/renderer/bootstrap/app-composition.ts` and `src/renderer/game-cards.ts`.
- [save-editor] Added `"dist/main/save-editor/bin/**/*"` to `asarUnpack` configuration in `package.json` to extract `ModernSaveConverter` dependencies from the ASAR archive.
- [save-editor] Updated `UnityMonoBinFormat` in `src/main/save-editor/formats/unity-mono-bin.ts` to automatically resolve `ModernSaveConverter.dll` paths under the `app.asar.unpacked` folder in packaged builds.
- [save-resolver] Added `bakin` engine type, detection logic (based on `bakinengine.dll` and `data.rbpack`), and direct save folder resolving to `data/savedata`.
- [save-editor] Implemented `BakinSgsFormat` to list `.sgs` save files and gracefully report them as unsupported for editing in the save editor UI.
- [renderer] Restored `logicalGame` domain instance reference in `src/renderer/library-stacks.ts` to preserve `favorite` state metadata.
- [security] Updated `connect-src` in `src/main/window/main-window.ts` to permit outbound requests to Google Translate API.
- [quality] Achieved **0 open issues** on SonarCloud code quality analysis across main and renderer processes (optional chaining, nullish coalescing, regex backtracking optimizations, `String.raw`, `codePointAt`, and dead store cleanups).


## [1.5.10] - 2026-06-01 — released

### 🔧 What Changed

- Deprioritized common utility and setup executables (`config.exe`, `setup.exe`, `setting.exe`, `settings.exe`, `configure.exe`) during library scans so they are not selected as the primary game launcher if another executable is present.

### 🛠️ For the Nerds

- [library-state] Introduced a soft-filter (deprioritization) in `pickPreferredExecutable` that filters out utility executable entries before selecting candidates, falling back to them only if they are the only executables present in the directory.
- [library-state] Added integration tests in `tests/library-state.test.js` to assert proper library scanning and executable selection when both `Config.exe` and a custom game executable coexist.

## [1.5.9] - 2026-06-01 — released

### ✨ What's New

- Added support for configuring **multiple game library paths**, enabling users to organize and scan games across different hard drives, partitions, or directories.
- Redesigned the "Library Path" setting UI into a dynamic, highly interactive list of configured folders. Each path is presented as a clickable link that opens the folder directly in File Explorer.
- Implemented robust directory path manipulation directly from the settings panel including **+ Add Path**, replace (**Change**), and delete (**Remove**) controls.

### 🔧 What Changed

- Fixed game icon extraction inside packaged production builds, enabling high-resolution 256x256 game icon recovery on client machines.
- Fixed translation engine support detection on startup to prevent Renderer uncaught promise errors.

### 🛠️ For the Nerds

- [library-state] Upgraded `LibraryConfig` interface to store `libraryPaths: string[]` with seamless migration path from legacy `libraryPath: string`.
- [library-state] Implemented atomic database mutation operations `addLibraryPath`, `removeLibraryPath`, and `changeLibraryPath` with path collision deduplication.
- [library-state] Restructured scanning engine `loader.ts` to iterate through all active library paths and safely aggregate candidates before executing unique path deduplication.
- [security] Updated IPC boundary validators (`isPathWithinLibrary`) to dynamically check boundaries against the complete array of allowed library paths.
- [renderer] Safely migrated Renderer bootstrap and event lifecycle controllers to drop legacy `btnChangePath` DOM references.
- [antigravity-icon-pipeline] Fallback to `process.execPath` (Electron) as Node interpreter using `ELECTRON_RUN_AS_NODE: '1'` for spawning the background extraction worker when a global Node environment is absent.
- [antigravity-icon-pipeline] Added `"asarUnpack"` entry in `package.json` for `extract-file-icon` dependency to unpack compiled native addon binary from the ASAR archive, ensuring seamless require calls inside Electron-as-Node environment.
- [antigravity-translation-pipeline] Implemented missing `detectEngineSupport` method in `TranslationService` to resolve `TypeError: translationService.detectEngineSupport is not a function` when invoking `translation:check-support`.

---

## [1.5.8] - 2026-05-27

### 🛠️ For the Nerds

- [security] Hardened the Electron main process by registering a restrictive session-level Content Security Policy (CSP) to neutralize dynamic XSS-based scripts, stylesheets, and image assets.
- [security] Implemented a strict path validation helper (`isPathWithinLibrary`) for Electron IPC channels (`reveal-game`, `open-path`, `delete-game`) to prevent directory traversal and unauthorized filesystem actions.
- [security] Hardened Save Editor data services by sanitizing dynamic `fileName` inputs via `path.basename` and validating path boundaries against target directory paths.
- [security] Neutralized dynamic HTML rendering entry points by replacing raw `innerHTML` writes with programmatic DOM APIs (`document.createElement`) or HTML escaping across settings components, language pack lists, and Save Editor sidebar templates.
- [security] Redacted raw game encryption keys from developer logging outputs, logging only the length of detected keys.
- [security] Stripped hardcoded developer environment client tokens from the telemetry shipper pipeline, implementing a graceful skip when configuration tokens are omitted.
- [performance] Debounced telemetry disk queue writes to a maximum frequency of once every 5 seconds to prevent filesystem write bottlenecks under rapid execution trace capturing.
- [modularization] Resolved cyclomatic complexity and nesting hotspots across five main components, bringing each god-function down to 1:
  - Modularized `setupUpdateFlow` (nsis-updater, was 142 CC) into `check.ts`, `download.ts` (with parallel segment chunk streams), and `install.ts` with strict SHA-512 checks.
  - Modularized `setupGridRenderer` (save-editor, was 243 CC) into `tabs.ts` and `content.ts` using a shared context binder.
  - Modularized `createUITextController` (renderer ui-text, was 95 CC) into separate sectional applier helpers.
  - Modularized `createLibraryState` (main library-state, was 87 CC) into `config.ts`, `loader.ts`, and `actions.ts`.
  - Modularized `createAppUpdateServices` (main app-updates, was 82 CC) into helper, checker, and downloader submodules.

---

## [1.5.7] - 2026-05-26

> **Manual Update Required for v1.5.6 Users**
> A bug in the YumeShelf v1.5.6 updater UI prevents the in-app update progress from rendering, which can cause the app to appear stuck or unresponsive when updating. If your in-app updater does not automatically trigger on restart, please manually download and run the v1.5.7 setup from the Releases Page.

### ✨ What's New

- [translation-system] Added a new game translation extraction system with initial support for games running on the RPG Maker and Unity engines.

### 🔧 What Changed

- [save-editor-fixes] Fixed the standalone Save Editor window displaying a blank screen in development environments by correctly handling the Vite dev server URL.
- [save-editor-fixes] Added view state preservation when popping out the Save Editor into a separate window, allowing the new window to seamlessly retain your selected file, active tab, and search filters.
- [save-editor-fixes] Added a warning prompt when popping out the Save Editor if there are unsaved changes, preventing accidental data loss.
- [translation-system] Implemented a dictionary lock system to prevent concurrent translation processes from corrupting language dictionary files.

### 🛠️ For the Nerds

- [save-editor-fixes] Updated `src/main/ipc/register.ts` to conditionally use `loadURL` instead of `loadFile` when `VITE_DEV_SERVER_URL` is active.
- [save-editor-fixes] Refactored `src/renderer/save-editor-ui.ts` to serialize view state configurations to `localStorage` under a short-lived game-specific key before calling `openSaveEditorWindow`.
- [translation-system] Added modular base extractors (`src/main/translation/extractors/base.ts`) to easily extend translation support for new game engines in the future.
- [translation-system] Implemented `dictionary-lock.ts` to manage thread-safe reads and writes to language packs.

---

## [1.5.6] - 2026-05-20

### 🔧 What Changed

- **Infrastructure & Maintenance Update**: This release is a core infrastructure, optimization, and code-quality maintenance update. It focuses entirely on backend stability, code modularization, and build system modernization, with no new user-facing features or direct functionality changes.

### 🛠️ For the Nerds

- [dependency-analysis] Introduced a robust, AST-based codebase Dependency Graph Analyzer using Web Tree-sitter to parse CommonJS require calls and ESM import statements.
- [dependency-analysis] Implemented a CLI tool to support codebase dependency mapping, dynamic query checks, and DFS cycle detection.
- [dependency-analysis] Configured automated resolving logic to map relative import strings to absolute repository-relative references, classifying builtin modules and external NPM dependencies separately.
- [dependency-analysis] Implemented recursive, normalized circular dependency path detection to prevent memory leaks and initialization cycles across 119 codebase files.
- [typescript-migration] Initialized Phase 1 of TypeScript migration by configuring a mixed JS/TS environment via `tsconfig.json` (`allowJs: true`, `checkJs: false`).
- [typescript-migration] Added foundational IPC type definitions in `src/shared/types/ipc.d.ts` for safe `window.electronAPI` boundary typing.
- [typescript-migration] Installed core TypeScript dependencies (`typescript`, `esbuild`, `tsup`, `vite`) and added non-intrusive `typecheck` and `build:ts` scripts.
- [typescript-migration] Executed Phase 2: Enforced strict typing for the IPC bridge (`src/preload.ts`) utilizing the `ElectronAPI` interface, resolving all implicit `any` parameter types.
- [typescript-migration] Executed Phase 2: Typed the Save Editor service (`src/main/save-editor/index.js`) using JSDoc `@ts-check` to achieve full static analysis compliance.
- [typescript-migration] Executed Phase 2: Standardized all Save Editor format plugins (RPG Maker MZ/MV, WOLF RPG, Ren'Py, Pure JSON) to strictly conform to the `SaveFormat` interface via asynchronous `decode`/`encode` methods and uniform metadata structures, successfully passing `tsc --noEmit`.
- [typescript-migration] Executed Phase 3: Applied `@ts-check` and comprehensive JSDoc annotations to all Save Editor renderer modules: `components.js`, `translator.js`, `grid-renderer.js`, `data-engine.js`, `search-bar.js`, `sidebar.js`.
- [typescript-migration] Executed Phase 3: Annotated all five Save Editor engine strategy classes with full JSDoc signatures for `detect`, `extractRoot`, `getTabs`, `getProp`, `findGold`, and `extractData`, including internal helper methods.
- [typescript-migration] Resolved `TS2322`, `TS2774`, and `TS2345` type errors across `grid-renderer.js`.
- [typescript-migration] All Save Editor modules now pass `npm run typecheck` with zero errors; full static analysis coverage achieved across the renderer layer.
- [typescript-migration] Executed Phase 4: Successfully migrated the YumeShelf Renderer layer to a modern Vite-powered build pipeline, introducing zero-reload Hot Module Replacement (HMR) during UI development.
- [typescript-migration] Re-architected Electron Main process bootstrap to load Vite Dev Server conditionally via `VITE_DEV_SERVER_URL` in development, while reading `dist/renderer/index.html` in production.
- [typescript-migration] Overhauled `package.json` to leverage `concurrently` for parallelizing the Vite dev server alongside the Electron main process via `npm start`.

---

## [1.5.5] - 2026-05-20

### ✨ What's New

- [save-editor] Added full support for raw JSON save formats to enable seamless visual editing, state tracking, and configuration tweaking for games utilizing plain JSON serialization.
- [save-editor] Added global keyboard shortcuts in the Save Editor for fast filter toggling: 'E' to toggle 'Show Empty', 'I' to toggle 'Show Important', 'X' to toggle 'Exact Match', and 'Shift + Enter' to instantly commit and save changes.
- [save-editor] Added a "Pinned" feature in the Save Editor to allow users to quickly access specific cards and rows across all tabs. Users can click a star-toggle icon on any data row to pin/unpin it. A dynamic "Pinned" tab appears whenever there are pinned items.
- [i18n] Implemented localized "save_editor_pinned" strings in English, Japanese, and Chinese locales.

### 🔧 What Changed

- [settings] Resolved a critical UI bug where the Settings page erroneously displayed a stale application version instead of the authoritative active version by hardening the renderer process state synchronization.
- [save-editor] Implemented strict Test Contracts for all Save Editor format strategies under `src/main/save-editor/formats/` to enforce structure, cipher involution, checksum compliance, and API consistency.
- [save-editor] Registered the new `PureJsonFormat` strategy inside the main Save Editor orchestrator and the new `PureJsonEngine` strategy inside the renderer's DataEngine orchestrator.
- [save-editor] Implemented strict active element checks to prevent global keyboard shortcuts from interfering during text input.
- [save-editor] Enabled star icon hover, active gold glowing state, and layout adjustments for all data rows to accommodate the new pinning action.
- [save-editor] Configured the "All" tab to list the default category sections dynamically without duplicates, while keeping pinned variables, switches, items, and gold synchronized in both their original tab categories and the central Pinned hub tab.
- [tooling] Upgraded `docs/tools/generate-repo-map.js` from brittle Regex-based scans to high-fidelity AST-based parsing using `web-tree-sitter`.

### 🛠️ For the Nerds

- [save-editor] Implemented recursive deep object flattening, path traversal (`_getDeep`, `_setDeep`), and numeric type coercion within the `PureJsonEngine` renderer strategy.
- [i18n] Replaced vulnerable state mutation inside `src/renderer/i18n.js` with explicit version synchronization, guaranteeing `localeState.appVersion` is always retained from the main process's boot context.
- [tests] Created `tests/save-editor-contracts.test.js` validating standard Strategy interfaces and byte-level compression/cipher round-trips.
- [save-editor] Managed the pinned state globally using prefixed IDs and persisted state to localStorage under context-aware keys.
- [tooling] Pinned `web-tree-sitter` to version `0.20.8` and implemented custom tree traversal visitors for JavaScript function and method nodes.
- [tooling] Refactored `smart-patcher.js` and `generate-repo-map.js` into exportable modules consumed by `SOP/cli.js`.

---

## [1.5.4] - 2026-05-19

### 🔧 What Changed

- [auto-launch] Fixed a bug where the Auto-launch and Minimize to Tray settings rendered as "Off" by default in the UI on application start regardless of the actual configured values.
- [renderer] Resolved a critical startup crash (`TypeError: Cannot set properties of undefined`) by restoring missing root flat refs and resolving the unmapped `languagePackTitle` inside `language-packs.js` build factory.
- [save-editor] Replaced custom minimal lz-string library with the standard legacy 100% compatible LZString library to resolve .rpgsave value reverting data regression.
- [save-editor] Added a state-aware "unsaved changes" tracking mechanism and user-confirmation dialogs to prevent active edits from being clobbered by background library re-syncs.

### 🛠️ For the Nerds

- [code-modularization] Relocated root Main Process files to their respective subdirectories and refactored internal relative require paths.
- [auto-launch] Guarded `set-auto-launch` and `get-auto-launch` IPC handlers with `app.isPackaged` to prevent writing the development prebuilt `electron.exe` to the OS startup registry in development.
- [auto-launch] Added database synchronization of auto-launch and minimize-to-tray settings on startup.
- [auto-launch] Added comprehensive `tests/settings-sync.test.js` unit tests to verify database synchronization of auto-launch in both packaged and dev environments.
- [architecture] Completed Container-level Componentization refactor for the Renderer bootstrap layer. Controllers now receive a root `container` element and perform internal `querySelector` calls.
- [renderer] Restored `searchPlaceholder` back to the root returned object of `buildRendererRefs` inside `dom-refs.js`.
- [renderer] Mapped the missing `languagePackTitle` inside `buildLanguagePackRefs` in `language-packs.js`.
- [save-editor] Integrated standard legacy 16-bit word-aligned bitstream padding to prevent game engine decompression failures on edited save files.
- [tests] Added comprehensive save mutation validation suites to guarantee stable save editor round-trips.
