# Changelog

All notable changes to YumeShelf are documented here. Entries follow a two-tier structure: a quick summary for regular users, and technical details for developers.

---

## [2.0.5] - 2026-08-23 — released

### What Changed
- Ren'Py save editing works on modern Ren'Py 8 games now. Edited saves load cleanly in-game instead of crashing with missing argument or corrupted token errors.
- Grouped variable tabs (like character stats and relationship flags) and extra currency types (yen, coins, wallet) now show up properly in Ren'Py saves.
- GameMaker Studio games now automatically resolve their save folders in AppData instead of getting trapped by distributor shortcut folders.
- Portable Unity games (like Naninovel visual novels) and Godot / Ren'Py games with local save folders now detect their saves right inside the game directory.
- RPG Maker games using launcher wrappers now find their item, weapon, and armor database files properly.

### For the Nerds
- [save-editor] Implemented byte-level Surgical Stream Patcher in `renpy_save_converter.py` to mutate `store.*` variable slices directly in the raw pickle stream, preserving downstream Cython compiled classes (`StyleCore`, `Displayable`, `RollbackLog`) without full-graph re-serialization.
- [save-editor] Added Pickle Protocol 5 Frame Length Compensation to dynamically recalculate and patch 8-byte frame length headers when variable byte widths change, eliminating stream desynchronization and memo index errors.
- [save-editor] Added automated ECDSA NIST P-256 token re-signing over modified `log` payloads using SHA-1 digest and system token keys from `%APPDATA%\RenPy\tokens\security_keys.txt`.
- [save-editor] Fixed dynamic `prefix_*` proxy routing in `RenpyEngine` and broadened currency identifier detection.
- [save-resolver] Added GameMaker Studio engine detector (`data.win`, `options.ini`) and deterministic resolver mapping sanitized executable stems to `%LOCALAPPDATA%`.
- [save-resolver] Enhanced Unity resolver to inspect runtime data folders and portable `StreamingAssets/SaveData` (Naninovel) before falling back to `AppData\LocalLow`.
- [save-resolver] Added deterministic local portable save checks for Ren'Py (`game/saves`) and Godot (`save/`) before querying user AppData roots.
- [save-resolver] Added recursive search for Flash Player `.sol` objects under `%APPDATA%\Macromedia\Flash Player\#SharedObjects`.
- [save-editor] Dynamic `dataDir` resolution relative to resolved `saveDir` (`path.join(path.dirname(saveDir), 'data')`) and wrapper directories (`bin/www/data`) for RPG Maker MZ/MV games.
- [devutil] Added `.devutil/simulate-save-pipeline.cjs` and updated documentation in `.devutil/README.md` for end-to-end save path, format, and auxiliary metadata benchmarking.

---

## [2.0.4] - 2026-08-22 — released

### What Changed
- Fixed the "More languages..." button in settings doing nothing when clicked.
- Added proper Japanese, Chinese, and Vietnamese translations for the Hide and Seek options in settings, and cleaned up the redundant English labels.

### For the Nerds
- [settings] Fixed DOM query target for `#more-languages-btn` in `dom-refs.ts` to query `settingsContainer` instead of `languagePackContainer`, reconnecting the modal trigger and dynamic localization.
- [i18n] Localized Hide and Seek dropdown options across Japanese (うん / いやです), Chinese (好啊 / 不玩了), and Vietnamese (Chơi luôn / Thôu), and dropped redundant `(Hide And Seek?)` suffix.
- [ci] Migrated release workflow to `pnpm/action-setup@v4` with automated pnpm store caching on `actions/setup-node@v4` and `--frozen-lockfile` installs, speeding up dependency installation on GitHub Actions.

---

## [2.0.3] - 2026-08-22 — released

### What Changed
- Fixed the broken icons in the save editor.
- Fixed Hide and Seek keeping a fake disguise card in your library even after hiding Yume-chan, and fixed both the floating mascot and the card showing up at the same time when turning her back on.

### For the Nerds
- [save-editor] Fixed incomplete SVG paths and missing linecap/linejoin attributes in `createSVGIcon` across popout, reload, translate, and empty state controls.
- [hide-and-seek] Bound Hide and Seek activation directly to master `yumeshelf_mascot_show` setting, preventing orphan disguise cards and syncing floating widget visibility when toggling mascot visibility.

---

## [2.0.2] - 2026-08-22 — released

### What Changed
- Fixed a dumb bug where Yume-chan got pinned down in the bottom-right corner whenever an update popup showed up. You can drag and bonk her around freely now even with a notification on your screen.
- Moved the update notification popup back to where it used to be (with some breathing room from the screen edge).

