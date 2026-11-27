# 04 — Wire Settings Mascot/Hide-and-Seek Sync, Retire Bridge & Runtime Smoke Gate ($B$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [03.2 — Restore Hide-and-Seek `<MascotCard />`, `LibraryGrid` & `SearchBar` Integration ($B$)](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/tickets/03.2-restore-hide-and-seek-card-and-search.md)

## What to Build
> **Scope Guard:** Implement only the Settings-to-`MascotProvider` synchronization, retirement of the transitional `App.tsx` mascot preference bridge, test updates, and terminal build/runtime smoke verification; preserve all other Settings controls and tabs.

Connect `#mascot-show-select`, `#hide-and-seek-select`, scale, sound, and volume controls in Settings directly to `MascotProvider`, retire the transitional `App.tsx` bridge, and execute the terminal build and runtime smoke check for Epic 11:

- [ ] 1. **Synchronize `SettingsModal.tsx` Mascot & Hide-and-Seek controls with `MascotProvider`**:
  - **Files:** **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx)
  - Consume `useOptionalMascot()` (falling back to `parseMascotPreferences(resolvedStorage)` when `useOptionalMascot()` is `null` so standalone callers/tests such as `src/renderer/components/modals/path-dnd.test.tsx` continue rendering cleanly without `<MascotProvider>` and whitespace-only storage values default cleanly, and wrapping standalone `resolvedStorage?.setItem(...)` fallback writes in `try/catch` with structured `console.warn('[SettingsModal] Failed to persist mascot setting:', { key, error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)), stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined })` via `SettingsModal.tsx`'s existing `sanitizeUserPaths` import at `L4` to match `MascotProvider` and `mascot-domain.ts` resilience against `QuotaExceededError` or restricted storage environments).
  - When `useOptionalMascot()` is non-null, read and update `show` (`#mascot-show-select`), `hideAndSeek` (`#hide-and-seek-select`, `'yeaaa'` / `'out'`), `scale`, `sound`, and `volume` directly via `MascotProvider` (passing only the changed field in `updatePreferences(patch)` or calling the specific setter so adjusting `scale` or `volume` never triggers redundant `hideAndSeek` session resets, while still invoking optional `onMascotSettingsChanged` for standalone callers/tests), so toggling `"YEAAA"` hides the corner `MascotWidget` and mounts `<MascotCard />` in `LibraryGrid` immediately without requiring an app restart.

- [ ] 2. **Retire transitional `App.tsx` Mascot bridge**:
  - **Files:** **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx)
  - Explicitly remove the transitional `const mascot = useMascot();` hook call inside `AppShell` and the `useMascot` import from `./providers/MascotProvider` alongside removing `onMascotSettingsChanged` (`L698`) and `type MascotPreferences` (`L13`) now that `SettingsModal.tsx` synchronizes directly with `MascotProvider`:
    ```ts
    // Before (introduced in Ticket 02 Step 2):
    import { MascotProvider, useMascot } from './providers/MascotProvider';
    // inside AppShell:
    const mascot = useMascot();
    // ...
    <SettingsModal ... onMascotSettingsChanged={mascot.updatePreferences} ... />

    // After (Ticket 04 Step 2):
    import { MascotProvider } from './providers/MascotProvider';
    // inside AppShell: zero useMascot() subscription; SettingsModal consumes useOptionalMascot() directly
    <SettingsModal ... />
    ```

- [ ] 3. **Update `SettingsModal.test.tsx` for standalone and `<MascotProvider>`-backed sync**:
  - **Files:** **[MODIFY]** [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx)
  - Retain the standalone `onMascotSettingsChanged` test (`L701-L726`), assert `console.warn('[SettingsModal] ...')` with sanitized error context when standalone `resolvedStorage.setItem` throws, wrap `renderSettingsModal` (`L152-L164`) / `Harness` (`L738-L758`) or dedicated integration tests in `<MascotProvider storage={storage}>`, and assert that changing `#mascot-show-select`, `#hide-and-seek-select` (`'yeaaa'` <-> `'out'`), `#mascot-scale-slider`, `#mascot-sound-select`, and `#mascot-volume-slider` immediately updates the live `MascotProvider` context state (`show`, `hideAndSeek`, `scale`, `sound`, `volume`) and `isWidgetVisible` / `isHideAndSeekCardActive` without requiring a remount or `onMascotSettingsChanged` bridge.

- [ ] 4. **Run full automated unit/integration suite, typecheck, and Vite renderer build**:
  - **Files:** **[VERIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx), [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx), [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx)
  - Execute `npm test && npm run typecheck && npm run build:vite`, and verify `AppShell` in `src/renderer/App.tsx` has no remaining `useMascot` reference.

- [ ] 5. **Execute terminal Electron real-runtime UI smoke gate (Epic 11)**:
  - **Files:** **[VERIFY]** [`docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md`](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)
  - Boot `npm start` and verify mascot dragging, bonking, SFX playback, context menu, and full Hide-and-Seek loop (Settings `"YEAAA"` -> hidden corner mascot -> `MascotCard` in grid/search -> bonk threshold -> mascot returns to corner) with zero console or CSP errors.

## Acceptance Criteria
- [ ] Changing `#mascot-show-select`, `#hide-and-seek-select`, scale, sound, or volume in Settings synchronizes `MascotWidget` and `<MascotCard />` immediately via `MascotProvider` (emitting path-sanitized `[SettingsModal]` `console.warn` diagnostics on standalone storage write failures), and `App.tsx` retains zero legacy `onMascotSettingsChanged` bridge state and zero `useMascot()` subscription in `AppShell`.
- [ ] Full `npm test && npm run typecheck && npm run build:vite` passes cleanly with zero `mascot-widget.ts` leftovers.
- [ ] Real-runtime smoke check passes with zero console/CSP errors.
- [ ] Execute automated verification command: `npm test && npm run typecheck && npm run build:vite`.

## Verification Command
```bash
npm test && npm run typecheck && npm run build:vite
```
