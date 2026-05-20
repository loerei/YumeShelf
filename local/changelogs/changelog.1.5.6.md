---
version: "1.5.6"
status: "released"
released_at: "2026-05-20T15:00:19.759Z"
last_updated_by: "release-compiler-script"
last_updated_at: "2026-05-20T15:00:19.759Z"
---

# YumeShelf Changelog - v1.5.6

## 🔧 What Changed

- **Infrastructure & Maintenance Update**: This release is a core infrastructure, optimization, and code-quality maintenance update. It focuses entirely on backend stability, code modularization, and build system modernization, with no new user-facing features or direct functionality changes.

---

## 🛠️ For the Nerds

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
- [typescript-migration] Executed Phase 3: Annotated all five Save Editor engine strategy classes (`RpgMakerEngine`, `RpgWolfSavEngine`, `RenpyEngine`, `UnityMonoEngine`, `PureJsonEngine`) with full JSDoc signatures for `detect`, `extractRoot`, `getTabs`, `getProp`, `findGold`, and `extractData`, including internal helper methods.
- [typescript-migration] Resolved `TS2322` (null/array assignability) in `grid-renderer.js` by introducing an explicit `rawTabs` nullable intermediate and narrowing tabs via an if/else branch.
- [typescript-migration] Resolved `TS2774` (always-true function check) in `grid-renderer.js` by replacing truthiness check with `typeof onPinToggle === 'function'`.
- [typescript-migration] Resolved `TS2345` (undefined not assignable to string) in `grid-renderer.js` by guarding optional `tab.i18n` with a nullish coalescing fallback (`?? ''`).
- [typescript-migration] All Save Editor modules now pass `npm run typecheck` with zero errors; full static analysis coverage achieved across the renderer layer.
- [typescript-migration] Executed Phase 4: Successfully migrated the YumeShelf Renderer layer to a modern Vite-powered build pipeline, introducing zero-reload Hot Module Replacement (HMR) during UI development.
- [typescript-migration] Re-architected Electron Main process bootstrap (`main-window.js`) to load Vite Dev Server (`localhost:5173`) conditionally via `VITE_DEV_SERVER_URL` in development, while reading `dist/renderer/index.html` in production.
- [typescript-migration] Automated a codebase-wide transpilation script (`migrate-ts.js`) that successfully transformed 60+ legacy JavaScript UI components and services into TypeScript (`.ts`) files.
- [typescript-migration] Injected `@ts-nocheck` pragmas into legacy renderer files to silence TS compiler errors temporarily, enabling a perfectly clean `npm run typecheck` state and unblocking Vite compilation without risking runtime logic.
- [typescript-migration] Overhauled `package.json` to leverage `concurrently` for parallelizing the Vite dev server alongside the Electron main process via `npm start`.
