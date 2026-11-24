# 05 — Inline Folder Rename, Empty Folder Manual Add & Runtime Smoke Gate ($B$)

## Epic
[Epic 09.1: Sort by Folder — Core View & Folder Management](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/PRD.md)

## Status
ready-for-agent

## Blocked by
- [04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09.1-sort-by-folder-core/tickets/04-folder-accordions-and-sections.md)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `FolderSection.tsx`, `FolderAccordion.tsx`, and `LibraryGrid.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement pure presentational `FolderTitle.tsx` (inline folder rename) and `EmptyFolderPrompt.tsx` (manual executable addition), wire their persistence callbacks in `LibraryGrid.tsx`, and execute the terminal real-runtime smoke gate for Epic 09.1:

- [x] 1. **[NEW]** [`src/renderer/components/FolderTitle.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.tsx) & **[MODIFY]** [`src/renderer/i18n/locale-strings.ts`](file:///d:/Projects/YumeShelf/src/renderer/i18n/locale-strings.ts) — **Single-Click Inline Folder Rename (Pure Presentational) & Shared Error-Code Localization Helper**:
  - Model edit lifecycle as a discriminated union (`{ status: 'idle' } | { status: 'editing'; draft: string; hasError: boolean } | { status: 'submitting'; draft: string }`) rather than separate booleans.
  - Accept `onShowToast?: (message: string) => void` in `FolderTitleProps` (invoking `onShowToast?.(...)` rather than calling `useNotification()` directly).
  - Idle mode: renders focusable title heading (`role="heading"`, `aria-level={3}`, `className="folder-section-title"`, `tabIndex={0}`) decoupled from the accordion toggle button, with localized `aria-description={strings.rename_folder_hint}`. Single-click, `F2`, or `Enter` enters edit mode without toggling accordion collapse (no `stopPropagation()`).
  - Edit mode: renders `<input className="rename-input" />`, auto-focuses and selects all text.
  - Pair the discriminated union `state` with `inputRef = useRef<HTMLInputElement | null>(null)` and synchronous `isSubmittingRef = useRef(false)`, `isCancelingRef = useRef(false)`, `shouldFocusHeadingRef = useRef(false)`, and `shouldFocusInputRef = useRef(false)` (resetting `isSubmittingRef`, `isCancelingRef`, and `shouldFocusInputRef` to `false` on entering `'editing'` mode):
    - In `Escape` (suppressed while `isSubmittingRef.current` / `status === 'submitting'`): set `isCancelingRef.current = true;` and `shouldFocusHeadingRef.current = true;` synchronously *before* calling `setState({ status: 'idle' })` (do **not** call `headingRef.current?.focus()` or schedule a `queueMicrotask` reset inside `onKeyDown`, since `headingRef.current` is `null` while `<input>` is mounted), and restore focus post-commit in a `useEffect` on `[state.status]`:
      ```ts
      useEffect(() => {
        if (state.status === 'idle') {
          isCancelingRef.current = false;
          if (shouldFocusHeadingRef.current) {
            shouldFocusHeadingRef.current = false;
            headingRef.current?.focus();
          }
        }
      }, [state.status]);
      ```
      preventing focus restoration from triggering `onBlur` -> `onRenameFolder` and avoiding `document.body` focus drops.
    - In `handleCommit(restoreFocusOnExit: boolean)` (invoked with `true` on `Enter` and `!e.relatedTarget` on `onBlur`, matching `GameCard.tsx`), guard at the very top with `if (isCancelingRef.current || isSubmittingRef.current || state.status !== 'editing') return;`, exit early without IPC when `trimmedValue === displayName` (setting `if (restoreFocusOnExit) { shouldFocusHeadingRef.current = true; }` before `setState({ status: 'idle' }); return;` — while still allowing `trimmedValue === ''` to clear an existing alias), then set `isSubmittingRef.current = true` synchronously *before* `setState({ status: 'submitting', draft: state.draft })` and `await onRenameFolder(folderPath, trimmedValue)` inside `try/catch/finally` (resetting `isSubmittingRef.current = false` in `finally`):
      ```tsx
      const handleCommit = async (restoreFocusOnExit: boolean) => {
        if (isCancelingRef.current || isSubmittingRef.current || state.status !== 'editing') return;
        const trimmedValue = state.draft.trim();
        if (trimmedValue === displayName) {
          if (restoreFocusOnExit) {
            shouldFocusHeadingRef.current = true;
          }
          setState({ status: 'idle' });
          return;
        }
        isSubmittingRef.current = true;
        setState({ status: 'submitting', draft: state.draft });
        try {
          const res = await onRenameFolder(folderPath, trimmedValue);
          if (res?.ok) {
            if (restoreFocusOnExit) {
              shouldFocusHeadingRef.current = true;
            }
            setState({ status: 'idle' });
            return;
          }
          // ... existing error rollback with shouldFocusInputRef.current = true
        } catch (err) {
          // ... existing rejection rollback with shouldFocusInputRef.current = true
        } finally {
          isSubmittingRef.current = false;
        }
      };

      // In <input> handlers:
      // onKeyDown: if (e.key === 'Enter') { e.preventDefault(); void handleCommit(true); }
      // onBlur: (e) => { void handleCommit(!e.relatedTarget); }
      ```
      - In-flight: `readOnly={true}`, `aria-busy="true"`.
      - Success (`res?.ok`): exits edit mode (restoring focus post-commit to `headingRef.current` when `restoreFocusOnExit` is true); ShelfTabs automatically synchronize from store.
      - Failure (`!res?.ok`) or unexpected promise rejection (`catch (err)`): log `sanitizeUserPaths`-scrubbed diagnostics (`console.warn('[FolderTitle] Folder rename failed:', { folderPath: sanitizeUserPaths(folderPath), error: sanitizeUserPaths(res?.error ?? 'unknown') })` on `{ ok: false }`; `console.error('[FolderTitle] Folder rename rejected:', { folderPath: sanitizeUserPaths(folderPath), error: sanitizeUserPaths(...), stack: ... })` on rejection), set `shouldFocusInputRef.current = true` before calling `setState({ status: 'editing', draft: state.draft, hasError: true })` (removing `readOnly`/`aria-busy`, preserving user text, and setting `aria-invalid="true"`), restore input focus post-commit in a `useEffect` keyed on `[state.status, state.status === 'editing' ? state.hasError : false]` (`if (state.status === 'editing' && shouldFocusInputRef.current) { shouldFocusInputRef.current = false; inputRef.current?.focus(); }`) so `onBlur`-triggered commit failures do not leave `<input>` unfocused, and trigger localized error toast via `onShowToast?.(resolveLocalizedErrorCode(strings, res?.error, strings.toast_folder_rename_failed))` (using shared helper `resolveLocalizedErrorCode(strings, errorCode, fallback)` exported from [`src/renderer/i18n/locale-strings.ts`](file:///d:/Projects/YumeShelf/src/renderer/i18n/locale-strings.ts) that normalizes kebab-case `errorCode` to snake_case and checks `Object.hasOwn(strings, localeKey)` before returning `fallback`).
- [x] 2. **[NEW]** [`src/renderer/components/EmptyFolderPrompt.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.tsx) — **Empty Folder Manual Game Addition (Pure Presentational)**:
  - Accept `onShowToast?: (message: string) => void` in `EmptyFolderPromptProps` (invoking `onShowToast?.(...)` rather than calling `useNotification()` directly).
  - Renders full-width dashed `.empty-folder-prompt` (`<button type="button" className="manual-add-btn">`) when folder has 0 games in unfiltered state (`!activeCategoryId`), using `strings.manual_add_prompt` and `strings.add_game_to_folder`.
  - Click handler pairs `isSelecting` state with a synchronous `isSelectingRef = useRef(false)` (`if (isSelectingRef.current) return; isSelectingRef.current = true; setIsSelecting(true);`), sets `aria-busy="true"` and `aria-disabled="true"` (preserving focus) with `strings.empty_folder_selecting`, and wraps `await onAddManualGame(folderPath)` (`Promise<{ ok: boolean; game?: GameEntry; canceled?: boolean; error?: string }>`, wired by `LibraryGrid.tsx` to `electronAPI.addManualGame({ folderPath })`, `getGames()` + `annotateGamesForDisplay`, `setAllGames`, and focus handoff to the added card) in `try/catch` with `finally` resetting both `isSelectingRef.current = false` and `setIsSelecting(false)` (in `catch (err)`, log `console.error('[EmptyFolderPrompt] Manual game addition rejected:', { folderPath: sanitizeUserPaths(folderPath), error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)), stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined })` before clearing `aria-busy`/`aria-disabled` and invoking `onShowToast?.(strings.toast_manual_add_failed)`):
    - Canceled: resets cleanly.
    - Error: use shared `resolveLocalizedErrorCode(strings, res.error, strings.toast_manual_add_failed)` from [`src/renderer/i18n/locale-strings.ts`](file:///d:/Projects/YumeShelf/src/renderer/i18n/locale-strings.ts) (normalizing kebab-case backend error codes to snake_case and performing an `Object.hasOwn(strings, localeKey)` check before falling back to `strings.toast_manual_add_failed`), and log sanitized diagnostics via `sanitizeUserPaths`:
      ```ts
      export function resolveLocalizedErrorCode(
        strings: LocaleStrings,
        errorCode: string | undefined,
        fallback: string
      ): string {
        const normalizedCode = typeof errorCode === 'string' ? errorCode.trim().replace(/-/g, '_') : '';
        const localeKey = normalizedCode ? `error_${normalizedCode}` : '';
        return localeKey && Object.hasOwn(strings, localeKey) && typeof strings[localeKey] === 'string'
          ? strings[localeKey]
          : fallback;
      }
      ```
      and invoke `onShowToast?.(resolveLocalizedErrorCode(strings, res.error, strings.toast_manual_add_failed));`.
- [x] 3. **[MODIFY]** [`src/renderer/App.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.tsx) & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) (plus **[MODIFY]** [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx) / [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx) only if additional prop forwarding beyond Ticket `04`'s `renderTitle` / `renderEmptyFolder` slot props is needed) — **Wire Callbacks, Toast Seam & Global Empty Bypass**:
  - Add `onShowToast?: (message: string) => void` to `LibraryGridProps` and pass `onShowToast={showToast}` from `src/renderer/App.tsx` into `<LibraryGrid />` (matching `onFavoriteError`). Forward `onShowToast` into `<FolderTitle />` and `<EmptyFolderPrompt />`.
  - Mount `<FolderTitle />` in `FolderSection.tsx` via `renderTitle` and `<EmptyFolderPrompt />` via `renderEmptyFolder`.
  - In `LibraryGrid.tsx`'s `handleRenameFolder(folderPath, trimmedValue)`: return `{ ok: false, error: 'unavailable' }` if `!api?.setFolderAlias`; wrap `const res = await api.setFolderAlias(folderPath, trimmedValue)` in `try/catch`:
    - If `!res?.ok`, log `console.warn('[LibraryGrid] Failed to rename folder:', { folderPath: sanitizeUserPaths(folderPath), error: sanitizeUserPaths(res?.error ?? 'unknown') })`.
    - In `catch (err)`, log `console.error('[LibraryGrid] Error invoking setFolderAlias:', { folderPath: sanitizeUserPaths(folderPath), error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)), stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined })` and return `{ ok: false, error: 'unavailable' }`.
    - On `res?.ok`:
      ```ts
      if (res.config) {
        dispatch.setCurrentLibraryConfig(res.config);
      }
      ```
  - In `LibraryGrid.tsx`'s `handleAddManualGame(folderPath)`: guard with `if (!api?.addManualGame) return { ok: false, error: 'unavailable' };` symmetrically with `handleRenameFolder`, wrap `await api.addManualGame({ folderPath })` in `try/catch` (logging `console.warn` with `sanitizeUserPaths(folderPath)` and `sanitizeUserPaths(res?.error)` when `!res?.ok && !res?.canceled`; logging `console.error` with `sanitizeUserPaths` for `folderPath`, `error`, and `stack` and returning `{ ok: false, error: 'unavailable' }` on rejection). On `res.ok === true`, isolate `await api.getGames?.()` in its own `try/catch` so a post-commit `getGames()` failure does not falsely reject into `EmptyFolderPrompt`'s error toast:
    ```ts
    let games: GameEntry[] | undefined;
    try {
      games = await api.getGames?.();
    } catch (err) {
      console.warn('[LibraryGrid] Failed to refresh games after manual add; falling back to added entry:', {
        folderPath: sanitizeUserPaths(folderPath),
        hasFallbackGame: Boolean(res.game),
        error: sanitizeUserPaths(err instanceof Error ? err.message : err),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      games = undefined;
    }
    if (games !== undefined && !Array.isArray(games)) {
      console.warn('[LibraryGrid] Unexpected non-array response from getGames after manual add; falling back to added entry:', {
        folderPath: sanitizeUserPaths(folderPath),
        hasFallbackGame: Boolean(res.game),
      });
    }
    const snapshot = store.getSnapshot();
    const nextGames = Array.isArray(games)
      ? games
      : res.game
        ? [...snapshot.allGames, res.game]
        : null;
    ```
    annotate via `annotateGamesForDisplay(nextGames, snapshot.currentLibraryConfig ?? '', snapshot.locationDisplayMode)` when non-null, call `dispatch.setAllGames(annotated)`, and record `const focusKey = res.game?.gameKey || res.game?.gameId; if (focusKey) pendingFocusKeyRef.current = focusKey;` for a dedicated `pendingFocusKeyRef` + post-commit `useEffect` on `[viewItems]` that resolves the card via Ticket `04`'s shared `resolveConnectedCardElement(focusKey)` helper (`el.isConnected && !el.closest('[inert]')`, handling `game:` prefix and stack `groupKey` symmetry) to focus the newly added card element directly (distinct from `activeToggledKeyRef`, which focuses `.fav-btn`). If `addManualGame` returns a `res.game` already present in `allGames` with identical structural fields (so `viewItems` retains its reference and `[viewItems]` does not re-run), focus `resolveConnectedCardElement(focusKey)` directly or clear `pendingFocusKeyRef.current` so stale pending focus never lingers.
  - Ensure Global Empty State Bypass in `LibraryGrid.tsx` evaluates `isFolderViewActive = currentSort === 'folder' && rootPaths.length > 0` before both `allGames.length === 0` (`LibraryEmptyState`) and `viewItems.length === 0` (`FilteredEmptyState`), so empty configured folders show `EmptyFolderPrompt` instead of the global empty illustration.
- [x] 4. **[NEW]** [`src/renderer/components/FolderTitle.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.test.tsx), **[NEW]** [`src/renderer/components/EmptyFolderPrompt.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.test.tsx), **[MODIFY]** [`src/renderer/components/LibraryGrid.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.test.tsx), & **[MODIFY]** [`src/renderer/App.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/App.test.tsx) — **Vitest Component & Integration Tests**:
  - Verify rename activation, commit/rollback/Escape, manual add prompt vs filtered empty state, global empty bypass, `onShowToast` invocation without `NotificationProvider`, `getGames()` + `annotateGamesForDisplay` manual-add refresh + fallback, in-flight `aria-busy`/`aria-disabled` focus retention, and error toast handling.
  - **`FolderTitle.test.tsx`**: explicitly test (a) `onRenameFolder` returning a rejected `Promise` (assert `status` returns to `'editing'`, `readOnly`/`aria-busy` are cleared, `aria-invalid="true"` is set, user draft is preserved, `onShowToast(strings.toast_folder_rename_failed)` is called, and `console.error` emits `sanitizeUserPaths`-scrubbed output using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`), (b) triggering commit via `fireEvent.blur(input)` with a failed/rejected `onRenameFolder` restores `document.activeElement` post-commit to `<input>` with `aria-invalid="true"`, (c) pressing `Escape` while `status === 'submitting'` is suppressed without exiting edit mode, (d) pressing `Escape` followed synchronously by `blur` does not invoke `onRenameFolder` and restores `document.activeElement` post-commit to the idle heading element, (e) pressing `Enter` followed synchronously by `blur` invokes `onRenameFolder` exactly once, (f) committing an unchanged `displayName` exits edit mode without invoking `onRenameFolder`, (g) `{ ok: false }` emits `console.warn` with `sanitizeUserPaths` scrubbing on both `folderPath` and `res?.error` (using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`), and (h) *given* `FolderTitle` is in `'editing'` mode with focus on `.rename-input`, *when* the user presses `Enter` to commit either an unchanged `displayName` or a valid new name where `onRenameFolder` resolves `{ ok: true }`, *then* `FolderTitle` exits to `'idle'` and restores `document.activeElement` post-commit to the idle heading element (never `document.body`), whereas `onBlur` with a non-null `relatedTarget` does not steal focus back to the heading.
  - **`EmptyFolderPrompt.test.tsx`**: explicitly test (a) real kebab-case backend error codes (e.g. `'outside-library'`, `'target-not-found'`) asserting `onShowToast` receives `strings.error_outside_library` / `strings.error_target_not_found` rather than `strings.toast_manual_add_failed`, (b) two synchronous clicks (`fireEvent.click(btn); fireEvent.click(btn);` without awaiting between clicks) invoking `onAddManualGame` only once, (c) `{ ok: false, canceled: true }` resetting `aria-busy`/`aria-disabled` without calling `onShowToast`, (d) rejected `onAddManualGame` promise resetting `aria-busy`/`aria-disabled` in `finally`, emitting `console.error` with `sanitizeUserPaths` scrubbing (using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`), and calling `onShowToast(strings.toast_manual_add_failed)`, and (e) prototype-key error code (e.g. `'toString'` / `'constructor'`) falling back to `strings.toast_manual_add_failed` via `Object.hasOwn(strings, localeKey)`.
  - **`LibraryGrid.test.tsx`**: explicitly test (a) committing an inline rename through `LibraryGrid` invokes `api.setFolderAlias`, updates `currentLibraryConfig` via `setCurrentLibraryConfig`, and updates the corresponding tab label in `ShelfTabs` without a full library reload (plus `console.warn`/`console.error` with `sanitizeUserPaths` scrubbing on `{ ok: false }` / rejection using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`), (b) clicking `EmptyFolderPrompt` when `api.addManualGame` is `undefined` triggers `{ ok: false, error: 'unavailable' }`, invokes `onShowToast` with `strings.toast_manual_add_failed`, and clears `aria-busy`/`aria-disabled`, (c) `api.addManualGame` resolving `{ ok: true, game }` while `api.getGames` rejects (or returns non-array) emits `console.warn` with `sanitizeUserPaths` scrubbing (using a user-home path fixture such as `C:\Users\John Doe\Games` or `/Users/alice/Games`), dispatches `setAllGames` with the annotated `res.game` fallback, and resolves `{ ok: true }`, (d) `pendingFocusKeyRef` post-commit `useEffect` resolves via `resolveConnectedCardElement` and moves `document.activeElement` directly to the newly added card element (not `.fav-btn`) in `'folder'` sort mode, (e) when `addManualGame` returns a `res.game` whose `gameId` groups into an existing `StackLibraryViewItem` (`groupKey !== res.game.gameKey`), `pendingFocusKeyRef` resolves via `resolveConnectedCardElement` and focuses the `StackCard` element, and (f) when `addManualGame` returns a `res.game` already present in `allGames` with identical structural fields (so `viewItems` retains its reference), moving focus to an external control and triggering a subsequent `viewItems` update (such as toggling favorite on another game) leaves `document.activeElement` on the external control rather than jumping to the previously added card.
  - **`App.test.tsx`**: add an integration test case that renders `<App />` with `createMockStorage({ yumeshelf_sort_pref: 'folder' })`, `libraryPaths: ['D:\\Games']`, and `createMockElectronAPI({ setFolderAlias: vi.fn().mockResolvedValue({ ok: false, error: 'outside-library' }) })` (or `addManualGame` returning `{ ok: false, error: 'outside-library' }`), triggers the folder rename (or empty-folder manual add) via the rendered UI, and asserts that `NotificationProvider`'s `ToastPill` (`screen.getByRole('status')`) displays the localized error message (`'Target path is outside configured library folders.'` / `strings.error_outside_library`).
- [ ] 5. **Terminal Real-Runtime UI Smoke Gate (Epic 09.1)**:
  - Run `npm test && npm run typecheck` and boot `npm start` to verify `"By Folder"` switching, `ShelfTabs`, `FolderAccordion`, inline rename, empty folder prompt, and zero visual regressions on flat sort modes or modals across light/dark themes.

## Acceptance Criteria
- [x] `FolderTitle.tsx` and `EmptyFolderPrompt.tsx` are pure presentational components consuming `onRenameFolder`, `onAddManualGame`, and `onShowToast` callbacks (zero direct `electronAPI`, store, or `useNotification()` imports), with `App.tsx` passing `onShowToast={showToast}` to `LibraryGrid` (verified end-to-end in `src/renderer/App.test.tsx` via `ToastPill` `role="status"`).
- [x] Inline rename commits via `setFolderAlias` (skipping IPC when `trimmedValue === displayName`, guarding `Escape`/`Enter`-vs-`onBlur` races via synchronous `isSubmittingRef`/`isCancelingRef`/`shouldFocusHeadingRef`), updates `currentLibraryConfig` via `dispatch.setCurrentLibraryConfig(res.config)`, synchronizes `ShelfTabs` without a full library reload, cancels cleanly on `Escape` and commits cleanly on `Enter` (and `onBlur` with `!e.relatedTarget`) with post-commit focus restoration to the idle heading element (never `document.body`, and without stealing focus when `onBlur` has a non-null `relatedTarget`), restores focus post-commit to `<input>` via `shouldFocusInputRef` on error rollback (including `onBlur`-triggered failures), emits `sanitizeUserPaths`-scrubbed `console.warn`/`console.error` diagnostics on failure/rejection, and retains user text on error.
- [x] `EmptyFolderPrompt.tsx` guards synchronous double-click re-entry via `isSelectingRef`, emits `sanitizeUserPaths`-scrubbed `console.error` on rejection, and shares `resolveLocalizedErrorCode` in `src/renderer/i18n/locale-strings.ts` with `FolderTitle.tsx` to normalize kebab-case backend error codes to snake_case with `Object.hasOwn(strings, localeKey)` before falling back.
- [x] `LibraryGrid.tsx` manual-add handler guards `!api?.addManualGame` (`{ ok: false, error: 'unavailable' }`), wraps `api.addManualGame` and `api.getGames?.()` in separate `try/catch` blocks with `sanitizeUserPaths`-scrubbed diagnostics (falling back to `res.game` + post-`await` `store.getSnapshot()` on `getGames()` rejection/non-array), and hands off focus to the added card via a dedicated `pendingFocusKeyRef` + post-commit `useEffect` on `[viewItems]` using `resolveConnectedCardElement`; `FolderTitle.tsx` and `EmptyFolderPrompt.tsx` reset in-flight/busy states in `try/catch/finally` on unexpected promise rejections.
- [x] Empty unfiltered folders render `EmptyFolderPrompt` (including Global Empty State Bypass when `rootPaths.length > 0`), while filtered empty folders render `no_matching_games_in_folder`.
- [ ] Real-runtime smoke check passes with zero console/CSP errors and zero visual regressions.
- [x] Execute automated verification command: `npm run test:vitest -- src/renderer/components/FolderTitle.test.tsx src/renderer/components/EmptyFolderPrompt.test.tsx src/renderer/components/LibraryGrid.test.tsx src/renderer/App.test.tsx && npm test && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderTitle.test.tsx src/renderer/components/EmptyFolderPrompt.test.tsx src/renderer/components/LibraryGrid.test.tsx src/renderer/App.test.tsx && npm test && npm run typecheck
```
