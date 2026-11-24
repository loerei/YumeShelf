# 03 — Harden Remaining IPC Types & Save Editor Imperative Seams ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors across `ipc.d.ts`, `SaveEditorApp.tsx`, and `save-editor-store.ts`. Do NOT alter, restyle, or remove anything unasked.

Close the remaining untyped IPC signatures and imperative DOM/silent-catch seams in the Save Editor:

- [ ] 1. **[MODIFY]** [`src/shared/types/ipc.d.ts`](file:///d:/Projects/YumeShelf/src/shared/types/ipc.d.ts) — **Eliminate Remaining `any` Signatures on `ElectronAPI`**:
  - Replace remaining `any` parameter and return types (`bootstrapApp`, `checkConfig`, `setupLibrary`, `addLibraryPath`, `removeLibraryPath`, `changeLibraryPath`, `getCategoryTree`, `createCategory`, `renameCategory`, `deleteCategory`, `assignGameCategories`, `removeGameCategory`, `launchYume`, `renameGame`, `deleteGame`, `toggleRunInBackground`, etc.) with concrete TypeScript interfaces.
  - Ensure zero `any` remains across `ElectronAPI` without breaking existing preload/main/renderer call sites.
- [ ] 2. **[MODIFY]** [`src/renderer/save-editor/SaveEditorApp.tsx`](file:///d:/Projects/YumeShelf/src/renderer/save-editor/SaveEditorApp.tsx) — **Replace `document.querySelector` Shortcuts with React Refs & Callbacks**:
  - Replace `document.querySelector('input.save-editor-search')` and `document.querySelector('.save-editor-footer .save-btn')?.click()` in `SaveEditorShell` with a forwarded/passed `searchInputRef` and an explicit save action callback.
  - Preserve `Ctrl/Cmd+F` search focus (via `useFindShortcut`) and `Ctrl/Cmd+S` save shortcut behavior identically.
- [ ] 3. **[MODIFY]** [`src/renderer/save-editor/store/save-editor-store.ts`](file:///d:/Projects/YumeShelf/src/renderer/save-editor/store/save-editor-store.ts) — **Remove Silent Storage Catch in `writePinnedIds`**:
  - Replace the silent `catch` around `storage.setItem` in `writePinnedIds` with explicit sanitized diagnostic logging (`sanitizeUserPaths`) or an optional `onStorageError` callback so persistence failures (e.g. quota exceeded) are observable in tests and diagnostics without crashing the editor.
- [ ] 4. **[MODIFY]** [`src/renderer/save-editor/save-editor-integration.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/save-editor/save-editor-integration.test.tsx) & **[MODIFY]** [`src/renderer/save-editor/store/save-editor-store.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/save-editor/store/save-editor-store.test.ts) — **Seam & Error-Reporting Tests**:
  - Verify `Ctrl/Cmd+F` and `Ctrl/Cmd+S` work through ref/callback wiring without querying global `document`.
  - Verify `writePinnedIds` invokes diagnostic/error reporting when `storage.setItem` throws while preserving in-memory pinned state.

## Acceptance Criteria
- [ ] `src/shared/types/ipc.d.ts` has zero `any` types on `ElectronAPI`.
- [ ] `SaveEditorApp.tsx` contains zero `document.querySelector` calls for keyboard shortcuts.
- [ ] `writePinnedIds` in `save-editor-store.ts` surfaces storage errors explicitly instead of silently swallowing them.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/save-editor/ && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/save-editor/ && npm run typecheck
```
