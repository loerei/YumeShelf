# 02 — Pure React `MascotWidget`, Context Menu & Legacy Decommissioning ($B$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [01 — Mascot Domain Core, Shuffled Decks & `MascotProvider` ($S$)](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/tickets/01-mascot-domain-and-provider.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI (drag physics, boundary clamping, `smug`/`bonked`/`bonkedTooMuch` expressions, sound/volume/scale controls, and `src/styles/mascot.css` classes/IDs). Do NOT modify `LibraryGrid.tsx` or `SettingsModal.tsx` in this ticket.

Replace imperative `src/renderer/mascot-widget.ts` with pure declarative React 19 inside `MascotWidget.tsx`, mount `MascotProvider` in `App.tsx`, wire `SearchBar.tsx` to `MascotProvider`, migrate existing tests, and decommission `mascot-widget.ts` / `mascot-widget.test.ts`:

- [x] 1. **Migrate `MascotWidget.tsx` to pure React 19 consuming `MascotProvider`**:
  - **Files:** **[MODIFY]** [`src/renderer/components/MascotWidget.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.tsx) *(Replaces: [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts))*
  - Consume `useOptionalMascot()` (falling back safely when rendered standalone in isolated tests), resolve `const resolvedStorage = storage ?? mascot?.storage;`, and pass `resolvedStorage` to `useLocaleStrings(resolvedStorage)` so zero ambient `Storage.prototype` reads occur.
  - Delegate all bonks, recovery state (`expression`), audio, and `BONK.png` impact particle spawning to `MascotProvider.bonk(...)` (`<BonkImpactLayer />` — do NOT duplicate local click-streak/cooldown/recovery timers or local impact particle state inside `MascotWidget.tsx`). Pass head-center coordinates (`rect.left + rect.width / 2`, `rect.top + rect.height * 0.28`, `renderedHeight: rect.height || 260`) on `Enter`/`Space` keydown bonks, ignoring auto-repeat (`if (e.repeat) return;`) and active pointer drag (`if (isDraggingRef.current) return;`).
  - Keep `#mascot-widget-container` mounted and toggle `.hidden` on `button.yume-mascot-widget` based on `isWidgetVisible` (closing `#mascot-context-menu` when hidden) to preserve `src/styles/mascot.css` (`.yume-mascot-widget.hidden`) and existing DOM assertions.
  - Implement declarative pointer drag-to-reposition using `yumeshelf_mascot_x` and `yumeshelf_mascot_y` (never `yumeshelf_mascot_pos`): cache `{ width, height }` on `pointerdown`, guard `setPointerCapture`/`releasePointerCapture` with `typeof el.setPointerCapture === 'function'` + `try/catch` (emitting structured `console.warn('[MascotWidget] ...', { error: sanitizeUserPaths(...), stack: ... })` on `setPointerCapture` failure while keeping best-effort `releasePointerCapture` teardown exempt), call `interruptRecoveryForDrag()` on drag start and `finishDrag()` on drop/unmount/visibility loss (also clearing local `isPointerDown` and `isDragging` refs/state on visibility loss so stale pointer-down state cannot persist if `pointerup` occurs while hidden), handle `onPointerCancel` via `finishDrag()` without triggering `bonk()`, persist/clear coordinates exclusively on drop (`pointerup`), `Reset Position`, or scale/resize clamping (never on `pointermove`) inside `try/catch` blocks emitting structured `console.warn('[MascotWidget] Failed to persist mascot position:', { key, error: sanitizeUserPaths(...), stack: ... })` via `sanitizeUserPaths` from `../../shared/path-sanitizer` so `QuotaExceededError` or restricted storage neither crashes pointer/resize handlers nor fails silently, guard `resize`/`scale` clamping with `if (!isWidgetVisible) return;`, and run a `useLayoutEffect` clamp when `isWidgetVisible` becomes `true` while saved `(posX, posY)` is active.
  - Render `#mascot-context-menu` (`display: flex | none` with `aria-hidden={!isMenuOpen}`) with controlled `value={sound}` on `#mascot-menu-sound-select`, `Scale`, `Volume`, and `Reset Position`; clamp menu coordinates inside `useLayoutEffect` against `window.innerWidth - 10` / `window.innerHeight - 10` with `250x180` fallback dimensions when `getBoundingClientRect()` returns `0x0` in `happy-dom`; replace `stopPropagation()` with parent target filtering (`closest(...)`); return focus to `widgetRef.current` (guarded on `isWidgetVisible`) when closing via `Escape` or `#mascot-menu-reset-btn` while focus is inside `#mascot-context-menu`; and run the 4-`Image()` preload inside `useEffect` on mount (never at module top level).

- [x] 2. **Mount `MascotProvider` in `App.tsx` with transitional Settings bridge**:
  - **Files:** **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx)
  - Mount `<MascotProvider storage={effectiveStorage}>` inside `App()` (`L810-L828`) wrapping `<AppShell />` alongside `NotificationProvider` / `OverlayProvider` (covering `Header`, `LibraryGrid`, `MascotWidget`, and `SettingsModal`).
  - Inside `AppShell`, update `<MascotWidget {...mascotPreferences} storage={storage} />` (`L690`) to `<MascotWidget />` consuming `MascotProvider`, delete the unused `mascotPreferences` `useState` (`L103-L112`), and temporarily bridge `<SettingsModal onMascotSettingsChanged={mascot.updatePreferences} />` (`L698`, retaining `type MascotPreferences` import at `L13` until Ticket `04`) so Settings -> `MascotWidget` reactivity stays live across Tickets `02`–`03.2`.

