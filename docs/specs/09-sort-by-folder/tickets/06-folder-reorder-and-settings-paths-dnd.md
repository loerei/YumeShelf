# 06 — Folder Reordering & Settings Library Paths Drag Reorder ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement vertical drag-and-drop reordering for configured library paths in Settings and coordinate declarative folder section reordering in the main library view:
- [ ] 1. **[NEW]** [`src/renderer/settings/PathReorderList.tsx`](file:///d:/Projects/YumeShelf/src/renderer/settings/PathReorderList.tsx) & **[NEW]** [`src/renderer/settings/SortablePathRow.tsx`](file:///d:/Projects/YumeShelf/src/renderer/settings/SortablePathRow.tsx) — **Settings Library Paths Drag Reorder with @dnd-kit**:
   - Wrap configured paths in a vertical `SortableContext` with `verticalListSortingStrategy`.
   - `SortablePathRow.tsx`: Grip handle (`.grip-handle`) on each row with SVG grip icon, accessible name (`reorder_library_path`), tooltip (`drag_to_reorder`), folder alias display (resolving via own-property check on `folderAliases`) alongside the path, and remove button.
   - Max 4 visible rows (~180px) with `scrollbar-gutter: stable` to eliminate layout shift.
   - On drop:
     - Identity guard (`if (oldIndex === newIndex) return;`).
     - Optimistically reorder path rows.
     - Persist reordered array to `electronAPI.updateLibraryConfig({ libraryPaths: newPaths })`.
     - On IPC persistence error, rollback to previous order and display error toast pill (`toast_path_reorder_failed`).
- [ ] 2. **Main Library Folder Section Reordering Coordination**:
   - When shelf tabs are reordered in `ShelfTabs.tsx` (Ticket 03) or paths are updated in Settings, the library view updates its section rendering sequence declaratively.
   - Because sections are rendered via React Virtual DOM from `canonicalRoots`, reordering resolves immediately without manual DOM insertion or layout thrashing.
   - Smooth reorder transitions can be enabled declaratively via CSS transitions or layout animations.
- [ ] 3. **[NEW]** [`src/renderer/settings/path-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/settings/path-dnd.test.tsx) — **Vitest Unit Tests**:
   - Verify vertical drag reordering triggers `updateLibraryConfig`, rollback restores previous path order on IPC rejection, and in-memory state synchronization across Settings and Library views.

## Blocked by
- [03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/03-segmented-shelf-tabs-dnd-kit.md)
- [04 — Folder Accordions & Section Components ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Acceptance Criteria
- [ ] Configured library paths in Settings can be reordered vertically via `@dnd-kit`.
- [ ] Grip handles provide accessible names and tooltips.
- [ ] Reordered paths persist to storage via `updateLibraryConfig`.
- [ ] Reordering rolls back cleanly on IPC rejection with error toast feedback.
- [ ] Main library view reflects reordered folder sequence immediately.
- [ ] Tests in `path-dnd.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/settings/path-dnd.test.tsx && npm run typecheck
```
