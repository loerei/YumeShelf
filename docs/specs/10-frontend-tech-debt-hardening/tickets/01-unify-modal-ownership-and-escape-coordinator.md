# 01 — Unify Modal Ownership & Single Escape Coordinator ($S$)

## Epic
[Epic 10: Frontend Tech Debt Hardening](file:///d:/Projects/YumeShelf/docs/specs/10-frontend-tech-debt-hardening/PRD.md)

## Status
ready-for-agent

## Blocked by
- None — can start immediately *(Upstream Prerequisite [Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-hide-and-seek/PRD.md) merged in `ca88762`. Note: both `01` and `03.1` modify disjoint lines of `SettingsModal.tsx` — do not edit `SettingsModal.tsx` concurrently across parallel worktrees.)*

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors across `OverlayProvider.tsx`, `Modal.tsx`, `SettingsModal.tsx`, `AboutModal.tsx`, `LanguagePackModal.tsx`, `DuplicateStackModal.tsx`, and `App.tsx` (including passing `modalType` on those four modal wrappers and preserving the existing `Delete Game from Library` modal DOM structure and English/localized copy as-is). Do NOT alter, restyle, or remove anything unasked.

Eliminate split modal ownership and duplicate global `Escape` listeners so downstream epics (Epic 03, Epic 04) can add dialogs safely through one coordinator:

- [ ] 1. **Register Delete Confirmation Modal & Own Global Escape Coordination**:
  - **Files:** **[MODIFY]** [`src/renderer/providers/OverlayProvider.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/OverlayProvider.tsx)
  - Define the concrete coordination types and optional hook on `OverlayProvider.tsx`:
    ```ts
    export type ModalType =
      | 'settings'
      | 'about'
      | 'language-pack'
      | 'duplicate-stack'
      | 'delete-game';

    export interface ModalPayloadMap {
      settings: undefined;
      about: undefined;
      'language-pack': undefined;
      'duplicate-stack': { groupKey: string };
      'delete-game': { game: GameEntry };
    }

    export type ActiveModalEntry =
      | { readonly type: 'settings'; readonly payload?: undefined }
      | { readonly type: 'about'; readonly payload?: undefined }
      | { readonly type: 'language-pack'; readonly payload?: undefined }
      | { readonly type: 'duplicate-stack'; readonly payload: { groupKey: string } }
      | { readonly type: 'delete-game'; readonly payload: { game: GameEntry } };

    export interface OverlayContextValue {
      // ...existing fields
      registerDismissHandler(type: ModalType, handler: () => void): () => void;
    }

    export function useOptionalOverlay(): OverlayContextValue | null;
    ```
  - Memoize `registerDismissHandler` with `useCallback(..., [])` mutating `dismissHandlersRef.current`, and guard its returned cleanup by handler identity (`if (dismissHandlersRef.current.get(type) === handler) { dismissHandlersRef.current.delete(type); }`) to remain StrictMode-safe and preserve `OverlayContextValue` referential stability.
  - In `OverlayProvider`'s `window` `keydown` handler, on `Escape`: exit early if `event.isComposing || event.keyCode === 229` (IME composition safety), if `modalStackRef.current.length === 0`, or if `event.defaultPrevented`. Otherwise read `const top = modalStackRef.current[modalStackRef.current.length - 1]`, call `event.preventDefault()`, and invoke `dismissHandlersRef.current.get(top.type)?.()` if registered, falling back to `closeModal(top.type)` when no `<Modal>` handler is registered (preserving `OverlayProvider.test.tsx`).
- [ ] 2. **Wire Provider-Coordinated Escape Delegation & Modal Wrapper Types**:
  - **Files:** **[MODIFY]** [`src/renderer/components/modals/Modal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/Modal.tsx), **[MODIFY]** [`src/renderer/components/modals/SettingsModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/SettingsModal.tsx), **[MODIFY]** [`src/renderer/components/modals/AboutModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/AboutModal.tsx), **[MODIFY]** [`src/renderer/components/modals/LanguagePackModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/LanguagePackModal.tsx), **[MODIFY]** [`src/renderer/components/modals/DuplicateStackModal.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/DuplicateStackModal.tsx)
  - Add optional `modalType?: ModalType` to `ModalProps` in `Modal.tsx` and pass `modalType` from `SettingsModal` (`'settings'`), `AboutModal` (`'about'`), `LanguagePackModal` (`'language-pack'`), and `DuplicateStackModal` (`'duplicate-stack'`).
  - Inside `ModalRoot`:
    - Read `const overlay = useOptionalOverlay();` and compute `const isOverlayCoordinated = Boolean(overlay && modalType && overlay.isModalOpen(modalType));`.
    - When `overlay && modalType && isOpen`, register `() => onCloseRef.current()` via `overlay.registerDismissHandler(modalType, ...)` (using a ref to latest `onClose` so busy-guard state changes stay current without thrashing effects).
    - In `ModalRoot`'s local `handleKeyDown`, skip the `Escape` branch only when `isOverlayCoordinated` is `true`; when running locally, exit early on `if (e.nativeEvent.isComposing || e.keyCode === 229) return;` before `e.preventDefault(); onClose();` (preserving standalone `Escape` outside `OverlayProvider` for `SaveEditorSidebar.tsx`, `SaveFileList.tsx`, and `Modal.test.tsx`).
  - Preserve portal rendering, focus trap, focus restoration, and backdrop click-drag guard unchanged.
- [ ] 3. **Migrate `pendingDeleteGame` into `OverlayProvider`**:
  - **Files:** **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx)
  - Replace local `pendingDeleteGame` `useState` in `AppShell` with `openModal('delete-game', { game })`, `getModalPayload('delete-game')?.game ?? null`, and `closeModal('delete-game')` from `OverlayProvider`, passing `modalType="delete-game"` on the delete `<Modal>`.
  - In `handleConfirmDelete`, call `closeModal('delete-game')` **before** calling `openModal('duplicate-stack', { groupKey: nextGroupKey })` when `nextGroupKey !== prevGroupKey` so `openModal` sees `'duplicate-stack'` at the top of `modalStack` instead of pushing a duplicate `'duplicate-stack'` entry.
  - Ensure `activeModalState.type === null` now accurately reflects every open modal including delete confirmation, while preserving the existing `Delete Game from Library` copy, `secondary-btn`/`danger-btn` markup, `isDeletingGame` guard, and `targetFocusGameKey` focus handoff behavior.
