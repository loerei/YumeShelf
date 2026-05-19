---
version: "1.5.4"
status: "released"
released_at: "2026-05-19T07:58:42.713Z"
last_updated_by: "release-compiler-script"
last_updated_at: "2026-05-19T07:58:42.713Z"
---

# YumeShelf Changelog - v1.5.4

## ✨ What's New

- ...

## 🔧 What Changed

- [auto-launch] Fixed a bug where the Auto-launch and Minimize to Tray settings rendered as "Off" by default in the UI on application start regardless of the actual configured values.
- [renderer] Resolved a critical startup crash (`TypeError: Cannot set properties of undefined (setting 'innerText')` and `TypeError: Cannot set properties of undefined (setting 'textContent')`) by restoring missing root flat refs and resolving the unmapped `languagePackTitle` inside `language-packs.js` build factory.

---

## 🛠️ For the Nerds

- [code-modularization] Relocated root Main Process files to their respective subdirectories (library-state.js -> library-state/index.js, save-editor-service.js -> save-editor/index.js) and refactored internal relative require paths without affecting outer importers due to automatic directory resolution.
- [auto-launch] Guarded `set-auto-launch` and `get-auto-launch` IPC handlers with `app.isPackaged` to prevent writing the development prebuilt `electron.exe` to the OS startup registry in development, while mocking the startup settings state in-memory to preserve UI settings panel sync and prevent developers' machines from launching the default Electron welcome page on boot.
- [auto-launch] Added database synchronization of auto-launch and minimize-to-tray settings on startup, so that these settings load correctly when the application starts.
- [auto-launch] Added comprehensive tests/settings-sync.test.js unit tests to verify database synchronization of auto-launch in both packaged and dev environments.
- [architecture] Completed Container-level Componentization refactor for the Renderer bootstrap layer. Controllers (`settings.js`, `category-filter.js`, `search.js`, `language-packs.js`, `duplicate-stack-overlay.js`) now receive a root `container` element and perform internal `querySelector` calls. Eliminated the manual flat-ref distribution pattern where `app-composition.js` passed 10–25 individual element references to each controller. `dom-refs.js` now exports a `containers` object alongside shared refs for the event binding layer.
- [renderer] Restored `searchPlaceholder` back to the root returned object of `buildRendererRefs` inside `dom-refs.js` to ensure the boot pipeline and translation controllers (`bootstrap.js`, `ui-text.js`) don't fail during startup.
- [renderer] Mapped the missing `languagePackTitle` inside `buildLanguagePackRefs` in `language-packs.js` to prevent failures when setting review surface titles on boot.
- [sop] Created new SOP-06 (Architectural Thinking & Component Boundary Enforcement) to codify universal architectural decision-making processes for large repos: architecture discovery, component encapsulation rules, dependency direction, and common anti-patterns.
- [sop] Extended SOP-03 with Section 4 (Post-Refactor Structural Verification): cross-module dependency audit, boot pipeline smoke test, and shared-to-owned migration checklist.
- [docs] Added Section 6.4 (Safety Pitfalls & Verification) to `yumeshelf-code-modularization.md` documenting the Shared Ref Leak and Unmapped Internal Ref anti-patterns with prevention rules.