### For the Nerds
- [mascot] Bumped Yume-chan widget z-index (1650) above update notifications so pointer events and dragging never get swallowed by active notification cards.
- [notifications] Reverted `.update-notification-host` offset to 28px bottom/right and removed bottom margins to match v1.6.0.

---

## [2.0.1] - 2026-08-22 — released

### What Changed
- Scanning messy folders (like your Downloads or Desktop) actually finds every game separately now instead of grouping them all into one giant weird entry.
- Fixed Wolf RPG save editing. It properly opens and saves files across any Wolf RPG game now, and doesn't freeze the app when opening saves with tens of thousands of variables.
- Better Linux gaming support (SteamOS, Bazzite). It detects Steam Proton, Bottles, and Lutris if you don't have Wine installed, and no longer crashes on startup.
- Fixed playtime tracking so games that fail to launch don't keep counting phantom hours.
- You can drag Yume-chan anywhere on your screen, and she might disguise herself as a game card in your library until you bonk her enough to go away.

### For the Nerds
- [scanner] Implemented unified sibling-disjointness resolution in `scanner.ts`. Container folders with multiple child games branch cleanly, while games with top-level launchers (like Bakin engine or Unreal Engine games) prioritize the game root launcher over internal runtime sub-binaries.
- [scanner] Filtered out helper and installer binaries (`prereq`, `redist`, `patcher`, `updater`, `createdump`, `gameupdate`) from candidate discovery.
- [save-editor] Fixed `sanitizeSaveData` in `SaveDataEngine` (`engine.ts`) to preserve format inspection tokens (`$type`), restoring Wolf RPG LCG-XOR save encoding and contract test coverage.
- [save-editor] Refactored `RpgWolfSavFormat` (`rpg-wolf-sav.ts`) from a static 800-variable heuristic into a generic dual-strategy deserializer: detects 401-byte segmented database table matrices anchored by `save/system.sav\0` as well as Tag 10 system variables (`aux_n14`) with dynamic lengths and full round-trip checksum recalculation.
- [save-editor] Added in-memory `metadataCache` with `mtime` validation to eliminate duplicate `SysDatabase.dat` parsing, and shifted fallback label formatting to on-demand rendering in `content.ts` to reduce IPC payload size by 99%.
- [deps] Added automated dynamic AST and transitive dependency tree crawler (`verify:deps`) to prevent missing runtime modules in production `.asar` bundles.
- [deps] Bundled missing runtime dependencies (`fs-extra`, `universalify`, `graceful-fs`, `jsonfile`, `sax`, `lazy-val`) for pnpm compatibility in Linux AppImage builds.
- [renderer] Fixed `ReferenceError: isEnabled is not defined` crash in `hide-and-seek.ts`.
- [game-runner] Added multi-source runner detection in `detector.ts` for Steam Proton (standard, Flatpak, GE-Proton), Bottles Flatpak (`~/.var/app/com.usebottles.bottles`), Lutris, Heroic, and UMU.
- [game-runner] Added automatic Proton fallback in `resolver.ts` when running Windows `.exe` games on immutable Linux systems without `/usr/bin/wine`.
- [playtime] Added stale session heartbeat expiry in `journal.ts` (`isActiveJournal`) to eliminate ghost playtime accumulation from aborted launches.
- [title-resolver] Added case-insensitive manifest exploration in `rpg-maker-resolver.ts` for Linux ext4/btrfs filesystems.
- [mascot] Added dragging physics so you can move Yume-chan around anywhere on your screen. Her position and total bonk count save to local storage, and her expression reacts while dragging.
- [mascot] Added the comic bonk particle with exponential decay, random rotation, and variable opacity.
- [mascot] Built a two-stage cooldown state machine for her recovery so spamming clicks extends the timer instead of breaking the animation.
- [hide-and-seek] Added the hide-and-seek minigame controller (`hide-and-seek.ts`). It injects a fake disguise card into your library grid with a random click threshold (5 to 10 bonks), then sends her back to the dock once she is chased away.
- [hide-and-seek] Quotes on the disguise card rotate smoothly every 10 seconds and pause immediately if you click her.
- [shuffle-bag] Added persistent Fisher-Yates shuffle bags (`getNextShuffledIndex`) for card titles and quotes. Works like a music playlist with shuffle and loop turned on so you never get duplicates until the full list is played through.
- [search] Wired mascot callbacks into the search bar (`search.ts`) so bonking her temporarily displays her quotes in the placeholder, then goes back to normal once she recovers.
- [context-menu] Added a right-click menu on the mascot for quick adjustments (reset position, sound pickers, volume, scale slider, and bonk counter).
- [i18n] Did a full cleanup across the codebase to pull all hardcoded UI strings, card actions, filters, and save editor labels into proper JSON language packs (EN, JA, ZH, VI).

