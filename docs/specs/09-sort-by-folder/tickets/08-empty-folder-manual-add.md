# 08 — Empty Folder Manual Game Addition & Runtime Smoke Verification ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `FolderAccordion.tsx` and `LibraryGrid.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement the empty folder placeholder prompt and manual executable addition as a declarative React component, wire it into `FolderAccordion.tsx` / `LibraryGrid.tsx` via `renderEmptyFolder`, and execute the terminal real-runtime smoke check for Epic 09:
- [ ] 1. **[NEW]** [`src/renderer/components/EmptyFolderPrompt.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.tsx) — **Empty Folder Placeholder Component (Localized via `useLocaleStrings()`)**:
   - Renders when a folder section contains zero games in the unfiltered library state (`!activeCategoryId`).
   - Multi-column layout: `.empty-folder-prompt` spanning all columns (`grid-column: 1 / -1; min-height: 120px; border: 2px dashed var(--border-color);`).
   - Button: `<button type="button" className="manual-add-btn">` with visible label from `strings.manual_add_prompt` ("Your Game Is Not Scanned? Manually Add Them Here.") and accessible name combining visible label + folder name (`strings.add_game_to_folder`).
   - **Filtered View Invariant**: When an active category filter is present and a folder contains zero matching games, renders `<div className="filtered-folder-empty-state">{strings.no_matching_games_in_folder}</div>` instead of the manual add prompt.
   - **Global Empty State Bypass**: When total scanned games is 0, but configured library root directories exist (`rootPaths.length > 0`), folder sort renders the empty folder sections with `EmptyFolderPrompt` buttons rather than showing the global library empty illustration.
- [ ] 2. **[NEW]** [`src/renderer/components/EmptyFolderPrompt.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.tsx) — **Manual Game Selection Dialog & Ingestion**:
   - Click handler on `.manual-add-btn`:
     - Guard: if already selecting (`isSelecting === true`), returns immediately.
     - In-flight: sets `isSelecting = true`, applies `aria-busy="true"` and `aria-disabled="true"` (preserving active keyboard focus), and displays localized in-flight status text (`strings.empty_folder_selecting`).
     - Calls `electronAPI.addManualGame({ folderPath })`:
       - **Canceled**: cleanly resets button to default prompt.
       - **Success**: receives `result.game`, updates library state via `setAllGames`, and anchors focus to the newly added game card.
       - **Error**: displays localized error toast pill (`strings[\`error_${errorCode}\`] ?? strings.toast_manual_add_failed`) and logs structured diagnostic context with `sanitizeUserPaths`.
     - Cleanup in `finally`: resets `isSelecting = false`, removes `aria-busy` and `aria-disabled`.
- [ ] 3. **[MODIFY]** [`src/renderer/components/FolderAccordion.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderAccordion.tsx) & **[MODIFY]** [`src/renderer/components/LibraryGrid.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/LibraryGrid.tsx) — **Wire `EmptyFolderPrompt` & Global Empty Bypass**:
   - Pass `<EmptyFolderPrompt />` through `FolderAccordion`'s `renderEmptyFolder` slot (introduced in Ticket `04`) and enable the Global Empty State Bypass in `LibraryGrid.tsx` when `currentSort === 'folder' && rootPaths.length > 0`.
- [ ] 4. **[NEW]** [`src/renderer/components/EmptyFolderPrompt.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.test.tsx) — **Vitest Component Tests**:
   - Verify prompt renders in unfiltered empty folder via `useLocaleStrings()`, filtered empty state renders when category filter is active, global empty bypass renders empty folder prompts when `rootPaths.length > 0`, in-flight busy feedback (`aria-busy`/`aria-disabled`) preserves focus during IPC file picker invocation, successful game addition updates library state, and error toast feedback fires on IPC rejection.
- [ ] 5. **Terminal Real-Runtime UI Smoke Gate (Electron Dev Runtime)**:
   - Run full automated suite (`npm test && npm run typecheck`) and boot the app (`npm start`) to verify: (a) switching to `"By Folder"` renders `ShelfTabs` and `FolderAccordion` with zero console/CSP errors, (b) flat sort modes (`date`, `played`, `az`, `custom`), card styling, right-click menus, and Settings modal tabs/footer show zero visual regressions, and (c) shelf tab reorder, card drag-drop, inline folder rename, and empty folder prompt compute cleanly across light/dark themes.

## Blocked by
- [04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)
- [05 — @dnd-kit Game Card Drag-and-Drop & Favorites Cross-Zone Drop ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/05-dnd-kit-game-cards-and-cross-zone-drop.md)
- [06 — Folder Reordering & Settings Library Paths Drag Reorder ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/06-folder-reorder-and-settings-paths-dnd.md)
- [07 — Single-Click Inline Folder Rename ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/07-inline-folder-rename.md)

## Status
todo

## Acceptance Criteria
- [ ] Empty folder prompt renders full-width dashed box in unfiltered empty folders with localized copy from `useLocaleStrings()`.
- [ ] Active category filter shows localized neutral message (`no_matching_games_in_folder`) instead of manual add prompt.
- [ ] Clicking manual add button opens native file picker via `addManualGame` IPC with `aria-busy`/`aria-disabled` focus retention.
- [ ] Selected game is ingested, added to library state, and focused immediately.
- [ ] Tests in `EmptyFolderPrompt.test.tsx` and full `npm test && npm run typecheck` pass cleanly.
- [ ] Real-runtime smoke check passes with zero console/CSP errors and zero visual regressions on existing flat sort modes and modals.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/EmptyFolderPrompt.test.tsx && npm run typecheck
```
