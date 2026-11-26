# 02 — Pure React `MascotWidget` & Context Menu Migration ($B$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [01 — Mascot Domain Core, Shuffled Decks & `MascotProvider` ($S$)](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/tickets/01-mascot-domain-and-provider.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI (drag physics, boundary clamping, `BONK.png` impact visual, `smug`/`bonked`/`bonkedTooMuch` expressions, sound/volume/scale controls, and `src/styles/mascot.css` classes/IDs). Do NOT modify `LibraryGrid.tsx` or `SettingsModal.tsx` in this ticket.

Replace imperative `src/renderer/mascot-widget.ts` with pure declarative React 19 inside `MascotWidget.tsx` and wire `SearchBar.tsx` to `MascotProvider`:

- [ ] 1. **[MODIFY]** [`src/renderer/components/MascotWidget.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.tsx) — **Replace [src/renderer/mascot-widget.ts](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts) preserving initial intended UXUI**:
  - Implement drag-to-reposition (with `UiStorageAdapter` position persistence and viewport clamping), `BONK.png` impact spawn, click streak + recovery timers (`smug` -> `bonked` -> `bonkedTooMuch`), and `#mascot-context-menu` (`Reset Position`, `Bonk Sound`, `Scale`, `Volume`) directly in React state/hooks consuming `MascotProvider`.
  - Respect `isWidgetVisible` from `MascotProvider`.
- [ ] 2. **[MODIFY]** [`src/renderer/components/SearchBar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.tsx) & **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) — **Mount `MascotProvider` & Remove `CustomEvent` Bus**:
  - Mount `<MascotProvider>` in `App.tsx` wrapping `Header` (`SearchBar`), `LibraryGrid`, and `MascotWidget`.
  - Replace `window.addEventListener('yumeshelf:mascot-bonk' | 'yumeshelf:mascot-recover')` in `SearchBar.tsx` with `MascotProvider` state consumption.
- [ ] 3. **[DELETE]** [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts) & **[MODIFY]** [`src/renderer/mascot-widget.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.test.ts) -> **[NEW]** [`src/renderer/components/MascotWidget.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotWidget.test.tsx) — **Decommission Imperative Controller & Migrate Tests**:
  - Delete `src/renderer/mascot-widget.ts` once zero callers remain.
  - Migrate all behavioral assertions from `mascot-widget.test.ts` (drag/reset position, bonk counter, recovery, scale/sound/volume persistence, context menu) into `MascotWidget.test.tsx` `(Replaces: [src/renderer/mascot-widget.test.ts](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.test.ts))`.

## Acceptance Criteria
- [ ] `src/renderer/mascot-widget.ts` is deleted with zero remaining imports or `yumeshelf:mascot-bonk` `CustomEvent` references.
- [ ] `MascotWidget.tsx` preserves 100% of drag clamping, `BONK.png` impact, context menu controls, and `mascot.css` DOM contracts in pure React 19.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/MascotWidget.test.tsx src/renderer/components/SearchBar.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/MascotWidget.test.tsx src/renderer/components/SearchBar.test.tsx && npm run typecheck
```
