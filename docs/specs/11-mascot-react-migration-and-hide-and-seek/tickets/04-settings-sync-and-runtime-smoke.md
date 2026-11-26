# 04 — Wire Settings Mascot/Hide-and-Seek Sync & Runtime Smoke Gate ($B$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [03 — Restore Hide-and-Seek `<MascotCard />`, `LibraryGrid` & `SearchBar` Seams ($B$)](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/tickets/03-restore-hide-and-seek-card-and-search.md)

## What to Build
> **Scope Guard:** Implement only the Settings-to-`MascotProvider` synchronization and terminal runtime smoke verification; preserve all other Settings controls and tabs.

Connect `#mascot-show-select` and `#hide-and-seek-select` in Settings to `MascotProvider` and execute the terminal runtime smoke check for Epic 11:

- [ ] 1. **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx) — **Synchronize Mascot & Hide-and-Seek Settings with `MascotProvider`**:
  - Wire `#mascot-show-select`, `#hide-and-seek-select` (`'yeaaa'` / `'out'`), scale, sound, and volume controls to update `MascotProvider` immediately so toggling `"YEAAA"` hides the corner `MascotWidget` and mounts `<MascotCard />` in `LibraryGrid` without requiring an app restart.
- [ ] 2. **[MODIFY]** [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx) — **Integration Tests**:
  - Verify toggling `#hide-and-seek-select` (`'yeaaa'` <-> `'out'`) and `#mascot-show-select` updates `MascotProvider` visibility and Hide-and-Seek card state immediately.
- [ ] 3. **Terminal Real-Runtime UI Smoke Gate (Epic 11)**:
  - Run `npm test && npm run typecheck` and boot `npm start` to verify mascot dragging, bonking, SFX playback, context menu, and full Hide-and-Seek loop (Settings `"YEAAA"` -> hidden corner mascot -> `MascotCard` in grid/search -> bonk threshold -> mascot returns to corner).

## Acceptance Criteria
- [ ] Changing `#mascot-show-select` or `#hide-and-seek-select` in Settings synchronizes `MascotWidget` and `<MascotCard />` immediately.
- [ ] Full `npm test && npm run typecheck` passes cleanly with zero `mascot-widget.ts` leftovers.
- [ ] Real-runtime smoke check passes with zero console/CSP errors.
- [ ] Execute automated verification command: `npm test && npm run typecheck`.

## Verification Command
```bash
npm test && npm run typecheck
```
