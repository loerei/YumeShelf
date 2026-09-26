# 03 — React Root Mounting & Reactive State Bridge ($S$)

## Epic
[Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Establish the React 19 component tree root and build the reactive state bridge connecting YumeShelf's runtime store (`ui-runtime-state.ts`) and Electron IPC to React:
1. **React Root Container**:
   - Update [`src/index.html`](file:///d:/Projects/YumeShelf/src/index.html) to provide `#react-root` mounting container while keeping existing window titlebar and layout containers intact.
   - Implement entrypoint [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) and mount via `createRoot` in [`src/renderer/index.tsx`](file:///d:/Projects/YumeShelf/src/renderer/index.tsx) (or bootstrap module).
2. **Reactive State Bridge**:
   - Implement `LibraryStateContext` and `<LibraryStateProvider>` in [`src/renderer/context/LibraryStateContext.tsx`](file:///d:/Projects/YumeShelf/src/renderer/context/LibraryStateContext.tsx):
     - Wrap [`src/renderer/state/ui-runtime-state.ts`](file:///d:/Projects/YumeShelf/src/renderer/state/ui-runtime-state.ts) using `useSyncExternalStore` (or state listener subscription) to expose reactive state: `allGames`, `categoryTree`, `activeCategoryId`, `currentLibraryConfig`, and `currentSort`.
     - Expose action dispatchers: `setAllGames`, `setActiveCategoryId`, `setCurrentSort`, `updateLibraryConfig`.
     - Wire Electron IPC listeners (e.g. `electronAPI.onLibraryUpdated`, `electronAPI.onConfigUpdated`) to automatically synchronize the reactive React state without manual DOM queries.
   - Implement custom hook `useLibraryState()` in [`src/renderer/hooks/useLibraryState.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useLibraryState.ts) for simple, declarative consumption across all downstream React components.
3. **Vitest Unit Tests**:
   - Author tests in `src/renderer/context/LibraryStateContext.test.tsx` verifying:
     - Component subscribing to `useLibraryState` re-renders when runtime state changes.
     - IPC event dispatch updates reactive state seamlessly.
     - Clean subscriber detachment on unmount with zero memory leaks.

## Blocked by
- [01 — Build & Tooling Setup for React & Testing Library ($S$)](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/tickets/01-build-and-tooling-setup.md)
- [02 — Frontend Tech Debt Cleanup & HTML5 Drag Purge ($S$)](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/tickets/02-frontend-tech-debt-cleanup.md)

## Status
todo

## Target Files

### [MODIFY] [`src/index.html`](file:///d:/Projects/YumeShelf/src/index.html)
- Add `<div id="react-root"></div>` for React component mounting.

### [NEW] [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx)
- Top-level application component wrapping the component tree in `LibraryStateProvider`.

### [NEW] [`src/renderer/context/LibraryStateContext.tsx`](file:///d:/Projects/YumeShelf/src/renderer/context/LibraryStateContext.tsx)
- React Context and Provider implementing reactive bridge to `ui-runtime-state.ts` and Electron IPC events.

### [NEW] [`src/renderer/hooks/useLibraryState.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useLibraryState.ts)
- Custom hook exposing reactive library state and action handlers.

### [NEW] [`src/renderer/context/LibraryStateContext.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/context/LibraryStateContext.test.tsx)
- Vitest tests verifying state bridge reactivity, IPC synchronization, and teardown hygiene.

## Acceptance Criteria
- [ ] React root mounts successfully into `#react-root` without breaking window controls or layout.
- [ ] `LibraryStateProvider` correctly bridges `ui-runtime-state.ts` state changes into React Virtual DOM.
- [ ] `useLibraryState()` exposes current games, categories, active category, and sort mode.
- [ ] IPC event subscriptions are safely attached on mount and cleanly unsubscribed on unmount.
- [ ] Vitest unit tests in `LibraryStateContext.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/context/LibraryStateContext.test.tsx && npm run typecheck
```
