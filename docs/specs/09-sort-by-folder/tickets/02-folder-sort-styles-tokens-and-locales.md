# 02 — Folder Sort Styles, Design Tokens & Locales ($B$)

## Epic
[Epic 09: Sort by Folder](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/PRD.md)

## What to build
Establish static shell references, elevation tokens, CSS layout rules, and localization keys for the Sort by Folder feature:
1. **Design Tokens & Elevations**:
   - Update [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) to define tokenized elevation variables:
     - `--zIndex-shelf-tabs: 200;`
     - `--zIndex-tab-drag: 500;`
     - `--zIndex-card-drag: 1600;`
     - `--zIndex-path-row-drag: 2100;`
2. **CSS Styling Rules**:
   - Update [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css) with:
     - **Shelf Tabs Bar**: sticky positioning (`position: sticky; top: 0; z-index: var(--zIndex-shelf-tabs, 200); background-color: var(--bg-color); border-bottom: 1px solid var(--border-color);`), tab item styling, active indicator, count badges, and overflow scroll buttons (`aria-disabled="true"` styling).
     - **Accordion Transitions**: GPU-accelerated CSS Grid rows (`grid-template-rows: 0fr <-> 1fr`), `.is-collapsed` modifier, and chevron rotation using SVG icons bound to `currentColor`. Include `@media (prefers-reduced-motion: reduce)` block disabling transitions for instantaneous (0ms) state changes.
     - **Accordion Toolbar**: `.folder-accordion-toolbar` flex layout with gap and button spacing for Expand All / Collapse All.
     - **Empty Folder Prompt**: `.empty-folder-prompt` spanning all grid columns (`grid-column: 1 / -1; min-height: 120px; border: 2px dashed var(--border-color);`), hover states, and `.manual-add-btn` busy state (`aria-busy="true"`).
     - **Inline Title Input**: `.library-section-header .rename-input` scoped styling overriding card-level centered styling with left alignment, natural title width, and header token styling.
3. **Sort Menu & Text Mapping**:
   - Update `src/renderer/ui-text.ts` mapping `currentSortVal === 'folder'` to `d.sort_folder`.
   - Update sort dropdown menu to include "By Folder" option.
4. **Localization Keys**:
   - Update localization files across built-in locales (`src/locales/builtins/en.json`, `ja.json`, `zh.json`) and language pack (`language-packs/packs/vi.json`) with keys:
     - Folder sorting & accordion: `sort_folder`, `all_folders`, `expand_all`, `collapse_all`, `toggle_folder`.
     - Manual game addition: `manual_add_prompt`, `add_game_to_folder`, `no_matching_games_in_folder`, `empty_folder_selecting`.
     - Shelf tabs navigation: `scroll_tabs_left`, `scroll_tabs_right`.
     - Settings drag & drop: `reorder_library_path`, `drag_to_reorder`.
     - Action & reorder error toasts: `toast_favorite_update_failed`, `toast_tab_reorder_failed`, `toast_path_reorder_failed`, `toast_folder_rename_failed`, `toast_manual_add_failed`, `error_target_not_found`, `error_outside_library`, `error_outside_enclosing_folder`, `error_root_level_executable`, `error_unresolvable_executable`, `error_degraded_database`.

## Blocked by
- [01 — Headless Library Section Projections & Library Stacks Custom Order ($B$)](file:///d:/Projects/YumeShelf/docs/specs/09-sort-by-folder/tickets/01-headless-library-sections-and-stacks.md)

## Status
todo

## Target Files

### [MODIFY] [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css)
- Define tokenized elevation scale variables (`--zIndex-shelf-tabs`, `--zIndex-tab-drag`, `--zIndex-card-drag`, `--zIndex-path-row-drag`).

### [MODIFY] [`src/style.css`](file:///d:/Projects/YumeShelf/src/style.css)
- Add CSS styling rules for shelf tabs, accordion transitions, toolbar, empty folder prompt, and inline rename input.

### [MODIFY] [`src/renderer/ui-text.ts`](file:///d:/Projects/YumeShelf/src/renderer/ui-text.ts)
- Add text mapping for `sort_folder`.

### [MODIFY] Localization JSON Files
- `src/locales/builtins/en.json`
- `src/locales/builtins/ja.json`
- `src/locales/builtins/zh.json`
- `language-packs/packs/vi.json`

## Acceptance Criteria
- [ ] Theme tokens for shelf tabs and drag layers defined in `theme.css`.
- [ ] Accordion transitions use hardware-accelerated CSS Grid rows with reduced motion bypass.
- [ ] "By Folder" sort option wired in UI sort controls and mapped in `ui-text.ts`.
- [ ] All 4 localization files updated with full set of folder sorting, shelf navigation, and error toast keys.
- [ ] `npm run typecheck` passes with zero errors.

## Verification Command
```bash
npm run typecheck
```
