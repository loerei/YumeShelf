# 00 — Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens ($S$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## What to Build
> **Scope Guard:** Implement only structural seams, dependency installation, drag tokens/locales, and `updateLibraryConfig` typing specified below; preserve initial intended UXUI and all unmentioned existing behaviors across `SettingsModal.tsx` and Epic 09.1 folder views. Do NOT wire drag-and-drop handlers yet.

Prepare the dependencies, `SettingsLibraryTab.tsx` seam, IPC typing, and drag design tokens/locales for Tickets `01`..`03`:

- [ ] 1. **[MODIFY]** [`package.json`](file:///d:/Projects/YumeShelf/package.json) & `pnpm-lock.yaml` — **Install `@dnd-kit` Dependencies**:
  - Install and version-pin `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` in `dependencies`.
  - Verify `npm run verify:deps` / `pnpm ls` reports zero peer conflicts.
- [ ] 2. **[NEW]** [`src/renderer/components/modals/SettingsLibraryTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsLibraryTab.tsx) & **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx) — **Extract Library Tab Seam from `SettingsModal.tsx`**:
  - Extract the Library tab panel (configured library paths list, add/remove/change path controls, rescan feedback, and category management) out of `SettingsModal.tsx` into `SettingsLibraryTab.tsx` receiving typed state and callbacks via props.
  - Expose a clean slot/prop seam for the configured library paths list so Ticket `03` mounts `PathReorderList.tsx` inside `SettingsLibraryTab.tsx` without adding drag state to `SettingsModal.tsx`.
  - Remove the orphaned `#hide-and-seek-select` control and its dead `hideAndSeek` state from `SettingsModal.tsx` (its runtime controller no longer exists in `src/renderer/`).
  - Preserve 100% of existing `.library-path-entry` classes, focus handoff on removal, i18n strings, and all other Settings tabs and footer.
- [ ] 3. **[MODIFY]** [`src/shared/types/ipc.d.ts`](file:///d:/Projects/YumeShelf/src/shared/types/ipc.d.ts) — **Harden `updateLibraryConfig` IPC Contract**:
  - Replace `any` on `updateLibraryConfig` with concrete typed request/response interfaces referencing `LibraryConfig`.
- [ ] 4. **[MODIFY]** [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) & Localization JSON Files ([`src/locales/builtins/en.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/en.json), [`src/locales/builtins/ja.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/ja.json), [`src/locales/builtins/zh.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/zh.json), [`language-packs/packs/vi.json`](file:///d:/Projects/YumeShelf/language-packs/packs/vi.json)) — **Drag Z-Index Tokens & Locales**:
  - Add drag elevation tokens to `src/styles/theme.css`:
    - `--zIndex-tab-drag: 500;`
    - `--zIndex-card-drag: 1650;` *(strictly above `--zIndex-widget: 1600`, below `--zIndex-modal: 2000`)*
    - `--zIndex-path-row-drag: 2100;` *(above `--zIndex-modal: 2000`, below `--zIndex-overlay: 6000`)*
  - Add 4-language parity keys: `reorder_library_path`, `drag_to_reorder`, `toast_favorite_update_failed`, `toast_tab_reorder_failed`, `toast_path_reorder_failed`.
- [ ] 5. **[MODIFY]** [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx) — **Regression Verification**:
  - Verify `SettingsModal.test.tsx` passes 100% after `SettingsLibraryTab` extraction and `#hide-and-seek-select` removal.

## Acceptance Criteria
- [ ] `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are installed in `package.json` with clean resolution.
- [ ] `SettingsLibraryTab.tsx` encapsulates the Library settings tab and `#hide-and-seek-select` dead UI is removed.
- [ ] `updateLibraryConfig` in `src/shared/types/ipc.d.ts` uses concrete types with zero `any`.
- [ ] Drag z-index tokens and all 5 drag locale keys are present across all 4 locale files.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck
```
