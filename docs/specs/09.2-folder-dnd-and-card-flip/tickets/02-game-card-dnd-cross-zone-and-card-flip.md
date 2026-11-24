# 02 — Multi-Container Game/Stack Card DnD & Non-Drag Layout FLIP ($B$)

## Epic
[Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## Status
ready-for-agent

## Blocked by
- [01 — Shelf Tabs Horizontal Drag-and-Drop Reordering ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/01-shelf-tabs-horizontal-dnd-reorder.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `GameCard.tsx`, `StackCard.tsx`, `useCardMenu.ts` (including right-click context menus), `ShelfTabs.tsx`, and `LibraryGrid.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement connected multi-container drag-and-drop for both single `GameCard` and multi-instance `StackCard` items using `@dnd-kit`, and restore pre-310 non-drag card FLIP animation:

- [ ] 1. **[NEW]** [`src/renderer/dnd/GameDndContext.tsx`](file:///d:/Projects/YumeShelf/src/renderer/dnd/GameDndContext.tsx), **[NEW]** [`src/renderer/components/SortableGameCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableGameCard.tsx), & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **@dnd-kit Multi-Container Card Architecture**:
  - Mount `GameDndContext.tsx` in `LibraryGrid.tsx` strictly as a **sibling below `ShelfTabs.tsx`** (never wrapping `ShelfTabs.tsx` inside `GameDndContext`, preventing nested `DndContext` sensor contention).
  - Render sortable card wrappers (`SortableGameCard.tsx`) using `useSortable({ id })` around both `GameCard.tsx` (keyed by `game.gameKey`) and `StackCard.tsx` (keyed by `stack.primaryGame.gameKey`), preserving `forwardRef`, `useCardMenu.ts` right-click context menu behavior, and existing card CSS classes.
  - For `StackCard` cross-zone drops (into/out of Favorites), resolve all sibling keys via `getGroupedKeysForGame(item)` and dispatch `toggleFavorite` deterministically with the same optimistic update and rollback invariant as single cards, recording the canonical key in `customOrder`.
  - Render `<DragOverlay>` preview styled with `var(--zIndex-card-drag, 1650)`.
- [ ] 2. **[NEW]** [`src/renderer/dnd/card-drop-validator.ts`](file:///d:/Projects/YumeShelf/src/renderer/dnd/card-drop-validator.ts) — **5-Scenario Drop Permission Matrix**:
  - Implement pure `validateGameCardDrop(context: { sourceContainerId: string; targetContainerId: string; game: GameEntry; currentSort: string; favorites: readonly GameEntry[]; targetPlatform?: PlatformInput; }): boolean`:
    1. **Same-container reordering**: always allowed (`targetContainerId === sourceContainerId`).
    2. **Folder sort -> Drag into Favorites**: allowed strictly if game is not already in favorites; triggers `toggleFavorite(gameKey, true)` (dual placement).
    3. **Folder sort -> Drag out of Favorites**: allowed strictly into owning root folder (`isSubsumedBy(game.folderPath, targetRootPath, targetPlatform)`); triggers `toggleFavorite(gameKey, false)` (unfavorites, retains folder placement).
    4. **Cross-folder drops**: dragging directly between two different folder sections is strictly rejected.
    5. **Flat sort modes** (`date`, `played`, `az`, `custom`): cross-zone drag between favorites and non-favorites is unconditionally allowed, toggling favorite state and auto-switching to `custom` sort.
  - Persist `customOrder` via `writeCustomOrder`; roll back order and favorite state with `useLocaleStrings().toast_favorite_update_failed` on IPC failure.
- [ ] 3. **[NEW]** [`src/renderer/hooks/useCardLayoutFlip.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useCardLayoutFlip.ts) & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Non-Drag Card Layout FLIP Animation (Favorite Toggle & Sort Parity)**:
  - Implement `useCardLayoutFlip` using `useLayoutEffect` + Web Animations API (`element.animate`, 260ms, `cubic-bezier(0.22, 1, 0.36, 1)`) to restore pre-310 smooth card repositioning when toggling favorites via `.fav-btn` or switching sort modes.
  - Strictly suppress FLIP while a `@dnd-kit` drag session is active (`isDragging === true`), when `prefers-reduced-motion: reduce` matches, or when deltas are `< 1px`.
  - Scope coordinate keys by mode: use `gameKey` in flat sort modes (gliding smoothly between `#fav-grid` and `#unfav-grid`), and container-scoped `${sectionId}:${gameKey}` in `'folder'` sort (preventing cross-section coordinate collisions under dual placement).
- [ ] 4. **[NEW]** [`src/renderer/dnd/game-card-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/dnd/game-card-dnd.test.tsx) & **[NEW]** [`src/renderer/hooks/useCardLayoutFlip.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useCardLayoutFlip.test.tsx) — **Vitest Unit & Integration Tests**:
  - Verify 5-scenario drop matrix, `GameCard` and `StackCard` cross-zone drag + rollback, sibling `DndContext` isolation, and `useCardLayoutFlip` animation/suppression/container-scoping invariants.

## Acceptance Criteria
- [ ] Both `GameCard` and `StackCard` reorder within containers and drag across Favorites using `@dnd-kit`, with `ShelfTabs` mounted as a sibling outside `GameDndContext`.
- [ ] Cross-folder drops between different folder sections are strictly rejected, and failed `toggleFavorite` calls roll back order and favorite state with `toast_favorite_update_failed`.
- [ ] Non-drag favorite toggles and sort changes smoothly animate repositioned cards via `useCardLayoutFlip.ts` (suppressed when `isDragging === true` or `prefers-reduced-motion: reduce`, container-scoped in `'folder'` sort).
- [ ] Existing `GameCard.test.tsx`, `StackCard.test.tsx`, and `LibraryGrid.test.tsx` pass with zero regression to right-click menus or card styling.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/dnd/game-card-dnd.test.tsx src/renderer/hooks/useCardLayoutFlip.test.tsx src/renderer/components/GameCard.test.tsx src/renderer/components/StackCard.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/dnd/game-card-dnd.test.tsx src/renderer/hooks/useCardLayoutFlip.test.tsx src/renderer/components/GameCard.test.tsx src/renderer/components/StackCard.test.tsx && npm run typecheck
```
