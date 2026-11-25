# 03 — Segmented Shelf Tabs Core Component ($B$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/01-headless-library-sections-and-stacks.md)
- [02 — Folder Sort Core Styles, Header Option & 4-Language Locales ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/02-folder-sort-styles-header-and-locales.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT install `@dnd-kit` or add drag reordering in this ticket (horizontal tab drag is layered cleanly in Epic 09.2).

Implement the pure declarative React component `ShelfTabs.tsx` managing the horizontal Variant C segmented shelf tabs bar using `useLocaleStrings()`:

- [x] 1. **[NEW]** [`src/renderer/components/ShelfTabs.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.tsx) — **Pure Presentational Component Architecture**:
  - Props (pure data & callbacks — zero direct `electronAPI` or store coupling):
    - `sections: readonly FolderSection[]`
    - `activeTabId: string`
    - `effectiveTabId?: string` (optional coordinator-projected tab ID; when omitted, `ShelfTabs` resolves the effective tab locally using `normalizeLibraryPath(activeTabId, targetPlatform)` and `normalizeLibraryPath(s.path, targetPlatform)` imported from `../library/library-sections`, falling back to `'all'` whenever `activeTabId` is neither `'all'`, `'fav'` with `favoritesCount > 0`, nor a valid normalized `section.path`)
    - `favoritesCount: number`
    - `targetPlatform?: PlatformInput` (optional platform override imported from `../../shared/path-subsumption` for 100% in-memory virtual testing without mutating `process.platform`)
    - `onTabSelect: (tabId: string) => void`
  - **Pinned & Folder Tabs (Localized via `useLocaleStrings()`)**:
    - **"All Folders"**: pinned first tab (`id="shelf-tab-all"`), label from `strings.all_folders`.
    - **"Favorites"**: pinned second tab (`id="shelf-tab-fav"`), rendered strictly when `favoritesCount > 0`, label from `strings.favorites`. Renders an inline vector SVG star icon (`width`, `height`, `fill="currentColor"`, `aria-hidden="true"`) matching existing card favorite star styling.
    - **Folder Tabs**: dynamically generated for each canonical root folder section (`key={section.path}`), showing `section.displayName` plus game count badge.
  - **Tab Accessibility & Zero-Favorite Fallback**:
    - Outer wrapper binds `className="shelf-tabs-bar"`, and the tablist container binds `className="shelf-tabs-list"` alongside `role="tablist"` and `aria-label={strings.shelf_folders_aria}`.
    - Resolve `isActive` against `resolvedEffectiveTabId = effectiveTabId ?? fallbackEffectiveTabId` so `#shelf-tab-all` always receives `tabIndex={0}` and `aria-selected="true"` when `activeTabId` is invalid or falls back.
    - Individual tabs declare `role="tab"`, dynamic `aria-selected={isActive}`, deterministic HTML `id`, roving `tabIndex={isActive ? 0 : -1}`, and `ArrowLeft`/`ArrowRight`/`Home`/`End` keyboard cycling (without `stopPropagation()`), invoking `onTabSelect(targetTabId)` in addition to focusing the target tab button so `tabIndex={isActive ? 0 : -1}` remains synchronized with `document.activeElement`.
    - Zero-Favorite Fallback: when `activeTabId === 'fav'` and `favoritesCount === 0`, automatically call `onTabSelect('all')` and focus `#shelf-tab-all` ONLY when focus has dropped to `document.body` (or `null`) because `#shelf-tab-fav` unmounted while focused, rather than stealing focus from `CategoryFilter`, `SearchBar`, or a card's `.fav-btn`:
      ```tsx
      const allTabRef = useRef<HTMLButtonElement | null>(null);

      useEffect(() => {
        if (activeTabId === 'fav' && favoritesCount === 0) {
          onTabSelect('all');
          if (!document.activeElement || document.activeElement === document.body) {
            allTabRef.current?.focus();
          }
        }
      }, [activeTabId, favoritesCount, onTabSelect]);
      ```
  - **Horizontal Overflow & Chevron Navigation**:
    - Extract an `updateScrollState()` callback that reads `scrollWidth`, `clientWidth`, and `scrollLeft` from the `role="tablist"` container to compute `hasOverflow` (`scrollWidth > clientWidth`), `canScrollLeft` (`scrollLeft > 1`), and `canScrollRight` (`scrollLeft + clientWidth < scrollWidth - 1`), updating state booleans only when changed so smooth scrolling does not trigger redundant re-renders.
    - Invoke `updateScrollState()` from a `ResizeObserver` (guarded with `typeof ResizeObserver !== 'undefined'`, matching `SaveEditorContent.tsx`, and cleaned up via `disconnect()` on unmount), a post-commit `useEffect` depending on `[sections, favoritesCount, updateScrollState]` (so adding, removing, or renaming folder tabs updates `hasOverflow` / `canScrollRight` even when container dimensions do not change), and React's declarative `onScroll={updateScrollState}` prop on the `role="tablist"` container:
      ```tsx
      useEffect(() => {
        updateScrollState();
      }, [sections, favoritesCount, updateScrollState]);
      ```
    - Left and right chevron scroll buttons (`type="button"`, `className="shelf-tab-scroll-btn"`) rendering inline vector chevron SVGs (`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">`, matching `Header.tsx` SVG icons, never raw text glyphs) with localized `aria-label` and `data-tooltip` (`strings.scroll_tabs_left`, `strings.scroll_tabs_right`, integrating with `TooltipProvider.tsx` for keyboard/touch tooltip parity), dynamic `aria-disabled="true"` at boundaries, and `onClick` guarded against `aria-disabled="true"` (since `aria-disabled` does not suppress native click events on `<button type="button">`):
      ```tsx
      const handleScrollTabs = useCallback((direction: 'left' | 'right') => {
        const el = tablistRef.current;
        if (!el) return;
        if (direction === 'left' && !canScrollLeft) return;
        if (direction === 'right' && !canScrollRight) return;
        const delta = Math.max(120, Math.floor(el.clientWidth * 0.6));
        el.scrollBy?.({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
      }, [canScrollLeft, canScrollRight]);
      ```
    - Selecting an active tab calls `tabEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })` (safely guarded for environments where `scrollIntoView` is undefined).
- [x] 2. **[NEW]** [`src/renderer/components/ShelfTabs.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/ShelfTabs.test.tsx) — **Vitest Component Tests**:
  - Verify tab selection, pinned "All Folders" / conditional "Favorites" tabs, zero-favorite fallback (*given* `activeTabId === 'fav'` and `favoritesCount` transitions to `0`, *when* `document.activeElement` is `document.body`, `onTabSelect('all')` is called and focus moves to `#shelf-tab-all`; *when* `document.activeElement` is on another interactive control such as an external button/filter, `onTabSelect('all')` is called without stealing focus from that control), invalid `activeTabId` fallback (`#shelf-tab-all` receives `tabIndex={0}` and `aria-selected="true"`), macOS NFD-decomposed `activeTabId` matching NFC `section.path` when `targetPlatform="darwin"` is passed as a prop (with zero `process.platform` global mutation and `effectiveTabId` omitted), keyboard arrow/Home/End navigation (rendering `ShelfTabs` inside a stateful controlled parent wrapper or using `rerender` so `onTabSelect` updates `activeTabId` and roving `tabIndex` transitions to `0`), and localized labels via `useLocaleStrings()`.
  - **Horizontal overflow & chevron navigation**: stub `globalThis.ResizeObserver` and `Element.prototype.scrollBy` (restored in `afterEach`), mock `scrollWidth > clientWidth` and `scrollLeft` boundaries on the tablist element, trigger the `ResizeObserver` callback, fire a `scroll` event on the tablist after updating `scrollLeft` (without re-invoking `ResizeObserver`) and assert `aria-disabled` updates on both chevron buttons, assert that updating `sections` (or `favoritesCount`) so `scrollWidth > clientWidth` updates `hasOverflow` / chevron `aria-disabled` without firing a `ResizeObserver` callback or `scroll` event, assert clicking an enabled chevron invokes `scrollBy`, assert clicking a boundary chevron with `aria-disabled="true"` is a no-op, and assert `ResizeObserver.disconnect()` is called on unmount.
  - **`scrollIntoView` active tab alignment**: spy/stub `Element.prototype.scrollIntoView` (restored in `afterEach`) and assert `{ behavior: 'smooth', block: 'nearest', inline: 'nearest' }` is invoked when active tab changes.

## Acceptance Criteria
- [x] Renders localized "All Folders", "Favorites" (when `favoritesCount > 0`), and folder tabs with zero hardcoded English strings.
- [x] Zero-favorite fallback transitions active tab to `'all'` and focuses `#shelf-tab-all` only when `!document.activeElement || document.activeElement === document.body` (never stealing focus from another active interactive control); invalid `activeTabId` resolves `effectiveTabId` to `'all'` with `tabIndex={0}` and `aria-selected="true"` on `#shelf-tab-all`; omitted `effectiveTabId` fallback uses `normalizeLibraryPath(..., targetPlatform)` so `darwin` NFD/NFC `activeTabId` matches NFC `section.path`.
- [x] Roving `tabIndex`, horizontal keyboard navigation (`ArrowLeft`/`ArrowRight`/`Home`/`End` focusing and invoking `onTabSelect(targetTabId)` so `tabIndex={isActive ? 0 : -1}` stays synchronized), `ResizeObserver` + `[sections, favoritesCount]` `useEffect` + `onScroll` overflow/boundary synchronization (with `typeof ResizeObserver !== 'undefined'` guard and `disconnect()` on unmount), `tabEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })` active-tab alignment, and `.shelf-tab-scroll-btn` overflow chevron controls (inline SVG chevrons, `aria-disabled="true"` at boundaries with `onClick` no-op guard) function cleanly without `stopPropagation()`.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/ShelfTabs.test.tsx && npm run typecheck
```
