# 02 — Frontend Tech Debt Cleanup & HTML5 Drag Purge ($S$)

## Epic
[Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Completely excise legacy frontend drag-and-drop math and animation utilities and purge native HTML5 drag event handlers from card modules:
1. **Delete Obsolete Files**:
   - Delete [`src/renderer/utils/drag-math.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/drag-math.ts) (bounding box math, pointer distance, and row tolerance calculations).
   - Delete [`src/renderer/utils/flip-animation.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/flip-animation.ts) (manual imperative FLIP animation runner).
   - If any top-level alias `src/renderer/drag-math.ts` or `src/renderer/flip-animation.ts` exists, ensure it is removed.
2. **Purge HTML5 Drag Listeners & Draggable Attributes**:
   - In [`src/renderer/game-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards.ts):
     - Remove `card.draggable = draggable;` assignment.
     - Remove the entire `if (draggable) { ... }` block binding `ondragstart`, `ondragend`, `ondragenter`, `ondragleave`, `ondragover`, and `ondrop`.
     - Remove `favoriteButton.draggable = false;`.
     - Remove unused `draggable` property from `options`.
   - In [`src/renderer/stack-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/stack-cards.ts):
     - Remove `card.draggable = draggable;` assignment.
     - Remove `if (draggable) { ... }` block binding `ondragstart`, `ondragend`, `ondragenter`, etc.
     - Remove `favoriteButton.draggable = false;`.
   - In [`src/renderer/library-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts):
     - Remove `const itemOptions = { draggable: !activeCategoryId };` (replace with `{}` or relevant view options).
   - In [`src/renderer/search.ts`](file:///d:/Projects/YumeShelf/src/renderer/search.ts):
     - Remove `item.draggable = !getActiveCategoryId();` and corresponding dragstart handlers.
   - In [`src/renderer/drag-drop-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/drag-drop-grid.ts):
     - Remove imports of `./utils/drag-math` and `./utils/flip-animation`.
     - Decommission or stub the legacy imperatively driven HTML5 drag coordinator so that build and tests remain green while awaiting Epic 09 `@dnd-kit` integration.
3. **Vitest Unit Tests**:
   - Author tests in `src/renderer/game-cards-cleanup.test.ts` verifying that `createCard` and `createStackCard` produce card DOM elements without `draggable` attributes or attached drag event listeners, while maintaining click, double-click launch, and context menu behaviors.

## Blocked by
- [01 — Build & Tooling Setup for React & Testing Library ($S$)](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/tickets/01-build-and-tooling-setup.md)

## Status
todo

## Target Files

### [DELETE] [`src/renderer/utils/drag-math.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/drag-math.ts)
- Permanently delete file.

### [DELETE] [`src/renderer/utils/flip-animation.ts`](file:///d:/Projects/YumeShelf/src/renderer/utils/flip-animation.ts)
- Permanently delete file.

### [MODIFY] [`src/renderer/game-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards.ts)
- Strip `card.draggable = draggable;`.
- Strip `card.ondragstart`, `card.ondragend`, `card.ondragenter`, `card.ondragleave`, `card.ondragover`, and `card.ondrop`.
- Strip `favoriteButton.draggable = false;`.

### [MODIFY] [`src/renderer/stack-cards.ts`](file:///d:/Projects/YumeShelf/src/renderer/stack-cards.ts)
- Strip `card.draggable = draggable;`.
- Strip `card.ondragstart`, `card.ondragend`, `card.ondragenter`, etc.
- Strip `favoriteButton.draggable = false;`.

### [MODIFY] [`src/renderer/library-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/library-grid.ts)
- Strip `itemOptions.draggable` propagation.

### [MODIFY] [`src/renderer/drag-drop-grid.ts`](file:///d:/Projects/YumeShelf/src/renderer/drag-drop-grid.ts)
- Remove imports of `drag-math` and `flip-animation`.
- Replace imperative DOM FLIP calls with safe no-op or state update calls.

### [NEW] [`src/renderer/game-cards-cleanup.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/game-cards-cleanup.test.ts)
- Unit tests asserting cards do not have `draggable="true"` or native drag listeners attached.

## Acceptance Criteria
- [ ] `src/renderer/utils/drag-math.ts` deleted.
- [ ] `src/renderer/utils/flip-animation.ts` deleted.
- [ ] All native HTML5 drag event listeners and `draggable` attributes removed from `game-cards.ts` and `stack-cards.ts`.
- [ ] `drag-drop-grid.ts` has zero imports of deleted math or animation files.
- [ ] Unit tests in `src/renderer/game-cards-cleanup.test.ts` pass verifying clean card markup.
- [ ] `npm run typecheck` and `npm run test:vitest` pass with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/game-cards-cleanup.test.ts && npm run typecheck
```
