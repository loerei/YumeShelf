# YumeShelf Changelog - v1.5.7

## ✨ What's New

> [!WARNING]
> **Manual Update Required for v1.5.6 Users**
> A bug in the YumeShelf v1.5.6 updater UI prevents the in-app update progress from rendering, which can cause the app to appear stuck or unresponsive when updating. If your in-app updater does not automatically trigger on restart, please manually download and run the v1.5.7 setup from the [Releases Page](https://github.com/loerei/YumeShelf/releases/tag/v1.5.7). 

- Added a new game translation extraction system with initial support for games running on the RPG Maker and Unity engines.

## 🔧 What Changed

- Fixed the standalone Save Editor window displaying a blank screen in development environments by correctly handling the Vite dev server URL.
- Added view state preservation when popping out the Save Editor into a separate window, allowing the new window to seamlessly retain your selected file, active tab, and search filters.
- Added a warning prompt when popping out the Save Editor if there are unsaved changes, preventing accidental data loss.
- Implemented a dictionary lock system to prevent concurrent translation processes from corrupting language dictionary files.

---

## 🛠️ For the Nerds

- Updated `src/main/ipc/register.ts` to conditionally use `loadURL` instead of `loadFile` when `VITE_DEV_SERVER_URL` is active.
- Refactored `src/renderer/save-editor-ui.ts` to serialize view state configurations to `localStorage` under a short-lived game-specific key before calling `openSaveEditorWindow`.
- Added modular base extractors (`src/main/translation/extractors/base.ts`) to easily extend translation support for new game engines in the future.
- Implemented `dictionary-lock.ts` to manage thread-safe reads and writes to language packs.
