# PRD: Folder Drag-and-Drop Reordering & Card FLIP Animation (09.2)

- **Change Mode:** `BROWNFIELD`
- **Reviewed-At-Commit:** `e963d26e9c63865dc3f512c300c84df84b532ba7`
- **Upstream Prerequisite:** `docs/specs/09.1-sort-by-folder-core/`

## Problem Statement
After Epic 09.1 delivers core folder browsing, tabs, accordions, inline rename, and manual game addition, users still cannot reorder folder tabs, reorder game/stack cards across folders and Favorites via drag-and-drop, reorder library root paths in Settings, or see smooth card repositioning animations when toggling favorites or changing sort modes (a pre-310 UX regression from Epic 08).

## Solution
Layer `@dnd-kit` drag-and-drop reordering and non-drag layout FLIP animation cleanly on top of Epic 09.1's declarative components:
1. **Preparatory Seam & Dependencies (`00`)**: Install `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`; extract `SettingsLibraryTab.tsx` from `SettingsModal.tsx` (preserving `#hide-and-seek-select` and all other Settings controls); harden `updateLibraryConfig` in `ipc.d.ts`; add drag z-index tokens (`--zIndex-tab-drag: 500`, `--zIndex-card-drag: 1650`, `--zIndex-path-row-drag: 2100`) and 4-language drag locale keys.
2. **Shelf Tabs Horizontal Drag Reorder (`01`)**: Add `SortableTabItem.tsx` and wrap draggable folder tabs in `ShelfTabs.tsx` with horizontal `DndContext`/`SortableContext`, pinned-tab protection, `reorderLibraryPathsWithSubsumption`, and optimistic rollback.
3. **Multi-Container Game/Stack Card DnD (`02.1`)**: Mount `GameDndContext.tsx` strictly as a sibling outside `ShelfTabs`, and enforce the 5-scenario drop validation matrix (`card-drop-validator.ts`) for both `GameCard` and `StackCard` (`SortableGameCard.tsx`).
4. **Non-Drag Card Layout FLIP (`02.2`)**: Restore non-drag card FLIP animation (`useCardLayoutFlip.ts`) via `structuralLayoutRevision` in `LibraryGrid.tsx`, strictly suppressed during active drags and container-scoped in `'folder'` sort.
5. **Settings Library Paths Vertical Drag Reorder & Smoke Gate (`03`)**: Mount `PathReorderList.tsx` and `SortablePathRow.tsx` inside `SettingsLibraryTab.tsx`, synchronize folder order reactively with `LibraryGrid.tsx`, and run the terminal runtime smoke check.

## Dependency Lineage

```mermaid
flowchart TD
    E09.1["Epic 09.1: Sort by Folder Core<br/><b>PREREQUISITE (UPSTREAM)</b>"]
    --> E09.2["Epic 09.2: Folder DnD & Card FLIP<br/><b>CURRENT EPIC</b><br/>(@dnd-kit tabs/cards/settings paths + useCardLayoutFlip)"]
    --> E10["Epic 10: Frontend Tech Debt Hardening<br/><b>DOWNSTREAM DEPENDENT</b>"]
    --> E03["Epic 03: Virtual Nested Folders & Workspaces<br/><b>DOWNSTREAM DEPENDENT</b>"]
```

## Intentional Deltas
> **Default Preserve (`BROWNFIELD`):** All existing observable behavior, contracts, and `initial intended UXUI` (including all Epic 09.1 folder browsing, accordion collapse, inline rename, and manual add behaviors, existing flat sort modes, `GameCard`/`StackCard` styling and right-click menus `useCardMenu.ts`, and all other `SettingsModal.tsx` tabs and footer) default to **PRESERVE**; only deltas explicitly listed below may change.
- **`INTENTIONALLY_CHANGED`**:
  - Adding `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` to `package.json`.
  - Adding drag-overlay z-index tokens, horizontal tab drag, multi-container card drag, vertical Settings path drag (`PathReorderList`), and restoring pre-310 non-drag card FLIP animation (`useCardLayoutFlip.ts`).

## Testing Decisions
- Pure unit tests for `card-drop-validator.ts` (5-scenario matrix across Windows/Linux/macOS) and `useCardLayoutFlip.test.tsx` (`!isDragging`, `prefers-reduced-motion: reduce`, container-scoped keys).
- Component tests for `ShelfTabs`, `GameDndContext`, `PathReorderList`, `SettingsModal`, `GameCard`, and `StackCard` via Vitest + `@testing-library/react`.
- Terminal real-runtime smoke check in Electron dev mode (`npm start`) in Ticket `03`.

## Out of Scope
- Core folder projection, accordions, inline rename, and manual game addition (delivered in [Epic 09.1](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)).
- Remaining Settings tabs decomposition (`General`/`Updates`/`System`), `OverlayProvider` unification, and Save Editor / Mascot seams (handled in [Epic 10](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)).
- Virtual nested folders and spring-loaded drag-and-drop (deferred to [Epic 03](file:///d:/Projects/YumeShelf/docs/specs/03-virtual-nested-folders-and-workspaces/PRD.md)).

## Tickets
> **Critical Path:** `00 -> 01 -> 02.1 -> 02.2 -> 03`

- `00` — [Preparatory Refactoring: @dnd-kit Dependencies, Settings Library Tab & Drag Tokens](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/00-preparatory-dnd-deps-settings-tab-and-tokens.md)
- `01` — [Shelf Tabs Horizontal Drag-and-Drop Reordering](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/01-shelf-tabs-horizontal-dnd-reorder.md)
- `02.1` — [Multi-Container Game/Stack Card DnD](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/02.1-game-card-dnd-cross-zone.md)
- `02.2` — [Non-Drag Card Layout FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/02.2-non-drag-card-layout-flip.md)
- `03` — [Settings Library Paths Drag Reorder & Runtime Smoke Gate](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/tickets/03-settings-paths-dnd-reorder-and-smoke.md)
