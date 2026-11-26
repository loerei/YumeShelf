# 03 — Restore Hide-and-Seek `<MascotCard />`, `LibraryGrid` & `SearchBar` Seams ($B$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [02 — Pure React `MascotWidget` & Context Menu Migration ($B$)](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/tickets/02-pure-react-mascot-widget-migration.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI from `.scratch/pre-310-frontend/src/renderer/features/hide-and-seek.ts` and existing `LibraryGrid.tsx` / `SearchBar.tsx` behaviors. Do NOT alter unrelated game card or folder sorting behaviors.

Restore Hide-and-Seek mascot card injection, bonk-to-return lifecycle, and search matching in declarative React:

- [ ] 1. **[NEW]** [`src/renderer/components/MascotCard.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotCard.tsx) — **Declarative `<MascotCard />` `(Replaces: pre-310 hide-and-seek.ts card builder)`**:
  - Render the mascot card (`yumeshelf_mascot_card`, `isMascotCard: true`) with `smug` / `bonked` / `bonkedTooMuch` images, 10s idle quote rotation, squash animation (`bonk-animating`), localized deck title (`mascot_card_titles`), and 50% random favorite star.
  - On click/double-click: increment streak + cooldown, trigger `onBonk` / sound, and once `streak >= threshold` (`5..10`) after 3s idle, fade out (`0.4s`) and call `returnFromHideAndSeek(streak, accumulatedMs)` on `MascotProvider`.
- [ ] 2. **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) & **[MODIFY]** [`src/renderer/components/SearchBar.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.tsx) — **Inject Active Mascot Card & Search Entry**:
  - When `isHideAndSeekCardActive` is true in `MascotProvider`, inject the mascot item at a stable random session index in `LibraryGrid.tsx` and render `<MascotCard />` (preserving `useCardLayoutFlip` and non-draggable behavior).
  - Include the active mascot card title in `SearchBar.tsx` search results so searching its title locates/scrolls to `<MascotCard />`.
- [ ] 3. **[NEW]** [`src/renderer/components/MascotCard.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/MascotCard.test.tsx), **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx), & **[MODIFY]** [`src/renderer/components/SearchBar.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/SearchBar.test.tsx) — **Component & Integration Tests**:
  - Verify idle quote rotation, threshold dismissal calling `returnFromHideAndSeek`, `LibraryGrid` injection only when active, and `SearchBar` matching the active mascot card.

## Acceptance Criteria
- [ ] `<MascotCard />` restores `pre-310` Hide-and-Seek expressions, quotes, squash animation, and threshold return to `MascotWidget`.
- [ ] `LibraryGrid.tsx` renders `<MascotCard />` when `isHideAndSeekCardActive` is true, and `SearchBar.tsx` matches it.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/components/MascotCard.test.tsx src/renderer/components/LibraryGrid.test.tsx src/renderer/components/SearchBar.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/MascotCard.test.tsx src/renderer/components/LibraryGrid.test.tsx src/renderer/components/SearchBar.test.tsx && npm run typecheck
```
