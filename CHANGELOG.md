# Changelog

All notable changes to YumeShelf are documented here. Entries are written incrementally by agents and compiled for public releases using `npm run compile:release-notes`.

---

## [Unreleased]

## [1.5.9] - working

### 🔧 What Changed

- Fixed game icon extraction inside packaged production builds, enabling high-resolution 256x256 game icon recovery on client machines.
- Fixed translation engine support detection on startup to prevent Renderer uncaught promise errors.

### 🛠️ For the Nerds

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
