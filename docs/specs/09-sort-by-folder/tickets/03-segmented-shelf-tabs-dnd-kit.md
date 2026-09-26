# 03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement the declarative React component `ShelfTabs.tsx` managing the horizontal Variant C segmented shelf tabs bar using `@dnd-kit`:
1. **Component Architecture**:
   - Create [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx) and sortable tab item subcomponent [`SortableTabItem.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableTabItem.tsx).
   - Props:
     - `sections: FolderSection[]`
     - `activeTabId: string`
     - `favoritesCount: number`
     - `onTabSelect: (tabId: string) => void`
     - `onTabReorder?: (oldOrder: string[], newOrder: string[], movedPath?: string) => Promise<void> | void`
     - `targetPlatform?: PlatformInput`
2. **Pinned & Draggable Tabs**:
   - **"All Folders"**: pinned first tab (`id="shelf-tab-all"`), non-draggable.
   - **"Favorites"**: pinned second tab (`id="shelf-tab-fav"`), non-draggable, rendered strictly when `favoritesCount > 0`. Renders an inline vector SVG star icon (`aria-hidden="true"`) with gold styling.
   - **Draggable Folder Tabs**: dynamically generated for each canonical root folder section, showing display name or alias, plus game count badge.
3. **@dnd-kit Drag-and-Drop Reordering**:
   - Wrap draggable folder tabs in `DndContext` and `SortableContext` with `horizontalListSortingStrategy`.
   - Use `PointerSensor` (with activation constraint `distance: 5`) and `KeyboardSensor`.
   - Pinned Tab Protection: ensure drag modifiers and drop target validation reject insertion before or between pinned tabs ("All Folders" and "Favorites").
   - On drop (`onDragEnd`):
     - Check identity guard (`if (oldIndex === newIndex) return;`).
     - Calculate reordered paths using `reorderLibraryPathsWithSubsumption`.
     - Optimistically update local tab order and dispatch persistence via `electronAPI.updateLibraryConfig({ libraryPaths })`.
     - On persistence failure, rollback to previous order and display error toast pill (`toast_tab_reorder_failed`).
4. **WAI-ARIA Tabs Pattern & Accessibility**:
   - Container declares `role="tablist"` and `aria-label="Shelf folders"`.
   - Individual tabs declare `role="tab"`, dynamic `aria-selected="true" | "false"`, and deterministic HTML `id`.
   - Roving `tabindex` (`tabindex="0"` on active tab, `tabindex="-1"` on inactive tabs).
   - Horizontal keyboard arrow navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`) cycles focus and selection.
   - Zero-Favorite Fallback: when `activeTabId === 'fav'` and `favoritesCount === 0`, automatically transitions active tab to `'all'` and anchors focus to `#shelf-tab-all`.
5. **Horizontal Overflow & Chevron Navigation**:
   - Container detects geometric overflow (`scrollWidth > clientWidth`) via `ResizeObserver`.
   - Left and right chevron scroll buttons with localized tooltips, dynamic `aria-disabled="true"` when at boundaries, and smooth horizontal scrolling.
   - Selecting an active tab calls `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`.

## Blocked by
- [02 — Folder Sort Styles, Design Tokens & Locales ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/02-folder-sort-styles-tokens-and-locales.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx)
- Declarative React component for horizontal segmented shelf tabs with `@dnd-kit`.

### [NEW] [`src/renderer/components/SortableTabItem.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableTabItem.tsx)
- Sortable tab item component consuming `useSortable` from `@dnd-kit/sortable`.

### [NEW] [`src/renderer/components/ShelfTabs.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.test.tsx)
- Vitest component tests verifying tab selection, pinned tabs, zero-favorite fallback, keyboard arrow navigation, and reorder rollback.

## Acceptance Criteria
- [ ] Renders "All Folders", "Favorites" (if count > 0), and draggable folder tabs.
- [ ] Drag-and-drop reordering with `@dnd-kit` updates folder path order and persists via IPC.
- [ ] Pinned tabs ("All Folders", "Favorites") cannot be dragged or displaced.
- [ ] Zero-favorite fallback transitions active tab to `'all'` when last favorite is removed.
- [ ] Roving `tabindex` and horizontal keyboard navigation function per WAI-ARIA tabs pattern.
- [ ] All `@testing-library/react` tests in `ShelfTabs.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck
```
