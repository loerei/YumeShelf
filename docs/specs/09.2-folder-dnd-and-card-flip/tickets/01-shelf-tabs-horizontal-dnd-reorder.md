# 01 — Shelf Tabs Horizontal Drag-and-Drop Reordering ($B$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/00-preparatory-dnd-deps-settings-tab-and-tokens.md)

## What to Build
> **Scope Guard:** Implement only horizontal drag reordering on `ShelfTabs.tsx` and its persistence callback in `LibraryGrid.tsx`; preserve all Epic 09.1 tab selection, roving `tabIndex`, zero-favorite fallback, and overflow scroll behavior. Do NOT alter, restyle, or remove anything unasked.

Add `@dnd-kit` horizontal drag-and-drop reordering to `ShelfTabs.tsx`:

- [ ] 1. **[NEW]** [`src/renderer/components/SortableTabItem.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableTabItem.tsx) & **[MODIFY]** [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx) — **Horizontal `@dnd-kit` Tab Reordering**:
  - Add optional `onTabReorder?: (oldOrder: readonly string[], newOrder: readonly string[], movedPath?: string) => Promise<void> | void` and `targetPlatform?: PlatformInput` props on `ShelfTabs.tsx` (preserving pure callback architecture — zero direct `electronAPI` inside `ShelfTabs.tsx`).
  - Wrap draggable folder tabs (only folder tabs, never pinned `"All Folders"` or `"Favorites"`) in `DndContext` and `SortableContext` with `horizontalListSortingStrategy`, `PointerSensor` (`distance: 5`), and `KeyboardSensor`.
  - Pinned Tab Protection: reject insertion before or between pinned tabs (`"All Folders"`, `"Favorites"`).
  - Style drag overlay with `var(--zIndex-tab-drag, 500)`.
  - On `onDragEnd`:
    - Identity guard (`if (oldIndex === newIndex) return;`).
    - Compute canonical reordered paths via `reorderLibraryPathsWithSubsumption` from [`src/shared/path-subsumption.ts`](file:///d:/Projects/YumeShelf/src/shared/path-subsumption.ts).
    - Optimistically update local tab order and invoke `onTabReorder(oldOrder, newOrder, movedPath)`; on rejected Promise, roll back local tab order and surface `useLocaleStrings().toast_tab_reorder_failed`.
- [ ] 2. **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Wire `onTabReorder` Persistence**:
  - Pass `onTabReorder` to `<ShelfTabs />` invoking `electronAPI.updateLibraryConfig({ libraryPaths })` and propagating errors for rollback + toast feedback.
- [ ] 3. **[MODIFY]** [`src/renderer/components/ShelfTabs.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.test.tsx) — **Vitest Component Tests**:
  - Verify horizontal drag reorder calls `reorderLibraryPathsWithSubsumption` + `onTabReorder`, protects pinned tabs from displacement, and rolls back with localized error feedback on rejection.

## Acceptance Criteria
- [ ] Draggable folder tabs reorder horizontally via `@dnd-kit`, compute canonical order via `reorderLibraryPathsWithSubsumption`, and persist via `onTabReorder`.
- [ ] Pinned tabs (`"All Folders"`, `"Favorites"`) cannot be dragged or displaced.
- [ ] Failed persistence rolls back local tab order cleanly with `toast_tab_reorder_failed`.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck
```
