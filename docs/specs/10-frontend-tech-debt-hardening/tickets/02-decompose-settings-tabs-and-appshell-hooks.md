# 02 — Decompose Remaining Settings Tabs & AppShell Orchestration ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- [01 — Unify Modal Ownership & Single Escape Coordinator ($S$)](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/tickets/01-unify-modal-ownership-and-escape-coordinator.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors across `SettingsModal.tsx` and `App.tsx`. Do NOT alter, restyle, or remove anything unasked.

Finish decomposing the two remaining monolithic renderer containers (`SettingsModal.tsx` and `App.tsx`) into cohesive modules with clear prop/hook boundaries:

- [ ] 1. **[NEW]** [`src/renderer/components/modals/SettingsGeneralTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsGeneralTab.tsx), **[NEW]** [`src/renderer/components/modals/SettingsUpdatesTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsUpdatesTab.tsx), **[NEW]** [`src/renderer/components/modals/SettingsSystemTab.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsSystemTab.tsx), & **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx) — **Decompose Remaining Settings Tabs**:
  - Extract the `general`, `updates`, and `system` tab panels out of `SettingsModal.tsx` into dedicated sibling components matching the `SettingsLibraryTab.tsx` seam created in Epic 09 Ticket `00`.
  - Keep `SettingsModal.tsx` as a thin tab navigation shell and footer container coordinating active tab state and shared save/close lifecycle.
  - Preserve all DOM IDs, CSS classes, i18n strings (`useLocaleStrings()`), update status indicators, release links, and app version footer behavior.
- [ ] 2. **[NEW]** [`src/renderer/hooks/useLibraryActions.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useLibraryActions.ts) & **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) — **Extract Card & Library Orchestration Hooks from `App.tsx`**:
  - Extract `handleMenuAction`, optimistic favorite locking/rollback, and multi-instance stack deletion recalculation out of `AppShell` (`App.tsx`) into `useLibraryActions.ts` accepting injected `electronAPI`, store dispatch, and notification/overlay callbacks.
  - Keep `App.tsx` focused on top-level layout composition and provider wiring.
- [ ] 3. **[NEW]** [`src/renderer/hooks/useLibraryActions.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useLibraryActions.test.ts) & **[MODIFY]** [`src/renderer/components/modals/SettingsModal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.test.tsx) — **Unit & Regression Tests**:
  - Test optimistic favorite rollback and stack deletion recalculation directly through `useLibraryActions.test.ts`.
  - Verify `SettingsModal.test.tsx` and existing `App` integration tests pass 100% with zero behavioral drift.

## Acceptance Criteria
- [ ] `SettingsModal.tsx` delegates all 4 tabs (`general`, `library`, `updates`, `system`) to dedicated tab components with zero UXUI change.
- [ ] Card menu actions, optimistic favorite locking/rollback, and stack deletion recalculation reside in `useLibraryActions.ts` and are unit-tested in isolation.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/hooks/useLibraryActions.test.ts src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/hooks/useLibraryActions.test.ts src/renderer/components/modals/SettingsModal.test.tsx && npm run typecheck
```