- [ ] 4. **Behavioral Tests**:
  - **Files:** **[MODIFY]** [`src/renderer/providers/OverlayProvider.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/OverlayProvider.test.tsx), **[MODIFY]** [`src/renderer/components/modals/Modal.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/modals/Modal.test.tsx), **[MODIFY]** [`src/renderer/App.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.test.tsx), **[VERIFY]** [`src/renderer/entrypoint-cutover.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/entrypoint-cutover.test.tsx)
  - In `OverlayProvider.test.tsx`: verify `useOptionalOverlay()` returns `null` outside `<OverlayProvider>`, `registerDismissHandler(type, handler)` intercepts `Escape` for the topmost modal and restores `closeModal(top.type)` fallback on unregister, handler-identity cleanup (`registerDismissHandler('settings', handlerA)` followed by `registerDismissHandler('settings', handlerB)` and calling `cleanupA()`, then dispatching `Escape` on `window` still invokes `handlerB` `toHaveBeenCalledTimes(1)` without running `closeModal` fallback), and `OverlayProvider` IME composition guard (with `'settings'` open and no `<Modal>` dismiss handler registered, dispatching `new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, cancelable: true })` and a second event with `keyCode: 229` on `window` keeps `modalStack.length === 1` and `event.defaultPrevented === false`).
  - In `Modal.test.tsx`: render `<Modal modalType="settings" isOpen onClose={...}>` coordinated via `openModal('settings')` inside `<OverlayProvider>` and verify a single `Escape` invokes `onClose` once (`toHaveBeenCalledTimes(1)`), plus IME `isComposing` does not dismiss.
  - In `App.test.tsx` / `entrypoint-cutover.test.tsx`: verify `'delete-game'` opens, confirms, cancels, and restores focus (`targetFocusGameKey`) through `OverlayProvider`, assert that pressing `Escape` while `isDeletingGame === true` does NOT close `'delete-game'` while pressing `Escape` when idle cancels `'delete-game'` and restores focus to the triggering `GameCard`, and add an explicit integration test opening `DuplicateStackModal` for a 3-instance stack (`inst-1`, `inst-2`, `inst-3` with distinct `gameKey`s so `nextGroupKey !== prevGroupKey`), deleting `inst-1` via `'delete-game'`, pressing `Escape` **once** (`fireEvent.keyDown(window, { key: 'Escape' })`), and asserting `screen.queryByRole('dialog') === null` immediately after that single `Escape` (proving `closeModal('delete-game')` ran before `openModal('duplicate-stack', { groupKey: nextGroupKey })` and replaced `'duplicate-stack'` in-place rather than pushing a duplicate entry).

## Acceptance Criteria
- [ ] `pendingDeleteGame` local modal state is removed from `App.tsx` and managed strictly via `OverlayProvider.tsx` (calling `closeModal('delete-game')` before updating `'duplicate-stack'`, verified by a 3-instance stack deletion + single-`Escape` integration test).
- [ ] `OverlayProvider.tsx` exports `useOptionalOverlay()` and memoized `registerDismissHandler(type, handler)` (with handler-identity cleanup and IME `isComposing` / `keyCode === 229` guard, both verified in `OverlayProvider.test.tsx`) as the single coordinator for provider-owned modals, while `Modal.tsx` skips local `Escape` only when `isOverlayCoordinated` is `true` and all 5 modal consumers pass `modalType`.
- [ ] `activeModalState.type === null` accurately reflects all open modals in `App.tsx`.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/providers/OverlayProvider.test.tsx src/renderer/components/modals/Modal.test.tsx src/renderer/App.test.tsx src/renderer/entrypoint-cutover.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/providers/OverlayProvider.test.tsx src/renderer/components/modals/Modal.test.tsx src/renderer/App.test.tsx src/renderer/entrypoint-cutover.test.tsx && npm run typecheck
```
