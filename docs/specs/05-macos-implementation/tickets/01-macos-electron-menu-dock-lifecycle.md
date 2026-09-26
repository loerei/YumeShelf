# 01 — macOS Electron Menu, Dock & Window Lifecycle

## Epic
PRD: Implementation for macOS Platform Support (Parked)

## What to build

Implement native macOS application lifecycle and window behaviors in Electron. Set up standard macOS Application Menu (`Menu.setApplicationMenu`) with standard system shortcuts (Cmd+C, Cmd+V, Cmd+X, Cmd+A, Cmd+Z, Cmd+Q, Cmd+W, Cmd+H, Cmd+M) to enable clipboard, editing, and window management on Darwin. Handle `app.on('activate')` to restore or create the main window when clicking the Dock icon, and configure Darwin title bar styling.

## Acceptance criteria

- [ ] Create `src/main/window/mac-menu.ts` (or extend window menu setup) to configure standard macOS application menu with App, Edit, Window, and Help menus.
- [ ] Register standard macOS key accelerators (`Cmd+C`, `Cmd+V`, `Cmd+X`, `Cmd+A`, `Cmd+Z`, `Cmd+Q`, `Cmd+W`, `Cmd+H`, `Cmd+M`) on `process.platform === 'darwin'`.
- [ ] Implement `app.on('activate')` in `src/main/window/app-lifecycle.ts` to show/restore `mainWindow` when the user clicks the Dock icon.
- [ ] Ensure window close behavior on macOS follows Apple Human Interface Guidelines (hiding/minimizing instead of terminating the app unless explicitly quit via Cmd+Q).
- [ ] Verify that clipboard operations (copy, paste, cut, select all) work seamlessly across all input fields on macOS.
- [ ] Add automated unit tests in `tests/mac-window-lifecycle.test.js` and execute via `npm test -- tests/mac-window-lifecycle.test.js`.

## Blocked by
- Epic 02: 01 — Core Platform Types & macOS Game Scanner Adapter
