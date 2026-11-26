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
  - Preserve 100% of existing `.library-path-entry` classes, focus handoff on removal, i18n strings, `#hide-and-seek-select` (`hideAndSeek` state), and all other Settings tabs and footer.
- [ ] 3. **[MODIFY]** [`src/shared/types/ipc.d.ts`](file:///d:/Projects/YumeShelf/src/shared/types/ipc.d.ts) & [`src/preload.ts`](file:///d:/Projects/YumeShelf/src/preload.ts) — **Harden `updateLibraryConfig` IPC Contract**:
  - Replace `any` on `updateLibraryConfig` in `src/shared/types/ipc.d.ts` with concrete typed request/response interfaces referencing `LibraryConfig` (typing the input as `Omit<Partial<LibraryConfig>, 'libraryPath'>` to exclude legacy `libraryPath` at compile time), and update `src/preload.ts` (`updateLibraryConfig: (updates: Omit<Partial<LibraryConfig>, 'libraryPath'>) => ipcRenderer.invoke('update-library-config', updates)`) so the preload bridge does not retain `any`.
- [ ] 4. **[MODIFY]** [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) & Localization JSON Files ([`src/locales/builtins/en.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/en.json), [`src/locales/builtins/ja.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/ja.json), [`src/locales/builtins/zh.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/zh.json), [`language-packs/packs/vi.json`](file:///d:/Projects/YumeShelf/language-packs/packs/vi.json), [`language-packs/templates/en.sample.json`](file:///d:/Projects/YumeShelf/language-packs/templates/en.sample.json)) — **Drag Z-Index Tokens & Locales**:
  - Add drag elevation tokens to `src/styles/theme.css`:
    - `--zIndex-tab-drag: 500;`
    - `--zIndex-card-drag: 1650;` *(strictly above `--zIndex-widget: 1600`, below `--zIndex-modal: 2000`)*
    - `--zIndex-path-row-drag: 2100;` *(above `--zIndex-modal: 2000`, below `--zIndex-overlay: 6000`)*
  - Add 4-language parity keys: `reorder_library_path`, `drag_to_reorder`, `toast_favorite_update_failed`, `toast_tab_reorder_failed`, `toast_path_reorder_failed`.
- [ ] 5. **[MODIFY]** [`src/renderer/styles/folder-sort.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/styles/folder-sort.test.ts) & **Regression Verification ([`SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx))** — **Drag Z-Index Token & Modal Regression Verification**:
  - Extend `src/renderer/styles/folder-sort.test.ts` to assert that `src/styles/theme.css` defines `--zIndex-tab-drag: 500;`, `--zIndex-card-drag: 1650;`, and `--zIndex-path-row-drag: 2100;` (matching the existing `--zIndex-shelf-tabs: 200;` contract check):
    ```ts
    it('defines drag overlay z-index tokens in src/styles/theme.css', () => {
      expect(themeCss).toMatch(/--zIndex-tab-drag:\s*500;/);
      expect(themeCss).toMatch(/--zIndex-card-drag:\s*1650;/);
      expect(themeCss).toMatch(/--zIndex-path-row-drag:\s*2100;/);
    });
    ```
  - Run `SettingsModal.test.tsx` regression check and verify it passes 100% after `SettingsLibraryTab` extraction, preserving `#hide-and-seek-select` and all other Settings controls.

## Acceptance Criteria
- [ ] `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are installed in `package.json` with clean resolution.
- [ ] `SettingsLibraryTab.tsx` encapsulates the Library settings tab with zero unrequested removals (preserving `#hide-and-seek-select`).
- [ ] `updateLibraryConfig` in `src/shared/types/ipc.d.ts` and `src/preload.ts` uses concrete types with zero `any`.
- [ ] Drag z-index tokens (`--zIndex-tab-drag: 500`, `--zIndex-card-drag: 1650`, `--zIndex-path-row-drag: 2100`) and all 5 drag locale keys are present across all 4 locale files and `language-packs/templates/en.sample.json`, with `src/renderer/styles/folder-sort.test.ts` verifying the `theme.css` drag z-index tokens.
- [ ] Execute automated verification command: `npm run verify:deps && npm run test:vitest -- src/renderer/components/modals/SettingsModal.test.tsx src/renderer/i18n/locale-strings.test.ts src/renderer/styles/folder-sort.test.ts && npm run typecheck`.

## Verification Command
```bash
npm run verify:deps && npm run test:vitest -- src/renderer/components/modals/SettingsModal.test.tsx src/renderer/i18n/locale-strings.test.ts src/renderer/styles/folder-sort.test.ts && npm run typecheck
```
