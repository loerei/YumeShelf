# 06 — Folder Reordering & Settings Library Paths Drag Reorder ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `SettingsModal.tsx` (all tabs, footer, release link, app version, and existing path add/remove workflows). Do NOT alter, restyle, or remove anything unasked.

Implement vertical drag-and-drop reordering for configured library paths inside `SettingsModal.tsx` and coordinate declarative folder section reordering in the main library view:
- [ ] 1. **[NEW]** [`src/renderer/components/modals/PathReorderList.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/PathReorderList.tsx), **[NEW]** [`src/renderer/components/modals/SortablePathRow.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SortablePathRow.tsx), & **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx) — **Settings Library Paths Drag Reorder with @dnd-kit**:
   - Wrap configured library paths in `PathReorderList.tsx` using a vertical `SortableContext` with `verticalListSortingStrategy`, and mount `PathReorderList` inside `SettingsModal.tsx` (replacing the static path list while preserving existing `.library-path-entry` styling, add/remove path actions, focus handoff on removal, and all other Settings tabs/footer).
   - `SortablePathRow.tsx`: Grip handle (`.grip-handle`) on each row with inline SVG grip icon (`width`, `height`, `currentColor`, `aria-hidden="true"`), localized accessible name (`strings.reorder_library_path`), localized tooltip (`strings.drag_to_reorder`), folder alias display (resolving via own-property check on `folderAliases`) alongside the path, and existing remove button.
   - Max 4 visible rows (~180px) with `scrollbar-gutter: stable` to eliminate layout shift; drag overlay uses `var(--zIndex-path-row-drag, 2100)`.
   - On drop:
     - Identity guard (`if (oldIndex === newIndex) return;`).
     - Optimistically reorder path rows.
     - Persist reordered array via `electronAPI.updateLibraryConfig({ libraryPaths: newPaths })`.
     - On IPC persistence error, roll back to previous order and display localized error toast pill (`useLocaleStrings().toast_path_reorder_failed`).
- [ ] 2. **Main Library Folder Section Reordering Coordination**:
   - When shelf tabs are reordered in `ShelfTabs.tsx` (Ticket `03`) or paths are updated in `SettingsModal.tsx`, `LibraryGrid.tsx` updates its section rendering sequence declaratively from canonical roots in `useLibraryState()`.
- [ ] 3. **[NEW]** [`src/renderer/components/modals/path-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/path-dnd.test.tsx) — **Vitest Unit Tests**:
   - Verify vertical drag reordering triggers `updateLibraryConfig`, rollback restores previous path order on IPC rejection with localized toast feedback, and in-memory state synchronization across Settings and Library views.
   - Verify existing `SettingsModal.test.tsx` continues passing 100%.

## Blocked by
- [03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/03-segmented-shelf-tabs-dnd-kit.md)
- [04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Acceptance Criteria
- [ ] Configured library paths in `SettingsModal.tsx` can be reordered vertically via `@dnd-kit` using `PathReorderList.tsx` and `SortablePathRow.tsx`.
- [ ] Grip handles provide localized accessible names (`reorder_library_path`) and tooltips (`drag_to_reorder`) via `useLocaleStrings()`.
- [ ] Reordered paths persist to storage via `updateLibraryConfig` and roll back cleanly on IPC rejection with localized error toast (`toast_path_reorder_failed`).
- [ ] Main library view reflects reordered folder sequence immediately.
- [ ] Tests in `path-dnd.test.tsx` and `SettingsModal.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/modals/path-dnd.test.tsx src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck
```
