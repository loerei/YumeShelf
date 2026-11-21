# 02 — Folder Sort Dependencies, Styles, Design Tokens & Locales ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing styles, elevation tokens, header controls, and locale keys. Do NOT alter, restyle, or remove anything unasked.

Install `@dnd-kit` dependencies, add non-colliding elevation tokens, create a dedicated folder-sort stylesheet imported at the right cascade position, wire the `'folder'` sort option in `Header.tsx`, and add all localization keys across all 4 locale files:
- [ ] 1. **[MODIFY]** [`package.json`](file:///d:/Projects/YumeShelf/package.json) & `pnpm-lock.yaml` — **Install `@dnd-kit` Dependencies**:
   - Install and version-pin `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` in `dependencies`.
   - Verify `npm run verify:deps` / `pnpm ls` reports zero peer conflicts with React 19.
- [ ] 2. **[MODIFY]** [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) — **Non-Colliding Design Tokens & Elevations**:
   - Add elevation tokens aligned with the existing scale (`--zIndex-dropdown: 1000`, `--zIndex-widget: 1600`, `--zIndex-modal: 2000`, `--zIndex-overlay: 6000`):
     - `--zIndex-shelf-tabs: 200;`
     - `--zIndex-tab-drag: 500;`
     - `--zIndex-card-drag: 1650;` *(strictly above `--zIndex-widget: 1600`, below `--zIndex-modal: 2000`)*
     - `--zIndex-path-row-drag: 2100;` *(above `--zIndex-modal: 2000` for Settings modal drag overlay, below `--zIndex-overlay: 6000`)*
- [ ] 3. **[NEW]** [`src/styles/folder-sort.css`](file:///d:/Projects/YumeShelf/src/styles/folder-sort.css) & **[MODIFY]** [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) — **Dedicated Folder Sort Stylesheet**:
   - Create `src/styles/folder-sort.css` and add `@import "./styles/folder-sort.css";` in [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) **after** `settings.css` and **before** `responsive.css` (preserving existing cascade order without touching other stylesheets).
   - **Shelf Tabs Bar**: sticky positioning (`position: sticky; top: 0; z-index: var(--zIndex-shelf-tabs, 200); background-color: var(--bg-color); border-bottom: 1px solid var(--border-color);`), tab item styling with clean `<button>` UA resets (`color`, `background`, `border`, `font`), active indicator, count badges, and overflow scroll buttons (`aria-disabled="true"` styling).
   - **Accordion Transitions**: GPU-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`), `.is-collapsed` modifier, and chevron rotation using SVG icons bound to `currentColor` with explicit `width`/`height`. Include `@media (prefers-reduced-motion: reduce)` block disabling transitions for instantaneous (0ms) state changes.
   - **Accordion Toolbar**: `.folder-accordion-toolbar` flex layout with gap and button spacing for Expand All / Collapse All.
   - **Empty Folder Prompt**: `.empty-folder-prompt` spanning all grid columns (`grid-column: 1 / -1; min-height: 120px; border: 2px dashed var(--border-color);`), hover states, and `.manual-add-btn` busy state (`aria-busy="true"`).
   - **Inline Title Input**: `.library-section-header .rename-input` scoped styling overriding card-level centered styling with left alignment, natural title width, and header token styling.
- [ ] 4. **[MODIFY]** [`src/renderer/components/Header.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/Header.tsx) & [`src/renderer/components/Header.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/components/Header.test.tsx) — **Add "By Folder" Sort Option**:
   - Add `{ id: 'folder', label: 'By Folder' }` to `SORT_OPTIONS` in `Header.tsx`, resolving its localized label from `useLocaleStrings().sort_folder` (preserving all existing sort options `date`, `played`, `az`, `custom` and existing `Header.test.tsx` assertions).
- [ ] 5. **[MODIFY]** Localization JSON Files ([`src/locales/builtins/en.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/en.json), [`src/locales/builtins/ja.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/ja.json), [`src/locales/builtins/zh.json`](file:///d:/Projects/YumeShelf/src/locales/builtins/zh.json), [`language-packs/packs/vi.json`](file:///d:/Projects/YumeShelf/language-packs/packs/vi.json)) — **4-Language Schema Parity**:
   - Because [`src/renderer/i18n/locale-strings.ts`](file:///d:/Projects/YumeShelf/src/renderer/i18n/locale-strings.ts) derives `DefaultLocaleStrings` directly from `en.json`, adding all keys to all 4 files automatically types them on `useLocaleStrings()`:
   - Folder sorting & accordion: `sort_folder`, `all_folders`, `shelf_folders_aria`, `expand_all`, `collapse_all`, `toggle_folder`, `rename_folder_hint`.
   - Manual game addition: `manual_add_prompt`, `add_game_to_folder`, `no_matching_games_in_folder`, `empty_folder_selecting`.
   - Shelf tabs navigation: `scroll_tabs_left`, `scroll_tabs_right`.
   - Settings drag & drop: `reorder_library_path`, `drag_to_reorder`.
   - Action & reorder error toasts: `toast_favorite_update_failed`, `toast_tab_reorder_failed`, `toast_path_reorder_failed`, `toast_folder_rename_failed`, `toast_manual_add_failed`, `error_target_not_found`, `error_outside_library`, `error_outside_enclosing_folder`, `error_root_level_executable`, `error_unresolvable_executable`, `error_degraded_database`.

## Blocked by
- [01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/01-headless-library-sections-and-stacks.md)

## Status
todo

## Acceptance Criteria
- [ ] `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are installed in `package.json` with clean dependency resolution.
- [ ] Non-colliding elevation tokens (`--zIndex-shelf-tabs`, `--zIndex-tab-drag`, `--zIndex-card-drag: 1650`, `--zIndex-path-row-drag: 2100`) are defined in `src/styles/theme.css`.
- [ ] `src/styles/folder-sort.css` is created and imported in `src/style.css` after `settings.css` and before `responsive.css`, with reduced-motion bypass and `<button>` UA resets.
- [ ] `"By Folder"` (`folder`) sort option is wired in `Header.tsx` via `useLocaleStrings().sort_folder` with `Header.test.tsx` passing.
- [ ] All 4 localization files (`en.json`, `ja.json`, `zh.json`, `vi.json`) contain identical new key sets.
- [ ] `npm run test:vitest -- src/renderer/components/Header.test.tsx && npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run test:vitest -- src/renderer/components/Header.test.tsx && npm run typecheck
```
