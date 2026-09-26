# 04 — Declarative React Game Cards & Library Grid ($B$)

## Epic
[Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Migrate the flat library grid rendering and game card generation from imperative DOM factories (`game-cards.ts`, `library-grid.ts`) to declarative React components:
1. **Declarative Game Card Component (`GameCard.tsx`)**:
   - Implement [`src/renderer/components/GameCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/GameCard.tsx):
     - Props: `game: GameEntry`, `launchMode?: 'single' | 'double'`, `showDuplicateChip?: boolean`, `showPath?: boolean`, `onToggleFavorite?: (game: GameEntry) => void`, `onLaunch?: (game: GameEntry) => void`, `onMenuAction?: (action: string, game: GameEntry) => void`.
     - Render card structure:
       - Star favorite toggle button (`.fav-btn`) reflecting `game.favorite`.
       - Menu trigger button (`.menu-btn`) and dropdown menu (`.dropdown-menu`) for rename, reveal, save editor, and addons.
       - Game icon thumbnail with lazy loading and cached data URL.
       - Title, duplicate chip, and path metadata.
     - Single/double click launch handling honoring `launchMode`.
     - Completely free of HTML5 `draggable` attributes and drag event listeners.
   - Implement [`src/renderer/components/StackCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/StackCard.tsx) for multi-instance game stacks with instance badges.
2. **Declarative Library Grid Component (`LibraryGrid.tsx`)**:
   - Implement [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx):
     - Consumes `useLibraryState()` for `allGames`, `activeCategoryId`, and `currentSort`.
     - Uses [`buildLibraryViewItems`](file:///d:/Projects/YumeShelf/src/renderer/library-stacks.ts) to partition visible games into `favorites` and `nonFavorites` for flat sort modes (`date`, `played`, `az`, `custom`).
     - Declarative grid rendering:
       - `#fav-grid` container for favorited games.
       - `#library-separator` rendered when both favorites and non-favorites exist.
       - `#unfav-grid` container for non-favorited games.
     - Empty states:
       - Renders `<LibraryEmptyState />` when library has 0 games.
       - Renders `<FilteredEmptyState />` when active category filter yields 0 matches.
3. **Vitest & Testing Library Verification**:
   - Component tests in `src/renderer/components/GameCard.test.tsx`:
     - Verifies favorite toggle triggers `onToggleFavorite`.
     - Verifies click/double-click triggers `onLaunch`.
     - Verifies menu interactions.
   - Component tests in `src/renderer/components/LibraryGrid.test.tsx`:
     - Verifies partition between favorites and non-favorites.
     - Verifies category filtering filters the rendered card list.
     - Verifies empty state displays when game list is empty.

## Blocked by
- [03 — React Root Mounting & Reactive State Bridge ($S$)](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/tickets/03-react-root-and-state-bridge.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/components/GameCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/GameCard.tsx)
- Declarative React component for single game cards.

### [NEW] [`src/renderer/components/StackCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/StackCard.tsx)
- Declarative React component for multi-instance game stack cards.

### [NEW] [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx)
- Declarative React component managing flat library grid layout, favorites section, and category filtering.

### [NEW] [`src/renderer/components/LibraryEmptyState.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryEmptyState.tsx)
- Empty state components for empty library and filtered empty state.

### [NEW] [`src/renderer/components/GameCard.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/GameCard.test.tsx)
- Vitest component tests for `GameCard`.

### [NEW] [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx)
- Vitest component tests for `LibraryGrid`.

## Acceptance Criteria
- [ ] `GameCard.tsx` renders game cards declaratively without imperative DOM creation or HTML5 drag attributes.
- [ ] `LibraryGrid.tsx` renders flat sort modes (`date`, `played`, `az`, `custom`) cleanly in React Virtual DOM.
- [ ] Clicking favorite star toggles favorite state via reactive bridge.
- [ ] Empty state and filtered category empty states render properly.
- [ ] All `@testing-library/react` tests in `GameCard.test.tsx` and `LibraryGrid.test.tsx` pass.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/GameCard.test.tsx src/renderer/components/LibraryGrid.test.tsx && npm run typecheck
```
