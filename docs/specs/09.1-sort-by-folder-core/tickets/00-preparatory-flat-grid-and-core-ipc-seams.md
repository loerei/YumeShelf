# 00 — Preparatory Refactoring: Flat Grid Seam, Core IPC Contracts & Canonical Sort ($S$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 07: Storage Schema Migration & Domain Core](file:///d:/Projects/YumeShelf/docs/specs/07-storage-schema-migration-and-domain-core/PRD.md)
- [Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to Build
> **Scope Guard:** Implement only structural seams and type hardening specified below; preserve initial intended UXUI and all unmentioned existing behaviors across `LibraryGrid.tsx` and existing sort modes (`date`, `played`, `az`, `custom`). Do NOT introduce folder-sort UI behavior, touch `SettingsModal.tsx`, or install `@dnd-kit` in this ticket.

Establish clean preparatory seams (`$S$`) on `LibraryGrid.tsx`, IPC contracts, and sort option validation before building folder-sort features:

- [x] 1. **[NEW]** [`src/renderer/components/FlatLibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FlatLibraryGrid.tsx) & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Extract Flat-Sort Grid View from `LibraryGrid.tsx`**:
  - Extract the existing flat-sort rendering branch (`date`, `played`, `az`, `custom` favorites + all-games sections, empty states, and card rendering) from `LibraryGrid.tsx` into `FlatLibraryGrid.tsx`.
  - Keep `LibraryGrid.tsx` as a thin sort-mode coordinator owning shared subscriptions (`useLibraryState`) and delegating rendering by mode.
- [x] 2. **[NEW]** [`src/shared/types/game.ts`](file:///d:/Projects/YumeShelf/src/shared/types/game.ts), **[MODIFY]** [`src/renderer/types/game.ts`](file:///d:/Projects/YumeShelf/src/renderer/types/game.ts), **[MODIFY]** [`src/shared/types/ipc.d.ts`](file:///d:/Projects/YumeShelf/src/shared/types/ipc.d.ts), & **[MODIFY]** [`src/renderer/state/ui-runtime-state.ts`](file:///d:/Projects/YumeShelf/src/renderer/state/ui-runtime-state.ts) — **Harden Epic 09.1 IPC Contracts & Canonical Sort Set**:
  - Move the canonical `GameEntry`, `LibraryPathConfig`, `LibraryPathsInput`, and `LibraryConfig` interfaces from `src/renderer/types/game.ts` into `src/shared/types/game.ts`, and re-export them from `src/renderer/types/game.ts` (`export type { GameEntry, LibraryPathConfig, LibraryPathsInput, LibraryConfig } from '../../shared/types/game';`) so all existing `src/renderer/**` imports remain unchanged and `shared` never imports from `renderer`.
  - In `src/shared/types/ipc.d.ts`, import `import type { GameEntry, LibraryConfig } from './game.js';` (explicit `.js` extension required by `tsconfig.main.json`'s `moduleResolution: "NodeNext"`, which also resolves to `./game.ts` under `tsconfig.json`'s `bundler` mode, Vite, and Vitest) and replace `any` on the 3 `ElectronAPI` methods consumed by Epic 09.1 with concrete types:
    - `getGames: () => Promise<GameEntry[]>;`
    - `setFolderAlias: (folderPath: string, alias: string) => Promise<{ ok: boolean; config?: LibraryConfig; error?: string }>;`
    - `addManualGame(data?: { folderPath?: string } | string): Promise<{ ok: boolean; game?: GameEntry; canceled?: boolean; error?: string }>;`
  - Add `'folder'` to `CANONICAL_SORT_OPTIONS` in `src/renderer/state/ui-runtime-state.ts` so `setCurrentSort('folder')` and persisted sort restoration accept `'folder'` without falling back to a flat sort mode.
- [x] 3. **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx) & **[MODIFY]** [`src/renderer/state/ui-runtime-state.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/state/ui-runtime-state.test.ts) — **Regression & Seam Verification Tests**:
  - Verify `LibraryGrid.test.tsx` passes 100% after extraction with zero visual or behavioral regression.
  - Verify `CANONICAL_SORT_OPTIONS` accepts `'folder'` and `setCurrentSort('folder')` persists/restores cleanly through `UiStorageAdapter`.

## Acceptance Criteria
- [x] `FlatLibraryGrid.tsx` encapsulates existing flat-sort rendering and `LibraryGrid.tsx` acts as a thin mode coordinator.
- [x] `GameEntry`, `LibraryPathConfig`, `LibraryPathsInput`, and `LibraryConfig` live in `src/shared/types/game.ts` and are re-exported from `src/renderer/types/game.ts`; `getGames`, `setFolderAlias`, and `addManualGame` in `src/shared/types/ipc.d.ts` import from `'./game.js'` and use concrete types with zero `any`.
- [x] `CANONICAL_SORT_OPTIONS` in `src/renderer/state/ui-runtime-state.ts` includes `'folder'`.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/LibraryGrid.test.tsx src/renderer/state/ui-runtime-state.test.ts && npm run typecheck && npx tsc -p tsconfig.main.json --noEmit`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/LibraryGrid.test.tsx src/renderer/state/ui-runtime-state.test.ts && npm run typecheck && npx tsc -p tsconfig.main.json --noEmit
```
