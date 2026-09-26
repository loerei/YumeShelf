# 08 — Empty Folder Manual Game Addition ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement empty folder placeholder prompt and manual executable addition as a declarative React component:
1. **Empty Folder Placeholder Component**:
   - Implement [`src/renderer/components/EmptyFolderPrompt.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.tsx):
     - Renders when a folder section contains zero games in the unfiltered library state (`!activeCategoryId`).
     - Multi-column layout: `.empty-folder-prompt` spanning all columns (`grid-column: 1 / -1; min-height: 120px; border: 2px dashed var(--border-color);`).
     - Button: `<button type="button" className="manual-add-btn">` with visible label from `t('manual_add_prompt')` ("Your Game Is Not Scanned? Manually Add Them Here.") and accessible name complying with WCAG 2.5.3 by including the visible label and folder name.
   - **Filtered View Invariant**:
     - When an active category filter is present and a folder contains zero matching games, renders `<div className="filtered-folder-empty-state">{t('no_matching_games_in_folder')}</div>` instead of the manual add prompt.
   - **Global Empty State Bypass**:
     - When total scanned games is 0, but configured library root directories exist (`rootPaths.length > 0`), folder sort renders the empty folder sections with `EmptyFolderPrompt` buttons rather than showing the global library empty illustration.
2. **Manual Game Selection Dialog & Ingestion**:
   - Click listener on `.manual-add-btn`:
     - Guard: if already selecting (`isSelecting === true`), returns immediately.
     - In-flight: sets `isSelecting = true`, applies `aria-busy="true"` and `aria-disabled="true"`, and displays in-flight status text ("Selecting...").
     - Calls `electronAPI.addManualGame({ folderPath })`:
       - **Canceled**: cleanly resets button to default prompt.
       - **Success**: receives `result.game`, updates library state via `setAllGames`, and anchors focus to the newly added game card.
       - **Error**: displays localized error toast pill (`error_${errorCode}` or `toast_manual_add_failed`) and logs structured diagnostic context.
     - Cleanup in `finally`: resets `isSelecting = false`, removes `aria-busy` and `aria-disabled`.
3. **Vitest Component Tests**:
   - Author tests in `src/renderer/components/EmptyFolderPrompt.test.tsx` verifying:
     - Prompt renders in unfiltered empty folder.
     - Filtered empty state renders when category filter active.
     - In-flight busy feedback during IPC file picker invocation.
     - Successful game addition updates library state.
     - Error toast feedback on IPC rejection.

## Blocked by
- [04 — Folder Accordions & Section Components ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/components/EmptyFolderPrompt.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.tsx)
- React component rendering empty folder prompt and coordinating manual file selection.

### [NEW] [`src/renderer/components/EmptyFolderPrompt.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/EmptyFolderPrompt.test.tsx)
- Vitest component tests verifying prompt states, IPC invocation, and error handling.

## Acceptance Criteria
- [ ] Empty folder prompt renders full-width dashed box in empty folders.
- [ ] Active category filter shows neutral message instead of manual add prompt.
- [ ] Clicking manual add button opens native file picker via `addManualGame` IPC.
- [ ] Selected game is ingested, added to library state, and displayed immediately.
- [ ] In-flight busy feedback and error toasts function properly.
- [ ] Tests in `EmptyFolderPrompt.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/EmptyFolderPrompt.test.tsx && npm run typecheck
```
