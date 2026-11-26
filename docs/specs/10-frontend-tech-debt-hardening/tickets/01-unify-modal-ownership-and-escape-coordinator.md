# 01 — Unify Modal Ownership & Single Escape Coordinator ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors across `OverlayProvider.tsx`, `Modal.tsx`, and `App.tsx`. Do NOT alter, restyle, or remove anything unasked.

Eliminate split modal ownership and duplicate global `Escape` listeners so downstream epics (Epic 03, Epic 04) can add dialogs safely through one coordinator:

- [ ] 1. **[MODIFY]** [`src/renderer/providers/OverlayProvider.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/OverlayProvider.tsx) — **Register Delete Confirmation Modal & Own Global Escape Coordination**:
  - Add `'delete-game'` (with typed payload `{ game: GameEntry }`) to `ModalType`, `ModalPayloadMap`, and `ActiveModalEntry`.
  - Designate `OverlayProvider.tsx` as the single global `Escape` dismissal coordinator for active modals, respecting in-flight/busy guards when a modal cannot be dismissed.
- [ ] 2. **[MODIFY]** [`src/renderer/components/modals/Modal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/Modal.tsx) — **Remove Duplicate Escape Listener**:
  - Remove the competing `Escape` keydown listener from `Modal.tsx` when mounted under `OverlayProvider` (or route dismissal through a single opt-in/provider-managed callback) so pressing `Escape` once never fires two dismissal paths.
  - Preserve portal rendering, focus trap, focus restoration, and backdrop click-drag guard unchanged.
- [ ] 3. **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) — **Migrate `pendingDeleteGame` into `OverlayProvider`**:
  - Replace local `pendingDeleteGame` `useState` in `AppShell` with `openModal('delete-game', { game })` and `closeModal()` from `OverlayProvider`.
  - Ensure `activeModalState.type === null` now accurately reflects every open modal including delete confirmation.
- [ ] 4. **[MODIFY]** [`src/renderer/providers/OverlayProvider.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/OverlayProvider.test.tsx) & **[MODIFY]** [`src/renderer/components/modals/Modal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/Modal.test.tsx) — **Behavioral Tests**:
  - Verify `'delete-game'` opens, confirms, cancels, and restores focus through `OverlayProvider`.
  - Verify pressing `Escape` invokes dismissal exactly once with zero double-close or stale focus state.

## Acceptance Criteria
- [ ] `pendingDeleteGame` local modal state is removed from `App.tsx` and managed strictly via `OverlayProvider.tsx`.
- [ ] Only one `Escape` coordinator handles modal dismissal across `OverlayProvider.tsx` and `Modal.tsx`.
- [ ] `activeModalState.type === null` accurately reflects all open modals in `App.tsx`.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/providers/OverlayProvider.test.tsx src/renderer/components/modals/Modal.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/providers/OverlayProvider.test.tsx src/renderer/components/modals/Modal.test.tsx && npm run typecheck
```
