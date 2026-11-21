# 05 — @dnd-kit Game Card Drag-and-Drop & Favorites Cross-Zone Drop ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement connected multi-container drag-and-drop for game cards using `@dnd-kit`, supporting card reordering within folder sections and cross-zone drag-and-drop with the Favorites section:
- [ ] 1. **[NEW]** [`src/renderer/dnd/GameDndContext.tsx`](file:///d:/Projects/YumeShelf/src/renderer/dnd/GameDndContext.tsx), **[NEW]** [`src/renderer/components/SortableGameCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SortableGameCard.tsx), & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **@dnd-kit Drag Architecture**:
   - Establish multi-container `DndContext` in `LibraryGrid.tsx` or dedicated drag provider `GameDndContext.tsx`.
   - Render sortable card wrappers (`SortableGameCard.tsx`) using `useSortable({ id: gameKey })` around `GameCard.tsx`.
   - Provide `<DragOverlay>` to render a high-fidelity visual preview of the dragged game card during interactions, styled with elevated z-index (`--zIndex-card-drag: 1600`).
- [ ] 2. **[NEW]** [`src/renderer/dnd/card-drop-validator.ts`](file:///d:/Projects/YumeShelf/src/renderer/dnd/card-drop-validator.ts) — **Drop Permission Matrix & Validation Seam**:
   - Implement pure validator function `validateGameCardDrop(context: { sourceContainerId: string; targetContainerId: string; game: GameEntry; currentSort: string; favorites: GameEntry[]; targetPlatform?: PlatformInput; }): boolean`:
     1. **Same-container reordering**: always allowed (`targetContainerId === sourceContainerId`).
     2. **Folder sort -> Drag into Favorites**: allowed strictly if the game is not already present in the favorites collection. Upon successful drop, triggers `electronAPI.toggleFavorite(gameKey, true)` to establish dual placement.
     3. **Folder sort -> Drag out of Favorites**: allowed strictly if the target container is the owning root folder of the game (verified via `isSubsumedBy(game.folderPath, targetRootPath, targetPlatform)`). Upon drop, triggers `electronAPI.toggleFavorite(gameKey, false)` to remove from favorites while retaining folder placement.
     4. **Cross-folder drops**: dragging a game card directly between two different folder sections is strictly rejected.
     5. **Flat sort modes** (`date`, `played`, `az`, `custom`): cross-zone drag between favorites and non-favorites is unconditionally allowed, toggling favorite state and auto-switching to `custom` sort.
- [ ] 3. **Custom Order Persistence & Optimistic Updates**:
   - Calculate relative insertion into `customOrder` upon drop.
   - Optimistically update local state and persist to storage via `writeCustomOrder`.
   - If favorite state changed, invoke `electronAPI.toggleFavorite`. On error, roll back local order/favorite state and dispatch toast notification (`toast_favorite_update_failed`).
- [ ] 4. **[NEW]** [`src/renderer/hooks/useCardMenuAndRename.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useCardMenuAndRename.ts), **[MODIFY]** [`src/renderer/components/GameCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/GameCard.tsx), & **[MODIFY]** [`src/renderer/components/StackCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/StackCard.tsx) — **Shared Card Menu & Inline Rename Hook (SSOT)**:
   - Extract the duplicated menu-toggle/outside-click/`Escape` listener lifecycle, inline rename draft/focus/commit/cancel state, and forwarded card ref handler shared by `GameCard.tsx` and `StackCard.tsx` (~197 duplicated lines flagged in Epic 08 SonarCloud CPD) into `useCardMenuAndRename.ts`.
   - Consume `useCardMenuAndRename` in both `GameCard.tsx` and `StackCard.tsx` without changing existing DOM selectors, ARIA attributes, or test contracts.
- [ ] 5. **[NEW]** [`src/renderer/dnd/game-card-dnd.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/dnd/game-card-dnd.test.tsx) — **Vitest Unit & Integration Tests**:
   - Verify 5-scenario drop validation matrix, favorite toggle dispatch on cross-zone drops, cross-folder drop rejection, and custom order update and persistence.

## Blocked by
- [03 — Segmented Shelf Tabs Component with @dnd-kit ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/03-segmented-shelf-tabs-dnd-kit.md)
- [04 — Folder Accordions & Section Components ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Acceptance Criteria
- [ ] Game cards can be reordered within the same folder container using `@dnd-kit`.
- [ ] Dragging a game card into Favorites favorites the game and retains it in its folder section (dual placement).
- [ ] Dragging a game card out of Favorites unfavorites the game only when dropped into its owning folder.
- [ ] Cross-folder drops between different folder sections are strictly rejected.
- [ ] Reordered custom order persists deterministically to disk.
- [ ] Shared card menu and inline rename logic lives in `useCardMenuAndRename.ts` with `GameCard.test.tsx` and `StackCard.test.tsx` passing.
- [ ] Unit tests in `game-card-dnd.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/dnd/game-card-dnd.test.tsx src/renderer/components/GameCard.test.tsx src/renderer/components/StackCard.test.tsx && npm run typecheck
```
