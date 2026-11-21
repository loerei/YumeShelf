# 07 — Single-Click Inline Folder Rename ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors in `FolderSection.tsx` and `FolderAccordion.tsx`. Do NOT alter, restyle, or remove anything unasked.

Implement single-click inline folder rename and live shelf tab synchronization as a declarative React component wired into `FolderSection.tsx`:
- [ ] 1. **[NEW]** [`src/renderer/components/FolderTitle.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.tsx) — **Title Activation (Click and Keyboard)**:
   - In idle mode, renders title heading element (`tabIndex={0}`) decoupled from the accordion toggle button.
   - Accessible affordance: visual text edit hover state, text selection cursor, and localized `aria-description={strings.rename_folder_hint}` from `useLocaleStrings()`.
   - Activation: single-click on title text, or pressing `F2` or `Enter` while focused on the title triggers rename mode.
   - Event handling: use parent target filtering or `e.preventDefault()` (without calling `e.stopPropagation()`) so activating the title never toggles the parent accordion collapse state.
- [ ] 2. **[NEW]** [`src/renderer/components/FolderTitle.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.tsx) — **Inline Edit Lifecycle & Persistence**:
   - In edit mode, replaces title text with an inline text input (`<input className="rename-input" />` styled with natural width and left alignment).
   - Automatically focuses the input and selects all text.
   - **Enter & Blur Commit Flow**:
     - Extracts trimmed value. If unchanged from the original title/alias, exits edit mode immediately.
     - While saving via IPC, marks input with `readOnly={true}`, `aria-busy="true"`, and submitting style.
     - Calls `electronAPI.setFolderAlias(folderPath, trimmedValue)` (or injected `onRenameFolder` callback):
       - **Success**: exits edit mode, updates display name, and updates `currentLibraryConfig.folderAliases` in store. Shelf tabs and Settings automatically synchronize.
       - **Failure**: retains input mounted and focused with `aria-invalid="true"`, preserves the user's typed text, removes `readOnly`/`aria-busy`, and displays localized error toast pill (`useLocaleStrings().toast_folder_rename_failed`).
   - **Escape Cancel Flow**:
     - Suppressed if IPC call is currently in-flight.
     - Cancels editing, reverts to original title without invoking IPC, and restores focus to the title heading.
- [ ] 3. **[MODIFY]** [`src/renderer/components/FolderSection.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderSection.tsx) — **Mount `FolderTitle`**:
   - Wire `<FolderTitle />` into `FolderSection.tsx` (as default title renderer or via its `renderTitle` slot) so inline rename is live in folder sort views.
- [ ] 4. **[NEW]** [`src/renderer/components/FolderTitle.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.test.tsx) — **Vitest Component Tests**:
   - Verify click and `F2`/`Enter` activation, `Enter`/blur commit dispatching `setFolderAlias`, `Escape` cancellation restoring original label and focus, localized hint/error strings via `useLocaleStrings()`, and failure retention with error styling and toast feedback.

## Blocked by
- [04 — Folder Accordions, Section Components & LibraryGrid Mounting ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Acceptance Criteria
- [ ] Folder title activates inline rename mode on click or `F2`/`Enter` and exposes localized `aria-description` (`useLocaleStrings().rename_folder_hint`).
- [ ] Accordion toggle is not triggered when clicking or typing in the rename input (without using `stopPropagation()`).
- [ ] Submitting a new alias commits via `electronAPI.setFolderAlias` and reactively synchronizes Shelf tabs and Settings.
- [ ] `Escape` cleanly cancels edit mode without saving and returns focus to the title heading.
- [ ] Failed save retains the input with user's text and shows localized error toast (`toast_folder_rename_failed`).
- [ ] Tests in `FolderTitle.test.tsx` and `FolderAccordion.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderTitle.test.tsx src/renderer/components/FolderAccordion.test.tsx && npm run typecheck
```
