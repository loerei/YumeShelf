# 04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `LibraryGrid.tsx` (all flat sort modes `date`, `played`, `az`, `custom`, card rendering, right-click menus, and existing `LibraryGrid.test.tsx` assertions). Do NOT alter, restyle, or remove anything unasked.

Implement the declarative React components for folder accordion sections and the accordion toolbar, and wire `ShelfTabs` + `FolderAccordion` into `LibraryGrid.tsx` when `currentSort === 'folder'`:
- [ ] 1. **[NEW]** [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx), **[NEW]** [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx), & **[NEW]** [`src/renderer/components/FolderAccordionToolbar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordionToolbar.tsx) — **Component Architecture**:
   - `FolderAccordion.tsx` & `FolderAccordionToolbar.tsx`:
     - Renders `.folder-accordion-toolbar` with localized "Expand All" (`strings.expand_all`) and "Collapse All" (`strings.collapse_all`) `<button type="button">` controls strictly on tab `'all'`.
     - Maps over `folderSections` projected by `projectLibrarySections` (`key={section.path}`).
     - Maintains collapsed state via React state (`Set<string>`), initialized from user preferences.
     - Controls tab-scoped filtering:
       - Tab `'all'`: displays top Favorites section (if games favorited) followed by all folder sections.
       - Tab `'fav'`: displays top Favorites section only.
       - Tab `'<folder-id>'`: displays the selected folder section only (with `isCollapsible: false`).
   - `FolderSection.tsx`:
     - Renders single folder section container (`.library-section`).
     - Header: semantic heading (`role="heading"`, `aria-level={3}`), isolated `<button type="button">` toggle (`aria-expanded={isExpanded}`, localized `aria-label` via `strings.toggle_folder`), chevron SVG icon (`width`, `height`, `currentColor`, `aria-hidden="true"`), title slot (`renderTitle?: (section: FolderSection) => React.ReactNode`, defaulting to plain title text — consumed by Ticket `07` `FolderTitle.tsx`), and game count badge.
     - Collapsible Grid: hardware-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`).
     - Accessibility & Focus: when collapsed, sets HTML `inert` on the inner grid container to suppress keyboard focus and screen reader navigation.
     - Releases overflow clipping upon animation completion (`onTransitionEnd`) so that game card dropdown menus and tooltips are never truncated.
- [ ] 2. **Empty Folder Slot (Decoupled from Ticket 08 — Zero Circular Dependency)**:
   - Expose an optional `renderEmptyFolder?: (section: FolderSection) => React.ReactNode` slot prop on `FolderAccordion.tsx` / `FolderSection.tsx` (wired to `<EmptyFolderPrompt />` in Ticket `08`).
   - When a folder contains 0 games:
     - Filtered view (active category): renders `<div className="filtered-folder-empty-state">{strings.no_matching_games_in_folder}</div>`.
     - Unfiltered view: invokes `renderEmptyFolder?.(section)` if provided, otherwise renders neutral fallback text.
- [ ] 3. **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Mount `ShelfTabs` & `FolderAccordion` for `'folder'` Sort**:
   - When `currentSort === 'folder'`, project sections via `projectLibrarySections(...)`, render `<ShelfTabs />` (passing `onTabReorder` backed by `electronAPI.updateLibraryConfig({ libraryPaths })` + error toast rollback) and `<FolderAccordion />`.
   - Keep all non-folder sort modes (`date`, `played`, `az`, `custom`) rendering identically to existing live behavior.
- [ ] 4. **[NEW]** [`src/renderer/components/FolderAccordion.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.test.tsx) & **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx) — **Vitest Component Tests**:
   - Verify expand/collapse toggling updates `aria-expanded` and applies `inert` when collapsed.
   - Verify "Expand All" and "Collapse All" toolbar buttons toggle all sections and resolve labels via `useLocaleStrings()`.
   - Verify tab-scoped visibility filtering across `'all'`, `'fav'`, and individual folder tabs, and verify existing flat-sort tests in `LibraryGrid.test.tsx` remain 100% green.

## Blocked by
- [03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/03-segmented-shelf-tabs-dnd-kit.md)

## Status
todo

## Acceptance Criteria
- [ ] Folder sections render collapsible headers with animated chevrons, localized controls (`useLocaleStrings()`), and game counts.
- [ ] Collapsed sections apply `inert` to child grids, preventing keyboard focus trapping.
- [ ] Expand All and Collapse All buttons update all sections simultaneously.
- [ ] Tab-scoped visibility shows all sections on `'all'`, favorites only on `'fav'`, and single section on folder tab.
- [ ] `LibraryGrid.tsx` mounts `ShelfTabs` and `FolderAccordion` when `currentSort === 'folder'` without regressing flat sort modes.
- [ ] Component tests in `FolderAccordion.test.tsx` and `LibraryGrid.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderAccordion.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck
```
