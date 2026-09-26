# 04 — Folder Accordions & Section Components ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement the declarative React components for folder accordion sections and the accordion control toolbar:
1. **Component Architecture**:
   - Create [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx):
     - Renders the `.folder-accordion-toolbar` with "Expand All" and "Collapse All" buttons strictly on tab `'all'`.
     - Maps over `folderSections` projected by `projectLibrarySections`.
     - Maintains collapsed state via React state (`Set<string>`), initialized from user preferences.
     - Controls tab-scoped filtering:
       - Tab `'all'`: displays top Favorites section (if games favorited) followed by all folder sections.
       - Tab `'fav'`: displays top Favorites section only.
       - Tab `'<folder-id>'`: displays the selected folder section only (with `isCollapsible: false`).
   - Create [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx):
     - Renders single folder section container (`.library-section`).
     - Header: semantic heading (`role="heading"`, `aria-level="3"`), isolated toggle button (`role="button"`, dynamic `aria-expanded="true" | "false"`), chevron SVG icon, folder title/alias, and game count badge.
     - Collapsible Grid: hardware-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`).
     - Accessibility & Focus: when collapsed, sets HTML `inert` on the inner grid container to suppress keyboard focus and screen reader navigation.
     - Releases overflow clipping upon animation completion so that game card dropdown menus and tooltips are never truncated.
2. **Empty Folder Handling**:
   - When a folder contains 0 games:
     - Unfiltered view: renders `<EmptyFolderPrompt folderPath={section.path} displayName={section.displayName} />` (Ticket 08).
     - Filtered view (active category): renders neutral filtered empty message `<div class="filtered-folder-empty-state">...</div>`.
3. **Vitest Component Tests**:
   - Author tests in `src/renderer/components/FolderAccordion.test.tsx`:
     - Verifies expand/collapse toggling updates `aria-expanded` and applies `inert` when collapsed.
     - Verifies "Expand All" and "Collapse All" toolbar buttons toggle all sections.
     - Verifies tab-scoped visibility filtering across `'all'`, `'fav'`, and individual folder tabs.

## Blocked by
- [02 — Folder Sort Styles, Design Tokens & Locales ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/02-folder-sort-styles-tokens-and-locales.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx)
- React container managing folder sections, toolbar controls, and collapsed state.

### [NEW] [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx)
- Collapsible folder section component with accessible header and CSS Grid transitions.

### [NEW] [`src/renderer/components/FolderAccordionToolbar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordionToolbar.tsx)
- Toolbar with "Expand All" and "Collapse All" actions.

### [NEW] [`src/renderer/components/FolderAccordion.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.test.tsx)
- Vitest component tests verifying accordion behaviors, toolbar actions, and tab filtering.

## Acceptance Criteria
- [ ] Folder sections render collapsible headers with animated chevrons and game counts.
- [ ] Collapsed sections apply `inert` to child grids, preventing keyboard focus trapping.
- [ ] Expand All and Collapse All buttons update all sections simultaneously.
- [ ] Tab-scoped visibility shows all sections on `'all'`, favorites only on `'fav'`, and single section on folder tab.
- [ ] Component tests in `FolderAccordion.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderAccordion.test.tsx && npm run typecheck
```
