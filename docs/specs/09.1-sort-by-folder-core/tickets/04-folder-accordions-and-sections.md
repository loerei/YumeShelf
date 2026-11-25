# 04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [00 — Preparatory Refactoring: Flat Grid Seam, Core IPC Contracts & Canonical Sort ($S$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/00-preparatory-flat-grid-and-core-ipc-seams.md)
- [03 — Segmented Shelf Tabs Core Component ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/03-segmented-shelf-tabs-core.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `LibraryGrid.tsx` and `FlatLibraryGrid.tsx` (all flat sort modes `date`, `played`, `az`, `custom`, card rendering, right-click menus, and existing `LibraryGrid.test.tsx` assertions). Do NOT alter, restyle, or remove anything unasked.

Implement the declarative React components for folder accordion sections and the accordion toolbar, and mount `ShelfTabs` + `FolderAccordion` in `LibraryGrid.tsx` when `currentSort === 'folder'`:

- [x] 1. **[NEW]** [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx), **[NEW]** [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx), & **[NEW]** [`src/renderer/components/FolderAccordionToolbar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordionToolbar.tsx) — **Component Architecture**:
  - `FolderAccordion.tsx` & `FolderAccordionToolbar.tsx`:
    - Props include `projection: LibrarySectionsProjection` (already resolved with `effectiveTabId` by `LibraryGrid.tsx`), `storage?: UiStorageAdapter` (for `collapsed` folder IDs only, falling back to an in-memory/`localStorage` adapter when omitted to match `LibraryGridProps`), `nowProvider?: () => number` (defaulting to `Date.now` for deterministic corrupt-payload quarantine timestamps), `renderItem: (item: LibraryViewItem, sectionScope?: string) => React.ReactNode`, `isFiltered?: boolean`, and optional `renderTitle` / `renderEmptyFolder` slots.
    - Renders `.folder-accordion-toolbar` with localized "Expand All" (`strings.expand_all`) and "Collapse All" (`strings.collapse_all`) `<button type="button">` controls strictly on tab `'all'`.
    - Maps over `projection.folderSections` (`key={section.path}`).
    - Maintains collapsed folder IDs (`Set<string>`) initialized via a lazy `useState(() => readCollapsedFolders(resolvedStorage, nowProvider))` initializer (executing `getItem` and `JSON.parse` once on mount rather than on every re-render) via the injectable `UiStorageAdapter` (passed from `LibraryGrid.tsx`, never calling global `localStorage` directly) under the canonical key `'yumeshelf_collapsed_folders'` using the versioned envelope `{ schemaVersion: 1, collapsed: string[] }` (matching `src/renderer/library-order.ts` `readStoredCustomOrder` / `writeCustomOrder`, without legacy unversioned `string[]` fallback sniffing since `'yumeshelf_collapsed_folders'` is a new key):
      - **Read**: inside `try/catch`, parse JSON; if `parsed` is an object with `typeof envelope.schemaVersion === 'number' && envelope.schemaVersion > 1`, log `console.warn('[FolderAccordion] Ignoring collapsed folders with newer schemaVersion:', { schemaVersion: envelope.schemaVersion })` and return an empty `Set<string>` without mutating or quarantining storage; if `envelope.schemaVersion === 1 && Array.isArray(envelope.collapsed)`, filter to `typeof item === 'string' && item.trim().length > 0` elements (matching `readStoredCustomOrder` in `src/renderer/library-order.ts`); on `SyntaxError` or any other malformed/non-versioned payload (including unversioned arrays like `'["C:/Games"]'`), log `console.warn('[FolderAccordion] Corrupt collapsed folders payload encountered; quarantining:', ...)` with `sanitizeUserPaths`, quarantine the raw value to ``yumeshelf_collapsed_folders_corrupt_${nowProvider()}`` (inside `try/catch`, logging `console.warn('[FolderAccordion] Failed during corrupt collapsed folders recovery:', ...)` on quarantine/remove failure) and `removeItem('yumeshelf_collapsed_folders')` in `finally`, returning an empty `Set<string>`. On unexpected `getItem` failure, log `console.warn('[FolderAccordion] Failed to read collapsed folders from storage:', ...)` with `sanitizeUserPaths`-scrubbed error and stack.
      - **Write**: inside `try/catch`, probe existing `'yumeshelf_collapsed_folders'` first by wrapping `JSON.parse(existingRaw)` in its own inner `try/catch` (ignoring `SyntaxError` so a corrupt non-JSON value in storage never aborts the write); if `existing.schemaVersion > 1`, log `console.warn('[FolderAccordion] Aborting write: collapsed folders schema version is newer than supported version:', ...)` and abort the write (`FUTURE_SCHEMA_VERSION`) to preserve future-version data; otherwise write `JSON.stringify({ schemaVersion: 1, collapsed: Array.from(nextSet) })`, logging `console.warn('[FolderAccordion] Failed to persist collapsed folders:', ...)` with `sanitizeUserPaths`-scrubbed error and stack on `setItem` failure. Expand/collapse state survives sort-mode switches (`folder` -> flat sort -> `folder`) while remaining 100% testable in memory. (`activeTabId` state and persistence are owned by `LibraryGrid.tsx`.)
    - Controls tab-scoped visibility using `projection.effectiveTabId`:
      - Tab `'all'`: displays top Favorites section (if games favorited, passing `sectionScope="fav"` to `renderItem`) followed by all folder sections (passing `sectionScope={section.path}` to `renderItem`).
      - Tab `'fav'`: displays top Favorites section only.
      - Tab `'<folder-id>'`: displays the selected folder section only (with `isCollapsible: false`), computing effective expansion in `FolderAccordion.tsx` as:
        ```ts
        const isExpanded = !section.isCollapsible || !collapsedFolders.has(section.path);
        ```
        so a folder previously collapsed on the `'all'` tab always renders expanded when opened in its single-folder `<folder-id>` tab without mutating `collapsedFolders` persistence.
  - `FolderSection.tsx`:
    - Props include `renderItem: (item: LibraryViewItem, sectionScope?: string) => React.ReactNode`.
    - Renders single folder section container (`.library-section`).
    - Header: semantic heading (`role="heading"`, `aria-level={3}`, `className="folder-section-title"` on the default title fallback), isolated `<button type="button">` toggle (`aria-expanded={effectiveExpanded}`, localized `aria-label` via `strings.toggle_folder`) with chevron SVG icon (`width`, `height`, `currentColor`, `aria-hidden="true"`) rendered **only when `section.isCollapsible` is true** (omitting the collapse toggle control and chevron SVG on non-collapsible single-folder tab headers), title slot (`renderTitle?: (section: FolderSection) => React.ReactNode`, defaulting to `<div role="heading" aria-level={3} className="folder-section-title">{section.displayName}</div>` — consumed by Ticket `05` `FolderTitle.tsx`), and game count badge.
    - Collapsible Grid & Accessibility: resolve `const effectiveExpanded = !section.isCollapsible || isExpanded;` before applying `.is-collapsed` or HTML `inert` on the inner grid container, using hardware-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`) and setting `inert` when `!effectiveExpanded` to suppress keyboard focus and screen reader navigation.
    - Track `isTransitioning` state (initialized to `false` so initially-expanded sections never start clipped) and apply `.is-transitioning` on the grid wrapper only during active expand/collapse transitions when reduced motion is not active (`!(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)`). In `onTransitionEnd`, guard `if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') { setIsTransitioning(false); }` so bubbled child transitions never release overflow prematurely, and `overflow: hidden` applies only while `.is-collapsed` or `.is-transitioning` is active (leaving `overflow: visible` on initial expanded mount and under `prefers-reduced-motion: reduce` where `transitionend` never fires):
      ```tsx
      const [isTransitioning, setIsTransitioning] = useState(false);
      const prevExpandedRef = useRef(effectiveExpanded);

      useEffect(() => {
        if (prevExpandedRef.current === effectiveExpanded) return;
        prevExpandedRef.current = effectiveExpanded;
        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReducedMotion) {
          setIsTransitioning(true);
        }
      }, [effectiveExpanded]);

      const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') {
          setIsTransitioning(false);
        }
      }, []);
      ```
  - **Empty Folder Slot**: Expose optional `isFiltered?: boolean` and `renderEmptyFolder?: (section: FolderSection) => React.ReactNode` slot props on `FolderAccordion.tsx` / `FolderSection.tsx` (wired to `<EmptyFolderPrompt />` in Ticket `05` only when `!isFiltered`). When `section.games.length === 0` and `isFiltered` is true (or `renderEmptyFolder` is not provided), render `<div className="filtered-folder-empty-state">{strings.no_matching_games_in_folder}</div>`.
- [x] 2. **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Mount `ShelfTabs` & `FolderAccordion` for `'folder'` Sort**:
  - Subscribe reactively to `currentLibraryConfig` via `useLibrarySelector((s) => s.currentLibraryConfig)` (from `src/renderer/hooks/useLibraryState.ts`), derive `rootPaths` with the same `libraryPaths` -> `libraryPath` fallback used in `App.tsx`, and extract `folderAliases`:
    ```ts
    const currentLibraryConfig = useLibrarySelector((s) => s.currentLibraryConfig);
    const rootPaths = useMemo(
      () =>
        currentLibraryConfig?.libraryPaths?.length
          ? currentLibraryConfig.libraryPaths
          : currentLibraryConfig?.libraryPath
            ? [currentLibraryConfig.libraryPath]
            : [],
      [currentLibraryConfig]
    );
    const folderAliases = currentLibraryConfig?.folderAliases;
    ```
  - Extend the `customOrder` resolution gate from `currentSort === 'custom'` to `currentSort === 'custom' || currentSort === 'folder'`:
    ```ts
    const usesCustomOrder = currentSort === 'custom' || currentSort === 'folder';
    if (customOrder !== undefined) {
      currentResolvedCustomOrder = customOrder;
      isCustomOrderChanged = usesCustomOrder && isCustomOrderPropChanged;
    } else if (usesCustomOrder) {
      // ... resolveCustomOrder(allGames, readStoredCustomOrder(storage))
    }
    ```
  - Resolve `const resolvedStorage: UiStorageAdapter = storage ?? defaultStorage;` (matching `FolderAccordion.tsx` and `src/renderer/library-order.ts`, falling back to `localStorage` when defined and an in-memory adapter otherwise), and use `resolvedStorage` for both `'yumeshelf_active_folder_tab'` read/write and `<FolderAccordion storage={resolvedStorage} ... />`.
  - Add optional `targetPlatform?: PlatformInput` (imported from `../../shared/path-subsumption`) to `LibraryGridProps` for 100% in-memory virtual testing without mutating `process.platform`.
  - Own `activeTabId` state (initialized via a lazy `useState(() => ...)` initializer so `resolvedStorage.getItem` executes once on mount) and `UiStorageAdapter` persistence in `LibraryGrid.tsx` (sibling coordinator) under canonical key `'yumeshelf_active_folder_tab'`, reading via `resolvedStorage.getItem('yumeshelf_active_folder_tab')?.trim() || 'all'` inside `try/catch` (matching `yumeshelf_active_category_id` in `src/renderer/state/ui-runtime-state.ts`), wrapping `resolvedStorage.setItem` in `try/catch`, emitting `console.warn` with `sanitizeUserPaths`-scrubbed `error` and `stack` on `getItem`/`setItem` failures, and synchronizing `activeTabId` back to `'all'` (and persisting via `resolvedStorage`) in a post-commit `useEffect` whenever `isFolderViewActive && activeTabId === 'fav' && favoritesCount === 0` (so filtering to a category with 0 favorites while in a flat sort mode does not overwrite `'yumeshelf_active_folder_tab'`).
  - Evaluate `const isFolderViewActive = currentSort === 'folder' && rootPaths.length > 0;` **before** both `allGames.length === 0` (`LibraryEmptyState`) and `viewItems.length === 0` (`FilteredEmptyState`), so an active category filter returning 0 games still mounts `<ShelfTabs />` and `<FolderAccordion />` and renders `.filtered-folder-empty-state`.
  - When `isFolderViewActive` is true, compute `baseProjection` in a `useMemo` keyed on `[isFolderViewActive, viewItems, currentSort, rootPaths, folderAliases, targetPlatform]` (projecting `'all'` once, returning `null` in flat-sort modes for `0 ms` projection overhead), and derive the tab-scoped `projection` in a second lightweight $O(K)$ `useMemo` keyed on `[baseProjection, activeTabId, targetPlatform]` via `selectFolderTabProjection(baseProjection, activeTabId, targetPlatform)` (imported from `../library/library-sections`) so tab switches avoid re-scanning all $N$ games while preserving `darwin` NFC/NFD normalization; wrap `renderItem` in `useCallback` with its stable dependencies, and render `<ShelfTabs sections={projection.allFolderSections ?? []} activeTabId={activeTabId} effectiveTabId={projection.effectiveTabId} targetPlatform={targetPlatform} ... />` and `<FolderAccordion projection={projection} storage={resolvedStorage} isFiltered={Boolean(activeCategoryId)} renderItem={renderItem} />` as clean siblings:
    ```ts
    const baseProjection = useMemo<LibrarySectionsProjection | null>(() => {
      if (!isFolderViewActive) return null;
      return projectLibrarySections({
        items: viewItems,
        currentSort,
        activeTabId: 'all',
        rootPaths,
        folderAliases,
        targetPlatform,
      });
    }, [isFolderViewActive, viewItems, currentSort, rootPaths, folderAliases, targetPlatform]);

    const projection = useMemo<LibrarySectionsProjection | null>(() => {
      if (!baseProjection) return null;
      return selectFolderTabProjection(baseProjection, activeTabId, targetPlatform);
    }, [baseProjection, activeTabId, targetPlatform]);
    ```
  - Scope `cardRefs` per placement in `LibraryGrid.tsx` rather than sharing a single `cb(null)` across dual-mounted nodes: either use section-scoped ref keys `getCardRefCallback(key, sectionScope)` (where `sectionScope` is `'fav'`, `section.path`, or `'flat'`, keyed by `${sectionScope}::${key}` in `Map<string, HTMLElement>`, and update the post-commit `cardRefCallbacksRef` pruning `useEffect` to compare against scoped keys or extract the raw key after `::` to avoid detaching/re-attaching card refs on each render), OR a React 19 ref cleanup closure on `Map<string, Set<HTMLElement>>` (`() => { set.delete(el); if (set.size === 0) cardRefs.current.delete(key); }`). Extract a shared helper `resolveConnectedCardElement(key: string): HTMLElement | null` using `isFocusableCardElement`:
    ```ts
    const isFocusableCardElement = (el: HTMLElement | null | undefined): el is HTMLElement =>
      Boolean(el && el.isConnected && !el.closest('[inert]'));
    ```
    After checking direct `cardRefs` matches (`key`, `key.slice(5)` if `key.startsWith('game:')`, `game:${key}`), fall back to scanning `viewItems` (`item.representativeKey === key || item.groupKey === key || item.games.some((g) => (g.gameKey || g.gameId) === key)`) and resolving `item.isStack ? item.groupKey : item.representativeKey` through `isFocusableCardElement`, and use `resolveConnectedCardElement` symmetrically for `activeToggledKeyRef`, `focusTargetKey`, and Ticket `05`'s `pendingFocusKeyRef` so dual-mounted favorited cards in `'all'` tab never resolve to a card inside a collapsed (`inert`) folder section and stacked manual-add entries resolve to their `StackCard` element.
  - Keep all non-folder sort modes (`date`, `played`, `az`, `custom`) delegating identically to `FlatLibraryGrid.tsx`.
- [x] 3. **[NEW]** [`src/renderer/components/FolderAccordion.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.test.tsx) & **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx) — **Vitest Component Tests**:
  - Verify expand/collapse toggling updates `aria-expanded` and applies `inert` when collapsed, and persists/restores `{ schemaVersion: 1, collapsed: [...] }` under `'yumeshelf_collapsed_folders'` and `activeTabId` under `'yumeshelf_active_folder_tab'` via `UiStorageAdapter`.
  - Verify **versioned envelope, corrupt quarantine, sanitized diagnostics & throwing `UiStorageAdapter` resilience**: seed `UiStorageAdapter` under `'yumeshelf_collapsed_folders'` with (a) malformed or non-versioned JSON (`"{bad"`, `'{"a":1}'`, unversioned `'["C:/Games"]'`) using injected `nowProvider` (or `vi.useFakeTimers()` / `vi.spyOn(Date, 'now')` restored in `afterEach`), asserting non-throwing fallback, removal of `'yumeshelf_collapsed_folders'`, deterministic quarantine to `yumeshelf_collapsed_folders_corrupt_<ts>`, and `console.warn` emission with `sanitizeUserPaths` scrubbing (using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games` so `sanitizeUserPaths` redaction is exercised), (b) `{ schemaVersion: 1, collapsed: [123, null, "", "   ", "C:/Games"] }` asserting non-string/whitespace-only element filtering, (c) `schemaVersion > 1` payload asserting forward-version preservation and `console.warn` emission on both read and write-abort when toggling sections, (d) write-time corrupt non-JSON recovery where `storage.getItem('yumeshelf_collapsed_folders')` returns `"{bad"` during a toggle write, asserting the inner `try/catch` ignores the `SyntaxError` and persists `{ schemaVersion: 1, collapsed: [...] }` without aborting, and (e) a throwing `getItem`/`setItem` adapter on both `FolderAccordion` (`collapsed`) and `LibraryGrid` (`activeTabId`) asserting graceful non-throwing render and `console.warn` with `sanitizeUserPaths` scrubbing (using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`).
  - Verify **`FolderSection` `onTransitionEnd` overflow release & `prefers-reduced-motion: reduce`**: restore any `window.matchMedia` spy/stub in `afterEach` (`vi.restoreAllMocks()`); with reduced motion disabled, assert `.is-transitioning` is present on the grid wrapper immediately after toggling, assert a bubbled `transitionEnd` from a child element does not remove `.is-transitioning`, then dispatch `fireEvent.transitionEnd(gridWrapper, { propertyName: 'grid-template-rows' })` and assert `.is-transitioning` is removed; when `window.matchMedia` matches `(prefers-reduced-motion: reduce)`, assert toggling `FolderSection` does not leave `.is-transitioning` / overflow clipping active without `onTransitionEnd`.
  - Verify `LibraryGrid` rendered with `storage={undefined}` persists `'yumeshelf_active_folder_tab'` via `defaultStorage` (`localStorage`).
  - Verify **`rootPaths.length === 0` fallback in `'folder'` sort**: render `LibraryGrid` with `currentSort="folder"` and empty `libraryPaths: []` / `libraryPath: ''`, asserting delegation to `FlatLibraryGrid` / `LibraryEmptyState` rather than mounting `ShelfTabs`.
  - Verify a folder present in the persisted `collapsed` set when projected with `isCollapsible: false` (single-folder tab) forces expanded state (`inert` is not applied) and omits the collapse toggle button.
  - Verify `'folder'` sort respects `customOrder` persisted in an injectable `UiStorageAdapter`.
  - Verify `currentSort === 'folder'` with `activeCategoryId` matching 0 games renders `.filtered-folder-empty-state` (`strings.no_matching_games_in_folder`) rather than `FilteredEmptyState`.
  - Verify focus retention on a non-`[inert]` connected target when unfavoriting in `'all'` tab (including when the owning folder section is collapsed/`inert`), and `UiStorageAdapter` `activeTabId` sync when `favoritesCount` drops to `0`.
  - Verify "Expand All" / "Collapse All" toolbar buttons, tab-scoped visibility (`'all'`, `'fav'`, folder tab), macOS NFD-decomposed `activeTabId` matching NFC `section.path` when `targetPlatform="darwin"` is passed as a prop to `LibraryGrid` (with zero `process.platform` mutation), `ShelfTabs` retention of all canonical folder tabs in `LibraryGrid.test.tsx` when switching to `'fav'` or an individual folder tab, and zero regression on flat-sort tests in `LibraryGrid.test.tsx`.

## Acceptance Criteria
- [x] Folder sections render collapsible headers with animated chevrons, localized controls (`useLocaleStrings()`), and game counts.
- [x] Collapsed sections apply `inert` to child grids and release `.is-transitioning` / overflow clipping on `onTransitionEnd` (`e.target === e.currentTarget && e.propertyName === 'grid-template-rows'`) while bypassing `.is-transitioning` on initial expanded mount and under `prefers-reduced-motion: reduce`; non-collapsible sections (`section.isCollapsible === false`) force expanded state (`!section.isCollapsible || !collapsedFolders.has(section.path)` / `effectiveExpanded`), omit the collapse toggle button and chevron SVG, and never apply `inert`; `'yumeshelf_collapsed_folders'` (in `FolderAccordion`, using `{ schemaVersion: 1, collapsed: string[] }`, `trim().length > 0` filtering, `schemaVersion > 1` read/write-abort preservation, and `yumeshelf_collapsed_folders_corrupt_<ts>` quarantine with injectable `nowProvider`) and `'yumeshelf_active_folder_tab'` (in `LibraryGrid`) persist via injectable `UiStorageAdapter` (`resolvedStorage = storage ?? defaultStorage`) with `try/catch` resilience and `sanitizeUserPaths`-scrubbed `console.warn` diagnostics.
- [x] Expand All and Collapse All buttons update all sections simultaneously.
- [x] `LibraryGrid.tsx` accepts optional `targetPlatform?: PlatformInput` (passing it to `projectLibrarySections`, `selectFolderTabProjection`, and `<ShelfTabs />`), subscribes reactively to `currentLibraryConfig` via `useLibrarySelector((s) => s.currentLibraryConfig)` (with `libraryPaths` -> `libraryPath` fallback), extends `usesCustomOrder` to `'folder'`, evaluates `isFolderViewActive` before `LibraryEmptyState` and `FilteredEmptyState`, gates `projectLibrarySections` in `useMemo` on `isFolderViewActive` and derives `projection` via `selectFolderTabProjection`, memoizes `renderItem` via `useCallback`, scopes `cardRefs` per placement with `resolveConnectedCardElement` (`el.isConnected && !el.closest('[inert]')`, `viewItems` stack `groupKey` fallback, and aligned `cardRefCallbacksRef` pruning), and mounts `ShelfTabs` (receiving `sections={projection.allFolderSections ?? []}`) and `FolderAccordion` without regressing flat sort modes.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/FolderAccordion.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderAccordion.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck
```
