# 01 — Mascot Domain Core, Shuffled Decks & `MascotProvider` ($S$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## What to Build
> **Scope Guard:** Implement only the headless domain helpers, audio/storage interfaces, and `MascotProvider` context specified below; do NOT modify `MascotWidget.tsx` DOM rendering or `LibraryGrid.tsx` yet.

Establish the pure TypeScript domain core and shared React Context (`MascotProvider`) for Mascot and Hide-and-Seek state:

- [ ] 1. **[NEW]** [`src/renderer/mascot/mascot-domain.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot/mascot-domain.ts) — **Headless Mascot Domain, Shuffled Decks & Audio Seam**:
  - Extract pure `getNextShuffledIndex(storageKey, totalCount, storage)` (using Fisher-Yates deck persistence via `UiStorageAdapter` without crashing on corrupt JSON).
  - Define bonk streak/cooldown/recovery state helpers, `DEFAULT_BONK_QUOTES`, `DEFAULT_IDLE_QUOTES`, `DEFAULT_TITLES`, and `MASCOT_CARD_KEY = 'yumeshelf_mascot_card'`.
  - Define an injectable `MascotAudioPlayer` interface (`play(soundKey, volumePercent): void`) wrapping `Audio` / `squeaker.mp3` / `metal-pipe.mp3` safely for `happy-dom` tests.
- [ ] 2. **[NEW]** [`src/renderer/providers/MascotProvider.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/MascotProvider.tsx) — **Unified Reactive Mascot & Hide-and-Seek Context**:
  - Manage `show` (`yumeshelf_mascot_show`), `scale` (`yumeshelf_mascot_scale`, default `30`), `sound`, `volume` (`20`), `hideAndSeek` (`yumeshelf_hide_and_seek` `'yeaaa' | 'out'`), `isDismissed`, `bonkCount`, and `returnFromHideAndSeek(streak, accumulatedMs)` continuity.
  - Expose `isWidgetVisible` (`show && !(hideAndSeek === 'yeaaa' && !isDismissed)`) and `isHideAndSeekCardActive` (`show && hideAndSeek === 'yeaaa' && !isDismissed`).
  - Expose reactive `lastBonkEvent` / callback subscription so `SearchBar.tsx` reacts without `window` `CustomEvent('yumeshelf:mascot-bonk' | 'yumeshelf:mascot-recover')`.
- [ ] 3. **[NEW]** [`src/renderer/mascot/mascot-domain.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot/mascot-domain.test.ts) & **[NEW]** [`src/renderer/providers/MascotProvider.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/MascotProvider.test.tsx) — **Unit Tests**:
  - Verify `getNextShuffledIndex` deck exhaustion/reshuffle and corrupt-JSON resilience, `isWidgetVisible` vs `isHideAndSeekCardActive` transitions, and `returnFromHideAndSeek` streak/cooldown handoff.

## Acceptance Criteria
- [ ] `mascot-domain.ts` provides pure, storage-injectable shuffled deck, quote/bonk math, and `MascotAudioPlayer` abstractions.
- [ ] `MascotProvider.tsx` manages shared Mascot + Hide-and-Seek state with zero `window` `CustomEvent` dependencies.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/mascot/mascot-domain.test.ts src/renderer/providers/MascotProvider.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/mascot/mascot-domain.test.ts src/renderer/providers/MascotProvider.test.tsx && npm run typecheck
```
