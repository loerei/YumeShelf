# 02 — Frontend Tech Debt Cleanup & Dual-FLIP Animation Purge ($S$)

## Epic
[Epic 08: React Migration & Renderer Reconstruction](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Completely excise legacy frontend drag-and-drop math, eliminate dual competing FLIP animation implementations, and purge native HTML5 drag event handlers across all card and search modules:

1. **Delete Obsolete Files**:
   - Delete [`src/renderer/utils/drag-math.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/drag-math.ts) (bounding box math, pointer distance, and row tolerance calculations).
   - Delete [`src/renderer/utils/flip-animation.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/flip-animation.ts) (manual imperative CSS FLIP animation runner).
   - If any top-level alias `src/renderer/drag-math.ts` or `src/renderer/flip-animation.ts` exists, ensure it is removed.

2. **Purge Second Competing FLIP Engine in `library-grid.ts`**:
   - In [`src/renderer/library-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts#L24-L69):
     - Delete `captureCardRects` and `animateReorderedCards` (the secondary Web Animations API FLIP engine).
     - Remove the `requestAnimationFrame` block calling `animateReorderedCards` ([L146-L148](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts#L146-L148)), terminating the race condition between CSS transitions and element animation.

3. **Purge HTML5 Drag Listeners & Draggable Attributes**:
   - In [`src/renderer/game-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards.ts):
     - Remove `card.draggable = draggable;` assignment.
     - Remove the entire `if (draggable) { ... }` block binding `ondragstart`, `ondragend`, `ondragenter`, `ondragleave`, `ondragover`, and `ondrop`.
     - Remove `favoriteButton.draggable = false;`.
     - Remove unused `draggable` property from `options`.
   - In [`src/renderer/stack-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/stack-cards.ts):
     - Remove `card.draggable = draggable;` assignment.
     - Remove `if (draggable) { ... }` block binding `ondragstart`, `ondragend`, `ondragenter`, etc.
     - Remove `favoriteButton.draggable = false;`.
     - Remove `suppressNextClick` click-suppression hack.
   - In [`src/renderer/library-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts):
     - Remove `const itemOptions = { draggable: !activeCategoryId };` (replace with `{}` or relevant view options).
   - In [`src/renderer/search.ts`](file:///d:/Projects/YumeShelf/src/renderer/search.ts#L128-L138):
     - Remove `item.draggable = !getActiveCategoryId();` and strip native `ondragstart` / `ondragend` listeners from search results.
   - In [`src/renderer/drag-drop-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/drag-drop-grid.ts):
     - Remove imports of `./utils/drag-math` and `./utils/flip-animation`.
     - Strip `zone.ondragover` loop executing `getBoundingClientRect()` on all cards on mousemove.
     - Strip direct inline `card.style.transform = 'translateX(25px)'` style mutations.
     - Decommission legacy HTML5 drag coordinator into safe stub awaiting Epic 09 `@dnd-kit`.

4. **Vitest Unit Tests**:
   - Author tests in `src/renderer/game-cards-cleanup.test.ts` verifying that `createCard`, `createStackCard`, and search item renderers produce elements without `draggable` attributes or attached drag event listeners, while maintaining click, double-click launch, and context menu behaviors.

## Blocked by
- [01 — Build & Tooling Setup for React & Testing Library ($S$)](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/tickets/01-build-and-tooling-setup.md)

## Status
todo

## Target Files

### [DELETE] [`src/renderer/utils/drag-math.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/drag-math.ts)
- Permanently delete file.

### [DELETE] [`src/renderer/utils/flip-animation.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/flip-animation.ts)
- Permanently delete file.

### [MODIFY] [`src/renderer/library-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts)
- Delete `captureCardRects` and `animateReorderedCards`.
- Strip `itemOptions.draggable` propagation.

### [MODIFY] [`src/renderer/game-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards.ts)
- Strip `card.draggable = draggable;`.
- Strip `card.ondragstart`, `card.ondragend`, `card.ondragenter`, `card.ondragleave`, `card.ondragover`, and `card.ondrop`.
- Strip `favoriteButton.draggable = false;`.

### [MODIFY] [`src/renderer/stack-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/stack-cards.ts)
- Strip `card.draggable = draggable;`.
- Strip `card.ondragstart`, `card.ondragend`, `card.ondragenter`, etc.
- Strip `favoriteButton.draggable = false;`.
- Remove `suppressNextClick` hack.

### [MODIFY] [`src/renderer/search.ts`](file:///d:/Projects/YumeShelf/src/renderer/search.ts)
- Strip `item.draggable` and attached `ondragstart` / `ondragend` handlers.

### [MODIFY] [`src/renderer/drag-drop-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/drag-drop-grid.ts)
- Remove imports of `drag-math` and `flip-animation`.
- Strip layout-thrashing `getBoundingClientRect()` loops and inline transform styles.

### [NEW] [`src/renderer/game-cards-cleanup.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards-cleanup.test.ts)
- Unit tests asserting cards and search items do not have `draggable="true"` or native drag listeners attached.

## Acceptance Criteria
- [ ] Strip drag-math and flip-animation imports and module dependencies from `src/renderer/drag-drop-grid.ts`.
- [ ] Remove all `getBoundingClientRect()` layout-thrashing loops and inline transform style mutations in `src/renderer/drag-drop-grid.ts`.
- [ ] Stub legacy drag coordinator as a safe no-op with clear TODO referencing Epic 09 (@dnd-kit).
- [ ] Permanently delete `src/renderer/utils/drag-math.ts` and `src/renderer/utils/flip-animation.ts`.
- [ ] Delete secondary Web Animations API FLIP engine in `library-grid.ts` (`captureCardRects`, `animateReorderedCards`).
- [ ] Remove native HTML5 drag event listeners and `draggable` attributes from `src/renderer/game-cards.ts`.
- [ ] Remove native HTML5 drag event listeners, `draggable` attributes, and `suppressNextClick` hack from `src/renderer/stack-cards.ts`.
- [ ] Remove `item.draggable` and native `ondragstart`/`ondragend` listeners from search result items in `src/renderer/search.ts`.
- [ ] Execute automated verification `npm run test:vitest -- src/renderer/game-cards-cleanup.test.ts`.
- [ ] Unit tests in `src/renderer/game-cards-cleanup.test.ts` pass verifying clean card and search item markup.
- [ ] Verify `npm run typecheck` and `npm run test:vitest` pass cleanly with zero broken imports.

## Verification Command
```bash
npm run test:vitest -- src/renderer/game-cards-cleanup.test.ts && npm run typecheck
```
