# 07 — Single-Click Inline Folder Rename ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Implement single-click inline folder rename and live shelf tab synchronization as a declarative React component:
1. **Title Activation (Click and Keyboard)**:
   - Implement [`src/renderer/components/FolderTitle.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.tsx):
     - In idle mode, renders title heading element (`tabindex="0"`) decoupled from the accordion toggle button.
     - Accessible affordance: visual text edit hover state, text selection cursor, and `aria-description="Click or press Enter/F2 to rename folder"`.
     - Activation: single-click on title text, or pressing `F2` or `Enter` while focused on the title triggers rename mode.
     - Event handling: prevents default on activation to avoid toggling the parent accordion collapse state.
2. **Inline Edit Lifecycle & Persistence**:
   - In edit mode, replaces title text with an inline text input (`<input className="rename-input" />` styled with natural width and left alignment).
   - Automatically focuses the input and selects all text.
   - **Enter & Blur Commit Flow**:
     - Extracts trimmed value. If unchanged from the original title/alias, exits edit mode immediately.
     - While saving via IPC, marks input with `readOnly = true`, `aria-busy="true"`, and submitting style.
     - Calls `electronAPI.setFolderAlias(folderPath, trimmedValue)`:
       - **Success**: exits edit mode, updates display name, and updates `currentLibraryConfig.folderAliases` in context. Shelf tabs and settings automatically synchronize.
       - **Failure**: retains input mounted and focused with `aria-invalid="true"`, preserves the user's typed text, removes `readOnly`/`aria-busy`, and displays error toast pill (`toast_folder_rename_failed`).
   - **Escape Cancel Flow**:
     - Suppressed if IPC call is currently in-flight.
     - Cancels editing, reverts to original title without invoking IPC, and restores focus to the title heading.
3. **Vitest Component Tests**:
   - Author tests in `src/renderer/components/FolderTitle.test.tsx` verifying:
     - Click and F2 activation.
     - Enter commit dispatching `setFolderAlias`.
     - Escape cancellation restoring original label.
     - Failure retention with error styling and toast feedback.

## Blocked by
- [04 — Folder Accordions & Section Components ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/04-folder-accordions-and-sections.md)

## Status
todo

## Target Files

### [NEW] [`src/renderer/components/FolderTitle.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.tsx)
- Declarative React component handling idle title display and inline rename input lifecycle.

### [NEW] [`src/renderer/components/FolderTitle.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/FolderTitle.test.tsx)
- Vitest component tests verifying activation, keyboard interactions, IPC commit, and error recovery.

## Acceptance Criteria
- [ ] Folder title activates inline rename mode on click or F2/Enter.
- [ ] Accordion toggle is not triggered when clicking or typing in the rename input.
- [ ] Submitting a new alias commits via `electronAPI.setFolderAlias`.
- [ ] Shelf tabs and Settings reflect the updated alias reactively.
- [ ] Esc cleanly cancels edit mode without saving.
- [ ] Failed save retains the input with user's text and shows error toast.
- [ ] Tests in `FolderTitle.test.tsx` pass cleanly.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/FolderTitle.test.tsx && npm run typecheck
```