---

## [2.0.0] - 2026-08-21 — released

### What Changed
- Added Yume-chan so I'm bumping this to 2.0.0 lololololololol
- You can bonk her, better don't take that for granted

### For the Nerds
- [mascot] Created `src/renderer/mascot-widget.ts` managing character states (`smug`, `bonked`, `bonkedTooMuch`), audio cancellation/restart logic, squash-and-stretch CSS animation, and real-time preloading.
- [styling] Added `src/styles/mascot.css` with responsive `clamp()` sizing, bottom-dock alignment, and CSS `--mascot-scale` control.
- [audio] Integrated bundled audio playback (`squeaker.mp3`, `metal-pipe.mp3`) with instant interruption on rapid clicks.
- [settings] Extended settings controller, DOM references, and event bindings to support mascot visibility, scaling, sound selection, and volume controls.
- [i18n] Localized all new mascot and bonk settings across English, Japanese (Katakana: ユメちゃん), and Simplified Chinese dictionaries.

---

## [1.6.0] - 2026-08-20

### What Changed
- Official Linux support. You can now launch and run games on Linux through Wine or Proton without manual setup.
- Better game titles. It now reads the official title from game files instead of showing messy uploader folder names.
- Save folder resolver works on Linux now too, including inside Wine and Proton prefixes.

