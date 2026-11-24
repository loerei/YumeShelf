# 03 — Settings Library Paths Drag Reorder & Runtime Smoke Gate ($B$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/00-preparatory-dnd-deps-settings-tab-and-tokens.md)
- [02 — Multi-Container Game/Stack Card DnD & Non-Drag Layout FLIP ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/02-game-card-dnd-cross-zone-and-card-flip.md)

## What to Build
> **Scope Guard:** Implement only vertical path drag reordering inside `SettingsLibraryTab.tsx` and the terminal runtime smoke gate; preserve initial intended UXUI and all unmentioned existing behaviors in `SettingsLibraryTab.tsx` and `SettingsModal.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement vertical drag-and-drop reordering for configured library paths inside `SettingsLibraryTab.tsx` (extracted in Ticket `00`), synchronize folder sequence declaratively with `LibraryGrid.tsx`, and run the terminal Epic 09.2 smoke check:

- [ ] 1. **[NEW]** [`src/renderer/components/modals/PathReorderList.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/PathReorderList.tsx), **[NEW]** [`src/renderer/components/modals/SortablePathRow.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SortablePathRow.tsx), & **[MODIFY]** [`src/renderer/components/modals/SettingsLibraryTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsLibraryTab.tsx) — **Settings Library Paths Drag Reorder with `@dnd-kit`**:
  - Wrap configured library paths in `PathReorderList.tsx` using vertical `SortableContext` (`verticalListSortingStrategy`), mounted inside `SettingsLibraryTab.tsx` while keeping `SettingsModal.tsx` free of drag state.
  - `SortablePathRow.tsx`: Grip handle (`.grip-handle`) with inline SVG grip icon (`width`, `height`, `currentColor`, `aria-hidden="true"`), localized accessible name (`strings.reorder_library_path`), localized tooltip (`strings.drag_to_reorder`), folder alias display (own-property lookup on `folderAliases`), and existing remove button with focus handoff.
  - Max 4 visible rows (~180px) with `scrollbar-gutter: stable`; drag overlay uses `var(--zIndex-path-row-drag, 2100)`.
  - On drop: identity guard (`if (oldIndex === newIndex) return;`), optimistic reorder, persist via `electronAPI.updateLibraryConfig({ libraryPaths: newPaths })`, roll back on rejection with `useLocaleStrings().toast_path_reorder_failed`.
- [ ] 2. **Main Library Folder Section Reordering Coordination**:
  - Verify `LibraryGrid.tsx` updates folder section sequence declaratively from canonical roots in `useLibraryState()` whenever paths are reordered in `ShelfTabs.tsx` or `SettingsLibraryTab.tsx`.
- [ ] 3. **[NEW]** [`src/renderer/components/modals/path-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/path-dnd.test.tsx) — **Vitest Unit Tests**:
  - Verify vertical drag reordering calls `updateLibraryConfig`, rollback restores previous order with localized toast feedback on rejection, and existing `SettingsModal.test.tsx` passes 100%.
- [ ] 4. **Terminal Real-Runtime UI Smoke Gate (Epic 09.2)**:
  - Run `npm test && npm run typecheck` and boot `npm start` to verify horizontal shelf tab drag, multi-container `GameCard`/`StackCard` drag-drop, non-drag favorite FLIP animation, vertical Settings path drag, and zero console/CSP/visual regressions across light/dark themes.

## Acceptance Criteria
- [ ] Configured library paths in `SettingsLibraryTab.tsx` reorder vertically via `@dnd-kit` using `PathReorderList.tsx` and `SortablePathRow.tsx` with localized grip handle labels/tooltips.
- [ ] Reordered paths persist via `updateLibraryConfig`, synchronize immediately with `LibraryGrid.tsx`, and roll back with `toast_path_reorder_failed` on IPC failure.
- [ ] Real-runtime smoke check passes with zero console/CSP errors and zero visual regressions.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/modals/path-dnd.test.tsx src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/modals/path-dnd.test.tsx src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck
```
