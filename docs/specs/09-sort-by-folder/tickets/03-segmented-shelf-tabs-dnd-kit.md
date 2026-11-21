# 03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Implement the pure declarative React component `ShelfTabs.tsx` managing the horizontal Variant C segmented shelf tabs bar using `@dnd-kit` and `useLocaleStrings()`:
- [ ] 1. **[NEW]** [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx) & **[NEW]** [`src/renderer/components/SortableTabItem.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableTabItem.tsx) — **Pure Presentational Component Architecture**:
   - Create `ShelfTabs.tsx` and sortable tab item subcomponent `SortableTabItem.tsx` (consuming `useSortable` from `@dnd-kit/sortable`).
   - Props (pure callbacks — no direct `electronAPI` coupling inside `ShelfTabs.tsx`; persistence is injected via `onTabReorder` from `LibraryGrid.tsx`):
     - `sections: readonly FolderSection[]`
     - `activeTabId: string`
     - `favoritesCount: number`
     - `onTabSelect: (tabId: string) => void`
     - `onTabReorder?: (oldOrder: readonly string[], newOrder: readonly string[], movedPath?: string) => Promise<void> | void`
     - `targetPlatform?: PlatformInput`
- [ ] 2. **Pinned & Draggable Tabs (Localized via `useLocaleStrings()`)**:
   - **"All Folders"**: pinned first tab (`id="shelf-tab-all"`), non-draggable, label from `strings.all_folders`.
   - **"Favorites"**: pinned second tab (`id="shelf-tab-fav"`), non-draggable, rendered strictly when `favoritesCount > 0`, label from `strings.favorites`. Renders an inline vector SVG star icon (`width`, `height`, `fill="currentColor"`, `aria-hidden="true"`) matching existing card favorite star styling.
   - **Draggable Folder Tabs**: dynamically generated for each canonical root folder section (`key={section.path}`), showing display name or alias plus game count badge.
- [ ] 3. **@dnd-kit Drag-and-Drop Reordering**:
   - Wrap draggable folder tabs in `DndContext` and `SortableContext` with `horizontalListSortingStrategy`.
   - Use `PointerSensor` (with activation constraint `distance: 5`) and `KeyboardSensor`.
   - Pinned Tab Protection: ensure drag modifiers and drop target validation reject insertion before or between pinned tabs ("All Folders" and "Favorites").
   - On drop (`onDragEnd`):
     - Check identity guard (`if (oldIndex === newIndex) return;`).
     - Calculate reordered paths using `reorderLibraryPathsWithSubsumption` from `src/shared/path-subsumption.ts`.
     - Optimistically update local tab order and invoke `onTabReorder(oldOrder, newOrder, movedPath)`; if the returned Promise rejects, roll back local tab order and surface localized error feedback (`strings.toast_tab_reorder_failed`).
- [ ] 4. **Tab Accessibility & Zero-Favorite Fallback**:
   - Container declares `role="tablist"` and `aria-label={strings.shelf_folders_aria}`.
   - Individual tabs declare `role="tab"`, dynamic `aria-selected={isActive}`, deterministic HTML `id`, roving `tabIndex={isActive ? 0 : -1}`, and `ArrowLeft`/`ArrowRight`/`Home`/`End` keyboard cycling.
   - Zero-Favorite Fallback: when `activeTabId === 'fav'` and `favoritesCount === 0`, automatically call `onTabSelect('all')` and focus `#shelf-tab-all`.
- [ ] 5. **Horizontal Overflow & Chevron Navigation**:
   - Container detects geometric overflow (`scrollWidth > clientWidth`) via `ResizeObserver` (cleaned up on unmount).
   - Left and right chevron scroll buttons (`type="button"`) with localized `aria-label` / tooltips (`strings.scroll_tabs_left`, `strings.scroll_tabs_right`), dynamic `aria-disabled="true"` at boundaries, and smooth horizontal scrolling.
   - Selecting an active tab calls `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`.
- [ ] 6. **[NEW]** [`src/renderer/components/ShelfTabs.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.test.tsx) — **Vitest Component Tests**:
   - Verify tab selection, pinned tabs, zero-favorite fallback, keyboard arrow navigation, localized labels via `useLocaleStrings()`, and reorder rollback on rejected `onTabReorder`.

## Blocked by
- [02 — Folder Sort Dependencies, Styles, Design Tokens & Locales ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/02-folder-sort-styles-tokens-and-locales.md)

## Status
todo

## Acceptance Criteria
- [ ] Renders localized "All Folders", "Favorites" (when `favoritesCount > 0`), and draggable folder tabs with zero hardcoded English strings.
- [ ] Drag-and-drop reordering with `@dnd-kit` computes canonical order via `reorderLibraryPathsWithSubsumption`, invokes `onTabReorder`, and rolls back on rejection.
- [ ] Pinned tabs ("All Folders", "Favorites") cannot be dragged or displaced.
- [ ] Zero-favorite fallback transitions active tab to `'all'` when last favorite is removed.
- [ ] Roving `tabIndex` and horizontal keyboard navigation function cleanly without `stopPropagation()`.
- [ ] All `@testing-library/react` tests in `ShelfTabs.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck
```