### For the Nerds
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
- [title-resolver] Manual game renames are now explicitly flagged and permanently preserved across metadata rescans.
- [icon-pipeline] Refactored local game image discovery into a centralized helper `findLocalGameImage` and normalized symmetries across IPC `get-game-icon` and `game-icon://` custom protocol handlers.
- [icon-pipeline] Added support for nested subfolder icon discovery (`icon/icon.*`, `icon/cover.*`, `www/icon/icon.*`), enabling games built with NW.js / RPG Maker MV & MZ to automatically resolve custom icons in Branch A (`local-image`).
- [ipc] Restored missing startup and app lifecycle IPC handlers (`bootstrap-app`, `get-language-state`, `open-external-url`, `log-app-update-debug`, and update download/install handlers) in `AppIpcController`.
- [lifecycle] Reordered `startMainRuntime` sequence to register all IPC handlers before initializing the main BrowserWindow, eliminating startup race conditions.
- [linux-compat] Fixed first-launch ENOENT exception on Linux where `~/.config/YumeShelf/` directory did not exist prior to database initialization.
- [devutil] Added official developer utility suite under `.devutil/` (`simulate-icon-pipeline.cjs`, `simulate-startup.cjs`, `inspect-exe-icon.cjs`, `inspect-engine-icon.cjs`, and `README.md`).
- [core-adapters] Added zero-dependency cross-platform ZIP archive extractor (`src/main/core/zip-extractor.ts`) with End of Central Directory (EOCD) parsing and built-in Zip Slip path traversal defenses (#42).
- [core-adapters] Added platform-adaptive filesystem helper (`src/main/core/filesystem-adapter.ts`) supporting NTFS junctions on Windows and POSIX directory symlinks on Linux/macOS (#42).
- [playtime-helper] Adapted Rust `playtime-helper` for cross-platform compilation (ELF on Linux, `.exe` on Windows) with conditional `windows-sys` dependency scoping (#44).
- [playtime-helper] Implemented pure `/proc/[pid]/stat` process line parser and `/proc` process tree polling on Linux without Win32 Job Objects (#44).
- [playtime-helper] Made `playtime-helper-paths.ts` and `ensure-playtime-helper.js` platform-adaptive with `getHelperExeName` (#44).
- [scanner] Implemented cross-platform executable discovery (`src/main/library-state/scanner.ts`) recognizing Linux native binaries (`.x86_64`, `.x86`, `.AppImage`, `.sh`, and POSIX executable mode) alongside Windows `.exe` files (#43).
- [scanner] Implemented 5-tier composite prioritization in `pickPreferredExecutable` prioritizing host-native binaries on Linux and Windows (#43).
- [scanner] Expanded wrapper directory promotion for Linux package layouts (`linux/`, `linux64/`, `x86_64/`) and preserved `platform` metadata (#43).
- [continuity] Updated `getExecutableStem` in `continuity.ts` and `game-annotations.ts` to strip Linux extensions (#43).
- [title-resolver] Added generic Linux script and binary names (`game.x86_64`, `start.sh`, `run.sh`, `launch.sh`, `apprun`) to `GENERIC_TITLE_BLOCKLIST` (#43).
- [translation] Refactored `TranslationService` to use native Node.js archive extraction and cross-platform directory symlinks, removing `powershell.exe` shell execution (#42).
- [packaging] Configured Electron-builder Linux targets (`AppImage` and `tar.gz`) with icon, category, and platform-specific `extraResources` for `playtime-helper` (#48).
- [release] Extended release orchestration and build artifact management (`release.js`, `organize-build-output.js`, `release-artifacts.js`, `write-release-checksum.js`) for Linux packaging and multi-binary SHA-256 verification (#48).
- [game-runner] Added Game Runner architecture (`src/main/game-runner/`) with runner auto-detection (`detector.ts`) for System Wine, Steam Proton, UMU Launcher, and Bottles/Lutris environments (#47).
- [game-runner] Implemented game launch resolver (`resolver.ts`) with automated execution permission enforcement (`chmod +x` / `0o755`) and environment synthesis (#47).
- [playtime-helper] Extended `SessionJournal` schema and Rust helper `launch_game_process` to spawn games via configured compatibility runners (#47).
- [icon-pipeline] Implemented pure TypeScript Portable Executable (PE32 / PE32+) resource decoder (`src/main/icon-pipeline/pe-resource-decoder.ts`) to parse `.rsrc` structures, extract 256px PNG / ICO frames, and read `VS_VERSIONINFO` without Win32 native addons (#46).
- [icon-pipeline] Added Linux Desktop Entry asset resolver (`src/main/icon-pipeline/desktop-entry.ts`) to extract `Icon=` references from `.desktop` files (#46).
- [icon-pipeline] Established unified 4-stage icon resolution cascade with dynamic MIME type dispatching and strict non-Windows guards (#46).
- [save-resolver] Expanded `SaveFolderResolver` and `FileSystemProvider` to support Linux XDG directories and multi-source Wine/Proton prefix AppData paths (#45).
- [save-resolver] Added cross-platform save discovery for Ren'Py, Unity, Unreal, and Godot engines (#45).
- [save-editor] Adapted `unity-mono-bin.ts` to locate and execute self-contained native `ModernSaveConverter` binaries (#45).
- [save-resolver] Consolidated engine detection, deterministic path discovery, and heuristic fallback scanning behind a unified `SaveFolderResolver` deep module.
- [save-resolver] Added `FileSystemProvider` interface (`DefaultFileSystemProvider` and `MockFileSystemProvider`) enabling virtual filesystem unit testing.
- [save-resolver] Standardized return DTO `ResolvedSaveDirectory` with `path`, `engine`, `confidence`, and `source` fields.
- [save-resolver] Added engine detection and path resolution rules for Godot Engine (`.pck`, `project.godot`) and TyranoBuilder (`tyrano/`, `tyrano/savedata`).
- [save-resolver] Added comprehensive vitest suite (`save-folder-resolver.test.ts`) covering all engine resolvers and fallbacks.

---

## [1.5.12] - 2026-07-26

### What Changed
- Fixed RPG Maker MZ save editing so saving changes does not corrupt your save file anymore.

### For the Nerds
- [save-editor] Fixed `.rmmzsave` RPG Maker MZ save file encoding format by converting compressed binary zlib streams to UTF-8 character string representation expected by RPG Maker MZ's `StorageManager` (`pako.inflate`).
- [save-editor] Automatically strip internal UI metadata (`_userMappings`) prior to encoding `.rmmzsave` files to prevent save file corruption and pollution.

---

## [1.5.11] - 2026-07-22

### What Changed
- Added a launch popup when clicking a game so you know it is opening.
- Fixed save editor translation and added support for RPG Developer Bakin games.

### For the Nerds
- [ui] Implemented `ToastPillController` in `src/renderer/ui/toast-pill.ts` and `src/styles/toast-pill.css` with auto-dismiss timers and glassmorphic styling.
- [renderer] Integrated `showToastPill` in `onGameLaunched` callback in `src/renderer/bootstrap/app-composition.ts` and `src/renderer/game-cards.ts`.
- [save-editor] Added `"dist/main/save-editor/bin/**/*"` to `asarUnpack` configuration in `package.json` to extract `ModernSaveConverter` dependencies from the ASAR archive.
- [save-editor] Updated `UnityMonoBinFormat` in `src/main/save-editor/formats/unity-mono-bin.ts` to automatically resolve `ModernSaveConverter.dll` paths under `app.asar.unpacked`.
- [save-resolver] Added `bakin` engine type, detection logic (based on `bakinengine.dll` and `data.rbpack`), and direct save folder resolving to `data/savedata`.
- [save-editor] Implemented `BakinSgsFormat` to list `.sgs` save files and gracefully report them as unsupported for editing in the save editor UI.
- [renderer] Restored `logicalGame` domain instance reference in `src/renderer/library-stacks.ts` to preserve `favorite` state metadata.
- [security] Updated `connect-src` in `src/main/window/main-window.ts` to permit outbound requests to Google Translate API.
- [quality] Achieved 0 open issues on SonarCloud code quality analysis across main and renderer processes.

---

## [1.5.10] - 2026-06-01

### What Changed
- Ignored setup and config executables (like `config.exe` or `setup.exe`) so clicking a game launches the actual game instead.

### For the Nerds
- [library-state] Introduced a soft-filter (deprioritization) in `pickPreferredExecutable` that filters out utility executable entries before selecting candidates, falling back to them only if they are the only executables present in the directory.
- [library-state] Added integration tests in `tests/library-state.test.js` to assert proper library scanning and executable selection when both `Config.exe` and a custom game executable coexist.

---

## [1.5.9] - 2026-06-01

### What Changed
- Multiple library folders. You can now add and scan games from multiple drives or folders at once.
- High-resolution game icons now load properly in packaged builds.

### For the Nerds
- [library-state] Upgraded `LibraryConfig` interface to store `libraryPaths: string[]` with seamless migration path from legacy `libraryPath: string`.
- [library-state] Implemented atomic database mutation operations `addLibraryPath`, `removeLibraryPath`, and `changeLibraryPath` with path collision deduplication.
- [library-state] Restructured scanning engine `loader.ts` to iterate through all active library paths and safely aggregate candidates before executing unique path deduplication.
- [security] Updated IPC boundary validators (`isPathWithinLibrary`) to dynamically check boundaries against the complete array of allowed library paths.
- [renderer] Safely migrated Renderer bootstrap and event lifecycle controllers to drop legacy `btnChangePath` DOM references.
- [antigravity-icon-pipeline] Fallback to `process.execPath` (Electron) as Node interpreter using `ELECTRON_RUN_AS_NODE: '1'` for spawning the background extraction worker when global Node is absent.
- [antigravity-icon-pipeline] Added `"asarUnpack"` entry in `package.json` for `extract-file-icon` dependency to unpack compiled native addon binary from the ASAR archive.
- [antigravity-translation-pipeline] Implemented missing `detectEngineSupport` method in `TranslationService` to resolve `TypeError: translationService.detectEngineSupport is not a function`.

---

## [1.5.8] - 2026-05-27

### What Changed
- Security and stability update. Hardened internal IPC channels and cleaned up background memory usage.

### For the Nerds
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

### What Changed
- Fixed updater bug where in-app updates could appear frozen or stuck on v1.5.6.
- The Save Editor now remembers your active tab, selected file, and search query when popped out into a separate window.
- Added game text extraction support for RPG Maker and Unity games.

### For the Nerds
- [save-editor-fixes] Updated `src/main/ipc/register.ts` to conditionally use `loadURL` instead of `loadFile` when `VITE_DEV_SERVER_URL` is active.
- [save-editor-fixes] Refactored `src/renderer/save-editor-ui.ts` to serialize view state configurations to `localStorage` under a short-lived game-specific key before calling `openSaveEditorWindow`.
- [save-editor-fixes] Added a warning prompt when popping out the Save Editor if there are unsaved changes, preventing accidental data loss.
- [translation-system] Added modular base extractors (`src/main/translation/extractors/base.ts`) to easily extend translation support for new game engines.
- [translation-system] Implemented `dictionary-lock.ts` to manage thread-safe reads and writes to language packs.

---

## [1.5.6] - 2026-05-20

### What Changed
- Core architecture update. Migrated the codebase to TypeScript and Vite for faster load times and fewer runtime bugs.

### For the Nerds
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

### What Changed
- Added raw JSON save file editing so you can tweak plain JSON saves directly in the app.
- Added variable pinning in the Save Editor to keep your favorite items and flags pinned at the top.
- Added quick keyboard shortcuts ('E', 'I', 'X', 'Shift + Enter') for faster save file filter toggles.

### For the Nerds
- [save-editor] Added full support for raw JSON save formats to enable seamless visual editing, state tracking, and configuration tweaking for games utilizing plain JSON serialization.
- [save-editor] Added global keyboard shortcuts in the Save Editor for fast filter toggling: 'E' to toggle 'Show Empty', 'I' to toggle 'Show Important', 'X' to toggle 'Exact Match', and 'Shift + Enter' to instantly commit and save changes.
- [save-editor] Added a "Pinned" feature in the Save Editor to allow users to quickly access specific cards and rows across all tabs. Users can click a star-toggle icon on any data row to pin/unpin it. A dynamic "Pinned" tab appears whenever there are pinned items.
- [i18n] Implemented localized "save_editor_pinned" strings in English, Japanese, and Chinese locales.
- [settings] Resolved a critical UI bug where the Settings page erroneously displayed a stale application version instead of the authoritative active version by hardening the renderer process state synchronization.
- [save-editor] Implemented strict Test Contracts for all Save Editor format strategies under `src/main/save-editor/formats/` to enforce structure, cipher involution, checksum compliance, and API consistency.
- [save-editor] Registered the new `PureJsonFormat` strategy inside the main Save Editor orchestrator and the new `PureJsonEngine` strategy inside the renderer's DataEngine orchestrator.
- [save-editor] Implemented strict active element checks to prevent global keyboard shortcuts from interfering during text input.
- [save-editor] Enabled star icon hover, active gold glowing state, and layout adjustments for all data rows to accommodate the new pinning action.
- [save-editor] Configured the "All" tab to list default category sections dynamically without duplicates, while keeping pinned variables, switches, items, and gold synchronized across tabs.
- [tooling] Upgraded `docs/tools/generate-repo-map.js` from Regex-based scans to high-fidelity AST-based parsing using `web-tree-sitter`.
- [save-editor] Implemented recursive deep object flattening, path traversal (`_getDeep`, `_setDeep`), and numeric type coercion within the `PureJsonEngine` renderer strategy.
- [i18n] Replaced vulnerable state mutation inside `src/renderer/i18n.js` with explicit version synchronization, guaranteeing `localeState.appVersion` is always retained from the main process's boot context.
- [tests] Created `tests/save-editor-contracts.test.js` validating standard Strategy interfaces and byte-level compression/cipher round-trips.
- [save-editor] Managed the pinned state globally using prefixed IDs and persisted state to localStorage under context-aware keys.
- [tooling] Pinned `web-tree-sitter` to version `0.20.8` and implemented custom tree traversal visitors for JavaScript function and method nodes.
- [tooling] Refactored `smart-patcher.js` and `generate-repo-map.js` into exportable modules consumed by `SOP/cli.js`.

---

## [1.5.4] - 2026-05-19

### What Changed
- Fixed auto-launch and minimize-to-tray settings resetting to Off on application launch.
- Fixed RPG Maker save file encoding regressions and added unsaved changes warning dialogs.

### For the Nerds
- [auto-launch] Fixed a bug where Auto-launch and Minimize to Tray settings rendered as "Off" by default in the UI on application start regardless of actual configured values.
- [renderer] Resolved a critical startup crash (`TypeError: Cannot set properties of undefined`) by restoring missing root flat refs and resolving the unmapped `languagePackTitle` inside `language-packs.js` build factory.
- [save-editor] Replaced custom minimal lz-string library with the standard legacy 100% compatible LZString library to resolve .rpgsave value reverting data regression.
- [save-editor] Added a state-aware "unsaved changes" tracking mechanism and user-confirmation dialogs to prevent active edits from being clobbered by background library re-syncs.
- [code-modularization] Relocated root Main Process files to their respective subdirectories and refactored internal relative require paths.
- [auto-launch] Guarded `set-auto-launch` and `get-auto-launch` IPC handlers with `app.isPackaged` to prevent writing the development prebuilt `electron.exe` to the OS startup registry in development.
- [auto-launch] Added database synchronization of auto-launch and minimize-to-tray settings on startup.
- [auto-launch] Added comprehensive `tests/settings-sync.test.js` unit tests to verify database synchronization of auto-launch in both packaged and dev environments.
- [architecture] Completed Container-level Componentization refactor for the Renderer bootstrap layer. Controllers now receive a root `container` element and perform internal `querySelector` calls.
- [renderer] Restored `searchPlaceholder` back to the root returned object of `buildRendererRefs` inside `dom-refs.js`.
- [renderer] Mapped the missing `languagePackTitle` inside `buildLanguagePackRefs` in `language-packs.js`.
- [save-editor] Integrated standard legacy 16-bit word-aligned bitstream padding to prevent game engine decompression failures on edited save files.
- [tests] Added comprehensive save mutation validation suites to guarantee stable save editor round-trips.

---

## [1.5.3] - 2026-05-18

### What Changed
- Parallel update downloads so app updates download much faster.
- System tray icon only shows up when the app is hidden or minimized.

### For the Nerds
- Substituted electron-updater sequential stream downloader with native HTTP range-aware fetch.
- Leveraged Node's `fileHandle.write(buffer, 0, length, offset)` concurrent system to write disjoint byte segments concurrently.
- Integrated native SHA-512 base64 checksum validation on completed downloads, with an automated cleanup callback of corrupt or incomplete files upon failures.
- Added window 'show' and 'hide' event listeners to dynamically call `createTrayIcon()` and `destroyTrayIcon()` to align tray visibility with window state.
- Modified tray menu Quit action to set `isQuitting = true` and call `win.close()` directly, routing through window-all-closed standard application teardown and eliminating Electron's native tray resource early-cleanup quit race condition.
- Wrapped scrollable tabs in a relative container with linear gradient absolute overlays.
- Implemented dynamic scroll-driven opacity adjustments using a scroll event listener and a ResizeObserver for automatic layout updates.

---

## [1.5.2] - 2026-05-18

### What Changed
- Fixed a rare white screen freeze when updating the application on Windows.

### For the Nerds
- Modified the `launchInstallerAndQuit` workflow in `src/main/nsis-updater/installer-handoff.js` to loop through all active `BrowserWindow` instances and call `w.hide()` before spawning the installer.
- Prevents Desktop Window Manager (DWM) from keeping a frozen, unbuffered window frame on-screen when the parent Electron process is terminated by silent `/S` NSIS execution.

---

## [1.5.1] - 2026-05-18

### What Changed
- Ren'Py save editor. View and edit Ren'Py `.save` files directly in the Save Editor.
- Inline translation button in the Save Editor to auto-translate Japanese variables and item names into your language.
- Fixed development preferences not saving across restarts.

### For the Nerds
- Implemented an internal helper Python converter (`renpy_save_converter.py`) utilizing `pickle` and custom script processing to safely deconstruct binary Ren'Py save states into structured JSON formats.
- Built a matching Python re-serialization script to re-pack edited JSON back into native Ren'Py binary `.save` structure.
- Engineered an atomic caching service layer (`translator.js` / `save-editor-service.js`) that automatically saves translations under `save_editor_translations_[lang].json` under the unified AppData directory.
- Resolved Electron v29.0.0's decoupled session behavior by setting `app.setPath('sessionData', userData)` alongside `userData` in `src/main.js` when running unpackaged.
- Corrected raw terminal character streams inside `safe-console.js` and `rpg-wolf-sav.js` to properly decode shift-JIS / UTF-8 binary sequences, removing mojibake output.

---

## [1.5.0] - 2026-05-17

### What Changed
- Built-in Save Editor. Edit gold, items, variables, and switches for RPG Maker, WOLF RPG, and Unity games.
- Detached Save Editor window so you can edit saves while continuing to browse your shelf.
- Added options for auto-launching on Windows startup and minimizing to the system tray.

### For the Nerds
- Decoded the `.wsav` binary structure and implemented automatic checksum calculation at the 17th byte using cumulative payload byte sum to prevent save corruption errors in-game.
- Added native support for `.rmmzsave` parsing via custom Zlib decompression and compression pipeline to manage structured JSON data blocks.
- Split Save Editor UI into single-responsibility submodules: `sidebar.js` (save directory scanning), `grid-renderer.js` (data grid rendering), `search-bar.js` (query and filter synchronization), and `components.js`.
- Added support for relational numeric search expressions (`>170`, `>=170`) in Save Editor filter bar.

---

## [1.4.8] - 2026-05-16

### What Changed
- Launching a game now brings its window to the front immediately.
- Right-clicking game cards opens context menus faster.

### For the Nerds
- Process foreground window focus helper implementation.
- Suppressed card hover tooltips while context dropdown menus are active to prevent visual overlap.

---

## [1.4.7] - 2026-05-02

### What Changed
- Favoriting a game moves its card smoothly instead of jumping.
- Better icon scaling for games with non-square icons.
- Restored official YumeShelf application icon on Windows setup packages.

### For the Nerds
- Replaced direct DOM re-ordering with CSS transform transitions during favoriting state updates.
- Added aspect ratio containment and letterbox centering for non-standard game icon frame dimensions.
- Updated electron-builder NSIS script to bundle 256px icon assets into installer headers and uninstall registries.

---

## [1.4.6] - 2026-05-01

### What Changed
- Playtime tracking. Automatically tracks how long you play each game and displays total playtime on game cards.
- Faster shelf startup when reopening the app.

### For the Nerds
- Built native Rust `playtime-helper` executable monitoring process lifecycles via Windows Job Objects.
- Migrated library metadata storage to structured SQLite / JSON persistence layer.
- Added background IPC heartbeat between Electron main process and playtime monitor daemon.

---

## [1.4.5] - 2026-04-28

### What Changed
- Faster folder scanning for large collections with hundreds of games.

### For the Nerds
- Optimized directory tree walker using non-blocking asynchronous `fs.promises.readdir` calls with depth caps.
- Added parallel directory traversal batching.

---

## [1.4.4] - 2026-04-28

### What Changed
- Smoother game card hover previews without interface lag.

### For the Nerds
- Debounced hover preview state triggers to 150ms.
- Offloaded image rendering calculations to GPU compositor layers using `will-change: transform`.

---

## [1.4.3] - 2026-04-28

### What Changed
- Better executable detection for RPG Maker and Unity games with complex subfolder structures.

### For the Nerds
- Expanded heuristic scanner to recognize nested engine entrypoints (`www/index.html`, `Game.exe`, `nw.exe`, Unity player binaries).
- Added exclusion rules for common crash dump logs and patcher scripts.

---

## [1.4.2] - 2026-04-28

### What Changed
- Search bar is more responsive when typing rapidly.

### For the Nerds
- Debounced input search query handler with 100ms trailing timer.
- Optimized in-memory string matching over library collections.

---

## [1.4.1] - 2026-04-28

### What Changed
- Custom game cover support and cached thumbnails so the shelf opens instantly.

### For the Nerds
- Added local image discovery cascade checking for `cover.png`, `cover.jpg`, `folder.png`, and `thumb.png`.
- Implemented thumbnail disk cache pipeline under AppData directory.

---

## [1.4.0] - 2026-04-28

### What Changed
- Multi-language localization with English and Vietnamese language packs.

### For the Nerds
- Implemented core i18n localization architecture with dynamic runtime dictionary loading.
- Added language selector in preferences overlay with instantaneous DOM text re-mapping.

---

## [1.3.9] - 2026-04-27

### What Changed
- Added keyboard shortcuts for launching selected games and focusing the search bar.

### For the Nerds
- Registered global Electron accelerator key bindings for search and launcher triggers.

---

## [1.3.8] - 2026-04-27

### What Changed
- Category filter bar and tag sorting to organize larger libraries.

### For the Nerds
- Added category state manager and filter bar DOM bindings with dynamic game count badges.

---

## [1.3.7] - 2026-04-27

### What Changed
- Right-click options to open game folders directly in File Explorer or remove games from your shelf.

### For the Nerds
- Added IPC channels for `reveal-game`, `open-path`, and `delete-game` with native shell integration.

---

## [1.3.6] - 2026-04-27

### What Changed
- Remembers your window size and position when you restart the app.

### For the Nerds
- Implemented window state manager persisting window bounds and maximization states to configuration JSON.

---

## [1.3.5] - 2026-04-27

### What Changed
- Cleans up DLsite product codes (`[RJxxxxxx]`) from folder names for cleaner titles.

### For the Nerds
- Added regular expression sanitization rules to strip DLsite RJ/VJ/BJ product codes from display titles.

---

## [1.3.4] - 2026-04-27

### What Changed
- Windows installer setup package with desktop shortcut creation.

### For the Nerds
- Configured NSIS offline builder scripts and desktop shortcut generators.

---

## [1.3.3] - 2026-04-27

### What Changed
- Responsive game grid that adjusts card sizes based on your window width.

### For the Nerds
- Implemented CSS Grid auto-fill breakpoints and card density layout rules.

---

## [1.3.2] - 2026-04-27

### What Changed
- Clearer error messages when a game fails to launch.

### For the Nerds
- Added child process spawn error handlers and native dialog error reporting.

---

## [1.3.1] - 2026-04-27

### What Changed
- Background scanning so the app stays smooth while loading new games.

### For the Nerds
- Offloaded directory scans to background worker threads with streaming batch IPC updates.

---

## [1.3.0] - 2026-04-25

### What Changed
- Dark theme glassmorphic UI overhaul.

### For the Nerds
- Implemented glassmorphism CSS design system with backdrop filters and translucent surface tokens.

---

## [1.2.1] - 2026-04-25

### What Changed
- Custom game folder picker and directory path validation.

### For the Nerds
- Added native openDirectory dialog integration and path existence checks.

---

## [1.2.0] - 2026-04-25

### What Changed
- High-resolution game icons that load much faster after the first scan.

### For the Nerds
- Migrated high-res icon pipeline to a dedicated worker process.
- Added fingerprint-based icon caching using executable path, file size, and timestamp.
- Implemented sequential extraction queue to stabilize native icon extraction under load.

---

## [1.1.0] - 2026-04-25

### What Changed
- Search bar to find games quickly in large collections.
- Visual polish with smoother fade effects across the UI.

### For the Nerds
- Implemented client-side search filtering with regex highlight matching.
- Added CSS mask and linear-gradient edge fading.
- Expanded i18n support for search placeholders across supported languages.

---

## [1.0.6] - 2026-04-25

### What Changed
- First release of YumeShelf. A lightweight launcher for organizing indie and visual novel games.

### For the Nerds
- Initial Electron application scaffold, local game scanner, and shelf grid.