- [x] 3. **Replace `CustomEvent` bus in `SearchBar.tsx` with `useOptionalMascotSearch()`**:
  - **Files:** **[MODIFY]** [`src/renderer/components/SearchBar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.tsx)
  - Remove `window.addEventListener('yumeshelf:mascot-bonk' | 'yumeshelf:mascot-recover')` and consume `useOptionalMascotSearch()` from `MascotProvider` for bonk quote placeholder override and recovery reset.

- [x] 4. **Migrate `MascotWidget.test.tsx` to pure React 19 + `MascotProvider`**:
  - **Files:** **[MODIFY]** [`src/renderer/components/MascotWidget.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.test.tsx)
  - Remove the `../mascot-widget` import and `createMascotWidget` spy (`L6, L69`), update all 4 existing tests (`L48-L151`) to render inside `<MascotProvider storage={adapter}>` (driving `show`/`scale`/`sound`/`volume` via `MascotProvider` controls/context instead of prop overrides), include a standalone `<MascotWidget storage={adapter} />` smoke test (rendered without `<MascotProvider>`) verifying safe fallback rendering and bonk handling, and port all behavioral assertions from [`src/renderer/mascot-widget.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.test.ts) (`L65-L202`): mount-time `useEffect` 4-`Image()` preload (`0` before mount, `4` after), zero-ambient-`Storage.prototype` calls, drag clamping with cached `pointerdown` rect, `pointermove` during an active drag updating rendered position without calling `storage.setItem('yumeshelf_mascot_x' | 'yumeshelf_mascot_y', ...)` until `pointerup`, opening `#mascot-context-menu` near the bottom-right viewport edge when `getBoundingClientRect()` returns `0x0` (default `happy-dom` behavior) clamping menu `left`/`top` using the `250x180` fallback against `window.innerWidth - 10` / `window.innerHeight - 10`, closing `#mascot-context-menu` via `Escape` or `#mascot-menu-reset-btn` while focus is inside the menu returning `document.activeElement` to `button.yume-mascot-widget` when `isWidgetVisible === true` (and not stealing focus when `isWidgetVisible === false`), `window` `resize` and `#mascot-menu-scale-slider` re-clamping, `onPointerCancel` restoring `'smug'` without incrementing `yumeshelf_mascot_bonk_count`, `Reset Position` clearing `yumeshelf_mascot_x`/`yumeshelf_mascot_y`, storage/pointer-capture exceptions emitting `[MascotWidget]` `console.warn` diagnostics with sanitized error context without crashing, `Space` + `e.repeat` keydown guard, bonk recovery, unmount listener cleanup, and post-unmount `#mascot-menu-reset-btn` no-op persistence.

- [x] 5. **Migrate `SearchBar.test.tsx` from `CustomEvent` dispatches to `MascotProvider`**:
  - **Files:** **[MODIFY]** [`src/renderer/components/SearchBar.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.test.tsx)
  - Replace `window.dispatchEvent(new CustomEvent('yumeshelf:mascot-bonk' | 'yumeshelf:mascot-recover'))` (`L328-L355`) with `<MascotProvider>` state transitions verifying both bonk quote placeholder override and post-recovery placeholder reset.

- [x] 6. **Wrap direct `<AppShell />` test harness in `entrypoint-cutover.test.tsx`**:
  - **Files:** **[MODIFY]** [`src/renderer/entrypoint-cutover.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/entrypoint-cutover.test.tsx)
  - Wrap the direct `<AppShell />` harness (`L333-L345`) in `<MascotProvider storage={...}>` mirroring the root provider stack in `App()`.

- [x] 7. **Decommission imperative `mascot-widget.ts` and `mascot-widget.test.ts`**:
  - **Files:** **[DELETE]** [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts), **[DELETE]** [`src/renderer/mascot-widget.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.test.ts)
  - Delete both files strictly after steps 1–6 leave zero remaining imports or `yumeshelf:mascot-*` `CustomEvent` references.

- [x] 8. **Run automated unit/integration tests and typecheck**:
  - **Files:** **[VERIFY]** [`src/renderer/components/MascotWidget.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.test.tsx), [`src/renderer/components/SearchBar.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.test.tsx), [`src/renderer/components/Header.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/Header.test.tsx), [`src/renderer/entrypoint-cutover.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/entrypoint-cutover.test.tsx)
  - Execute `npm run test:vitest -- src/renderer/components/MascotWidget.test.tsx src/renderer/components/SearchBar.test.tsx src/renderer/components/Header.test.tsx src/renderer/entrypoint-cutover.test.tsx && npm run typecheck`.

## Acceptance Criteria
- [x] `src/renderer/mascot-widget.ts` and `src/renderer/mascot-widget.test.ts` are deleted with zero remaining imports or `yumeshelf:mascot-bonk` / `yumeshelf:mascot-recover` `CustomEvent` references.
- [x] `MascotWidget.tsx` preserves 100% of drag clamping (`yumeshelf_mascot_x`/`yumeshelf_mascot_y` wrapped in `try/catch` with path-sanitized `[MascotWidget]` `console.warn` diagnostics), context menu controls, `.hidden` visibility class, and `mascot.css` DOM contracts in pure React 19, delegating bonks and `BONK.png` impact spawning to `MascotProvider`.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/MascotWidget.test.tsx src/renderer/components/SearchBar.test.tsx src/renderer/components/Header.test.tsx src/renderer/entrypoint-cutover.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/MascotWidget.test.tsx src/renderer/components/SearchBar.test.tsx src/renderer/components/Header.test.tsx src/renderer/entrypoint-cutover.test.tsx && npm run typecheck
```
