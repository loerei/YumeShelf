---
version: "1.5.7"
status: "released"
released_at: "null"
last_updated_by: "release-compiler-script"
last_updated_at: "2026-05-26T12:36:32.292Z"
---

# YumeShelf Changelog - v1.5.7

## ✨ What's New

> [!WARNING]
> **Manual Update Required for v1.5.6 Users**
> A bug in the YumeShelf v1.5.6 updater UI prevents the in-app update progress from rendering, which can cause the app to appear stuck or unresponsive when updating. If your in-app updater does not automatically trigger on restart, please manually download and run the v1.5.7 setup from the [Releases Page](https://github.com/loerei/YumeShelf/releases/tag/v1.5.7). 

- [translation-system] Added a new game translation extraction system with initial support for games running on the RPG Maker and Unity engines.

## 🔧 What Changed

- [save-editor-fixes] Fixed the standalone Save Editor window displaying a blank screen in development environments by correctly handling the Vite dev server URL.
- [save-editor-fixes] Added view state preservation when popping out the Save Editor into a separate window, allowing the new window to seamlessly retain your selected file, active tab, and search filters.
- [save-editor-fixes] Added a warning prompt when popping out the Save Editor if there are unsaved changes, preventing accidental data loss.
- [translation-system] Implemented a dictionary lock system to prevent concurrent translation processes from corrupting language dictionary files.

---

## 🛠️ For the Nerds

- [save-editor-fixes] Updated `src/main/ipc/register.ts` to conditionally use `loadURL` instead of `loadFile` when `VITE_DEV_SERVER_URL` is active.
- [save-editor-fixes] Refactored `src/renderer/save-editor-ui.ts` to serialize view state configurations to `localStorage` under a short-lived game-specific key before calling `openSaveEditorWindow`.
- [translation-system] Added modular base extractors (`src/main/translation/extractors/base.ts`) to easily extend translation support for new game engines in the future.
- [translation-system] Implemented `dictionary-lock.ts` to manage thread-safe reads and writes to language packs.
